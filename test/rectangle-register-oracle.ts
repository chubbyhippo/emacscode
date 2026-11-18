import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
const { editRectangle, yankRectangle } = require('../../out/core/rectangles');
const { Registers } = require('../../out/core/registers');
const binary = process.env.EMACS_ORACLE;
if (!binary) throw new Error('Set EMACS_ORACLE to GNU Emacs 31.1 executable');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /GNU Emacs 31\.1\b/);
const cases = JSON.parse(
  execFileSync(
    binary,
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/rectangle-register-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of cases) {
  for (const crlf of [false, true]) {
    const convert = (value: string): string => value.replace(/\n/g, crlf ? '\r\n' : '\n');
    const input = convert('abcde\nfghij\nklmno');
    const top = 2;
    const bottom = crlf ? 10 : 9;
    const result = editRectangle(
      input,
      expected.reverse ? bottom : top,
      expected.reverse ? top : bottom,
      expected.delete ? 'delete' : 'copy',
    );
    const registers = new Registers();
    registers.setRectangle('r', result.rows);
    const value = registers.read('r');
    assert.equal(value.kind, 'rectangle');
    assert.deepEqual(result.rows, expected.rows);
    assert.equal(result.text, convert(expected.copied));
    assert.equal(
      yankRectangle(result.text, result.text.length, value.rows).text,
      convert(expected.text),
    );
  }
}
console.log(
  `${cases.length} rectangle register text examples matched Emacs 31.1 and CRLF equivalents`,
);
