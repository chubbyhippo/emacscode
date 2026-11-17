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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/line-boundary-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  const match = expected.keys.match(/^(?:(M-- )?M-(\d+) )?C-([ae])$/);
  assert.ok(match, expected.keys);
  const count = match[2] === undefined ? 1 : Number(match[2]) * (match[1] ? -1 : 1);
  const state = new EditorState(expected.text, expected.start, new KillRing());
  let failed = false;
  try {
    state.lineBoundary(match[3] === 'e', count);
  } catch {
    failed = true;
  }
  assert.equal(state.point, expected.point, expected.keys);
  assert.equal(failed, expected.failed, expected.keys);
  assert.equal(state.text, expected.text, expected.keys);
  const crlf = expected.text.replace(/\n/g, '\r\n');
  const start = expected.text.slice(0, expected.start).replace(/\n/g, '\r\n').length;
  const point = expected.text.slice(0, expected.point).replace(/\n/g, '\r\n').length;
  const crlfState = new EditorState(crlf, start, new KillRing());
  crlfState.lineBoundary(match[3] === 'e', count);
  assert.equal(crlfState.point, point, `${expected.keys} CRLF`);
}
console.log(
  `${results.length} line boundary sequences matched GNU Emacs 31.1; CRLF offsets verified`,
);
