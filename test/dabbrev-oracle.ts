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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/dabbrev-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of cases) {
  const state = new EditorState(expected.input, expected.start, new KillRing());
  for (const step of expected.steps) {
    const hasPrefix = step.sequence !== 'M-/';
    const count = step.sequence.startsWith('M--')
      ? -1
      : step.sequence.startsWith('M-2')
        ? 2
        : step.sequence.startsWith('M-0')
          ? 0
          : 1;
    let failed = false;
    try {
      state.expandAbbreviation(count, hasPrefix);
    } catch {
      failed = true;
    }
    const context = JSON.stringify({ input: expected.input, step });
    assert.equal(failed, step.error !== null, context);
    assert.equal(state.text, step.text, context);
    assert.equal(state.point, step.point, context);
    assert.equal(state.mark ?? null, step.mark, context);
    assert.equal(state.active, step.active, context);
    checked++;
  }
}
console.log(`${checked} abbreviation expansion and error steps matched Emacs 31.1`);
