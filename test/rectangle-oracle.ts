const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { editRectangle, yankRectangle } = require('../../out/core/rectangles');

const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
const version = execFileSync(binary, ['--version'], { encoding: 'utf8' });
assert.match(version, /GNU Emacs 31\.1\b/);
const output = execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'rectangle-oracle.el')], { encoding: 'utf8' });
const results = JSON.parse(output);
for (const expected of results) {
  const text = 'abcde\nfghij\nklmno';
  const actual = expected.kind === 'yank'
    ? yankRectangle(text, 2, ['XY', 'ZZ'])
    : editRectangle(text, 9, 2, expected.kind);
  assert.equal(actual.text, expected.text, expected.kind);
  assert.equal(actual.point + 1, expected.point, expected.kind);
  if (expected.rectangle) assert.deepEqual(actual.rows, expected.rectangle, expected.kind);
}
const shortOutput = execFileSync(binary, ['--batch', '-Q', '-l', path.join(__dirname, '../../test/', 'short-rectangle-oracle.el')], { encoding: 'utf8' });
for (const expected of JSON.parse(shortOutput)) {
  const actual = editRectangle('abcde\nx\nabcde', 12, 1, expected.kind);
  assert.equal(actual.text, expected.text, expected.kind);
  if (expected.rows) assert.deepEqual(actual.rows, expected.rows, expected.kind);
}
console.log('Ten rectangle examples matched GNU Emacs 31.1');
