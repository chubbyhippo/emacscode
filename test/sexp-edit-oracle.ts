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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/sexp-edit-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of cases) {
  const ring = new KillRing();
  const state = new EditorState(expected.input, expected.start, ring);
  if (expected.kind === 'mark') state.markSexp(expected.count, true);
  else if (expected.kind === 'kill') state.killSexp(expected.count);
  else state.transposeSexps(expected.count);
  assert.deepEqual(
    {
      text: state.text,
      point: state.point,
      mark: state.mark ?? null,
      active: state.active,
      ring: ring.values(),
    },
    {
      text: expected.text,
      point: expected.point,
      mark: expected.mark,
      active: expected.active,
      ring: expected.ring,
    },
    JSON.stringify(expected),
  );
}
console.log(`${cases.length} structural editing cases matched Emacs 31.1`);
