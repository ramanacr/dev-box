// Package buildinfo carries the identity of the running binary: which version it
// is, which commit produced it, and when it was built.
//
// Without this an operator running the container has no way to say what they are
// running, and a support conversation starts by guessing. The values are set at
// link time by the release build (see .github/workflows/release.yml); a binary
// built with a plain `go build` reports the development defaults instead of
// pretending to be a release.
package buildinfo

import (
	"runtime"
	"runtime/debug"
	"sync"
)

// Set through -ldflags "-X developer-toolbox/internal/buildinfo.version=...".
// These are the only mutable package-level values, and nothing writes them after
// link time.
var (
	version = ""
	commit  = ""
	date    = ""
)

// DevelopmentVersion is reported when no version was stamped at link time. It is
// deliberately not a version number: a local build must never be mistaken for a
// release in a bug report.
const DevelopmentVersion = "dev"

// Info describes the running binary.
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit,omitempty"`
	BuildDate string `json:"build_date,omitempty"`
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

var (
	once   sync.Once
	cached Info
)

// Get returns the running binary's identity. The result is computed once and is
// safe for concurrent use.
func Get() Info {
	once.Do(func() {
		cached = Info{
			Version:   version,
			Commit:    commit,
			BuildDate: date,
			GoVersion: runtime.Version(),
			Platform:  runtime.GOOS + "/" + runtime.GOARCH,
		}

		if cached.Version == "" {
			cached.Version = DevelopmentVersion
		}

		// A `go build` from a git checkout still embeds the revision in the
		// module's build info, so an unstamped binary can report its commit even
		// though it cannot report a version. That is worth having: it is the
		// difference between "dev" and "dev, from this exact tree".
		if cached.Commit == "" {
			if bi, ok := debug.ReadBuildInfo(); ok {
				for _, s := range bi.Settings {
					switch s.Key {
					case "vcs.revision":
						cached.Commit = s.Value
					case "vcs.time":
						if cached.BuildDate == "" {
							cached.BuildDate = s.Value
						}
					case "vcs.modified":
						if s.Value == "true" {
							cached.Version = DevelopmentVersion + "-dirty"
						}
					}
				}
			}
		}
	})
	return cached
}

// IsRelease reports whether this binary was stamped by a release build. Callers
// use it to decide whether a version is worth quoting back to a user.
func IsRelease() bool {
	v := Get().Version
	return v != DevelopmentVersion && v != DevelopmentVersion+"-dirty"
}
