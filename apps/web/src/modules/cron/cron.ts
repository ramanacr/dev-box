/**
 * Cron expression parser, describer and schedule projector.
 *
 * White paper D-3 lists a "cron visualizer". Implemented natively: the grammar is
 * small and well defined, and a dependency would cost more than it saves.
 *
 * Supports the five-field POSIX form and the six-field form with a leading seconds
 * field, plus the common non-standard extensions that appear in real crontabs:
 * step values, ranges, lists, names for months and weekdays, and the @-shorthands.
 * Anything outside that is rejected with a message naming the field, rather than
 * silently matching nothing.
 */

export type CronFieldName = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export interface CronField {
  name: CronFieldName;
  /** The raw text for this field. */
  source: string;
  /** Every matching value, ascending. */
  values: number[];
  /** True when the field was "*" — matches everything. */
  wildcard: boolean;
  /** Human-readable description of this field alone. */
  description: string;
}

export interface ParsedCron {
  /** Normalised expression with any @shorthand expanded. */
  normalized: string;
  hasSeconds: boolean;
  fields: CronField[];
  /** One-sentence description of the whole schedule. */
  description: string;
  /** Notes about behaviour that commonly surprises people. */
  notes: string[];
}

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronError';
  }
}

interface FieldSpec {
  name: CronFieldName;
  min: number;
  max: number;
  names?: Record<string, number>;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIVE_FIELD: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { name: 'dayOfWeek', min: 0, max: 7, names: DAY_NAMES },
];

const SIX_FIELD: FieldSpec[] = [{ name: 'second', min: 0, max: 59 }, ...FIVE_FIELD];

/** Named shorthands, expanded before parsing. */
export const SHORTHANDS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim().replace(/\s+/g, ' ');
  if (trimmed === '') {
    throw new CronError('Enter a cron expression, for example "0 9 * * 1-5".');
  }
  if (trimmed.length > 200) {
    throw new CronError('Expression is too long.');
  }

  if (trimmed.toLowerCase() === '@reboot') {
    throw new CronError(
      '"@reboot" runs once when the daemon starts. It has no recurring schedule to project.',
    );
  }

  const normalized = SHORTHANDS[trimmed.toLowerCase()] ?? trimmed;
  const parts = normalized.split(' ');

  let specs: FieldSpec[];
  if (parts.length === 5) {
    specs = FIVE_FIELD;
  } else if (parts.length === 6) {
    specs = SIX_FIELD;
  } else {
    throw new CronError(
      `Expected 5 fields (minute hour day-of-month month day-of-week) or 6 with a leading seconds field, got ${parts.length}.`,
    );
  }

  const fields = specs.map((spec, i) => parseField(parts[i]!, spec));
  const hasSeconds = parts.length === 6;

  return {
    normalized,
    hasSeconds,
    fields,
    description: describeSchedule(fields, hasSeconds),
    notes: scheduleNotes(fields),
  };
}

function parseField(source: string, spec: FieldSpec): CronField {
  const values = new Set<number>();
  const wildcard = source === '*';

  for (const term of source.split(',')) {
    if (term === '') {
      throw new CronError(`Empty term in the ${spec.name} field ("${source}").`);
    }
    for (const value of expandTerm(term, spec, source)) {
      values.add(value);
    }
  }

  // Cron accepts both 0 and 7 for Sunday; collapse to 0 so projection is simple.
  if (spec.name === 'dayOfWeek' && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new CronError(`The ${spec.name} field matches no values ("${source}").`);
  }

  return {
    name: spec.name,
    source,
    values: sorted,
    wildcard,
    description: describeField(source, spec, sorted, wildcard),
  };
}

function expandTerm(term: string, spec: FieldSpec, fieldSource: string): number[] {
  // Step: "<range>/<step>" or "*/<step>".
  let step = 1;
  let rangePart = term;

  const slash = term.indexOf('/');
  if (slash !== -1) {
    rangePart = term.slice(0, slash);
    const stepText = term.slice(slash + 1);
    const parsedStep = Number(stepText);
    if (!Number.isInteger(parsedStep) || parsedStep < 1) {
      throw new CronError(
        `Step must be a positive integer in the ${spec.name} field, got "${stepText}".`,
      );
    }
    step = parsedStep;
    if (rangePart === '') {
      throw new CronError(`Step "${term}" in the ${spec.name} field has no range before "/".`);
    }
  }

  let start: number;
  let end: number;

  if (rangePart === '*') {
    start = spec.min;
    end = spec.max;
  } else {
    const dash = rangePart.indexOf('-', rangePart.startsWith('-') ? 1 : 0);
    if (dash > 0) {
      start = readValue(rangePart.slice(0, dash), spec, fieldSource);
      end = readValue(rangePart.slice(dash + 1), spec, fieldSource);
      if (end < start) {
        throw new CronError(
          `Range ${rangePart} in the ${spec.name} field ends before it starts. Cron does not wrap ranges; write two terms instead, for example "${rangePart.slice(0, dash)}-${spec.max},${spec.min}-${rangePart.slice(dash + 1)}".`,
        );
      }
    } else {
      start = readValue(rangePart, spec, fieldSource);
      // A bare value with a step means "from here to the end of the field".
      end = slash !== -1 ? spec.max : start;
    }
  }

  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}

