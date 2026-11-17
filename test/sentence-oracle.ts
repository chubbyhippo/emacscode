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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/sentence-oracle.el')],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (characters: number[]) =>
      String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
    const offset = (position: number) => convert(expected.input.slice(0, position)).length;
    const state = new EditorState(convert(expected.input), offset(expected.start), new KillRing());
    state.setMark();
    let error = null;
    try {
      state.moveSentence(expected.key === 'M-a' ? -expected.count : expected.count);
    } catch (failure) {
      error = failure.boundary ?? failure.message;
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(error, expected.error, context);
    assert.equal(state.point, offset(expected.point), context);
    assert.equal(state.mark, offset(expected.mark), context);
    assert.equal(state.active, expected.active, context);
    assert.equal(state.text, convert(expected.input), context);
  }
}
console.log(`${results.length} sentence sequences matched GNU Emacs 31.1; CRLF offsets verified`);
