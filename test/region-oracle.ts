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
    ['--batch', '-Q', '-l', path.join(__dirname, '../../test/region-oracle.el')],
    { encoding: 'utf8' },
  ),
);
for (const expected of results) {
  const ring = new KillRing();
  ring.restore(['older']);
  const inactive = expected.name.startsWith('inactive-');
  const state = new EditorState(
    'alpha beta',
    expected.name.startsWith('forward-') || inactive ? 5 : 0,
    ring,
  );
  if (!expected.name.startsWith('unset-')) {
    state.mark = expected.name.startsWith('reverse-') ? 5 : 0;
    state.active = !inactive;
  }
  let failed = false;
  try {
    state.region(expected.name.endsWith('copy'));
  } catch {
    failed = true;
  }
  const actual = {
    text: state.text,
    point: state.point,
    mark: state.mark ?? null,
    active: state.active,
    failed,
    ring: ring.values(),
  };
  if (inactive) {
    assert.equal(expected.failed, false, expected.name);
    assert.deepEqual(
      actual,
      { text: 'alpha beta', point: 5, mark: 0, active: false, failed: true, ring: ['older'] },
      expected.name,
    );
  } else {
    assert.deepEqual(
      actual,
      {
        text: expected.text,
        point: expected.point,
        mark: expected.mark,
        active: expected.active,
        failed: expected.failed,
        ring: expected.ring,
      },
      expected.name,
    );
  }
}
console.log(
  `${results.length - 2} region kill/copy cases matched GNU Emacs 31.1; 2 inactive-mark cases intentionally reject`,
);