function readValue(text: string, spec: FieldSpec, fieldSource: string): number {
  const token = text.trim();
  if (token === '') {
    throw new CronError(`Missing value in the ${spec.name} field ("${fieldSource}").`);
  }

  if (spec.names) {
    const named = spec.names[token.toLowerCase()];
    if (named !== undefined) return named;
  }

  const value = Number(token);
  if (!Number.isInteger(value)) {
    const hint = spec.names ? ` Use a number or a name such as ${Object.keys(spec.names)[0]}.` : '';
    throw new CronError(`"${token}" is not valid in the ${spec.name} field.${hint}`);
  }
  if (value < spec.min || value > spec.max) {
    throw new CronError(
      `${value} is out of range for the ${spec.name} field (${spec.min}-${spec.max}).`,
    );
  }
  return value;
}

/** Human wording for each field, so descriptions never leak the camelCase name. */
const FIELD_NOUN: Record<CronFieldName, { singular: string; plural: string }> = {
  second: { singular: 'second', plural: 'seconds' },
  minute: { singular: 'minute', plural: 'minutes' },
  hour: { singular: 'hour', plural: 'hours' },
  dayOfMonth: { singular: 'day of the month', plural: 'days of the month' },
  month: { singular: 'month', plural: 'months' },
  dayOfWeek: { singular: 'day of the week', plural: 'days of the week' },
};

function describeField(
  source: string,
  spec: FieldSpec,
  values: number[],
  wildcard: boolean,
): string {
  const noun = FIELD_NOUN[spec.name];
  if (wildcard) return `Every ${noun.singular}.`;

  const label = (v: number): string => {
    if (spec.name === 'month') return MONTH_LABELS[v - 1] ?? String(v);
    if (spec.name === 'dayOfWeek') return DAY_LABELS[v % 7] ?? String(v);
    return String(v);
  };

  const stepMatch = /^\*\/(\d+)$/.exec(source);
  if (stepMatch) {
    return `Every ${stepMatch[1]} ${noun.plural}.`;
  }

  if (values.length === 1) return `At ${noun.singular} ${label(values[0]!)}.`;
  if (values.length > 12) {
    return `${values.length} values: ${label(values[0]!)} through ${label(values[values.length - 1]!)}.`;
  }
  return `At ${values.map(label).join(', ')}.`;
}

function fieldByName(fields: CronField[], name: CronFieldName): CronField | undefined {
  return fields.find((f) => f.name === name);
}

function describeSchedule(fields: CronField[], hasSeconds: boolean): string {
  const second = fieldByName(fields, 'second');
  const minute = fieldByName(fields, 'minute')!;
  const hour = fieldByName(fields, 'hour')!;
  const dom = fieldByName(fields, 'dayOfMonth')!;
  const month = fieldByName(fields, 'month')!;
  const dow = fieldByName(fields, 'dayOfWeek')!;

  const parts: string[] = [];

  // Time of day.
  if (hour.wildcard && minute.wildcard) {
    parts.push(hasSeconds && second && !second.wildcard ? 'Every minute' : 'Every minute');
  } else if (hour.wildcard && minute.values.length === 1) {
    parts.push(`At ${minute.values[0]} minutes past every hour`);
  } else if (hour.wildcard) {
    parts.push(`At minutes ${minute.values.join(', ')} past every hour`);
  } else if (minute.values.length === 1 && hour.values.length === 1) {
    parts.push(`At ${pad(hour.values[0]!)}:${pad(minute.values[0]!)}`);
  } else if (minute.values.length === 1) {
    parts.push(`At ${hour.values.map((h) => `${pad(h)}:${pad(minute.values[0]!)}`).join(', ')}`);
  } else {
    parts.push(
      `At minutes ${minute.values.join(', ')} of hours ${hour.values.map(pad).join(', ')}`,
    );
  }

  // Day constraints. The day-of-month / day-of-week interaction is the classic trap.
  if (!dom.wildcard && !dow.wildcard) {
    parts.push(
      `on day-of-month ${dom.values.join(', ')} **or** on ${dow.values.map((d) => DAY_LABELS[d]).join(', ')}`,
    );
  } else if (!dom.wildcard) {
    parts.push(`on day-of-month ${dom.values.join(', ')}`);
  } else if (!dow.wildcard) {
    parts.push(`on ${dow.values.map((d) => DAY_LABELS[d]).join(', ')}`);
  }

  if (!month.wildcard) {
    parts.push(`in ${month.values.map((m) => MONTH_LABELS[m - 1]).join(', ')}`);
  }

  return parts.join(' ') + '.';
}

