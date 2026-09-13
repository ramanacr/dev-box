// Package observability provides the metrics registry and HTTP instrumentation
// the service exposes to an operator.
//
// The exposition format is Prometheus text, which every enterprise monitoring
// stack can scrape directly and which the OpenTelemetry Collector ingests through
// its prometheus receiver. It is implemented here rather than pulled in, because
// the client library and the OpenTelemetry SDK together outweigh this entire
// binary, and a 18.5 MB image that starts in under a second is a property worth
// more than the features a full SDK would add. If push-based OTLP is ever needed,
// it belongs behind a build tag so the default image keeps its size.
package observability

import (
	"sort"
	"strconv"
	"strings"
	"sync"
)

// DefaultBuckets are the histogram boundaries, in seconds, for request duration.
//
// They are weighted toward the low end because the service is local-first and its
// measured search p95 is 2.84 ms: buckets starting at 100 ms would put every
// normal request in the first one and measure nothing. The tail still reaches 10 s
// so a pathological request is visible rather than clamped.
var DefaultBuckets = []float64{
	0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
}

// Registry holds every metric the process exports.
//
// A single mutex guards all of it. The alternative, per-metric atomics, buys
// throughput this service will never need: the lock is held for a handful of
// integer additions per request, and contention at local-first request rates is
// not measurable.
type Registry struct {
	mu         sync.Mutex
	counters   map[string]*counterFamily
	histograms map[string]*histogramFamily
	gauges     map[string]*gaugeFamily
	order      []string // registration order, so exposition output is stable
}

type family struct {
	name string
	help string
}

type counterFamily struct {
	family
	values map[string]*counterSeries
}

type counterSeries struct {
	labels labelSet
	value  uint64
}

type gaugeFamily struct {
	family
	values map[string]*gaugeSeries
}

type gaugeSeries struct {
	labels labelSet
	value  float64
}

type histogramFamily struct {
	family
	buckets []float64
	values  map[string]*histogramSeries
}

