// Positional tests for the hand-rolled layouts. Adapted from
// patterns/tests/layout.test.ts.
//
// Area-only assertions pass on visually broken layouts: a treemap that stacks
// every cell at the same origin conserves total area perfectly and renders as
// garbage. So these assert POSITIONS — in-bounds, no NaN, no pairwise overlap,
// rows flush.

import { describe, expect, it } from 'vitest';
import { squarify, type Rect } from '../src/utils/squarify';
import { clampViewBox, zoomViewBox } from '../src/utils/svgZoom';
import { histogram, ratioBucket, median, quantile, clean, type Ranked } from '../src/analysis';

const W = 800;
const H = 400;

function overlapArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

describe('squarify', () => {
  const values = [86489, 82070, 47734, 44457, 36929, 28660, 26609, 23883, 20913, 19126, 18592, 17999];
  const rects = squarify(values, W, H);

  it('returns one rect per value', () => {
    expect(rects).toHaveLength(values.length);
  });

  it('produces no NaN or undefined coordinates', () => {
    for (const r of rects) {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Number.isFinite(r[k])).toBe(true);
      }
    }
  });

  it('keeps every rect inside the canvas', () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-0.01);
      expect(r.y).toBeGreaterThanOrEqual(-0.01);
      expect(r.x + r.w).toBeLessThanOrEqual(W + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(H + 0.01);
    }
  });

  it('has no rect with zero or negative extent', () => {
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it('never overlaps two rects', () => {
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlapArea(rects[i], rects[j])).toBeLessThan(0.5);
      }
    }
  });

  it('conserves total area', () => {
    const total = rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(total).toBeGreaterThan(W * H * 0.995);
    expect(total).toBeLessThan(W * H * 1.005);
  });

  it('allocates area in proportion to value', () => {
    const sum = values.reduce((a, b) => a + b, 0);
    rects.forEach((r, i) => {
      const expected = (values[i] / sum) * W * H;
      expect(Math.abs(r.w * r.h - expected)).toBeLessThan(expected * 0.02);
    });
  });

  it('survives degenerate input', () => {
    expect(squarify([], W, H)).toEqual([]);
    expect(squarify([1], W, H)[0].w).toBeCloseTo(W, 5);
    const zeros = squarify([0, 0], W, H);
    for (const r of zeros) {
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.w)).toBe(true);
    }
  });
});

describe('zoomViewBox', () => {
  const base = { x: 0, y: 0, w: 100, h: 100 };

  it('zooming in shrinks the box', () => {
    const vb = zoomViewBox(base, base, 2, 50, 50, 1, 8);
    expect(vb.w).toBeLessThan(base.w);
    expect(Number.isFinite(vb.x)).toBe(true);
  });

  it('respects the maximum scale', () => {
    let vb = base;
    for (let i = 0; i < 40; i++) vb = zoomViewBox(vb, base, 2, 50, 50, 1, 8);
    expect(vb.w).toBeGreaterThanOrEqual(base.w / 8 - 0.001);
  });

  it('never zooms out past the base box', () => {
    let vb = base;
    for (let i = 0; i < 40; i++) vb = zoomViewBox(vb, base, 0.5, 50, 50, 1, 8);
    expect(vb.w).toBeLessThanOrEqual(base.w + 0.001);
  });

  it('clamps a panned box back inside the base', () => {
    const vb = clampViewBox({ x: -500, y: -500, w: 50, h: 50 }, base);
    expect(vb.x).toBeGreaterThanOrEqual(base.x - 0.001);
    expect(vb.y).toBeGreaterThanOrEqual(base.y - 0.001);
    expect(vb.x + vb.w).toBeLessThanOrEqual(base.x + base.w + 0.001);
  });
});

describe('histogram binning', () => {
  const rows = (values: number[]): Ranked[] =>
    values.map((v, i) => ({ region: { code: `R${i}`, level: 'SA3', name: `R${i}`, state: null, d: {} } as never, value: v, rank: i + 1 }));

  it('places every row in exactly one bin', () => {
    const bins = histogram(rows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 5);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(10);
  });

  it('puts the maximum in the last bin rather than overflowing', () => {
    const bins = histogram(rows([0, 5, 10]), 5);
    expect(bins[bins.length - 1].count).toBeGreaterThanOrEqual(1);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(3);
  });

  it('produces contiguous, flush, ascending bins', () => {
    const bins = histogram(rows([10, 20, 30, 40]), 4);
    for (let i = 0; i < bins.length; i++) {
      expect(bins[i].hi).toBeGreaterThan(bins[i].lo);
      if (i > 0) expect(bins[i].lo).toBeCloseTo(bins[i - 1].hi, 6);
    }
  });

  it('produces no NaN edges when every value is identical', () => {
    const bins = histogram(rows([7, 7, 7]), 4);
    for (const b of bins) {
      expect(Number.isFinite(b.lo)).toBe(true);
      expect(Number.isFinite(b.hi)).toBe(true);
    }
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(3);
  });

  it('returns [] for empty input rather than one NaN bin', () => {
    expect(histogram([], 5)).toEqual([]);
  });

  it('keeps the items alongside the counts for the click-through', () => {
    const bins = histogram(rows([1, 2, 3]), 3);
    expect(bins.reduce((a, b) => a + b.items.length, 0)).toBe(3);
  });
});

describe('ratioBucket', () => {
  it('puts a value equal to the national figure in the parity bucket', () => {
    expect(ratioBucket(100, 100, true)).toBe(3);
  });

  it('increases with the ratio when higher is worse', () => {
    expect(ratioBucket(70, 100, true)).toBeLessThan(ratioBucket(200, 100, true));
  });

  it('inverts when higher is better, so a high median age reads as low burden', () => {
    expect(ratioBucket(200, 100, false)).toBeLessThan(ratioBucket(70, 100, false));
  });

  it('returns -1 for a suppressed value so it can be drawn as "no data"', () => {
    expect(ratioBucket(null, 100, true)).toBe(-1);
  });

  it('returns -1 rather than dividing by zero', () => {
    expect(ratioBucket(50, 0, true)).toBe(-1);
    expect(ratioBucket(50, null, true)).toBe(-1);
  });
});

describe('statistics ignore suppressed values rather than zeroing them', () => {
  it('clean drops null and undefined', () => {
    expect(clean([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it('median ignores nulls', () => {
    expect(median([1, null, 3])).toBe(2);
  });

  it('median averages the middle pair on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('median returns null when everything is suppressed', () => {
    expect(median([null, null])).toBeNull();
  });

  it('quantile interpolates', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([0, 5, 10], 1)).toBe(10);
  });

  it('quantile returns null for empty input', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
});
