import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/character-boundary-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  const input = String.fromCodePoint(...expected.text);
  const offset = (position: number) =>
    String.fromCodePoint(...expected.text.slice(0, position)).length;
  const match = expected.keys.match(/^(?:(M-- )?M-(\d+) )?C-([fb])$/);
  assert.ok(match, expected.keys);
  const count =
    (match[2] === undefined ? 1 : Number(match[2])) *
    (match[1] ? -1 : 1) *
    (match[3] === 'b' ? -1 : 1);
  const state = new EditorState(input, offset(expected.start), new KillRing());
  let error: string | null = null;
  try {
    state.moveCharacter(count);
  } catch (failure) {
    error = failure.boundary;
  }
  assert.equal(state.point, offset(expected.point), expected.keys);
  assert.equal(error, expected.error, expected.keys);
  assert.equal(state.text, input, expected.keys);
}
console.log(`${results.length} character boundary sequences matched GNU Emacs 31.1`);
