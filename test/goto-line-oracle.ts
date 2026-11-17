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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/goto-line-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (characters: number[]) =>
      String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
    const offset = (position: number) => convert(expected.input.slice(0, position)).length;
    const input = convert(expected.input);
    const state = new EditorState(input, offset(expected.start), new KillRing());
    if (expected.initial !== 'unset') state.mark = input.length;
    state.active = expected.initial === 'active';
    state.gotoLine(expected.line);
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(state.point, offset(expected.point), context);
    assert.equal(state.mark, expected.mark === null ? undefined : offset(expected.mark), context);
    assert.equal(state.active, expected.active, context);
    assert.equal(state.text, input, context);
    assert.equal(expected.error, null, context);
  }
}
console.log(`${results.length} goto-line cases matched GNU Emacs 31.1; CRLF equivalents checked`);
