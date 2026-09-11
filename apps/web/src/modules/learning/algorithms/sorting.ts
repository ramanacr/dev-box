import { type Step } from './contracts';

export function* bubbleSortSteps(input: number[]): Generator<Step<number[]>> {
  const arr = [...input];
  const n = arr.length;

  yield {
    state: [...arr],
    explanation: 'Initial unsorted array',
    highlighted: [],
  };

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      const valJ = arr[j] ?? 0;
      const valJ1 = arr[j + 1] ?? 0;

      yield {
        state: [...arr],
        explanation: `Comparing arr[${j}] (${valJ}) and arr[${j + 1}] (${valJ1})`,
        highlighted: [j, j + 1],
      };

      if (valJ > valJ1) {
        arr[j] = valJ1;
        arr[j + 1] = valJ;

        yield {
          state: [...arr],
          explanation: `Swapped: arr[${j}] > arr[${j + 1}]`,
          highlighted: [j, j + 1],
        };
      }
    }
  }

  yield {
    state: [...arr],
    explanation: 'Array is sorted!',
    highlighted: [],
  };
}

export function* mergeSortSteps(input: number[]): Generator<Step<number[]>> {
  const arr = [...input];

  yield {
    state: [...arr],
    explanation: 'Initial unsorted array',
    highlighted: [],
  };

  function* merge(start: number, mid: number, end: number): Generator<Step<number[]>> {
    const left = arr.slice(start, mid + 1);
    const right = arr.slice(mid + 1, end + 1);

    let i = 0;
    let j = 0;
    let k = start;

    while (i < left.length && j < right.length) {
      const leftVal = left[i] ?? 0;
      const rightVal = right[j] ?? 0;

      yield {
        state: [...arr],
        explanation: `Comparing left element ${leftVal} with right element ${rightVal}`,
        highlighted: [start + i, mid + 1 + j],
      };

      if (leftVal <= rightVal) {
        arr[k] = leftVal;
        i++;
      } else {
        arr[k] = rightVal;
        j++;
      }
      yield {
        state: [...arr],
        explanation: `Placed element at index ${k}`,
        highlighted: [k],
      };
      k++;
    }

    while (i < left.length) {
      const leftVal = left[i] ?? 0;
      arr[k] = leftVal;
      yield {
        state: [...arr],
        explanation: `Placed remaining left element ${leftVal} at index ${k}`,
        highlighted: [k],
      };
      i++;
      k++;
    }

    while (j < right.length) {
      const rightVal = right[j] ?? 0;
      arr[k] = rightVal;
      yield {
        state: [...arr],
        explanation: `Placed remaining right element ${rightVal} at index ${k}`,
        highlighted: [k],
      };
      j++;
      k++;
    }
  }

  function* divideAndMerge(start: number, end: number): Generator<Step<number[]>> {
    if (start >= end) return;
    const mid = Math.floor((start + end) / 2);
    yield* divideAndMerge(start, mid);
    yield* divideAndMerge(mid + 1, end);
    yield* merge(start, mid, end);
  }

  yield* divideAndMerge(0, arr.length - 1);

  yield {
    state: [...arr],
    explanation: 'Merge sort complete! Array is sorted.',
    highlighted: [],
  };
}
