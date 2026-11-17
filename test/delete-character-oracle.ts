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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/delete-character-oracle.el')],
    { encoding: 'utf8' },
  ),
);
const text = (characters: number[]) => String.fromCodePoint(...characters);
for (const expected of results) {
  const input = text(expected.input);
  const ring = new KillRing();
  ring.add('older', 'forward', false);
  const state = new EditorState(input, text(expected.input.slice(0, expected.start)).length, ring);
  if (expected.markState !== 'unset') state.mark = input.length;
  state.active = expected.markState === 'active';
  const match = expected.keys.match(/^(?:(M-- )?M-(\d+) )?C-d$/);
  assert.ok(match, expected.keys);
  const count = (match[2] === undefined ? 1 : Number(match[2])) * (match[1] ? -1 : 1);
  let error: string | null = null;
  try {
    state.deleteCharacter(count, match[2] !== undefined);
  } catch (failure) {
    error = failure.code ?? failure.boundary;
  }
  const result = text(expected.text);
  const context = JSON.stringify(expected);
  assert.equal(error, expected.error, context);
  assert.equal(state.text, result, context);
  assert.equal(state.point, text(expected.text.slice(0, expected.point)).length, context);
  assert.equal(
    state.mark,
    expected.mark === null ? undefined : text(expected.text.slice(0, expected.mark)).length,
    context,
  );
  assert.equal(state.active, expected.active, context);
  assert.deepEqual(ring.values(), expected.ring.map(text), context);
}
console.log(`${results.length} character deletion sequences matched GNU Emacs 31.1`);
