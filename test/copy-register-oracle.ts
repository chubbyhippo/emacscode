import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');
const { Registers } = require('../../out/core/registers');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/copy-register-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 40);
let compared = 0;
for (const expected of results) {
  if (expected.region === 'inactive') continue;
  compared++;
  const state = new EditorState('abcdef', expected.region === 'reverse' ? 1 : 4, new KillRing());
  if (expected.region !== 'unset') {
    state.mark = expected.region === 'empty' ? state.point : expected.region === 'reverse' ? 4 : 1;
    state.active = true;
  }
  const registers = new Registers();
  registers.setText('r', 'old');
  let failed = false;
  try {
    registers.prepareCopy(state, 'r', !!expected.prefix)();
  } catch {
    failed = true;
  }
  const value = registers.read('r');
  assert.deepEqual(
    {
      text: state.text,
      point: state.point,
      mark: state.mark ?? null,
      active: state.active,
      failed,
      value: value.text,
    },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      failed: expected.failed,
      value: expected.value,
    },
    `${expected.key} ${expected.region} ${expected.prefix}`,
  );
}
assert.equal(compared, 32);
console.log(`${compared} copy-to-register cases matched Emacs 31.1; inactive marks excluded`);
