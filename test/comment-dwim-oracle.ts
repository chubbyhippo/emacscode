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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/comment-dwim-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let total = 0;
for (const expected of results.point) {
  for (const crlf of [false, true]) {
    const convert = (value: string) => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert(expected.input);
    const state = new EditorState(
      input,
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
    );
    const context = JSON.stringify({ ...expected, crlf });
    if (expected.error !== null) {
      assert.throws(() => state.commentDwim('//'), context);
    } else {
      state.commentDwim('//');
    }
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    total++;
  }
}
for (const expected of results.region) {
  for (const crlf of [false, true]) {
    const convert = (value: string) => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert(expected.input);
    const state = new EditorState(
      input,
      convert(expected.input.slice(0, expected['point-arg'])).length,
      new KillRing(),
    );
    state.mark = convert(expected.input.slice(0, expected.mark)).length;
    state.active = true;
    const context = JSON.stringify({ ...expected, crlf });
    state.commentDwim('//');
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark2 === null ? undefined : convert(expected.text.slice(0, expected.mark2)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
    total++;
  }
}
for (const expected of results.prefix) {
  for (const crlf of [false, true]) {
    const convert = (value: string) => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const ring = new KillRing();
    const state = new EditorState(
      convert(expected.input),
      convert(expected.input.slice(0, expected.start)).length,
      ring,
    );
    const raw = expected.keys.startsWith('C-u');
    const count = raw
      ? 4
      : Number((expected.keys.startsWith('M--') ? '-' : '') + expected.keys.match(/M-(\d)/)?.[1]);
    const context = JSON.stringify({ ...expected, crlf });
    if (expected.error) {
      assert.throws(() => state.commentDwim('//', 8, false, 32, count, raw), context);
      assert.equal(state.text, convert(expected.input), context);
      total++;
      continue;
    }
    state.commentDwim('//', 8, false, 32, count, raw);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : convert(expected.text.slice(0, expected.mark)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
    assert.deepEqual(ring.values(), expected.ring.map(convert), context);
    total++;
  }
}
console.log(
  `${total} comment-dwim comparisons checked against GNU Emacs 31.1 and CRLF equivalents; invalid-prefix edits are atomic`,
);
