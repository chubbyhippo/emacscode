const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
const bindings = manifest.contributes.keybindings;
const editorContext =
  'config.emacscode.enabled && editorTextFocus && !terminalFocus && !inQuickInput';
for (const [key, command] of [
  ['ctrl+b', 'emacscode.backwardChar'],
  ['ctrl+f', 'emacscode.forwardChar'],
]) {
  const matches = bindings.filter((binding) => binding.key === key && binding.command === command);
  assert.equal(matches.length, 1, `${key} must have one ${command} binding`);
  assert.equal(matches[0].when, editorContext);
  assert.ok(manifest.contributes.commands.some((entry) => entry.command === command));
}
console.log('Character motion keybinding configuration verified; native dispatch not tested');
