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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/append-next-kill-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let comparisons = 0;
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (value: string) => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const ring = new KillRing();
    ring.restore(expected.initialRing.map(convert));
    const state = new EditorState(
      convert(expected.input),
      convert(expected.input.slice(0, expected.start)).length,
      ring,
    );
    const context = JSON.stringify({ ...expected, crlf });
    const commands = expected.keys.split(' ');
    let argument: number | undefined;
    let universal = false;
    for (const command of commands) {
      if (command === 'C-u') {
        universal = true;
        continue;
      }
      if (/^M-\d$/.test(command)) {
        argument = Number(command.slice(2));
        continue;
      }
      switch (command) {
        case 'C-M-w':
          state.appendNextKill();
          break;
        case 'M-d':
          state.killWord(argument ?? (universal ? 4 : 1));
          break;
        case 'M-DEL':
          state.killWord(-(argument ?? (universal ? 4 : 1)));
          break;
        case 'C-k':
          state.killLine(argument ?? (universal ? 4 : 1), argument !== undefined || universal);
          break;
        case 'C-f':
          state.moveCharacter(argument ?? 1);
          break;
        case 'C-SPC':
          state.setMark();
          break;
        case 'M-w':
          state.region(true);
          break;
        case 'C-w':
          state.region();
          break;
        case 'C-y':
          state.yank(crlf ? '\r\n' : '\n');
          break;
        default:
          throw new Error(`Unknown oracle command ${command}`);
      }
      argument = undefined;
      universal = false;
    }
    assert.equal(expected.error, null, context);
    assert.equal(state.text, convert(expected.text), context);
    assert.equal(state.point, convert(expected.text.slice(0, expected.point)).length, context);
    assert.equal(
      state.mark,
      expected.mark === null ? undefined : convert(expected.text.slice(0, expected.mark)).length,
      context,
    );
    assert.equal(state.active, expected.active, context);
    assert.deepEqual(ring.values(), expected.ring.map(convert), context);
    comparisons++;
  }
}
console.log(`${comparisons} append-next-kill comparisons matched Emacs 31.1 and CRLF equivalents`);
