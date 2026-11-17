const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EditorState, KillRing } = require('../../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/transpose-mark-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  const state = new EditorState('abcdef', 3, new KillRing());
  state.mark = expected.startMark;
  state.active = expected.startActive;
  let failure = false;
  try {
    state.transposeCharacters(expected.count);
  } catch {
    failure = true;
  }
  assert.equal(failure, expected.error !== null, JSON.stringify(expected));
  assert.equal(state.text, expected.text, JSON.stringify(expected));
  assert.equal(state.point, expected.point, JSON.stringify(expected));
  assert.equal(state.mark, expected.mark, JSON.stringify(expected));
  assert.equal(state.active, expected.active, JSON.stringify(expected));
}
console.log(`${results.length} transpose mark examples matched GNU Emacs 31.1`);
