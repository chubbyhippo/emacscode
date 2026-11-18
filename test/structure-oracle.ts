import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const cases = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/structure-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of cases) {
  const quote = expected.input.indexOf('"');
  const endQuote = expected.input.lastIndexOf('"');
  if (quote >= 0 && expected.start > quote && expected.start <= endQuote) continue;
  if (expected.start > 0 && expected.input[expected.start - 1] === '\\') continue;
  const state = new EditorState(expected.input, expected.start, new KillRing());
  state.setMark();
  let failed = false;
  try {
    if (expected.kind === 'down' || expected.kind === 'up')
      state.moveListDepth(expected.count, expected.kind === 'up');
    else state.moveStructure(expected.count, expected.kind === 'list');
  } catch {
    failed = true;
  }
  assert.equal(failed, expected.failed, JSON.stringify(expected));
  assert.deepEqual(
    { point: state.point, mark: state.mark, active: state.active },
    { point: expected.point, mark: expected.start, active: true },
    JSON.stringify(expected),
  );
  checked++;
}
console.log(`${checked} plain-text structural movement and error cases matched GNU Emacs 31.1`);
