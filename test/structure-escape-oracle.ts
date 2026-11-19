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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/structure-escape-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of cases) {
  const state = new EditorState(expected.input, 0, new KillRing());
  state.setMark();
  state.point = expected.start;
  let failed = false;
  try {
    state.moveStructure(expected.count);
  } catch {
    failed = true;
  }
  assert.deepEqual(
    { text: state.text, point: state.point, mark: state.mark, active: state.active, failed },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      failed: expected.failed,
    },
    JSON.stringify(expected),
  );
}
console.log(`${cases.length} escaped structural motion cases matched GNU Emacs 31.1`);
