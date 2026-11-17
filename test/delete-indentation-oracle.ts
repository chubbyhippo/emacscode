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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/delete-indentation-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (characters: number[]) =>
      String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
    const offset = (characters: number[], position: number) =>
      convert(characters.slice(0, position)).length;
    const input = convert(expected.input);
    const ring = new KillRing();
    ring.add('older', 'forward', false);
    const state = new EditorState(input, offset(expected.input, expected.start), ring);
    if (expected.initial !== 'unset') state.mark = input.length;
    state.active = expected.initial === 'active';
    state.deleteIndentation(expected.prefix);
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, offset(expected.text, expected.point), context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : offset(expected.text, expected.mark),
      context,
    );
    assert.equal(state.active, expected.active, context);
    assert.deepEqual(ring.values(), ['older'], context);
  }
}
console.log(`${results.length} line-join cases matched GNU Emacs 31.1; CRLF equivalents checked`);
