const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EditorState, KillRing } = require('../../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'mark-word-oracle.el')], { encoding: 'utf8' }));
for (const expected of results) {
  const state = new EditorState(expected.text, expected.start, new KillRing());
  switch (expected.keys) {
    case 'M-@': state.markWord(1, false); break;
    case 'M-@ M-@': state.markWord(1, false); state.markWord(1, false); break;
    case 'M-2 M-@': state.markWord(2, true); break;
    case 'M-- M-2 M-@': state.markWord(-2, true); break;
    case 'M-0 M-@': state.markWord(0, true); break;
    case 'C-SPC M-b M-@': state.setMark(); state.moveWord(-1); state.markWord(1, false); break;
    case 'M-@ M-- M-2 M-@': state.markWord(1, false); state.markWord(-2, true); break;
    default: throw new Error(`Unexpected sequence ${expected.keys}`);
  }
  assert.equal(state.point, expected.point, expected.keys);
  assert.equal(state.mark, expected.mark, expected.keys);
  assert.equal(state.active, expected.active, expected.keys);
}
console.log(`${results.length} mark-word sequences matched GNU Emacs 31.1`);
