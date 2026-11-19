import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing, ZapSearchError } = require('../../out/core/editor');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/zap-failure-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 9);
for (const expected of results) {
  const ring = new KillRing();
  ring.add('older', 'forward', false);
  const state = new EditorState('alpha beta', 2, ring);
  if (expected.markState !== 'unset') {
    state.mark = 0;
    state.active = expected.markState === 'active';
  }
  let failed = false;
  try {
    state.zapToChar(
      expected.keys.includes('M-3') ? 'a' : 'z',
      expected.keys.startsWith('M--') ? -1 : expected.keys.startsWith('M-3') ? 3 : 1,
    );
  } catch (error) {
    assert.ok(error instanceof ZapSearchError);
    failed = true;
  }
  assert.deepEqual(
    {
      text: state.text,
      point: state.point,
      mark: state.mark ?? null,
      active: state.active,
      ring: ring.values(),
      failed,
    },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      ring: expected.ring,
      failed: expected.failed,
    },
    `${expected.keys}, ${expected.markState}`,
  );
}
console.log(`${results.length} zap failures matched Emacs 31.1`);
