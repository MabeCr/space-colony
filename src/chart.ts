const BLOCKS = ' ▁▂▃▄▅▆▇█';
const MAX_WIDTH = 60;
const ROWS = 6;

/** Shrink a series to at most `width` points by averaging neighbours. */
function downsample(values: number[], width: number): number[] {
  if (values.length <= width) return values;
  return Array.from({ length: width }, (_, i) => {
    const a = Math.floor((i * values.length) / width);
    const b = Math.max(a + 1, Math.floor(((i + 1) * values.length) / width));
    const part = values.slice(a, b);
    return part.reduce((x, y) => x + y, 0) / part.length;
  });
}

/**
 * A column chart of a series, oldest on the left, scaled from 0 up to `top`.
 * Returns lines ready to print: a y axis labelled with `top` and 0, bars, and a time caption.
 */
export function asciiChart(values: number[], top: number): string[] {
  const cols = downsample(values, MAX_WIDTH);
  const scale = top > 0 ? top : 1;
  const label = (n: number) => String(Math.round(n)).padStart(4);
  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const base = (ROWS - 1 - r) * 8;
    const bars = cols.map((v) => {
      const eighths = Math.round(Math.min(1, Math.max(0, v / scale)) * ROWS * 8);
      return BLOCKS[Math.min(8, Math.max(0, eighths - base))];
    }).join('');
    const axis = r === 0 ? label(top) : r === ROWS - 1 ? label(0) : '    ';
    rows.push(`${axis} │${bars}`);
  }
  rows.push(`     └${'─'.repeat(cols.length)}`);
  const ago = `-${values.length - 1}`;
  rows.push(`      ${ago}${' '.repeat(Math.max(1, cols.length - ago.length - 3))}now`);
  return rows;
}
