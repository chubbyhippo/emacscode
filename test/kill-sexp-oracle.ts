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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/kill-sexp-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
for (const expected of cases) {
  for (const lineEnding of ['\n', '\r\n']) {
    const convert = (text: string) => text.replace(/\n/g, lineEnding);
    const offset = (text: string, position: number) => convert(text.slice(0, position)).length;
    const ring = new KillRing();
    ring.restore(['older']);
    const state = new EditorState(
      convert(expected.input),
      offset(expected.input, expected.start ?? 0),
      ring,
    );
    if (expected.sequence) {
      state.killSexp(1);
      assert.throws(() => state.killSexp(1));
      assert.equal(expected.failed, true);
      assert.equal(state.text, convert(expected.failureText));
      assert.equal(state.point, offset(expected.failureText, expected.failurePoint));
      assert.deepEqual(ring.values(), expected.failureRing.map(convert));
      state.killWord(1);
    } else {
      state.setMark();
      let failed = false;
      try {
        state.killSexp(expected.count);
      } catch {
        failed = true;
      }
      assert.equal(failed, expected.failed, JSON.stringify(expected));
      assert.equal(
        state.mark,
        expected.mark === null ? undefined : offset(expected.text, expected.mark),
        JSON.stringify(expected),
      );
      assert.equal(state.active, expected.active, JSON.stringify(expected));
    }
    assert.equal(state.text, convert(expected.text), JSON.stringify(expected));
    assert.equal(state.point, offset(expected.text, expected.point), JSON.stringify(expected));
    assert.deepEqual(ring.values(), expected.ring.map(convert), JSON.stringify(expected));
  }
}
console.log(`${cases.length} structural kill cases matched Emacs 31.1 and CRLF equivalents`);
