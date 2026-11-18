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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/vertical-tabs-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
let checked = 0;
for (const expected of results) {
  for (const crlf of [false, true]) {
    const translate = (offset: number): number =>
      offset + (crlf ? (expected.text.slice(0, offset).match(/\n/g) ?? []).length : 0);
    const text = crlf ? expected.text.replace(/\n/g, '\r\n') : expected.text;
    const state = new EditorState(text, translate(expected.start), new KillRing());
    state.setMark();
    let failed = false;
    try {
      for (const key of expected.keys.split(' '))
        state.vertical(key === 'C-n' ? 1 : -1, expected.tabSize);
    } catch {
      failed = true;
    }
    assert.deepEqual(
      { point: state.point, mark: state.mark, active: state.active, text: state.text, failed },
      {
        point: translate(expected.point),
        mark: translate(expected.mark),
        active: expected.active,
        text,
        failed: expected.failed,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
    checked++;
  }
}
console.log(
  `${checked} tab-aware vertical movement comparisons, including failures, matched Emacs 31.1 and CRLF equivalents`,
);
