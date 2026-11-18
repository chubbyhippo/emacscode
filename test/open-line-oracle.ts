import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing, OpenLineError } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/open-line-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
for (const expected of results) {
  const source = String.fromCodePoint(...expected.characters);
  const output = String.fromCodePoint(...expected.output);
  for (const crlf of [false, true]) {
    const convert = (value: string): string => (crlf ? value.replace(/\n/g, '\r\n') : value);
    const offset = (value: string, index: number): number =>
      convert(Array.from(value).slice(0, index).join('')).length;
    const state = new EditorState(convert(source), offset(source, expected.start), new KillRing());
    if (expected.markState !== 'unset') {
      state.mark = offset(source, expected.markPosition);
      state.active = expected.markState === 'active';
    }
    const count = expected.key.startsWith('M--')
      ? -1
      : expected.key.startsWith('M-0')
        ? 0
        : expected.key.startsWith('M-2')
          ? 2
          : 1;
    let error = null;
    try {
      state.openLine(count, crlf ? '\r\n' : '\n');
    } catch (failure) {
      if (!(failure instanceof OpenLineError)) throw failure;
      error = 'error';
    }
    assert.deepEqual(
      {
        text: state.text,
        point: state.point,
        mark: state.mark ?? null,
        active: state.active,
        error,
      },
      {
        text: convert(output),
        point: offset(output, expected.point),
        mark: expected.mark === null ? null : offset(output, expected.mark),
        active: expected.active,
        error: expected.error,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
  }
}
console.log(`${results.length} open-line cases matched Emacs 31.1 and CRLF equivalents`);
