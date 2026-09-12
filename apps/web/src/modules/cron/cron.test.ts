import { describe, expect, it } from 'vitest';
import { CronError, nextOccurrences, parseCron, SHORTHANDS } from './cron';

const field = (expr: string, name: string) =>
  parseCron(expr).fields.find((f) => f.name === name);

describe('parseCron — field expansion', () => {
  it('expands a wildcard to the whole range', () => {
    expect(field('* * * * *', 'minute')?.values).toHaveLength(60);
    expect(field('* * * * *', 'hour')?.values).toHaveLength(24);
    expect(field('* * * * *', 'dayOfMonth')?.values).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });

  it('expands a single value', () => {
    expect(field('30 * * * *', 'minute')?.values).toEqual([30]);
  });

  it('expands a range', () => {
    expect(field('* * * * 1-5', 'dayOfWeek')?.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('expands a list', () => {
    expect(field('0,15,30,45 * * * *', 'minute')?.values).toEqual([0, 15, 30, 45]);
  });

  it('expands a step over a wildcard', () => {
    expect(field('*/15 * * * *', 'minute')?.values).toEqual([0, 15, 30, 45]);
  });

  it('expands a step over a range', () => {
    expect(field('0 8-18/2 * * *', 'hour')?.values).toEqual([8, 10, 12, 14, 16, 18]);
  });

  it('treats a bare value with a step as running to the end of the field', () => {
    expect(field('0 9/3 * * *', 'hour')?.values).toEqual([9, 12, 15, 18, 21]);
  });

  it('accepts month names', () => {
    expect(field('0 0 1 JAN,jul *', 'month')?.values).toEqual([1, 7]);
  });

  it('accepts weekday names', () => {
    expect(field('0 0 * * mon-fri', 'dayOfWeek')?.values).toEqual([1, 2, 3, 4, 5]);
  });

  // Cron accepts both 0 and 7 for Sunday; they must not produce two distinct days.
  it('collapses day-of-week 7 onto 0', () => {
    expect(field('0 0 * * 7', 'dayOfWeek')?.values).toEqual([0]);
    expect(field('0 0 * * 0,7', 'dayOfWeek')?.values).toEqual([0]);
  });

  it('parses the six-field form with seconds', () => {
    const parsed = parseCron('30 0 12 * * *');
    expect(parsed.hasSeconds).toBe(true);
    expect(parsed.fields.find((f) => f.name === 'second')?.values).toEqual([30]);
  });

  it('normalises whitespace', () => {
    expect(parseCron('  0   9  *  *  1-5  ').normalized).toBe('0 9 * * 1-5');
  });
});

describe('parseCron — shorthands', () => {
  it('expands every documented shorthand', () => {
    for (const [shorthand, expansion] of Object.entries(SHORTHANDS)) {
      expect(parseCron(shorthand).normalized).toBe(expansion);
    }
  });

  it('is case insensitive', () => {
    expect(parseCron('@DAILY').normalized).toBe('0 0 * * *');
  });

  // @reboot has no recurring schedule, so saying that is more useful than projecting
  // a wrong one.
  it('explains that @reboot has no schedule', () => {
    expect(() => parseCron('@reboot')).toThrow(/no recurring schedule/i);
  });
});

describe('parseCron — errors', () => {
  it('rejects an empty expression', () => {
    expect(() => parseCron('   ')).toThrow(CronError);
  });

  it('rejects the wrong number of fields', () => {
    expect(() => parseCron('* * *')).toThrow(/Expected 5 fields/);
    expect(() => parseCron('* * * * * * *')).toThrow(/Expected 5 fields/);
  });

  it('names the field when a value is out of range', () => {
    expect(() => parseCron('60 * * * *')).toThrow(/minute field \(0-59\)/);
    expect(() => parseCron('0 24 * * *')).toThrow(/hour field \(0-23\)/);
    expect(() => parseCron('0 0 32 * *')).toThrow(/dayOfMonth field \(1-31\)/);
    expect(() => parseCron('0 0 1 13 *')).toThrow(/month field \(1-12\)/);
  });

  it('rejects a non-numeric value and hints at names where they apply', () => {
    expect(() => parseCron('abc * * * *')).toThrow(/not valid in the minute field/);
    expect(() => parseCron('0 0 1 xyz *')).toThrow(/Use a number or a name/);
  });

  it('rejects a zero or negative step', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow(/positive integer/);
    expect(() => parseCron('*/-1 * * * *')).toThrow(/positive integer/);
  });

  // Cron does not wrap ranges, so an inverted range would silently match nothing.
  it('explains an inverted range instead of matching nothing', () => {
    expect(() => parseCron('0 22-6 * * *')).toThrow(/does not wrap ranges/);
  });

  it('rejects an empty list term', () => {
    expect(() => parseCron('0,,30 * * * *')).toThrow(/Empty term/);
  });

  it('rejects an over-long expression', () => {
    expect(() => parseCron('*'.repeat(300))).toThrow(/too long/);
  });
});

describe('parseCron — description', () => {
  it('describes a daily time', () => {
    expect(parseCron('0 9 * * *').description).toContain('At 09:00');
  });

  it('describes every minute', () => {
    expect(parseCron('* * * * *').description).toContain('Every minute');
  });

  it('describes minutes past the hour', () => {
    expect(parseCron('30 * * * *').description).toContain('30 minutes past every hour');
  });

  it('names weekdays', () => {
    const description = parseCron('0 9 * * 1-5').description;
    expect(description).toContain('Monday');
    expect(description).toContain('Friday');
  });

  it('names months', () => {
    expect(parseCron('0 0 1 1 *').description).toContain('January');
  });
});

describe('parseCron — notes', () => {
  // The OR semantics of the two day fields is the single most common cron mistake.
  it('warns that the two day fields are OR-ed, not AND-ed', () => {
    const notes = parseCron('0 0 13 * 5').notes;
    expect(notes.some((n) => /OR, not AND/.test(n))).toBe(true);
  });

  it('does not warn when only one day field is restricted', () => {
    expect(parseCron('0 0 13 * *').notes.some((n) => /OR, not AND/.test(n))).toBe(false);
    expect(parseCron('0 0 * * 5').notes.some((n) => /OR, not AND/.test(n))).toBe(false);
  });

  it('warns about days that do not occur in every month', () => {
    expect(parseCron('0 0 31 * *').notes.some((n) => /not occur in every month/.test(n))).toBe(true);
  });

  it('warns about a once-a-minute schedule', () => {
    expect(parseCron('* * * * *').notes.some((n) => /1,440 times a day/.test(n))).toBe(true);
  });

  it('always notes the timezone caveat', () => {
    expect(parseCron('0 9 * * *').notes.some((n) => /timezone/i.test(n))).toBe(true);
  });
});

describe('nextOccurrences', () => {
  // A fixed local instant so projections are deterministic.
  const from = new Date(2026, 8, 12, 10, 30, 0); // 2026-09-12 10:30 local

  it('projects a daily schedule', () => {
    const dates = nextOccurrences(parseCron('0 9 * * *'), from, 3);

    expect(dates).toHaveLength(3);
    expect(dates[0]?.getDate()).toBe(13);
    expect(dates[0]?.getHours()).toBe(9);
    expect(dates[0]?.getMinutes()).toBe(0);
    expect(dates[1]?.getDate()).toBe(14);
    expect(dates[2]?.getDate()).toBe(15);
  });

  it('starts strictly after the given instant', () => {
    const dates = nextOccurrences(parseCron('30 10 * * *'), from, 1);
    // 10:30 today is the `from` instant itself, so the next is tomorrow.
    expect(dates[0]?.getDate()).toBe(13);
  });

  it('projects a step schedule within the hour', () => {
    const dates = nextOccurrences(parseCron('*/15 * * * *'), from, 3);
    expect(dates.map((d) => d.getMinutes())).toEqual([45, 0, 15]);
  });

  it('respects a weekday restriction', () => {
    // 2026-09-12 is a Saturday, so a Mon-Fri schedule skips to Monday the 14th.
    const dates = nextOccurrences(parseCron('0 9 * * 1-5'), from, 1);
    expect(dates[0]?.getDay()).toBe(1);
    expect(dates[0]?.getDate()).toBe(14);
  });

  it('respects a month restriction', () => {
    const dates = nextOccurrences(parseCron('0 0 1 1 *'), from, 2);
    expect(dates[0]?.getFullYear()).toBe(2027);
    expect(dates[0]?.getMonth()).toBe(0);
    expect(dates[1]?.getFullYear()).toBe(2028);
  });

  // Both day fields restricted means OR, so this fires on the 13th and on Fridays.
  it('applies OR semantics when both day fields are restricted', () => {
    const dates = nextOccurrences(parseCron('0 0 13 * 5'), from, 3);
    for (const date of dates) {
      const isThirteenth = date.getDate() === 13;
      const isFriday = date.getDay() === 5;
      expect(isThirteenth || isFriday).toBe(true);
    }
    // The next Friday (18th) and the 13th of October both appear.
    expect(dates.some((d) => d.getDay() === 5)).toBe(true);
  });

  it('projects a seconds-precision schedule', () => {
    const dates = nextOccurrences(parseCron('*/30 * * * * *'), from, 2);
    expect(dates[0]?.getSeconds()).toBe(30);
    expect(dates[1]?.getSeconds()).toBe(0);
  });

  it('returns nothing for a schedule that can never fire', () => {
    // 30 February does not exist.
    expect(nextOccurrences(parseCron('0 0 30 2 *'), from, 3)).toHaveLength(0);
  });

  it('handles a leap-day schedule', () => {
    const dates = nextOccurrences(parseCron('0 0 29 2 *'), from, 1);
    expect(dates[0]?.getFullYear()).toBe(2028);
    expect(dates[0]?.getMonth()).toBe(1);
    expect(dates[0]?.getDate()).toBe(29);
  });

  it('defaults to five occurrences', () => {
    expect(nextOccurrences(parseCron('0 9 * * *'), from)).toHaveLength(5);
  });
});

describe('parseCron — description wording', () => {
  // The descriptions are user-facing, so they must not leak internal field names.
  it('never leaks a camelCase field name', () => {
    for (const expr of ['* * * * *', '0 9 * * 1-5', '*/5 * * * *', '0 0 1 1 *', '30 0 12 * * *']) {
      const parsed = parseCron(expr);
      const text = [parsed.description, ...parsed.fields.map((f) => f.description)].join(' ');

      expect(text).not.toMatch(/dayOfMonth|dayOfWeek/);
    }
  });

  it('describes a wildcard day-of-month in words', () => {
    expect(field('0 9 * * 1-5', 'dayOfMonth')?.description).toBe('Every day of the month.');
  });

  it('describes a wildcard day-of-week in words', () => {
    expect(field('0 9 1 * *', 'dayOfWeek')?.description).toBe('Every day of the week.');
  });

  it('pluralises a step description', () => {
    expect(field('*/5 * * * *', 'minute')?.description).toBe('Every 5 minutes.');
  });

  it('describes a single value with a readable noun', () => {
    expect(field('0 9 * * *', 'hour')?.description).toBe('At hour 9.');
  });

  // A wildcard day-of-month matches whatever days the month has, so the
  // short-month warning is not applicable.
  it('does not warn about short months when day-of-month is a wildcard', () => {
    const notes = parseCron('0 9 * * 1-5').notes;
    expect(notes.some((n) => /not occur in every month/.test(n))).toBe(false);
  });

  it('still warns when a short-month day is named explicitly', () => {
    expect(parseCron('0 0 31 * *').notes.some((n) => /not occur in every month/.test(n))).toBe(true);
  });
});
