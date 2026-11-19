import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this test through npm');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emacscode-build-test-'));
try {
  for (const directory of ['src', 'scripts', 'test']) {
    fs.cpSync(path.join(root, directory), path.join(temporary, directory), {
      recursive: true,
      filter: (source) => !/^inventory.*\.ts$/.test(path.basename(source)),
    });
  }
  for (const file of [
    'package.json',
    'tsconfig.json',
    'tsconfig.tools.json',
    'configure-manifest.ts',
    '.vscode-test.mts',
  ])
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'junction');
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    EMACS_ORACLE: path.join(temporary, 'missing-emacs'),
  };
  delete environment.EMACS_TEST_ARCHIVE;
  for (const script of ['compile', 'test', 'test:keybindings', 'test:extension']) {
    const argumentsForScript = script === 'test:extension' ? ['--', '--help'] : [];
    const result = spawnSync(process.execPath, [npm, 'run', script, ...argumentsForScript], {
      cwd: temporary,
      env: environment,
      encoding: 'utf8',
      timeout: 180000,
    });
    assert.equal(
      result.status,
      0,
      `${script} failed: ${result.error || result.stdout + result.stderr}`,
    );
    if (script === 'compile') {
      assert.ok(fs.existsSync(path.join(temporary, 'out', 'extension.js')));
      assert.ok(fs.existsSync(path.join(temporary, '.build', 'test', 'steps', 'editing.js')));
      assert.ok(fs.existsSync(path.join(temporary, '.build', '.vscode-test.mjs')));
    }
    if (script === 'test:extension') assert.match(result.stdout, /usage|options/i);
    assert.equal(fs.existsSync(path.join(temporary, '.emacs-oracle')), false);
  }
  const oracle = spawnSync(process.execPath, [npm, 'run', 'test:oracle'], {
    cwd: temporary,
    env: environment,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.notEqual(oracle.status, 0);
  assert.match(oracle.stderr + oracle.stdout, /Oracle tests failed:.*(ENOENT|missing-emacs)/);
  assert.equal(fs.existsSync(path.join(temporary, '.emacs-oracle')), false);
  console.log('Build and core tests require no Emacs; oracle tests reject an invalid override');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