type histogramSeries struct {
	labels labelSet
	counts []uint64 // one per bucket boundary; cumulative applied at render time
	sum    float64
	total  uint64
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry {
	return &Registry{
		counters:   make(map[string]*counterFamily),
		histograms: make(map[string]*histogramFamily),
		gauges:     make(map[string]*gaugeFamily),
	}
}

// labelSet is an ordered list of label name/value pairs. Order is normalised at
// construction so the same logical series always produces the same map key.
type labelSet []Label

// Label is one metric dimension.
type Label struct {
	Name  string
	Value string
}

// Labels builds a normalised label set from alternating name and value arguments.
// An odd final argument is dropped rather than panicking: a metric is never worth
// taking down a request path for.
func Labels(pairs ...string) labelSet {
	set := make(labelSet, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		set = append(set, Label{Name: pairs[i], Value: pairs[i+1]})
	}
	sort.Slice(set, func(i, j int) bool { return set[i].Name < set[j].Name })
	return set
}

// key renders a label set into a stable map key.
func (l labelSet) key() string {
	if len(l) == 0 {
		return ""
	}
	var b strings.Builder
	for i, label := range l {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(label.Name)
		b.WriteByte('=')
		b.WriteString(label.Value)
	}
	return b.String()
}

// render writes the label set in Prometheus exposition syntax, including the
// surrounding braces. Values are escaped per the text format specification.
func (l labelSet) render(extra ...Label) string {
	all := append(append(labelSet{}, l...), extra...)
	if len(all) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, label := range all {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(label.Name)
		b.WriteString(`="`)
		b.WriteString(escapeLabelValue(label.Value))
		b.WriteString(`"`)
	}
	b.WriteByte('}')
	return b.String()
}

// escapeLabelValue escapes the three characters the text format reserves inside a
// label value. Without this a value containing a quote produces a line no scraper
// can parse, which silently drops the whole endpoint.
func escapeLabelValue(v string) string {
	if !strings.ContainsAny(v, `\"`+"\n") {
		return v
	}
	replacer := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`)
	return replacer.Replace(v)
}

// registerOrder records a family name once so exposition output is deterministic.
// Callers hold the lock.
func (r *Registry) registerOrder(name string) {
	for _, existing := range r.order {
		if existing == name {
			return
		}
	}
	r.order = append(r.order, name)
}

// Counter increments a monotonic counter by one.
func (r *Registry) Counter(name, help string, labels labelSet) {
	r.CounterAdd(name, help, labels, 1)
}

// CounterAdd increments a monotonic counter by delta.
func (r *Registry) CounterAdd(name, help string, labels labelSet, delta uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	fam, ok := r.counters[name]
	if !ok {
		fam = &counterFamily{
			family: family{name: name, help: help},
			values: make(map[string]*counterSeries),
		}
		r.counters[name] = fam
		r.registerOrder(name)
	}

	key := labels.key()
	series, ok := fam.values[key]
	if !ok {
		series = &counterSeries{labels: labels}
		fam.values[key] = series
	}
	series.value += delta
}

// GaugeSet replaces a gauge's current value.
func (r *Registry) GaugeSet(name, help string, labels labelSet, value float64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	fam, ok := r.gauges[name]
	if !ok {
		fam = &gaugeFamily{
			family: family{name: name, help: help},
			values: make(map[string]*gaugeSeries),
		}
		r.gauges[name] = fam
		r.registerOrder(name)
	}

	key := labels.key()
	series, ok := fam.values[key]
	if !ok {
		series = &gaugeSeries{labels: labels}
		fam.values[key] = series
	}
	series.value = value
}

// GaugeAdd moves a gauge by delta, which may be negative. Used for in-flight
// counts, where set-to-absolute would race between concurrent requests.
func (r *Registry) GaugeAdd(name, help string, labels labelSet, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	fam, ok := r.gauges[name]
	if !ok {
		fam = &gaugeFamily{
			family: family{name: name, help: help},
			values: make(map[string]*gaugeSeries),
		}
		r.gauges[name] = fam
		r.registerOrder(name)
	}

	key := labels.key()
	series, ok := fam.values[key]
	if !ok {
		series = &gaugeSeries{labels: labels}
		fam.values[key] = series
	}
	series.value += delta
}

// Observe records one value into a histogram.
func (r *Registry) Observe(name, help string, labels labelSet, value float64) {
	r.ObserveWithBuckets(name, help, labels, value, DefaultBuckets)
}

// ObserveWithBuckets records one value into a histogram with explicit boundaries.
// The boundaries are fixed by the first observation of a given metric name; a
// later call with different ones keeps the original, because changing a
// histogram's buckets mid-process would corrupt every series already recorded.
func (r *Registry) ObserveWithBuckets(name, help string, labels labelSet, value float64, buckets []float64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	fam, ok := r.histograms[name]
	if !ok {
		sorted := append([]float64{}, buckets...)
		sort.Float64s(sorted)
		fam = &histogramFamily{
			family:  family{name: name, help: help},
			buckets: sorted,
			values:  make(map[string]*histogramSeries),
		}
		r.histograms[name] = fam
		r.registerOrder(name)
	}

	key := labels.key()
	series, ok := fam.values[key]
	if !ok {
		series = &histogramSeries{
			labels: labels,
			counts: make([]uint64, len(fam.buckets)),
		}
		fam.values[key] = series
	}

	series.sum += value
	series.total++
	for i, boundary := range fam.buckets {
		if value <= boundary {
			series.counts[i]++
			// Counts are stored per-bucket and made cumulative at render time, so
			// this stops at the first matching boundary.
			break
		}
	}
}

// Gather renders the whole registry in Prometheus text exposition format.
func (r *Registry) Gather() string {
	r.mu.Lock()
	defer r.mu.Unlock()

	var b strings.Builder
	for _, name := range r.order {
		switch {
		case r.counters[name] != nil:
			renderCounter(&b, r.counters[name])
		case r.gauges[name] != nil:
			renderGauge(&b, r.gauges[name])
		case r.histograms[name] != nil:
			renderHistogram(&b, r.histograms[name])
		}
	}
	return b.String()
}

func writeHeader(b *strings.Builder, name, help, typ string) {
	if help != "" {
		b.WriteString("# HELP ")
		b.WriteString(name)
		b.WriteByte(' ')
		b.WriteString(help)
		b.WriteByte('\n')
	}
	b.WriteString("# TYPE ")
	b.WriteString(name)
	b.WriteByte(' ')
	b.WriteString(typ)
	b.WriteByte('\n')
}

// sortedKeys returns map keys in sorted order so scrapes are byte-stable, which
// makes the endpoint diffable and its tests deterministic.
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func renderCounter(b *strings.Builder, fam *counterFamily) {
	writeHeader(b, fam.name, fam.help, "counter")
	for _, key := range sortedKeys(fam.values) {
		series := fam.values[key]
		b.WriteString(fam.name)
		b.WriteString(series.labels.render())
		b.WriteByte(' ')
		b.WriteString(strconv.FormatUint(series.value, 10))
		b.WriteByte('\n')
	}
}

func renderGauge(b *strings.Builder, fam *gaugeFamily) {
	writeHeader(b, fam.name, fam.help, "gauge")
	for _, key := range sortedKeys(fam.values) {
		series := fam.values[key]
		b.WriteString(fam.name)
		b.WriteString(series.labels.render())
		b.WriteByte(' ')
		b.WriteString(formatFloat(series.value))
		b.WriteByte('\n')
	}
}

func renderHistogram(b *strings.Builder, fam *histogramFamily) {
	writeHeader(b, fam.name, fam.help, "histogram")
	for _, key := range sortedKeys(fam.values) {
		series := fam.values[key]

		// Prometheus bucket counts are cumulative: each le bucket holds everything
		// at or below its boundary. Counts are stored per-bucket, so the running
		// total is accumulated here.
		var cumulative uint64
		for i, boundary := range fam.buckets {
			cumulative += series.counts[i]
			b.WriteString(fam.name)
			b.WriteString("_bucket")
			b.WriteString(series.labels.render(Label{Name: "le", Value: formatFloat(boundary)}))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatUint(cumulative, 10))
			b.WriteByte('\n')
		}

		// The +Inf bucket must equal the observation count, including values that
		// exceeded every boundary.
		b.WriteString(fam.name)
		b.WriteString("_bucket")
		b.WriteString(series.labels.render(Label{Name: "le", Value: "+Inf"}))
		b.WriteByte(' ')
		b.WriteString(strconv.FormatUint(series.total, 10))
		b.WriteByte('\n')

		b.WriteString(fam.name)
		b.WriteString("_sum")
		b.WriteString(series.labels.render())
		b.WriteByte(' ')
		b.WriteString(formatFloat(series.sum))
		b.WriteByte('\n')

		b.WriteString(fam.name)
		b.WriteString("_count")
		b.WriteString(series.labels.render())
		b.WriteByte(' ')
		b.WriteString(strconv.FormatUint(series.total, 10))
		b.WriteByte('\n')
	}
}

// formatFloat renders a float in the shortest form that round-trips, which keeps
// bucket boundaries like 0.0005 from becoming 0.000500000001.
func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}
