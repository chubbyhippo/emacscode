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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/transpose-sexp-oracle.el')],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  ),
);
for (const expected of cases) {
  for (const crlf of [false, true]) {
    const convert = (text: string) => text.replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert(expected.input);
    const ring = new KillRing();
    ring.restore(['sentinel']);
    const state = new EditorState(
      input,
      convert(expected.input.slice(0, expected.start)).length,
      ring,
    );
    if (expected.initial !== 'unset') {
      state.mark = expected.initial.endsWith('end') ? input.length : 0;
      state.active = expected.initial.startsWith('active');
    }
    let failed = false;
    try {
      state.transposeSexps(expected.count);
    } catch {
      failed = true;
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(failed, expected.failed, context);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : convert(expected.text.slice(0, expected.mark)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
    assert.deepEqual(ring.values(), expected.ring, context);
  }
}
console.log(`${cases.length} transpose-sexp cases matched Emacs 31.1 and CRLF equivalents`);
