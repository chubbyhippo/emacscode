const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EditorState, KillRing } = require('../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, 'kill-line-oracle.el')], { encoding: 'utf8' }));
for (const expected of results) {
  const ring = new KillRing();
  const state = new EditorState(expected.input, expected.start, ring);
  const counts = { 'C-u 1 C-k': 1, 'C-u 2 C-k': 2, 'M-- C-k': -1, 'M-0 C-k': 0, 'M-- M-2 C-k': -2, 'C-u 4 C-k': 4 };
  const hasPrefix = Object.hasOwn(counts, expected.keys);
  let failed = false;
  try { state.killLine(hasPrefix ? counts[expected.keys] : 1, hasPrefix); } catch { failed = true; }
  assert.equal(state.text, expected.text, expected.keys);
  assert.equal(state.point, expected.point, expected.keys);
  assert.equal(failed, expected.failed, expected.keys);
  if (expected.kill !== '') assert.equal(ring.current() ?? null, expected.kill, expected.keys);
}
console.log(`${results.length} kill-line examples matched GNU Emacs 31.1; empty kill-ring behavior differs`);
