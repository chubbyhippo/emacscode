const { execFileSync } = require('node:child_process');
const path = require('node:path');
import { setup } from './setup-emacs';

const tests = [
  'oracle.js',
  'movement-oracle.js',
  'vertical-tabs-oracle.js',
  'goal-column-oracle.js',
  'vertical-boundary-oracle.js',
  'character-boundary-oracle.js',
  'delete-character-oracle.js',
  'open-line-oracle.js',
  'tab-stop-oracle.js',
  'backward-delete-oracle.js',
  'line-boundary-oracle.js',
  'buffer-boundary-oracle.js',
  'goto-line-oracle.js',
  'position-page-oracle.js',
  'structure-oracle.js',
  'sexp-edit-oracle.js',
  'paragraph-oracle.js',
  'fill-paragraph-oracle.js',
  'dabbrev-oracle.js',
  'sentence-oracle.js',
  'kill-sentence-oracle.js',
  'mark-paragraph-oracle.js',
  'unicode-word-oracle.js',
  'combining-word-oracle.js',
  'rectangle-oracle.js',
  'rectangle-register-oracle.js',
  'copy-register-oracle.js',
  'increment-register-oracle.js',
  'zap-oracle.js',
  'word-case-oracle.js',
  'region-case-oracle.js',
  'transpose-oracle.js',
  'transpose-words-oracle.js',
  'transpose-lines-oracle.js',
  'transpose-mark-oracle.js',
  'transpose-unicode-oracle.js',
  'whitespace-oracle.js',
  'whitespace-mark-oracle.js',
  'cycle-spacing-oracle.js',
  'delete-blank-lines-oracle.js',
  'delete-indentation-oracle.js',
  'indentation-oracle.js',
  'indentation-unicode-oracle.js',
  'mark-word-oracle.js',
  'kill-line-oracle.js',
  'region-oracle.js',
  'exchange-oracle.js',
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
