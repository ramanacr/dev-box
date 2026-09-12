import { describe, expect, it } from 'vitest';
import { JsonPathError, queryJsonPath } from './jsonPath';

const store = {
  store: {
    book: [
      { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
      { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
      { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', price: 8.99, isbn: '0-553-21311-3' },
      { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', price: 22.99, isbn: '0-395-19395-8' },
    ],
    bicycle: { color: 'red', price: 19.95 },
  },
};

const values = (expr: string, root: unknown = store) => queryJsonPath(root, expr).values;

describe('JSONPath — structural selectors', () => {
  it('returns the root', () => {
    expect(values('$')).toEqual([store]);
  });

  it('selects a named child', () => {
    expect(values('$.store.bicycle.color')).toEqual(['red']);
  });

  it('selects with bracket notation', () => {
    expect(values("$['store']['bicycle']['color']")).toEqual(['red']);
  });

  it('selects an array element', () => {
    expect(values('$.store.book[0].title')).toEqual(['Sayings of the Century']);
  });

  it('supports a negative index', () => {
    expect(values('$.store.book[-1].title')).toEqual(['The Lord of the Rings']);
  });

  it('supports a union of indexes', () => {
    expect(values('$.store.book[0,2].title')).toEqual(['Sayings of the Century', 'Moby Dick']);
  });

  it('supports a union of names', () => {
    expect(values("$.store.bicycle['color','price']")).toEqual(['red', 19.95]);
  });

  it('supports a slice', () => {
    expect(values('$.store.book[1:3].title')).toEqual(['Sword of Honour', 'Moby Dick']);
  });

  it('supports an open-ended slice', () => {
    expect(values('$.store.book[2:].title')).toEqual(['Moby Dick', 'The Lord of the Rings']);
    expect(values('$.store.book[:2].title')).toEqual(['Sayings of the Century', 'Sword of Honour']);
  });

  it('supports a slice with a step', () => {
    expect(values('$.store.book[0:4:2].title')).toEqual(['Sayings of the Century', 'Moby Dick']);
  });

  it('supports a wildcard over an array', () => {
    expect(values('$.store.book[*].price')).toEqual([8.95, 12.99, 8.99, 22.99]);
  });

  it('supports a wildcard over an object', () => {
    expect(values('$.store.bicycle.*')).toEqual(['red', 19.95]);
  });

  it('supports recursive descent', () => {
    expect(values('$..price')).toEqual([8.95, 12.99, 8.99, 22.99, 19.95]);
  });

  it('supports recursive descent to a nested object property', () => {
    expect(values('$..isbn')).toEqual(['0-553-21311-3', '0-395-19395-8']);
  });

  it('returns nothing for a missing property rather than throwing', () => {
    expect(values('$.store.nothing.here')).toEqual([]);
  });

  it('returns nothing for an out-of-range index', () => {
    expect(values('$.store.book[99]')).toEqual([]);
  });

  it('accepts a bare leading property path', () => {
    expect(values('store.bicycle.color')).toEqual(['red']);
  });
});

describe('JSONPath — filters', () => {
  it('filters by greater-than', () => {
    expect(values('$.store.book[?(@.price > 10)].title')).toEqual([
      'Sword of Honour',
      'The Lord of the Rings',
    ]);
  });

  it('filters by less-than-or-equal', () => {
    expect(values('$.store.book[?(@.price <= 8.99)].title')).toEqual([
      'Sayings of the Century',
      'Moby Dick',
    ]);
  });

  it('filters by string equality', () => {
    expect(values('$.store.book[?(@.category == "reference")].title')).toEqual([
      'Sayings of the Century',
    ]);
  });

  it('filters by inequality', () => {
    expect(values('$.store.book[?(@.category != "fiction")].title')).toEqual([
      'Sayings of the Century',
    ]);
  });

  it('filters by property presence', () => {
    expect(values('$.store.book[?(@.isbn)].title')).toEqual([
      'Moby Dick',
      'The Lord of the Rings',
    ]);
  });

  it('accepts single-quoted filter values', () => {
    expect(values("$.store.book[?(@.category == 'reference')].title")).toEqual([
      'Sayings of the Century',
    ]);
  });

  it('accepts a filter without the surrounding parentheses', () => {
    expect(values('$.store.book[?@.price > 20].title')).toEqual(['The Lord of the Rings']);
  });

  it('compares strings in order', () => {
    // "fiction" (x3) and "reference" all sort after "f".
    expect(values('$.store.book[?(@.category > "f")].title')).toHaveLength(4);
    // Only "reference" sorts after "g".
    expect(values('$.store.book[?(@.category > "g")].title')).toEqual([
      'Sayings of the Century',
    ]);
  });

  it('does not match when types differ for an ordering comparison', () => {
    expect(values('$.store.book[?(@.category > 10)]')).toEqual([]);
  });

  it('filters against booleans and null', () => {
    const data = { items: [{ ok: true }, { ok: false }, { ok: null }] };
    expect(values('$.items[?(@.ok == true)]', data)).toEqual([{ ok: true }]);
    expect(values('$.items[?(@.ok == null)]', data)).toEqual([{ ok: null }]);
  });

  it('filters a nested property path', () => {
    const data = { rows: [{ meta: { n: 1 } }, { meta: { n: 5 } }] };
    expect(values('$.rows[?(@.meta.n > 3)]', data)).toEqual([{ meta: { n: 5 } }]);
  });

  // The engine must never evaluate user text as code. Filter bodies are parsed into
  // a typed form; eval and the Function constructor are not used anywhere.
  it('does not execute code in a filter expression', () => {
    const marker = '__jsonpath_filter_escape__';
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope[marker];

    const attempts = [
      `$.a[?(globalThis['${marker}'] = 1)]`,
      `$.a[?(globalThis["${marker}"]=true)]`,
      `$.a[?(@.b == 1 && (globalThis['${marker}'] = 1))]`,
    ];

    for (const attempt of attempts) {
      // Either the expression is rejected or it simply matches nothing. What must
      // never happen is the side effect running.
      try {
        queryJsonPath({ a: [{ b: 1 }] }, attempt);
      } catch (error) {
        expect(error).toBeInstanceOf(JsonPathError);
      }
      expect(globalScope[marker]).toBeUndefined();
    }
  });
});

describe('JSONPath — reported paths', () => {
  it('reports a normalised path for each match', () => {
    const result = queryJsonPath(store, '$.store.book[?(@.price > 20)].title');
    expect(result.paths).toEqual(["$['store']['book'][3]['title']"]);
  });

  it('reports array indexes numerically', () => {
    expect(queryJsonPath(store, '$.store.book[1]').paths).toEqual(["$['store']['book'][1]"]);
  });
});

describe('JSONPath — errors', () => {
  it('rejects an empty expression', () => {
    expect(() => queryJsonPath(store, '   ')).toThrow(/Enter a JSONPath expression/i);
  });

  it('rejects an unbalanced bracket', () => {
    expect(() => queryJsonPath(store, '$.store.book[0')).toThrow(/Unbalanced/i);
  });

  it('rejects an empty subscript', () => {
    expect(() => queryJsonPath(store, '$.store[]')).toThrow(/Empty/i);
  });

  it('rejects a dot with no property name', () => {
    expect(() => queryJsonPath(store, '$.store.')).toThrow(/Expected a property name/i);
  });

  it('rejects a mixed union of names and indexes', () => {
    expect(() => queryJsonPath(store, "$.store['book',0]")).toThrow(/Cannot interpret/i);
  });

  it('rejects an unquoted filter value that is not a literal', () => {
    expect(() => queryJsonPath(store, '$.store.book[?(@.category == reference)]')).toThrow(
      /Cannot interpret/i,
    );
  });

  it('rejects a non-integer slice bound', () => {
    expect(() => queryJsonPath(store, '$.store.book[1.5:2]')).toThrow(/must be an integer/i);
  });

  it('rejects an over-long expression', () => {
    expect(() => queryJsonPath(store, '$.' + 'a.'.repeat(600))).toThrow(/too long/i);
  });

  it('caps a result set that would explode', () => {
    // A wide recursive descent over a large structure.
    const wide = { items: Array.from({ length: 12000 }, (_, i) => ({ i })) };
    expect(() => queryJsonPath(wide, '$..*')).toThrow(/more than/i);
  });
});
