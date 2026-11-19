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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/yank-prefix-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 117);
for (const expected of results) {
  const ring = new KillRing();
  ring.restore(['new', 'middle', 'old']);
  const state = new EditorState('xy', expected.start, ring);
  if (expected.marked !== 'unset') {
    state.mark = 0;
    state.active = expected.marked === 'active';
  }
  const rawUniversal = expected.keys.startsWith('C-u ');
  const first = expected.keys.split(' C-y')[0];
  const counts: Record<string, number> = {
    'C-y': 1,
    'C-u': 4,
    'C-u C-u': 16,
    'M-0': 0,
    'M-1': 1,
    'M-2': 2,
    'M-3': 3,
    'M-4': 4,
    'M--': -1,
    'M-- M-2': -2,
  };
  const count = counts[first];
  assert.notEqual(count, undefined, expected.keys);
  let failed = false;
  try {
    state.yank(undefined, count, rawUniversal);
    if (expected.keys.endsWith(' M-y'))
      state.yankPop(expected.keys.includes('M-- M-2 M-y') ? -2 : 1);
  } catch {
    failed = true;
  }
  assert.deepEqual(
    {
      text: state.text,
      point: state.point,
      mark: state.mark ?? null,
      active: state.active,
      current: ring.current(),
      failed,
    },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      current: expected.current,
      failed: expected.failed,
    },
    `${expected.keys}, start=${expected.start}, mark=${expected.marked}`,
  );
}
console.log(`${results.length} numeric and universal yank cases matched Emacs 31.1`);
