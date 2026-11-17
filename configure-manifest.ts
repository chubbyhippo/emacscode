const fs = require('node:fs');
const path = require('node:path');
const manifestPath = path.join(__dirname, '..', 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const context = 'config.emacscode.enabled && editorTextFocus && !terminalFocus && !inQuickInput';
const bindings = [
  ['ctrl+b', 'backwardChar'],
  ['ctrl+f', 'forwardChar'],
  ['ctrl+p', 'previousLine'],
  ['ctrl+n', 'nextLine'],
  ['ctrl+a', 'beginningOfLine'],
  ['ctrl+e', 'endOfLine'],
  ['alt+b', 'backwardWord'],
  ['alt+f', 'forwardWord'],
  ['alt+u', 'upcaseWord'],
  ['alt+l', 'downcaseWord'],
  ['alt+c', 'capitalizeWord'],
  ['alt+m', 'backToIndentation'],
  ['alt+shift+,', 'beginningOfBuffer'],
  ['alt+shift+.', 'endOfBuffer'],
  ['ctrl+space', 'setMark'],
  ['alt+shift+2', 'markWord'],
  ['ctrl+x ctrl+x', 'exchangePointAndMark'],
  ['ctrl+x h', 'markWholeBuffer'],
  ['ctrl+w', 'killRegion'],
  ['alt+w', 'copyRegion'],
  ['ctrl+k', 'killLine'],
  ['alt+d', 'killWord'],
  ['alt+backspace', 'backwardKillWord'],
  ['alt+z', 'zapToChar'],
  ['alt+\\', 'deleteHorizontalSpace'],
  ['ctrl+y', 'yank'],
  ['alt+y', 'yankPop'],
  ['ctrl+d', 'deleteChar'],
  ['ctrl+t', 'transposeCharacters'],
  ['ctrl+o', 'openLine'],
  ['ctrl+g', 'cancel'],
  ['ctrl+s', 'searchForward'],
  ['ctrl+r', 'searchBackward'],
  ['ctrl+x r s', 'copyToRegister'],
  ['ctrl+x r x', 'copyToRegister'],
  ['ctrl+x r i', 'insertRegister'],
  ['ctrl+x r g', 'insertRegister'],
  ['ctrl+x r n', 'numberToRegister'],
  ['ctrl+x r shift+=', 'incrementRegister'],
  ['ctrl+x r k', 'rectangleKill'],
  ['ctrl+x r alt+w', 'rectangleCopy'],
  ['ctrl+x r d', 'rectangleDelete'],
  ['ctrl+x r c', 'rectangleClear'],
  ['ctrl+x r o', 'rectangleOpen'],
  ['ctrl+x r y', 'rectangleYank'],
  ['ctrl+u', 'universalArgument'],
  ['alt+-', 'negativeArgument'],
];
manifest.contributes.keybindings = bindings.map(([key, name]) => ({
  key,
  command: `emacscode.${name}`,
  when: context,
}));
const workbench = [
  ['ctrl+x ctrl+f', 'workbench.action.files.openFile'],
  ['ctrl+x ctrl+s', 'workbench.action.files.save'],
  ['ctrl+x ctrl+w', 'workbench.action.files.saveAs'],
  ['ctrl+x s', 'saveAll'],
  ['ctrl+x b', 'workbench.action.showAllEditorsByMostRecentlyUsed'],
  ['ctrl+x k', 'workbench.action.closeActiveEditor'],
  ['ctrl+x 2', 'workbench.action.splitEditorDown'],
  ['ctrl+x 3', 'workbench.action.splitEditorRight'],
  ['ctrl+x o', 'workbench.action.focusNextGroup'],
  ['ctrl+x 0', 'workbench.action.closeGroup'],
  ['ctrl+x 1', 'workbench.action.joinAllGroups'],
  ['alt+x', 'workbench.action.showCommands'],
  ['ctrl+/', 'undo'],
  ['ctrl+x u', 'undo'],
  ['alt+shift+5', 'editor.action.startFindReplaceAction'],
  ['ctrl+h b', 'workbench.action.openGlobalKeybindings'],
];
manifest.contributes.keybindings.push(
  ...workbench.map(([key, command]) => ({ key, command, when: context })),
);
for (const [key, name] of [
  ['ctrl+s', 'isearchForward'],
  ['ctrl+r', 'isearchBackward'],
  ['ctrl+g', 'isearchCancel'],
  ['alt+p', 'isearchPreviousHistory'],
  ['alt+n', 'isearchNextHistory'],
]) {
  manifest.contributes.keybindings.push({
    key,
    command: `emacscode.${name}`,
    when: 'config.emacscode.enabled && inQuickInput && emacscode.isearchActive',
  });
}
for (const [key, command] of [
  ['left', 'cursorLeftSelect'],
  ['right', 'cursorRightSelect'],
  ['up', 'cursorUpSelect'],
  ['down', 'cursorDownSelect'],
  ['home', 'cursorHomeSelect'],
  ['end', 'cursorEndSelect'],
  ['pageup', 'cursorPageUpSelect'],
  ['pagedown', 'cursorPageDownSelect'],
]) {
  manifest.contributes.keybindings.push({
    key,
    command,
    when: `${context} && emacscode.markActive`,
  });
}
for (let digit = 0; digit <= 9; digit++) {
  manifest.contributes.keybindings.push({
    key: `alt+${digit}`,
    command: `emacscode.digit${digit}`,
    when: context,
  });
  manifest.contributes.keybindings.push({
    key: `${digit}`,
    command: `emacscode.digit${digit}`,
    when: `${context} && emacscode.prefixPending`,
  });
  manifest.contributes.keybindings.push({
    key: `ctrl+${digit}`,
    command: `emacscode.digit${digit}`,
    when: `${context} && emacscode.prefixPending`,
  });
}
manifest.contributes.commands = [
  { command: 'emacscode.toggle', title: 'emacscode: Toggle Emacs Keybindings' },
  ...Array.from(new Set(bindings.map(([, name]) => name)), (name) => ({
    command: `emacscode.${name}`,
    title: `emacscode: ${name}`,
  })),
  ...Array.from({ length: 10 }, (_, digit) => ({
    command: `emacscode.digit${digit}`,
    title: `emacscode: Digit ${digit}`,
  })),
];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
