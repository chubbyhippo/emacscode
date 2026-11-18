import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { CharacterBoundaryError, EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/vertical-boundary-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const translate = (offset: number): number =>
      offset + (crlf ? (expected.text.slice(0, offset).match(/\n/g) ?? []).length : 0);
    const text = crlf ? expected.text.replace(/\n/g, '\r\n') : expected.text;
    const state = new EditorState(text, translate(expected.start), new KillRing());
    state.setMark();
    let count = expected.key.includes('M-2') ? 2 : expected.key.includes('M-0') ? 0 : 1;
    if (expected.key.includes('M--')) count = -count;
    if (expected.key.endsWith('C-p')) count = -count;
    let error = null;
    try {
      state.vertical(count);
    } catch (failure) {
      if (!(failure instanceof CharacterBoundaryError)) throw failure;
      error = failure.boundary;
    }
    assert.deepEqual(
      { point: state.point, mark: state.mark, active: state.active, text: state.text, error },
      {
        point: translate(expected.point),
        mark: translate(expected.mark),
        active: expected.active,
        text,
        error: expected.error,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
    if (expected.error) {
      try {
        state.vertical(expected.error === 'end-of-buffer' ? -1 : 1);
      } catch (failure) {
        if (!(failure instanceof CharacterBoundaryError)) throw failure;
      }
      assert.equal(
        state.point,
        translate(expected.recovery),
        `${JSON.stringify(expected)} recovery CRLF=${crlf}`,
      );
      assert.equal(state.mark, translate(expected.mark));
      assert.equal(state.active, expected.active);
    }
  }
}
console.log(`${results.length} vertical boundary cases matched Emacs 31.1 and CRLF equivalents`);
