import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, '../../test/unicode-word-oracle.el')], { encoding: 'utf8' }));
const offsets: Record<string, number[]> = { 'M-f': [4, 5], 'M-b': [0, 2], 'M-2 M-f': [7], 'M-2 M-b': [0], 'M-d': [0], 'M-DEL': [0], 'M-@': [0] };
const oracleOffsets: Record<string, number[]> = { 'M-f': [1, 1], 'M-b': [2, 2], 'M-2 M-f': [2], 'M-2 M-b': [3], 'M-d': [0], 'M-DEL': [2], 'M-@': [0] };
for (const expected of results) {
  const input = String.fromCodePoint(...expected.input);
  const start = String.fromCodePoint(...expected.input.slice(0, expected.start)).length;
  const ring: { values(): string[] } = new KillRing();
  const state: { text: string; point: number; mark: number | undefined; moveWord(count: number): void; killWord(count: number): void; markWord(count: number, hasPrefix: boolean): void } = new EditorState(input, start, ring);
  const match = expected.keys.match(/^(?:M-2 )?M-(f|b|d|DEL|@)$/);
  assert.ok(match, expected.keys);
  const count = expected.keys.startsWith('M-2 ') ? 2 : 1;
  let failed = false;
  try {
    if (match[1] === 'f') state.moveWord(count);
    else if (match[1] === 'b') state.moveWord(-count);
    else if (match[1] === 'd') state.killWord(count);
    else if (match[1] === 'DEL') state.killWord(-count);
    else state.markWord(1, false);
  } catch { failed = true; }
  const actual = { text: Array.from(state.text, character => character.codePointAt(0)), point: Array.from(state.text.slice(0, state.point)).length, mark: state.mark === undefined ? null : Array.from(state.text.slice(0, state.mark)).length, ring: ring.values().map(value => Array.from(value, character => character.codePointAt(0))), failed };
  assert.equal(state.point, offsets[expected.keys].shift(), expected.keys);
  assert.equal(expected.point, oracleOffsets[expected.keys].shift(), expected.keys);
  assert.equal(expected.failed, false, expected.keys);
  assert.equal(actual.failed, false, expected.keys);
  if (expected.keys === 'M-@') { assert.equal(state.mark, 4, expected.keys); assert.equal(expected.mark, 1, expected.keys); }
  if (expected.keys === 'M-d' || expected.keys === 'M-DEL') {
    assert.deepEqual(actual.text, [32, 99], expected.keys);
    assert.deepEqual(actual.ring, [[97, 66560, 98]], expected.keys);
    assert.deepEqual(expected.ring, [expected.keys === 'M-d' ? [97] : [98]], expected.keys);
  } else assert.deepEqual(actual.text, expected.input, expected.keys);
}
console.log(`${results.length} Unicode word cases checked; Emacs syntax-table differences are recorded`);
