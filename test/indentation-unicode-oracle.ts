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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/indentation-unicode-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 468);
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
    const state = new EditorState(
      convert(input),
      offset(input, expected.start, crlf),
      new KillRing(),
    );
    if (expected.markState !== 'unset') {
      state.mark = 0;
      state.active = expected.markState === 'active';
    }
    let failed = false;
    try {
      state.backToIndentation();
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
      },
      {
        text: convert(text),
        point: offset(text, expected.point, crlf),
        mark: expected.mark === null ? null : offset(text, expected.mark, crlf),
        active: expected.active,
        failed: expected.failed,
      },
      `${JSON.stringify(input)} at ${expected.start}, ${expected.markState}, ${expected.prefix}, CRLF=${crlf}`,
    );
  }
}
console.log(`${results.length} indentation cases matched Emacs 31.1 and CRLF equivalents`);
