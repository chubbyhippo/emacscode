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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/transpose-unicode-oracle.el')],
    { encoding: 'utf8' },
  ),
);
const encode = (characters: number[], crlf: boolean) =>
  String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
let compared = 0;
for (const expected of results) {
  if (expected.error !== null) continue;
  for (const crlf of [false, true]) {
    const offset = (characters: number[], position: number) =>
      encode(characters.slice(0, position), crlf).length;
    const state = new EditorState(
      encode(expected.input, crlf),
      offset(expected.input, expected.start),
      new KillRing(),
    );
    state.mark = offset(expected.input, expected.startMark);
    state.active = expected.startActive;
    const context = JSON.stringify({ ...expected, crlf });
    state.transposeCharacters(expected.count);
    assert.equal(state.text, encode(expected.text, crlf), context);
    assert.equal(state.point, offset(expected.text, expected.point), context);
    assert.equal(state.mark, offset(expected.text, expected.mark), context);
    assert.equal(state.active, expected.active, context);
    compared++;
  }
}
console.log(`${compared} successful Unicode/LF/CRLF transpose cases matched GNU Emacs 31.1`);
