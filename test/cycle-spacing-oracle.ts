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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/cycle-spacing-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (value: string) => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const state = new EditorState(
      convert(expected.input),
      convert(expected.input.slice(0, expected.start)).length,
      new KillRing(),
    );
    let count: number | undefined;
    let negative = false;
    for (const key of expected.keys.split(' ')) {
      if (key === 'M--') negative = true;
      else if (/^M-\d$/.test(key)) count = Number(key.slice(2)) * (negative ? -1 : 1);
      else if (key === 'M-SPC') {
        state.cycleSpacing(count);
        count = undefined;
        negative = false;
      } else if (key === 'C-b') state.moveCharacter(-1);
      else throw new Error(`Unknown key ${key}`);
    }
    const context = JSON.stringify({ ...expected, crlf });
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
  }
}
console.log(
  `${results.length} spacing cycle sequences matched GNU Emacs 31.1; CRLF equivalents checked`,
);
