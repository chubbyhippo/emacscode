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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/increment-register-oracle.el')],
    { encoding: 'utf8' },
  ),
);
assert.equal(results.length, 80);
let compared = 0;
for (const expected of results) {
  if (expected.region === 'inactive' && ['empty', 'text'].includes(expected.kind)) continue;
  compared++;
  const state = new EditorState('abcdef', expected.region === 'reverse' ? 1 : 4, new KillRing());
  if (expected.region !== 'unset') {
    state.mark = expected.region === 'empty' ? state.point : expected.region === 'reverse' ? 4 : 1;
    state.active = expected.region !== 'inactive';
  }
  const registers = new Registers();
  if (expected.kind === 'text') registers.setText('r', 'old');
  if (expected.kind === 'number') registers.setNumber('r', 7);
  if (expected.kind === 'rectangle') registers.setRectangle('r', ['a', 'b']);
  const amount =
    expected.prefix === 'C-u ' ? 4 : expected.prefix === 'M-0 ' ? 0 : expected.prefix ? -2 : 1;
  let failed = false;
  try {
    registers.prepareIncrement(state, 'r', amount, !!expected.prefix)();
  } catch {
    failed = true;
  }
  let value;
  try {
    const result = registers.read('r');
    value =
      result.kind === 'number' ? result.value : result.kind === 'text' ? result.text : result.rows;
  } catch {
    value = null;
  }
  assert.deepEqual(
    {
      text: state.text,
      point: state.point,
      mark: state.mark ?? null,
      active: state.active,
      failed,
      value,
    },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      failed: expected.failed,
      value: expected.value,
    },
    `${expected.kind} ${expected.region} ${expected.prefix}`,
  );
}
assert.equal(compared, 72);
console.log(
  `${compared} increment-register cases matched Emacs 31.1; inactive text regions excluded`,
);
