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
  ['ctrl+alt+w', 'emacscode.appendNextKill'],
  ['ctrl+x r s', 'emacscode.copyToRegister'],
  ['ctrl+x r x', 'emacscode.copyToRegister'],
  ['ctrl+x r shift+=', 'emacscode.incrementRegister'],
]) {
  const matches = bindings.filter((binding) => binding.key === key && binding.command === command);
  assert.equal(matches.length, 1, `${key} must have one ${command} binding`);
  assert.equal(matches[0].when, editorContext);
  assert.ok(manifest.contributes.commands.some((entry) => entry.command === command));
}
const searchContext = 'config.emacscode.enabled && inQuickInput && emacscode.isearchActive';
const markContext = `${editorContext} && emacscode.markActive`;
const prefixContext = `${editorContext} && emacscode.prefixPending`;
const searchBindings = [
  ['ctrl+s', 'emacscode.isearchForward'],
  ['ctrl+r', 'emacscode.isearchBackward'],
  ['ctrl+g', 'emacscode.isearchCancel'],
  ['alt+p', 'emacscode.isearchPreviousHistory'],
  ['alt+n', 'emacscode.isearchNextHistory'],
];
const markBindings = [
  ['left', 'cursorLeftSelect'],
  ['right', 'cursorRightSelect'],
  ['up', 'cursorUpSelect'],
  ['down', 'cursorDownSelect'],
  ['home', 'cursorHomeSelect'],
  ['end', 'cursorEndSelect'],
  ['pageup', 'cursorPageUpSelect'],
  ['pagedown', 'cursorPageDownSelect'],
];
const expectedContext = new Map<string, string>();
for (const [key, command] of searchBindings)
  expectedContext.set(`${key}:${command}`, searchContext);
for (const [key, command] of markBindings) expectedContext.set(`${key}:${command}`, markContext);
for (let digit = 0; digit <= 9; digit++) {
  for (const key of [`${digit}`, `ctrl+${digit}`])
    expectedContext.set(`${key}:emacscode.digit${digit}`, prefixContext);
}
for (const [identity, context] of expectedContext) {
  const matches = bindings.filter((binding) => `${binding.key}:${binding.command}` === identity);
  assert.equal(matches.length, 1, `${identity} must have exactly one binding`);
  assert.equal(matches[0].when, context, `${identity} has an unsafe scope`);
}
const seen = new Set<string>();
for (const binding of bindings) {
  const identity = `${binding.key}:${binding.command}`;
  assert.ok(!seen.has(identity), `Duplicate binding: ${identity}`);
  seen.add(identity);
  assert.equal(binding.when, expectedContext.get(identity) || editorContext, identity);
  if (binding.command.startsWith('emacscode.') && binding.when !== searchContext)
    assert.ok(
      manifest.contributes.commands.some((entry) => entry.command === binding.command),
      `${identity} references an uncontributed command`,
    );
}
console.log('Keybinding scopes and state-specific bindings verified; native dispatch not tested');
