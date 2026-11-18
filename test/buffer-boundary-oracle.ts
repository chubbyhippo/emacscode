import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { EditorState, KillRing, PrefixArgument } = require('../../out/core/editor');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const results = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/buffer-boundary-oracle.el')],
    {
      encoding: 'utf8',
    },
  ),
);
let comparisons = 0;
for (const expected of results) {
  const original = String.fromCodePoint(...expected.characters);
  for (const crlf of [false, true]) {
    const offset = (position: number): number =>
      Array.from(original)
        .slice(0, position)
        .join('')
        .replace(/\n/g, crlf ? '\r\n' : '\n').length;
    const text = crlf ? original.replace(/\n/g, '\r\n') : original;
    const state = new EditorState(text, offset(expected.start), new KillRing());
    if (expected.markState !== 'unset') {
      state.mark = text.length;
      state.active = expected.markState === 'active';
    }
    const prefix = new PrefixArgument();
    for (const key of expected.prefix.trim().split(' ').filter(Boolean)) {
      if (key === 'C-u') prefix.universal();
      else if (key === 'M--') prefix.negative();
      else prefix.digit(Number(key.slice(2)));
    }
    const universal = prefix.rawUniversal;
    const hasPrefix = prefix.pending;
    const count = prefix.consume();
    let failed = false;
    try {
      state.bufferBoundary(
        expected.key === 'M->',
        hasPrefix && !universal ? count : undefined,
        universal,
      );
    } catch {
      failed = true;
    }
    assert.deepEqual(
      {
        point: state.point,
        mark: state.mark ?? null,
        active: state.active,
        text: state.text,
        failed,
      },
      {
        point: offset(expected.point),
        mark: expected.mark === null ? null : offset(expected.mark),
        active: expected.active,
        text,
        failed: expected.failed,
      },
      `${JSON.stringify(expected)} CRLF=${crlf}`,
    );
    comparisons++;
  }
}
console.log(`${comparisons} buffer-boundary comparisons matched Emacs 31.1 and CRLF equivalents`);
