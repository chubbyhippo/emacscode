const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EditorState, KillRing } = require('../../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const expected = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'zap-oracle.el')],
    { encoding: 'utf8' },
  ),
);
const cases = [
  [0, 1, 'a'],
  [1, 2, 'a'],
  [9, -1, 'a'],
  [9, -2, 'a'],
  [0, 1, 'A'],
  [0, 0, 'a'],
  [0, 2, 'z'],
];
for (const [index, [point, count, character]] of cases.entries()) {
  const ring = new KillRing();
  const state = new EditorState('abcAdefa!', point, ring);
  let failure = false;
  try {
    state.zapToChar(character, count);
  } catch {
    failure = true;
  }
  assert.equal(state.text, expected[index].text);
  assert.equal(state.point + 1, expected[index].point);
  assert.equal(failure, expected[index].failure);
  if (count !== 0) assert.equal(ring.current() ?? null, expected[index].kill);
}
console.log('Seven zap-to-char examples matched GNU Emacs 31.1; empty kills differ');
