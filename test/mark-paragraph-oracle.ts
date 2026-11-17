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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/mark-paragraph-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const text = (characters: number[]) =>
      String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
    const offset = (position: number) => text(expected.input.slice(0, position)).length;
    const input = text(expected.input);
    const state = new EditorState(input, offset(expected.start), new KillRing());
    if (expected.initial !== 'unset') state.mark = input.length;
    state.active = expected.initial === 'active';
    let error = null;
    try {
      state.markParagraph(expected.count);
    } catch {
      error = 'error';
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(error, expected.error, context);
    assert.equal(state.point, offset(expected.point), context);
    assert.equal(state.mark, expected.mark === null ? undefined : offset(expected.mark), context);
    assert.equal(state.active, expected.active, context);
    assert.equal(state.text, input, context);
  }
}
console.log(`${results.length} mark-paragraph cases matched GNU Emacs 31.1; CRLF offsets verified`);
