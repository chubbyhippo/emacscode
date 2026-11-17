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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/kill-sentence-oracle.el')],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (characters: number[]) =>
      String.fromCodePoint(...characters).replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert(expected.input);
    const ring = new KillRing();
    ring.restore(['older']);
    const state = new EditorState(
      input,
      convert(expected.input.slice(0, expected.start)).length,
      ring,
    );
    state.setMark();
    let error = null;
    try {
      if (expected.keys) {
        for (const operation of (
          {
            'M-k M-k': ['forward', 'forward'],
            'C-x DEL C-x DEL': ['backward', 'backward'],
            'M-d M-k': ['word', 'forward'],
            'M-0 M-k M-k': ['zero', 'forward'],
            'M-k C-y': ['forward', 'yank'],
            'C-x DEL C-y': ['backward', 'yank'],
          } as Record<string, string[]>
        )[expected.keys]) {
          if (operation === 'word') state.killWord(1);
          else if (operation === 'yank') state.yank();
          else state.killSentence(operation === 'zero' ? 0 : operation === 'backward' ? -1 : 1);
        }
      } else state.killSentence(expected.key === 'M-k' ? expected.count : -expected.count);
    } catch (failure) {
      error = failure.boundary ?? failure.message;
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(error, expected.error, context);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(state.mark, convert(expected.text.slice(0, expected.mark)).length, context);
    assert.equal(state.active, expected.active, context);
    assert.deepEqual(ring.values(), expected.ring.map(convert), context);
  }
}
console.log(
  `${results.length} sentence-kill sequences matched GNU Emacs 31.1; CRLF equivalents verified`,
);
