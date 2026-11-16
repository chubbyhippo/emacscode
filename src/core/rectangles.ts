export type RectangleAction = 'copy' | 'kill' | 'delete' | 'clear' | 'open';
export type RectangleResult = { text: string; point: number; rows: string[] };

type Lines = { lines: string[]; separator: string };

function splitLines(text: string): Lines {
  const withoutCrLf = text.replace(/\r\n/g, '');
  if (withoutCrLf.includes('\r') || (text.includes('\r\n') && withoutCrLf.includes('\n'))) throw new Error('Mixed line endings are not supported for rectangles');
  const separator = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(separator), separator };
}

function locate(text: string, offset: number, lines: Lines): { row: number; column: number } {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new Error('Invalid rectangle position');
  let start = 0;
  for (let row = 0; row < lines.lines.length; row++) {
    const end = start + lines.lines[row].length;
    if (offset <= end) return { row, column: offset - start };
    if (offset < end + lines.separator.length) throw new Error('Position falls inside a line ending');
    start = end + lines.separator.length;
  }
  throw new Error('Invalid rectangle position');
}

function assertSimple(lines: readonly string[]): void {
  if (lines.some(line => /[^\x20-\x7e]/.test(line))) throw new Error('Rectangles currently require ASCII text without tabs');
}

function offsetAt(lines: Lines, row: number, column: number): number {
  let offset = 0;
  for (let index = 0; index < row; index++) offset += lines.lines[index].length + lines.separator.length;
  return offset + Math.min(column, lines.lines[row].length);
}

export function editRectangle(text: string, mark: number, point: number, action: RectangleAction): RectangleResult {
  if (!['copy', 'kill', 'delete', 'clear', 'open'].includes(action)) throw new Error('Invalid rectangle action');
  const data = splitLines(text);
  const first = locate(text, mark, data);
  const second = locate(text, point, data);
  const top = Math.min(first.row, second.row);
  const bottom = Math.max(first.row, second.row);
  const left = Math.min(first.column, second.column);
  const right = Math.max(first.column, second.column);
  const width = right - left;
  assertSimple(data.lines.slice(top, bottom + 1));
  const rows = data.lines.slice(top, bottom + 1).map(line => line.slice(left, right).padEnd(width, ' '));
  if (action !== 'copy' && width > 0) {
    for (let row = top; row <= bottom; row++) {
      const line = data.lines[row];
      if (action === 'delete' || action === 'kill') data.lines[row] = line.slice(0, left) + line.slice(right);
      if (action === 'clear' && line.length > left) data.lines[row] = line.slice(0, left) + ' '.repeat(Math.min(width, line.length - left)) + line.slice(right);
      if (action === 'open' && line.length > left) data.lines[row] = line.slice(0, left) + ' '.repeat(width) + line.slice(left);
    }
  }
  return { text: data.lines.join(data.separator), point: action === 'copy' ? point : offsetAt(data, top, left), rows };
}

export function yankRectangle(text: string, point: number, rows: readonly string[]): RectangleResult {
  if (rows.length === 0) throw new Error('No killed rectangle');
  const data = splitLines(text);
  const target = locate(text, point, data);
  assertSimple(rows);
  assertSimple(data.lines.slice(target.row, target.row + rows.length));
  for (let index = 0; index < rows.length; index++) {
    const row = target.row + index;
    if (row >= data.lines.length) data.lines.push('');
    const line = data.lines[row].padEnd(target.column, ' ');
    data.lines[row] = line.slice(0, target.column) + rows[index] + line.slice(target.column);
  }
  const last = target.row + rows.length - 1;
  return { text: data.lines.join(data.separator), point: offsetAt(data, last, target.column + rows[rows.length - 1].length), rows: [...rows] };
}
