import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing, CharacterBoundaryError } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const cases = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/goal-column-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of cases) {
  for (const crlf of [false, true]) {
    const convert = (value: string): string => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const text = convert(expected.input);
    const goal: { column?: number } = {};
    const state = new EditorState(
      text,
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
      goal,
    );
    state.setMark();
    state.setGoalColumn(false, 4);
    if (expected.clear) state.setGoalColumn(true, 4);
    else state.lineBoundary(false);
    let failure = null;
    try {
      state.vertical(1, 4);
    } catch (error) {
      if (!(error instanceof CharacterBoundaryError)) throw error;
      failure = error.boundary;
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(state.point, convert(expected.input.slice(0, expected.point)).length, context);
    assert.equal(state.mark, convert(expected.input.slice(0, expected.mark)).length, context);
    assert.equal(state.active, expected.active, context);
    assert.equal(goal.column ?? null, expected.goal, context);
    assert.equal(failure, expected.error, context);
    checked++;
  }
}
console.log(`${checked} goal-column comparisons matched Emacs 31.1 and CRLF equivalents`);
