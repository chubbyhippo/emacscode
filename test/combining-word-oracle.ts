import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, '../../test/combining-word-oracle.el')], { encoding: 'utf8' }));
for (const expected of results) {
  const input = String.fromCodePoint(...expected.input);
  const start = String.fromCodePoint(...expected.input.slice(0, expected.start)).length;
  const ring: { values(): string[] } = new KillRing();
  const state: { text: string; point: number; moveWord(count: number): void; killWord(count: number): void; changeWordCase(kind: 'capitalize', count: number): void } = new EditorState(input, start, ring);
  let failed = false;
  try {
    if (expected.keys === 'M-f') state.moveWord(1);
    else if (expected.keys === 'M-b') state.moveWord(-1);
    else if (expected.keys === 'M-d') state.killWord(1);
    else if (expected.keys === 'M-c') state.changeWordCase('capitalize', 1);
    else throw new Error(`Unknown key sequence ${expected.keys}`);
  } catch { failed = true; }
  assert.deepEqual({ text: Array.from(state.text, character => character.codePointAt(0)), point: Array.from(state.text.slice(0, state.point)).length, ring: ring.values().map(value => Array.from(value, character => character.codePointAt(0))), failed },
    { text: expected.text, point: expected.point, ring: expected.ring, failed: expected.failed }, expected.keys);
}
console.log(`${results.length} combining-mark word cases matched GNU Emacs 31.1`);
