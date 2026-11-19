import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/whitespace-mark-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 895);
const offset = (text: string, position: number, crlf: boolean): number =>
  Array.from(text)
    .slice(0, position)
    .join('')
    .replace(/\n/g, crlf ? '\r\n' : '\n').length;
for (const expected of results) {
  const input = String.fromCodePoint(...expected.input);
  const text = String.fromCodePoint(...expected.text);
  for (const crlf of [false, true]) {
    const convert = (value: string): string => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const ring = new KillRing();
    ring.add('older', 'forward', false);
    const state = new EditorState(convert(input), offset(input, expected.start, crlf), ring);
    if (expected.initialMark !== null) {
      state.mark = offset(input, expected.initialMark, crlf);
      state.active = expected.markState === 'active';
    }
    let failed = false;
    try {
      state.deleteHorizontalSpace(!!expected.prefix);
    } catch {
      failed = true;
    }
    assert.deepEqual(
      {
        text: state.text,
        point: state.point,
        mark: state.mark ?? null,
        active: state.active,
        failed,
        ring: ring.values(),
      },
      {
        text: convert(text),
        point: offset(text, expected.point, crlf),
        mark: expected.mark === null ? null : offset(text, expected.mark, crlf),
        active: expected.active,
        failed: expected.failed,
        ring: ['older'],
      },
      `${JSON.stringify(input)} at ${expected.start}, ${expected.markState} ${expected.initialMark}, ${expected.prefix}, CRLF=${crlf}`,
    );
  }
}
console.log(`${results.length} whitespace cases matched Emacs 31.1 and CRLF equivalents`);
