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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/position-page-oracle.el')],
    { encoding: 'utf8' },
  ),
);
let checked = 0;
for (const expected of results) {
  const input = String.fromCodePoint(...expected.input);
  for (const crlf of [false, true]) {
    const convert = (offset: number): number => {
      const prefix = Array.from(input).slice(0, offset).join('');
      return prefix.length + (crlf ? (prefix.match(/\n/g) ?? []).length : 0);
    };
    const text = crlf ? input.replace(/\n/g, '\r\n') : input;
    if (expected.kind === 'column' && /[^\x20-\x7e\t\r\n]/u.test(text)) continue;
    const state = new EditorState(text, convert(expected.start), new KillRing());
    state.mark = text.length;
    state.active = true;
    if (expected.kind === 'character') state.gotoCharacter(expected.count);
    else if (expected.kind === 'page') state.movePage(expected.count);
    else if (expected.count < 0) assert.throws(() => state.moveToColumn(expected.count));
    else state.moveToColumn(expected.count);
    assert.deepEqual(
      { point: state.point, mark: state.mark, active: state.active, text: state.text },
      {
        point: convert(expected.point),
        mark: convert(expected.mark),
        active: expected.active,
        text,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
    checked++;
  }
}
console.log(`${checked} character, page and column cases matched Emacs and CRLF equivalents`);
