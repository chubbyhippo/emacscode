const assert = require('node:assert/strict');
const vscode = require('vscode');

describe('emacscode editor behavior', function () {
  this.timeout(15000);
  let editor;
  before(async function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    assert.ok(extension);
    await extension.activate();
  });
  beforeEach(async function () {
    const document = await vscode.workspace.openTextDocument({content:'alpha beta',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
  });
  afterEach(async function () { await vscode.commands.executeCommand('workbench.action.closeActiveEditor'); });
  it('Given default editor settings Then the extension contributes a block cursor', async function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    assert.equal(extension.packageJSON.contributes.configurationDefaults['editor.cursorStyle'], 'block');
    assert.equal(vscode.workspace.getConfiguration('editor', editor.document.uri).inspect('cursorStyle').defaultValue, 'block');
    assert.equal(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Block);
  });
  it('Given an explicit cursor preference Then it overrides the extension default', async function () {
    const configuration = vscode.workspace.getConfiguration('editor', editor.document.uri);
    const previous = configuration.inspect('cursorStyle').globalValue;
    try {
      await configuration.update('cursorStyle', 'line', vscode.ConfigurationTarget.Global);
      assert.equal(vscode.workspace.getConfiguration('editor', editor.document.uri).get('cursorStyle'), 'line');
    } finally { await configuration.update('cursorStyle', previous, vscode.ConfigurationTarget.Global); }
  });
  it('Given an editor When moving forward Then point advances', async function () {
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 1);
  });
  it('Given a pending prefix Then all Control digits are bound only in editor context', function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    const bindings = extension.packageJSON.contributes.keybindings;
    for (let digit = 0; digit <= 9; digit++) {
      const matches = bindings.filter(binding => binding.key === `ctrl+${digit}` && binding.command === `emacscode.digit${digit}`);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].when, 'config.emacscode.enabled && editorTextFocus && !terminalFocus && !inQuickInput && emacscode.prefixPending');
    }
  });
  for (const [key, command, start, expected, next] of [
    ['ctrl+n', 'nextLine', [1, 15], [13, 15], [14, 15]],
    ['ctrl+p', 'previousLine', [13, 15], [1, 15], [0, 15]],
    ['ctrl+f', 'forwardChar', [1, 15], [1, 27], [1, 28]],
    ['ctrl+b', 'backwardChar', [1, 15], [1, 3], [1, 2]]
  ]) {
    it(`Given a prefix of 12 When ${key} moves Then it applies once`, async function () {
      const document = await vscode.workspace.openTextDocument({content:Array.from({length: 16}, () => 'abcdefghijklmnopqrstuvwxyz0123456789').join('\n'),language:'plaintext'});
      editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(...start);
      editor.selection = new vscode.Selection(position, position);
      const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
      assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === key && binding.command === `emacscode.${command}`));
      await vscode.commands.executeCommand('emacscode.universalArgument');
      await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand(`emacscode.${command}`);
      assert.deepEqual([editor.selection.active.line, editor.selection.active.character], expected);
      await vscode.commands.executeCommand(`emacscode.${command}`);
      assert.deepEqual([editor.selection.active.line, editor.selection.active.character], next);
      assert.equal(document.lineCount, 16);
    });
  }
  for (const [key, command, expected] of [
    ['alt+u', 'upcaseWord', 'ALPHA beta'],
    ['alt+l', 'downcaseWord', 'alpha beta'],
    ['alt+c', 'capitalizeWord', 'Alpha beta']
  ]) {
    it(`Given ${key} When converting a word Then it uses the matching command`, async function () {
      const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
      assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === key && binding.command === `emacscode.${command}`));
      await vscode.commands.executeCommand(`emacscode.${command}`);
      assert.equal(editor.document.getText(), expected);
      assert.equal(editor.selection.active.character, 5);
    });
  }
  it('Given a negative prefix When downcasing Then point stays after the word', async function () {
    const document = await vscode.workspace.openTextDocument({content:'ONE TWO THREE',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 8);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.negativeArgument');
    await vscode.commands.executeCommand('emacscode.downcaseWord');
    assert.equal(document.getText(), 'ONE two THREE');
    assert.equal(editor.selection.active.character, 8);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'ONE TWO THREE');
  });
  for (const [prefix, expected] of [[false, 'leftright'], [true, 'left right']]) {
    it(`Given ${prefix ? 'a prefix' : 'no prefix'} When deleting whitespace Then the expected side is deleted`, async function () {
      const document = await vscode.workspace.openTextDocument({content:'left   right',language:'plaintext'});
      editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(0, 6);
      editor.selection = new vscode.Selection(position, position);
      const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
      assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === 'alt+\\' && binding.command === 'emacscode.deleteHorizontalSpace'));
      if (prefix) await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.deleteHorizontalSpace');
      assert.equal(document.getText(), expected);
      assert.equal(editor.selection.active.character, 4);
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'left   right');
    });
  }
  it('Given an active region and a numeric prefix When moving to indentation Then the region follows point', async function () {
    const document = await vscode.workspace.openTextDocument({content:'  first\n    second',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(1, 7);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === 'alt+m' && binding.command === 'emacscode.backToIndentation'));
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.backToIndentation');
    assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character, editor.selection.active.line, editor.selection.active.character], [1, 7, 1, 4]);
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 5);
    assert.equal(document.getText(), '  first\n    second');
  });
  it('Given Ctrl+T When transposing characters Then undo restores the document', async function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === 'ctrl+t' && binding.command === 'emacscode.transposeCharacters'));
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.transposeCharacters');
    assert.equal(editor.document.getText(), 'aplha beta');
    assert.equal(editor.selection.active.character, 3);
    await vscode.commands.executeCommand('undo');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given Alt+Z and a target When zapping Then the kill can be yanked', async function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === 'alt+z' && binding.command === 'emacscode.zapToChar'));
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.zapToChar', 'h');
      assert.equal(editor.document.getText(), 'a beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally { await vscode.env.clipboard.writeText(clipboard); }
  });
  it('Given a numeric prefix When zapping Then the matching occurrence is counted', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.zapToChar', 'a');
      assert.equal(editor.document.getText(), ' beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally { await vscode.env.clipboard.writeText(clipboard); }
  });
  it('Given incremental search When repeating and cancelling Then point returns to its origin', async function () {
    const document = await vscode.workspace.openTextDocument({content:'one two one',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.searchForward', 'one');
    assert.equal(editor.selection.active.character, 3);
    await vscode.commands.executeCommand('emacscode.isearchForward');
    assert.equal(editor.selection.active.character, 11);
    await vscode.commands.executeCommand('emacscode.isearchForward');
    await vscode.commands.executeCommand('emacscode.isearchCancel');
    assert.equal(editor.selection.active.character, 11);
    await vscode.commands.executeCommand('emacscode.isearchCancel');
    assert.equal(editor.selection.active.character, 0);
  });
  it('Given search shortcuts Then they are limited to the search input context', function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [['ctrl+s','isearchForward'], ['ctrl+r','isearchBackward'], ['ctrl+g','isearchCancel'], ['alt+p','isearchPreviousHistory'], ['alt+n','isearchNextHistory']]) {
      assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === key && binding.command === `emacscode.${command}` && binding.when.includes('inQuickInput && emacscode.isearchActive')));
    }
  });
  it('Given one mark command When immediately moving down repeatedly Then the region extends across lines', async function () {
    const document = await vscode.workspace.openTextDocument({content:'first\nsecond\nthird',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.nextLine');
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.equal(document.getText(editor.selection), 'first\nsecond\n');
    assert.deepEqual([editor.selection.anchor.line, editor.selection.active.line], [0, 2]);
    await vscode.commands.executeCommand('emacscode.cancel');
    assert.ok(editor.selection.isEmpty);
  });
  it('Given Ctrl+Space When moving with Emacs commands Then the active region follows point in either direction', async function () {
    const position = new vscode.Position(0, 5);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.backwardChar');
    assert.equal(editor.document.getText(editor.selection), 'a');
    assert.equal(editor.selection.anchor.character, 5);
    assert.equal(editor.selection.active.character, 4);
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.document.getText(editor.selection), ' ');
    assert.equal(editor.selection.anchor.character, 5);
    assert.equal(editor.selection.active.character, 6);
    await vscode.commands.executeCommand('emacscode.cancel');
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.backwardChar');
    assert.ok(editor.selection.isEmpty);
  });
  it('Given a mark When built-in selection movement runs Then the visible region can be killed', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.setMark');
      await vscode.commands.executeCommand('cursorRightSelect');
      await vscode.commands.executeCommand('cursorRightSelect');
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(editor.document.getText(editor.selection), 'al');
      await vscode.commands.executeCommand('emacscode.killRegion');
      assert.equal(editor.document.getText(), 'pha beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally { await vscode.env.clipboard.writeText(clipboard); }
  });
  it('Given an active region When an external edit occurs Then subsequent motion does not revive the old mark', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await editor.edit(builder => builder.insert(new vscode.Position(0, 0), 'x'));
    await new Promise(resolve => setTimeout(resolve, 100));
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.ok(editor.selection.isEmpty);
  });
  it('Given a mark Then ordinary movement keys are scoped to selection commands', function () {
    const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [['left','cursorLeftSelect'], ['right','cursorRightSelect'], ['up','cursorUpSelect'], ['down','cursorDownSelect'], ['home','cursorHomeSelect'], ['end','cursorEndSelect'], ['pageup','cursorPageUpSelect'], ['pagedown','cursorPageDownSelect']]) {
      assert.ok(extension.packageJSON.contributes.keybindings.some(binding => binding.key === key && binding.command === command && binding.when.includes('emacscode.markActive')));
    }
  });
  it('Given a mark When selecting and killing a word Then yank restores it', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    assert.equal(editor.selection.end.character, 5);
    await vscode.commands.executeCommand('emacscode.killRegion');
    assert.equal(editor.document.getText(), ' beta');
    await vscode.commands.executeCommand('emacscode.yank');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given a selected region When copied to a register Then it can be inserted', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.copyToRegister', 'a');
    await vscode.commands.executeCommand('emacscode.endOfBuffer');
    await vscode.commands.executeCommand('emacscode.insertRegister', 'a');
    assert.equal(editor.document.getText(), 'alpha betaalpha');
  });
  it('Given a register command after yank When yank-pop runs Then it does not replace text', async function () {
    await vscode.commands.executeCommand('emacscode.killWord');
    await vscode.commands.executeCommand('emacscode.yank');
    await vscode.commands.executeCommand('emacscode.numberToRegister', 'n');
    await vscode.commands.executeCommand('emacscode.yankPop');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given a rectangle When killed and yanked Then its text is restored', async function () {
    const document = await vscode.workspace.openTextDocument({content:'abcde\nfghij\nklmno',language:'plaintext'});
    editor = await vscode.window.showTextDocument(document);
    const start = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(start, start);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.nextLine');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.rectangleKill');
    assert.equal(document.getText(), 'abde\nfgij\nklmno');
    await vscode.commands.executeCommand('emacscode.rectangleYank');
    assert.equal(document.getText(), 'abcde\nfghij\nklmno');
  });
});
