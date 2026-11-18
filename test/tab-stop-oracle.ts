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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/tab-stop-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  for (const crlf of [false, true]) {
    const convert = (value: string): string => (crlf ? value.replace(/\n/g, '\r\n') : value);
    const offset = (value: string, position: number): number =>
      convert(value.slice(0, position)).length;
    const state = new EditorState(
      convert(expected.text),
      offset(expected.text, expected.start),
      new KillRing(),
    );
    if (expected.markState !== 'unset') {
      state.mark = offset(expected.text, expected.markPosition);
      state.active = expected.markState === 'active';
    }
    let failed = false;
    try {
      state.tabToTabStop(expected.tabSize, !expected.insertTabs);
    } catch {
      failed = true;
    }
    assert.deepEqual(
      {
        text: state.text,
        point: state.point,
        mark: state.mark ?? null,
        active: state.active,
        failed,
      },
      {
        text: convert(expected.output),
        point: offset(expected.output, expected.point),
        mark: expected.mark === null ? null : offset(expected.output, expected.mark),
        active: expected.active,
        failed: expected.error !== null,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
  }
}
console.log(`${results.length} tab-stop cases matched Emacs 31.1 and CRLF equivalents`);
