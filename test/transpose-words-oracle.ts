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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/transpose-words-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (text: string) => text.replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert(expected.input);
    const state = new EditorState(
      input,
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
    );
    if (expected.initial === 'active') {
      state.mark = input.length;
      state.active = true;
    }
    let failed = false;
    try {
      state.transposeWords(expected.count);
    } catch {
      failed = true;
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(failed, expected.error !== null, context);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : convert(expected.text.slice(0, expected.mark)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
  }
}
console.log(`${results.length} transpose-word cases matched Emacs 31.1; CRLF equivalents checked`);