function scheduleNotes(fields: CronField[]): string[] {
  const notes: string[] = [];

  const dom = fieldByName(fields, 'dayOfMonth')!;
  const dow = fieldByName(fields, 'dayOfWeek')!;
  const minute = fieldByName(fields, 'minute')!;
  const hour = fieldByName(fields, 'hour')!;

  // This catches people out constantly: the two day fields are OR-ed, not AND-ed.
  if (!dom.wildcard && !dow.wildcard) {
    notes.push(
      'Day-of-month and day-of-week are both restricted. Cron treats these as OR, not AND: the job runs when *either* matches, not only when both do.',
    );
  }

  // Only meaningful when specific days were named. A wildcard day-of-month matches
  // whatever days the month actually has, so there is nothing to warn about.
  if (!dom.wildcard && dom.values.some((d) => d > 28)) {
    notes.push(
      `Day-of-month includes ${dom.values.filter((d) => d > 28).join(', ')}, which does not occur in every month. The job simply will not run in months that are too short.`,
    );
  }

  if (minute.wildcard && hour.wildcard) {
    notes.push('This runs every minute — 1,440 times a day. Confirm that is intended.');
  }

  notes.push(
    'Times are interpreted in the timezone of whatever runs the schedule, which is not necessarily your local timezone.',
  );

  return notes;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Projects the next occurrences after a given instant.
 *
 * Uses plain field matching rather than date arithmetic tricks so the
 * day-of-month/day-of-week OR semantics stay explicit. The search is bounded so a
 * schedule that can never fire (for example 30 February) returns fewer results
 * instead of looping.
 */
export function nextOccurrences(parsed: ParsedCron, from: Date, count = 5): Date[] {
  const results: Date[] = [];

  const second = fieldByName(parsed.fields, 'second');
  const minute = fieldByName(parsed.fields, 'minute')!;
  const hour = fieldByName(parsed.fields, 'hour')!;
  const dom = fieldByName(parsed.fields, 'dayOfMonth')!;
  const month = fieldByName(parsed.fields, 'month')!;
  const dow = fieldByName(parsed.fields, 'dayOfWeek')!;

  const stepSeconds = parsed.hasSeconds ? 1 : 60;

  const cursor = new Date(from.getTime());
  cursor.setMilliseconds(0);
  if (!parsed.hasSeconds) cursor.setSeconds(0);
  // Start strictly after `from`.
  cursor.setTime(cursor.getTime() + stepSeconds * 1000);

  // Four years of steps bounds the search past any leap-year edge case.
  const maxIterations = parsed.hasSeconds ? 400_000 : 4 * 366 * 24 * 60;

  for (let i = 0; i < maxIterations && results.length < count; i++) {
    if (matches(cursor)) results.push(new Date(cursor.getTime()));
    cursor.setTime(cursor.getTime() + stepSeconds * 1000);
  }

  return results;

  function matches(date: Date): boolean {
    if (parsed.hasSeconds && second && !second.values.includes(date.getSeconds())) return false;
    if (!minute.values.includes(date.getMinutes())) return false;
    if (!hour.values.includes(date.getHours())) return false;
    if (!month.values.includes(date.getMonth() + 1)) return false;

    const domMatches = dom.values.includes(date.getDate());
    const dowMatches = dow.values.includes(date.getDay());

    // POSIX: when both day fields are restricted the job runs if either matches;
    // when only one is restricted, that one must match.
    if (dom.wildcard && dow.wildcard) return true;
    if (dom.wildcard) return dowMatches;
    if (dow.wildcard) return domMatches;
    return domMatches || dowMatches;
  }
}
