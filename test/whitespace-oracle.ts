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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'whitespace-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  const state = new EditorState(expected.input, expected.start, new KillRing());
  state.deleteHorizontalSpace(expected.keys.startsWith('C-u'));
  assert.equal(state.text, expected.text, expected.keys);
  assert.equal(state.point, expected.point, expected.keys);
}
console.log(`${results.length} whitespace key sequences matched GNU Emacs 31.1`);
