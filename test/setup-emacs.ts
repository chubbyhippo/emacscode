const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
import { setup, validate, buildSource } from '../scripts/setup-emacs';
import type { ExecFileSyncOptions } from 'node:child_process';

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'emacscode-setup-test-'));
  try {
    const target = path.join(temporary, 'emacs');
    const badArchive = path.join(temporary, 'invalid.zip');
    await fs.writeFile(badArchive, 'invalid archive');
    if ((process.platform === 'win32' && process.arch === 'x64') || ['linux', 'darwin'].includes(process.platform)) {
      await assert.rejects(setup({ target, archive: badArchive, ignoreOverride: true }), /SHA-256 mismatch/);
      assert.deepEqual((await fs.readdir(temporary)).sort(), ['invalid.zip']);
      const archive = process.env.EMACS_TEST_ARCHIVE;
      if (archive) {
        const binary = await setup({ target, archive, ignoreOverride: true, required: true });
        if (!binary) throw new Error('Expected an Emacs installation');
        assert.equal(validate(binary), binary);
        assert.equal(await setup({ target, ignoreOverride: true }), binary);
        const { execFileSync } = require('node:child_process');
        assert.equal(execFileSync(binary, ['--batch', '-Q', '--eval', "(progn (require 'rect) (princ (if (fboundp 'string-rectangle) 1 0)))"], { encoding: 'utf8' }), '1');
      }
    } else {
      assert.equal(await setup({ target, ignoreOverride: true }), undefined);
      await assert.rejects(setup({ target, ignoreOverride: true, required: true }), /supports Windows x64, Linux, and macOS/);
    }
    for (const platform of ['linux', 'darwin']) {
      const calls: { command: string; args: string[]; options: ExecFileSyncOptions }[] = [];
      const installed = buildSource(badArchive, temporary, target, platform, (command, args, options) => { calls.push({ command, args, options }); });
      assert.deepEqual(calls.map(call => call.command), ['tar', 'sh', 'make', 'make']);
      assert.deepEqual(calls[0].args, ['-xzf', badArchive, '-C', temporary]);
      assert.ok(calls[1].args.includes(`--prefix=${target}`));
      assert.ok(calls[1].args.includes('--without-all'));
      assert.ok(calls[1].args.includes('--without-x'));
      assert.equal(calls[1].args.includes('--without-ns'), platform === 'darwin');
      assert.equal(calls[1].options.cwd, path.join(temporary, 'emacs-31.1'));
      assert.match(calls[2].args[0], /^-j[1-4]$/);
      assert.deepEqual(calls[3].args, ['install', `DESTDIR=${path.join(temporary, 'install')}`]);
      assert.equal(installed, path.join(temporary, 'install', target.slice(path.parse(target).root.length)));
    }
    assert.throws(() => buildSource(badArchive, temporary, target, 'linux', () => { throw new Error('missing tar'); }), /missing tar/);
    const invalidTarget = path.join(temporary, 'invalid-install');
    await fs.mkdir(invalidTarget);
    await assert.rejects(setup({ target: invalidTarget, ignoreOverride: true }), /is invalid/);
    const previousOverride = process.env.EMACS_ORACLE;
    process.env.EMACS_ORACLE = path.join(temporary, 'missing');
    try {
      await assert.rejects(setup({ target, required: true }), /ENOENT/);
    } finally {
      if (previousOverride === undefined) delete process.env.EMACS_ORACLE;
      else process.env.EMACS_ORACLE = previousOverride;
    }
    console.log('Emacs setup checks passed');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
