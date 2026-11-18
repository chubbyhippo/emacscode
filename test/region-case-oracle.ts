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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/region-case-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of cases) {
  for (const crlf of [false, true]) {
    const convert = (text: string) => text.replace(/\n/g, crlf ? '\r\n' : '\n');
    const state = new EditorState(
      convert(expected.input),
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
    );
    state.mark = convert(expected.input.slice(0, expected['mark-start'])).length;
    state.active = true;
    state.changeRegionCase(expected.kind);
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(expected.error, null, context);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(state.mark, convert(expected.text.slice(0, expected.mark)).length, context);
    assert.equal(state.active, expected.active, context);
    checked++;
  }
}
console.log(`${checked} region case comparisons matched Emacs 31.1 and CRLF equivalents`);
