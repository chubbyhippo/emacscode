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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/exchange-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
for (const expected of results) {
  const state = new EditorState('abcdef', expected.initialPoint, new KillRing());
  if (expected.markState !== 'unset') {
    state.mark = 2;
    state.active = expected.markState === 'active';
  }
  let failed = false;
  try {
    state.exchange(expected.key !== 'C-x C-x');
  } catch {
    failed = true;
  }
  assert.deepEqual(
    { point: state.point, mark: state.mark ?? null, active: state.active, failed },
    {
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      failed: expected.failed,
    },
    `${expected.markState} at ${expected.initialPoint}: ${expected.key}`,
  );
}
console.log(`${results.length} point/mark exchange cases matched GNU Emacs 31.1`);
