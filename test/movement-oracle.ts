const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EditorState, KillRing, PrefixArgument } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
const version = execFileSync(binary, ['--version'], { encoding: 'utf8' });
assert.match(version, /GNU Emacs 31\.1\b/);
const output = execFileSync(
  binary,
  ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'movement-oracle.el')],
  { encoding: 'utf8' },
);
const cases = {
  n: { line: 1, move: (state, count) => state.vertical(count) },
  p: { line: 13, move: (state, count) => state.vertical(-count) },
  f: { line: 1, move: (state, count) => state.moveCharacter(count) },
  b: { line: 1, move: (state, count) => state.moveCharacter(-count) },
};
const text = Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789').join('\n');
for (const expected of JSON.parse(output)) {
  const testCase = cases[expected.key];
  assert.ok(testCase);
  const state = new EditorState(text, testCase.line * 37 + 15, new KillRing());
  const prefix = new PrefixArgument();
  prefix.universal();
  prefix.digit(1);
  prefix.digit(2);
  testCase.move(state, prefix.consume());
  assert.equal(state.point + 1, expected.first, expected.key);
  testCase.move(state, prefix.consume());
  assert.equal(state.point + 1, expected.second, expected.key);
}
console.log('Held-Control prefix movement matched GNU Emacs 31.1 for C-n, C-p, C-f and C-b');
