import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const cases = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/mark-sexp-oracle.el')],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  ),
);
for (const expected of cases) {
  for (const lineEnding of ['\n', '\r\n']) {
    const offset = (position: number) =>
      expected.input.slice(0, position).replace(/\n/g, lineEnding).length;
    const input = expected.input.replace(/\n/g, lineEnding);
    const ring = new KillRing();
    ring.add('sentinel', 'forward', false);
    const state = new EditorState(input, offset(expected.start), ring);
    if (expected.markKind !== 'unset') {
      state.mark = expected.markKind.endsWith('end') ? input.length : 0;
      state.active = expected.markKind.startsWith('active');
    }
    let failed = false;
    try {
      for (let iteration = 0; iteration < expected.repeat; iteration++)
        state.markSexp(expected.count, expected.prefixed);
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
        ring: ring.values(),
      },
      {
        text: expected.text.replace(/\n/g, lineEnding),
        point: offset(expected.point),
        mark: expected.mark === null ? null : offset(expected.mark),
        active: expected.active,
        failed: expected.failed,
        ring: expected.ring,
      },
      `${JSON.stringify(expected)} line ending ${JSON.stringify(lineEnding)}`,
    );
  }
}
console.log(`${cases.length} mark-sexp cases matched Emacs 31.1 and CRLF equivalents`);
