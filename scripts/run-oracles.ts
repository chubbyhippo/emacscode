const { execFileSync } = require('node:child_process');
const path = require('node:path');
import { setup } from './setup-emacs';

const tests = [
  'oracle.js',
  'movement-oracle.js',
  'character-boundary-oracle.js',
  'delete-character-oracle.js',
  'backward-delete-oracle.js',
  'line-boundary-oracle.js',
  'paragraph-oracle.js',
  'mark-paragraph-oracle.js',
  'unicode-word-oracle.js',
  'combining-word-oracle.js',
  'rectangle-oracle.js',
  'zap-oracle.js',
  'word-case-oracle.js',
  'transpose-oracle.js',
  'transpose-mark-oracle.js',
  'transpose-unicode-oracle.js',
  'whitespace-oracle.js',
  'cycle-spacing-oracle.js',
  'delete-blank-lines-oracle.js',
  'indentation-oracle.js',
  'mark-word-oracle.js',
  'kill-line-oracle.js',
  'region-oracle.js',
];

async function main() {
  const binary = await setup({ required: true });
  for (const test of tests) {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'test', test)], {
      stdio: 'inherit',
      env: { ...process.env, EMACS_ORACLE: binary },
    });
  }
}

main().catch((error) => {
  console.error(`Oracle tests failed: ${error.message}`);
  process.exitCode = 1;
});
