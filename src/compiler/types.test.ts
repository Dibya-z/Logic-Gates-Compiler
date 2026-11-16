import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAN, LIMITS } from './types';

describe('compiler contracts', () => {
  it('bounds exhaustive evaluation to 4096 rows', () => expect(2 ** LIMITS.inputs).toBe(4096));
  it('uses one-based source locations', () => expect(DEFAULT_SPAN).toMatchObject({ line: 1, column: 1, offset: 0 }));
});
