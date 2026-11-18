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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/fill-paragraph-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of results) {
  if (expected.initial === 'active' && expected.start !== 0) continue;
  for (const crlf of [false, true]) {
    const convert = (text: string): string => text.replace(/\n/g, crlf ? '\r\n' : '\n');
    const state = new EditorState(
      convert(expected.input),
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
    );
    if (expected.initial !== 'unset') {
      state.mark = 0;
      state.active = expected.initial === 'active';
    }
    state.fillParagraph(expected.width, crlf ? '\r\n' : '\n');
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : convert(expected.text.slice(0, expected.mark)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
    checked++;
  }
}
console.log(`${checked} paragraph fill comparisons matched Emacs 31.1 and CRLF equivalents`);
