import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  extensionDevelopmentPath: '..',
  files: '../.build/test/extension/**/*.test.js',
  mocha: { ui: 'bdd' },
  ...(process.env.VSCODE_EXECUTABLE_PATH
    ? { useInstallation: { fromPath: process.env.VSCODE_EXECUTABLE_PATH } }
    : { version: 'stable' }),
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
});
