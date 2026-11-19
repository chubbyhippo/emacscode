const assert = require('node:assert/strict');
const vscode = require('vscode');

describe('emacscode editor behavior', function () {
  this.timeout(15000);
  let editor;
  before(async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(extension);
    await extension.activate();
  });
  beforeEach(async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha beta',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
  });
  afterEach(async function () {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
  it('Given default editor settings Then the extension contributes a block cursor', async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.equal(
      extension.packageJSON.contributes.configurationDefaults['editor.cursorStyle'],
      'block',
    );
    assert.equal(
      vscode.workspace.getConfiguration('editor', editor.document.uri).inspect('cursorStyle')
        .defaultValue,
      'block',
    );
    assert.equal(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Block);
  });
  it('Given an explicit cursor preference Then it overrides the extension default', async function () {
    const configuration = vscode.workspace.getConfiguration('editor', editor.document.uri);
    const previous = configuration.inspect('cursorStyle').globalValue;
    try {
      await configuration.update('cursorStyle', 'line', vscode.ConfigurationTarget.Global);
      assert.equal(
        vscode.workspace.getConfiguration('editor', editor.document.uri).get('cursorStyle'),
        'line',
      );
    } finally {
      await configuration.update('cursorStyle', previous, vscode.ConfigurationTarget.Global);
    }
  });
  it('Given an editor When moving forward Then point advances', async function () {
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 1);
  });
  it('Given a mark When character motion exceeds the buffer Then point reaches the boundary and the mark survives', async function () {
    const position = new vscode.Position(0, 5);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit9');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 10],
    );
    assert.equal(editor.document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.backwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 9],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given an oversized deletion prefix Then the document and active region survive and the prefix resets', async function () {
    const position = new vscode.Position(0, 5);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit9');
    await vscode.commands.executeCommand('emacscode.deleteChar');
    assert.equal(editor.document.getText(), 'alpha beta');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 5],
    );
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 6],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given a numeric deletion prefix Then the deleted text can be yanked and undone', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.deleteChar');
      assert.equal(editor.document.getText(), 'pha beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
      await vscode.commands.executeCommand('undo');
      assert.equal(editor.document.getText(), 'pha beta');
      await vscode.commands.executeCommand('undo');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a CRLF boundary When deleting a character Then the newline is removed intact and undo restores it', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a\nb',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.deleteChar');
    assert.equal(document.getText(), 'ab');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'a\r\nb');
  });
  it('Given read-only text When prefixed deletion is rejected Then text is unchanged and later editing works', async function () {
    const scheme = 'emacscode-delete-readonly-test';
    const provider = vscode.workspace.registerTextDocumentContentProvider(scheme, {
      provideTextDocumentContent: () => 'protected',
    });
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${scheme}:/text`));
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.deleteChar');
      assert.equal(document.getText(), 'protected');
      const editable = await vscode.workspace.openTextDocument({
        content: 'abc',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(editable);
      await vscode.commands.executeCommand('emacscode.deleteChar');
      assert.equal(editable.getText(), 'bc');
    } finally {
      provider.dispose();
    }
  });
  it('Given open-line prefixes Then errors preserve the mark and counted CRLF edits can be undone', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abc\ndef',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.negativeArgument');
    await vscode.commands.executeCommand('emacscode.openLine');
    assert.equal(document.getText(), 'abc\r\ndef');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 2],
    );
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.openLine');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 3],
    );
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.openLine');
    assert.equal(document.getText(), 'abc\r\n\r\n\r\ndef');
    assert.ok(editor.selection.isEmpty);
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [0, 3]);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'abc\r\ndef');
  });
  it('Given read-only text When opening a line Then rejection does not modify it and later commands work', async function () {
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      'emacscode-open-readonly',
      {
        provideTextDocumentContent: () => 'protected',
      },
    );
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('emacscode-open-readonly:/text'),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.openLine');
      assert.equal(document.getText(), 'protected');
      await vscode.commands.executeCommand('emacscode.forwardChar');
      assert.equal(editor.selection.active.character, 1);
    } finally {
      provider.dispose();
    }
  });
  it('Given Backspace When an active region exists Then the region is deleted and undo restores it', async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'backspace' &&
          binding.command === 'emacscode.backwardDeleteChar' &&
          binding.when.includes('editorTextFocus'),
      ),
    );
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.backwardDeleteChar');
    assert.equal(editor.document.getText(), 'pha beta');
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('undo');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given an oversized backward prefix Then the mark survives and the next command uses no prefix', async function () {
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit9');
    await vscode.commands.executeCommand('emacscode.backwardDeleteChar');
    assert.equal(editor.document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 2],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given CRLF text When deleting backward Then undo restores the newline', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a\nb',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.backwardDeleteChar');
    assert.equal(document.getText(), 'ab');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'a\r\nb');
  });
  it('Given sentence motion and a prefix Then the active selection follows point and the prefix resets', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'One.  Two!  Three?',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['alt+a', 'backwardSentence'],
      ['alt+e', 'forwardSentence'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === `emacscode.${command}` &&
            binding.when.includes('editorTextFocus') &&
            binding.when.includes('!terminalFocus'),
        ),
      );
    }
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.forwardSentence');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 10],
    );
    await vscode.commands.executeCommand('emacscode.backwardSentence');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 6],
    );
    await vscode.commands.executeCommand('emacscode.negativeArgument');
    await vscode.commands.executeCommand('emacscode.backwardSentence');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 10],
    );
    await vscode.commands.executeCommand('emacscode.digit9');
    await vscode.commands.executeCommand('emacscode.forwardSentence');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 18],
    );
    await vscode.commands.executeCommand('emacscode.backwardSentence');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 12],
    );
    assert.equal(document.getText(), 'One.  Two!  Three?');
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given sentence kills Then the clipboard, yank and undo preserve CRLF and Unicode', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: '😀First.\nSecond.  Third.',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['alt+k', 'killSentence'],
      ['ctrl+x backspace', 'backwardKillSentence'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === `emacscode.${command}` &&
            binding.when.includes('editorTextFocus') &&
            binding.when.includes('!terminalFocus'),
        ),
      );
    }
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.killSentence');
      assert.equal(document.getText(), '  Third.');
      assert.equal(await vscode.env.clipboard.readText(), '😀First.\r\nSecond.');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(document.getText(), '😀First.\r\nSecond.  Third.');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), '  Third.');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), '😀First.\r\nSecond.  Third.');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a sentence kill beyond the end Then text, mark and clipboard survive and the prefix resets', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'One.',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.env.clipboard.writeText('sentence sentinel');
      await vscode.commands.executeCommand('emacscode.setMark');
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.killSentence');
      assert.equal(document.getText(), 'One.');
      assert.equal(await vscode.env.clipboard.readText(), 'sentence sentinel');
      assert.deepEqual(
        [editor.selection.anchor.character, editor.selection.active.character],
        [0, 4],
      );
      await vscode.commands.executeCommand('emacscode.backwardKillSentence');
      assert.equal(document.getText(), '');
      assert.equal(await vscode.env.clipboard.readText(), 'One.');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a read-only sentence Then a rejected kill leaves the clipboard and existing ring intact', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      'emacscode-sentence-readonly',
      {
        provideTextDocumentContent: () => 'Protected sentence.  Next.',
      },
    );
    try {
      await vscode.commands.executeCommand('emacscode.killWord');
      assert.equal(await vscode.env.clipboard.readText(), 'alpha');
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('emacscode-sentence-readonly:/text'),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.killSentence');
      assert.equal(document.getText(), 'Protected sentence.  Next.');
      assert.equal(await vscode.env.clipboard.readText(), 'alpha');
      const editable = await vscode.workspace.openTextDocument({
        content: '',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(editable);
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editable.getText(), 'alpha');
    } finally {
      provider.dispose();
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given an active mark and a prefix When moving paragraphs Then selection and prefix follow point', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\nline\n\ntwo\n\nthree',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['alt+shift+[', 'backwardParagraph'],
      ['alt+shift+]', 'forwardParagraph'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) => binding.key === key && binding.command === `emacscode.${command}`,
        ),
      );
    }
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.forwardParagraph');
    assert.deepEqual([editor.selection.anchor.line, editor.selection.active.line], [0, 4]);
    await vscode.commands.executeCommand('emacscode.backwardParagraph');
    assert.deepEqual([editor.selection.anchor.line, editor.selection.active.line], [0, 2]);
    assert.equal(document.getText(), 'one\nline\n\ntwo\n\nthree');
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given a paragraph When marking repeatedly and rejecting zero Then selection survives and extends', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\n\ntwo\n\nthree',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+h' && binding.command === 'emacscode.markParagraph',
      ),
    );
    await vscode.commands.executeCommand('emacscode.markParagraph');
    assert.equal(document.getText(editor.selection), 'one\n');
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.markParagraph');
    assert.equal(document.getText(editor.selection), 'one\n');
    await vscode.commands.executeCommand('emacscode.markParagraph');
    assert.equal(document.getText(editor.selection), 'one\n\ntwo\n');
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given a line prefix and active mark When going to a line Then the selection follows point', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\ntwo\nthree',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const key of ['alt+g g', 'alt+g alt+g']) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) => binding.key === key && binding.command === 'emacscode.gotoLine',
        ),
      );
    }
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.gotoLine');
    assert.deepEqual([editor.selection.anchor.line, editor.selection.active.line], [0, 1]);
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 1);
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given movement bindings Then character, page, column and structural commands preserve marks', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a\tb\n\f(one [two])\nend',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    editor.options = { ...editor.options, tabSize: 4 };
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['alt+g c', 'gotoCharacter'],
      ['alt+g tab', 'moveToColumn'],
      ['ctrl+x ]', 'forwardPage'],
      ['ctrl+x [', 'backwardPage'],
      ['ctrl+alt+f', 'forwardSexp'],
      ['ctrl+alt+b', 'backwardSexp'],
      ['ctrl+v', 'scrollForward'],
      ['alt+v', 'scrollBackward'],
      ['ctrl+l', 'recenter'],
      ['alt+r', 'moveToWindowLine'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === `emacscode.${command}` &&
            binding.when.includes('!terminalFocus'),
        ),
      );
    }
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.moveToColumn');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 2],
    );
    await vscode.commands.executeCommand('emacscode.forwardPage');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 1]);
    await vscode.commands.executeCommand('emacscode.forwardSexp');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 12]);
    await vscode.commands.executeCommand('emacscode.backwardSexp');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 1]);
    await vscode.commands.executeCommand('emacscode.gotoCharacter', 2);
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [0, 1]);
    assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character], [0, 0]);
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given structural editing When invoked Then text, ring and undo remain coherent', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one (two) three',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 4);
    editor.selection = new vscode.Selection(position, position);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.markSexp');
      assert.equal(document.getText(editor.selection), '(two)');
      await vscode.commands.executeCommand('emacscode.killSexp');
      assert.equal(document.getText(), 'one  three');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(document.getText(), 'one (two) three');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'one  three');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given quoted input and abbreviation When invoked Then edits are undoable', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha al',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 8);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'alpha alpha');
    await vscode.commands.executeCommand('emacscode.quotedInsert', '!');
    assert.equal(document.getText(), 'alpha alpha!');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'alpha alpha');
  });
  it('Given exhausted abbreviation candidates Then the original prefix returns and undo restores the expansion', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha al',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 8);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'alpha alpha');
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'alpha al');
    assert.equal(editor.selection.active.character, 8);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'alpha alpha');
  });
  it('Given a mixed-case abbreviation Then expansion preserves case and failure resets its cycle', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'fooBar fo',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 9);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'fooBar fooBar');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'fooBar fooBar');
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'fooBar fooBar');
    assert.equal(editor.selection.active.character, 13);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'fooBar fo');
  });
  it('Given a zero abbreviation prefix Then forward matches cycle and undo restores them', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'al alpha alpine',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'alpha alpha alpine');
    await vscode.commands.executeCommand('emacscode.expandAbbreviation');
    assert.equal(document.getText(), 'alpine alpha alpine');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'alpha alpha alpine');
  });
  it('Given fill input and an active region Then unsupported justification preserves the selection', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one  two three',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.fillParagraph');
    assert.equal(document.getText(), 'one  two three');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 3],
    );
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 4],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given newline and indentation adapters Then editing and undo remain functional', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha beta',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 5);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.newlineIndent');
    const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    assert.equal(document.getText(), `alpha${lineEnding} beta`);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.indentRegion');
    assert.notEqual(document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'alpha beta');
  });
  it('Given viewport movement When scrolling and recentering Then the mark and prefix remain coherent', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n'),
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(30, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await vscode.commands.executeCommand('emacscode.setMark');
    const before = editor.visibleRanges[0].start.line;
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.scrollForward');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(editor.visibleRanges[0].start.line > before);
    assert.equal(editor.selection.anchor.line, 30);
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.scrollBackward');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(editor.visibleRanges[0].start.line <= before + 3);
    assert.equal(editor.selection.anchor.line, 30);
    await vscode.commands.executeCommand('emacscode.recenter');
    await vscode.commands.executeCommand('emacscode.moveToWindowLine');
    assert.equal(editor.selection.anchor.line, 30);
    assert.equal(document.lineCount, 100);
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given a pending prefix Then all Control digits are bound only in editor context', function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    const bindings = extension.packageJSON.contributes.keybindings;
    for (let digit = 0; digit <= 9; digit++) {
      const matches = bindings.filter(
        (binding) =>
          binding.key === `ctrl+${digit}` && binding.command === `emacscode.digit${digit}`,
      );
      assert.equal(matches.length, 1);
      assert.equal(
        matches[0].when,
        'config.emacscode.enabled && editorTextFocus && !terminalFocus && !inQuickInput && emacscode.prefixPending',
      );
    }
  });
  for (const [key, command, start, expected, next] of [
    ['ctrl+n', 'nextLine', [1, 15], [13, 15], [14, 15]],
    ['ctrl+p', 'previousLine', [13, 15], [1, 15], [0, 15]],
    ['ctrl+f', 'forwardChar', [1, 15], [1, 27], [1, 28]],
    ['ctrl+b', 'backwardChar', [1, 15], [1, 3], [1, 2]],
  ]) {
    it(`Given a prefix of 12 When ${key} moves Then it applies once`, async function () {
      const document = await vscode.workspace.openTextDocument({
        content: Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789').join(
          '\n',
        ),
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(...start);
      editor.selection = new vscode.Selection(position, position);
      const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) => binding.key === key && binding.command === `emacscode.${command}`,
        ),
      );
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
  it('Given numeric and universal prefixes When moving across the buffer Then point and the stored mark follow Emacs', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\ntwo\nthree\nfour\nfive',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(1, 1);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.digit4');
    await vscode.commands.executeCommand('emacscode.beginningOfBuffer');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [3, 0]);
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 1]);
    await vscode.commands.executeCommand('emacscode.cancel');
    await vscode.commands.executeCommand('emacscode.universalArgument');
    await vscode.commands.executeCommand('emacscode.endOfBuffer');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [4, 4]);
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [3, 0]);
    await vscode.commands.executeCommand('emacscode.cancel');
    assert.equal(document.getText(), 'one\ntwo\nthree\nfour\nfive');
  });
  it('Given an oversized vertical prefix Then point reaches the boundary, the mark survives and the prefix resets', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abc\nx',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 1]);
    assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character], [0, 2]);
    await vscode.commands.executeCommand('emacscode.previousLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [0, 2]);
    assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character], [0, 2]);
    assert.equal(document.getText(), 'abc\nx');
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given a persistent goal column Then motion retains it until a prefix clears it', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abcde\nx\n0123456789',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 4);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setGoalColumn');
    await vscode.commands.executeCommand('emacscode.beginningOfLine');
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 1]);
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [2, 4]);
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.setGoalColumn');
    await vscode.commands.executeCommand('emacscode.beginningOfLine');
    await vscode.commands.executeCommand('emacscode.previousLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 0]);
  });
  it('Given tabbed lines and an active mark When moving vertically Then the editor tab size determines the goal column', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a\tb\nxy\n0123456789\n\tend',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    editor.options = { ...editor.options, tabSize: 4 };
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 2]);
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [2, 4]);
    await vscode.commands.executeCommand('emacscode.nextLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [3, 1]);
    assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character], [0, 2]);
    await vscode.commands.executeCommand('emacscode.previousLine');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [2, 4]);
    await vscode.commands.executeCommand('emacscode.cancel');
    assert.equal(document.getText(), 'a\tb\nxy\n0123456789\n\tend');
  });
  for (const [key, command, expected] of [
    ['alt+u', 'upcaseWord', 'ALPHA beta'],
    ['alt+l', 'downcaseWord', 'alpha beta'],
    ['alt+c', 'capitalizeWord', 'Alpha beta'],
  ]) {
    it(`Given ${key} When converting a word Then it uses the matching command`, async function () {
      const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) => binding.key === key && binding.command === `emacscode.${command}`,
        ),
      );
      await vscode.commands.executeCommand(`emacscode.${command}`);
      assert.equal(editor.document.getText(), expected);
      assert.equal(editor.selection.active.character, 5);
    });
  }
  for (const [command, prefix, expected] of [
    ['beginningOfLine', 2, [2, 0]],
    ['endOfLine', 2, [2, 2]],
    ['beginningOfLine', 0, [0, 0]],
    ['endOfLine', 0, [0, 2]],
    ['beginningOfLine', -2, [0, 0]],
    ['endOfLine', -2, [0, 0]],
  ] as [string, number, number[]][]) {
    it(`Given prefix ${prefix} When invoking ${command} Then point and active mark follow Emacs line motion`, async function () {
      const document = await vscode.workspace.openTextDocument({
        content: 'aa\nbb\ncc',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(1, 1);
      editor.selection = new vscode.Selection(position, position);
      await vscode.commands.executeCommand('emacscode.setMark');
      if (prefix < 0) await vscode.commands.executeCommand('emacscode.negativeArgument');
      await vscode.commands.executeCommand(`emacscode.digit${Math.abs(prefix)}`);
      await vscode.commands.executeCommand(`emacscode.${command}`);
      assert.deepEqual([editor.selection.active.line, editor.selection.active.character], expected);
      assert.deepEqual([editor.selection.anchor.line, editor.selection.anchor.character], [1, 1]);
      await vscode.commands.executeCommand('emacscode.cancel');
    });
  }
  it('Given a supplementary word When moving, killing and yanking Then its characters remain intact', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a𐐀b c',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.forwardWord');
      assert.equal(editor.selection.active.character, 4);
      await vscode.commands.executeCommand('emacscode.backwardWord');
      assert.equal(editor.selection.active.character, 0);
      await vscode.commands.executeCommand('emacscode.killWord');
      assert.equal(document.getText(), ' c');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(document.getText(), 'a𐐀b c');
      assert.equal(editor.selection.active.character, 4);
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), ' c');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a decomposed word When moving, capitalizing and undoing Then combining marks remain attached', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'éCOLE fin',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.forwardWord');
    assert.equal(editor.selection.active.character, 6);
    await vscode.commands.executeCommand('emacscode.backwardWord');
    assert.equal(editor.selection.active.character, 0);
    await vscode.commands.executeCommand('emacscode.capitalizeWord');
    assert.equal(document.getText(), 'École fin');
    assert.equal(editor.selection.active.character, 6);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'éCOLE fin');
  });
  it('Given a negative prefix When downcasing Then point stays after the word', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'ONE TWO THREE',
      language: 'plaintext',
    });
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
  it('Given an active region When changing case Then point, mark and undo are preserved', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\ntWo',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['ctrl+x ctrl+u', 'upcaseRegion'],
      ['ctrl+x ctrl+l', 'downcaseRegion'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === `emacscode.${command}` &&
            binding.when.includes('!terminalFocus'),
        ),
      );
    }
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit7');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.upcaseRegion');
    assert.equal(document.getText(), 'ONE\r\nTWO');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 3]);
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [0, 0]);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one\r\ntWo');
  });
  it('Given tab-to-stop When invoked with a prefix Then editor indentation settings and undo are respected', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abc',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    editor.options = { ...editor.options, tabSize: 4, insertSpaces: false };
    const position = new vscode.Position(0, 3);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'alt+i' &&
          binding.command === 'emacscode.tabToTabStop' &&
          binding.when.includes('editorTextFocus') &&
          binding.when.includes('!terminalFocus'),
      ),
    );
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.tabToTabStop');
    assert.equal(document.getText(), 'abc\t');
    await vscode.commands.executeCommand('emacscode.backwardChar');
    assert.equal(editor.selection.active.character, 3);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'abc');
  });
  it('Given non-ASCII display columns When tabbing Then text and active selection are preserved', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: '猫x',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.tabToTabStop');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(document.getText(), '猫x');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 2],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  it('Given read-only text When tabbing Then the edit is rejected and the next command works', async function () {
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      'emacscode-tab-readonly',
      {
        provideTextDocumentContent: () => 'protected',
      },
    );
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('emacscode-tab-readonly:/text'),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.tabToTabStop');
      assert.equal(document.getText(), 'protected');
      await vscode.commands.executeCommand('emacscode.forwardChar');
      assert.equal(editor.selection.active.character, 1);
    } finally {
      provider.dispose();
    }
  });
  for (const [prefix, expected] of [
    [false, 'leftright'],
    [true, 'left right'],
  ]) {
    it(`Given ${prefix ? 'a prefix' : 'no prefix'} When deleting whitespace Then the expected side is deleted`, async function () {
      const document = await vscode.workspace.openTextDocument({
        content: 'left   right',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(0, 6);
      editor.selection = new vscode.Selection(position, position);
      const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === 'alt+\\' && binding.command === 'emacscode.deleteHorizontalSpace',
        ),
      );
      if (prefix) await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.deleteHorizontalSpace');
      assert.equal(document.getText(), expected);
      assert.equal(editor.selection.active.character, 4);
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'left   right');
    });
  }
  it('Given an active region When deleting spaces Then the mark deactivates and undo restores text', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a   b',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.deleteHorizontalSpace');
    assert.equal(document.getText(), 'ab');
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.active.character, 1);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 0],
    );
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'a   b');
  });
  it('Given spacing When invoked repeatedly Then it cycles and undo restores the previous edit', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'left   right',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 6);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+space' && binding.command === 'emacscode.cycleSpacing',
      ),
    );
    await vscode.commands.executeCommand('emacscode.cycleSpacing');
    assert.equal(document.getText(), 'left right');
    await vscode.commands.executeCommand('emacscode.cycleSpacing');
    assert.equal(document.getText(), 'leftright');
    await vscode.commands.executeCommand('emacscode.cycleSpacing');
    assert.equal(document.getText(), 'left   right');
    assert.equal(editor.selection.active.character, 6);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'leftright');
  });
  it('Given CRLF text and a prefix When joining lines Then undo restores them', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\n  two',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'alt+shift+6' && binding.command === 'emacscode.deleteIndentation',
      ),
    );
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.deleteIndentation');
    assert.equal(document.getText(), 'one two');
    assert.equal(editor.selection.active.character, 3);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one\r\n  two');
  });
  it('Given blank lines When deleting them Then CRLF and undo are preserved', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\n\n\ntwo',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 1);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'ctrl+x ctrl+o' && binding.command === 'emacscode.deleteBlankLines',
      ),
    );
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.deleteBlankLines');
    assert.equal(document.getText(), 'one\r\ntwo');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 2);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one\r\n\r\n\r\ntwo');
  });
  it('Given an active region and a numeric prefix When moving to indentation Then the region follows point', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: '  first\n    second',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(1, 7);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+m' && binding.command === 'emacscode.backToIndentation',
      ),
    );
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.backToIndentation');
    assert.deepEqual(
      [
        editor.selection.anchor.line,
        editor.selection.anchor.character,
        editor.selection.active.line,
        editor.selection.active.character,
      ],
      [1, 7, 1, 4],
    );
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.equal(editor.selection.active.character, 5);
    assert.equal(document.getText(), '  first\n    second');
  });
  it('Given a numeric prefix When killing a line Then it includes the newline and undo restores it', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha\nbeta',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.killLine');
      assert.equal(document.getText(), 'albeta');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'alpha\nbeta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a CRLF line When killing through its end Then the line ending is removed intact', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha\nbeta',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 5);
    editor.selection = new vscode.Selection(position, position);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.killLine');
      assert.equal(document.getText(), 'alphabeta');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'alpha\r\nbeta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given CRLF text When killing before the newline Then yank and undo preserve it', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha\nbeta',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.killLine');
      assert.equal(document.getText(), 'al\r\nbeta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(document.getText(), 'alpha\r\nbeta');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'al\r\nbeta');
      await vscode.commands.executeCommand('undo');
      assert.equal(document.getText(), 'alpha\r\nbeta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given CRLF text When killing two lines consecutively Then yank restores them', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'alpha\nbeta\ngamma',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.killLine');
      await vscode.commands.executeCommand('emacscode.digit1');
      await vscode.commands.executeCommand('emacscode.killLine');
      assert.equal(document.getText(), 'algamma');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(document.getText(), 'alpha\r\nbeta\r\ngamma');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  for (const sourceCRLF of [false, true]) {
    it(`Given a ${sourceCRLF ? 'CRLF' : 'LF'} kill When yanked into the other EOL Then the destination EOL is used`, async function () {
      const source = await vscode.workspace.openTextDocument({
        content: 'one\ntwo',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(source);
      await editor.edit((builder) =>
        builder.setEndOfLine(sourceCRLF ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF),
      );
      const clipboard = await vscode.env.clipboard.readText();
      try {
        await vscode.commands.executeCommand('emacscode.digit1');
        await vscode.commands.executeCommand('emacscode.killLine');
        assert.equal(source.getText(), 'two');
        const destination = await vscode.workspace.openTextDocument({
          content: 'target\nend',
          language: 'plaintext',
        });
        editor = await vscode.window.showTextDocument(destination);
        await editor.edit((builder) =>
          builder.setEndOfLine(sourceCRLF ? vscode.EndOfLine.LF : vscode.EndOfLine.CRLF),
        );
        await vscode.commands.executeCommand('emacscode.yank');
        const eol = sourceCRLF ? '\n' : '\r\n';
        assert.equal(destination.getText(), `one${eol}target${eol}end`);
        await vscode.commands.executeCommand('undo');
        assert.equal(destination.getText(), `target${eol}end`);
      } finally {
        await vscode.env.clipboard.writeText(clipboard);
      }
    });
  }
  it('Given a read-only document When a kill is rejected Then the ring and clipboard recover', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    const scheme = 'emacscode-readonly-test';
    const provider = vscode.workspace.registerTextDocumentContentProvider(scheme, {
      provideTextDocumentContent: () => 'protected text',
    });
    try {
      await vscode.commands.executeCommand('emacscode.killWord');
      assert.equal(editor.document.getText(), ' beta');
      const before = await vscode.env.clipboard.readText();
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(`${scheme}:/readonly`),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.killLine');
      assert.equal(document.getText(), 'protected text');
      assert.equal(await vscode.env.clipboard.readText(), before);
      const destination = await vscode.workspace.openTextDocument({
        content: 'destination',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(destination);
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(destination.getText(), 'alphadestination');
    } finally {
      provider.dispose();
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given CRLF lines When transposed Then the binding and undo preserve the document', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\ntwo\nthree',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'ctrl+x ctrl+t' &&
          binding.command === 'emacscode.transposeLines' &&
          binding.when.includes('!terminalFocus'),
      ),
    );
    await vscode.commands.executeCommand('emacscode.transposeLines');
    assert.equal(document.getText(), 'two\r\none\r\nthree');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [2, 0]);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one\r\ntwo\r\nthree');
  });
  it('Given a zero prefix When transposing marked lines Then point and undo remain coherent', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one\ntwo\nthree',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.nextLine');
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.transposeLines');
    assert.equal(document.getText(), 'three\r\ntwo\r\none\r\n');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [0, 0]);
    assert.ok(editor.selection.isEmpty);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [2, 0]);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one\r\ntwo\r\nthree');
  });
  it('Given adjacent words When transposed Then undo restores the original text', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one, two three',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 3);
    editor.selection = new vscode.Selection(position, position);
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+t' && binding.command === 'emacscode.transposeWords',
      ),
    );
    await vscode.commands.executeCommand('emacscode.transposeWords');
    assert.equal(document.getText(), 'two, one three');
    assert.equal(editor.selection.active.character, 8);
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'one, two three');
  });
  it('Given Ctrl+T When transposing characters Then undo restores the document', async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) =>
          binding.key === 'ctrl+t' && binding.command === 'emacscode.transposeCharacters',
      ),
    );
    const position = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.transposeCharacters');
    assert.equal(editor.document.getText(), 'aplha beta');
    assert.equal(editor.selection.active.character, 3);
    await vscode.commands.executeCommand('undo');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given an active mark When transposing with a prefix Then the mark is retained but the region deactivates', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abcdef',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(0, 3);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.transposeCharacters');
    assert.equal(document.getText(), 'abdecf');
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.active.character, 5);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 4],
    );
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'abcdef');
  });
  it('Given Unicode and CRLF When transposing across a newline Then mark and undo remain coherent', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'a😀\nbcd',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit3');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.transposeCharacters');
    assert.equal(document.getText(), 'a😀bc\r\nd');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 0]);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual(
      [
        editor.selection.anchor.line,
        editor.selection.anchor.character,
        editor.selection.active.line,
        editor.selection.active.character,
      ],
      [1, 0, 0, 0],
    );
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'a😀\r\nbcd');
  });
  it('Given Alt+Z and a target When zapping Then the kill can be yanked', async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+z' && binding.command === 'emacscode.zapToChar',
      ),
    );
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.zapToChar', 'h');
      assert.equal(editor.document.getText(), 'a beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given a numeric prefix When zapping Then the matching occurrence is counted', async function () {
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('emacscode.digit2');
      await vscode.commands.executeCommand('emacscode.zapToChar', 'a');
      assert.equal(editor.document.getText(), ' beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given incremental search When repeating and cancelling Then point returns to its origin', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one two one',
      language: 'plaintext',
    });
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
  it('Given incremental search When the selection changes externally Then it is preserved', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'one two one',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('emacscode.searchForward', 'one');
    assert.equal(editor.selection.active.character, 3);
    const external = new vscode.Selection(0, 6, 0, 4);
    editor.selection = external;
    await vscode.commands.executeCommand('emacscode.isearchForward');
    await vscode.commands.executeCommand('emacscode.isearchCancel');
    assert.ok(editor.selection.isEqual(external));
    assert.equal(document.getText(), 'one two one');
  });
  it('Given search shortcuts Then their handlers are registered on activation', async function () {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'emacscode.isearchForward',
      'emacscode.isearchBackward',
      'emacscode.isearchCancel',
      'emacscode.isearchPreviousHistory',
      'emacscode.isearchNextHistory',
    ])
      assert.ok(commands.includes(command), `${command} is not registered`);
  });
  it('Given search shortcuts Then they are limited to the search input context', function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    for (const [key, command] of [
      ['ctrl+s', 'isearchForward'],
      ['ctrl+r', 'isearchBackward'],
      ['ctrl+g', 'isearchCancel'],
      ['alt+p', 'isearchPreviousHistory'],
      ['alt+n', 'isearchNextHistory'],
    ]) {
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === `emacscode.${command}` &&
            binding.when.includes('inQuickInput && emacscode.isearchActive'),
        ),
      );
    }
  });
  it('Given one mark command When immediately moving down repeatedly Then the region extends across lines', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'first\nsecond\nthird',
      language: 'plaintext',
    });
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
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(editor.document.getText(editor.selection), 'al');
      await vscode.commands.executeCommand('emacscode.killRegion');
      assert.equal(editor.document.getText(), 'pha beta');
      await vscode.commands.executeCommand('emacscode.yank');
      assert.equal(editor.document.getText(), 'alpha beta');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  });
  it('Given an active region When an external edit occurs Then subsequent motion does not revive the old mark', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), 'x'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.ok(editor.selection.isEmpty);
  });
  it('Given point and mark When exchange has a prefix Then it deactivates the region and consumes the prefix', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.digit5');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.universalArgument');
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.active.character, 0);
    await vscode.commands.executeCommand('emacscode.forwardChar');
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.active.character, 1);
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [1, 5],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.active.character, 1);
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given a mark Then ordinary movement keys are scoped to selection commands', function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
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
      assert.ok(
        extension.packageJSON.contributes.keybindings.some(
          (binding) =>
            binding.key === key &&
            binding.command === command &&
            binding.when.includes('emacscode.markActive'),
        ),
      );
    }
  });
  it('Given mark-word When repeated Then mark extends while point stays fixed', async function () {
    const extension = vscode.extensions.all.find((item) => item.packageJSON.name === 'emacscode');
    assert.ok(
      extension.packageJSON.contributes.keybindings.some(
        (binding) => binding.key === 'alt+shift+2' && binding.command === 'emacscode.markWord',
      ),
    );
    await vscode.commands.executeCommand('emacscode.markWord');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [5, 0],
    );
    await vscode.commands.executeCommand('emacscode.markWord');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [10, 0],
    );
    await vscode.commands.executeCommand('emacscode.exchangePointAndMark');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 10],
    );
    await vscode.commands.executeCommand('emacscode.cancel');
    assert.ok(editor.selection.isEmpty);
  });
  it('Given a negative prefix When marking words Then the region extends backward', async function () {
    const position = new vscode.Position(0, 10);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('emacscode.negativeArgument');
    await vscode.commands.executeCommand('emacscode.digit2');
    await vscode.commands.executeCommand('emacscode.markWord');
    assert.deepEqual(
      [editor.selection.anchor.character, editor.selection.active.character],
      [0, 10],
    );
    assert.equal(editor.document.getText(editor.selection), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.cancel');
  });
  for (const command of ['killRegion', 'copyRegion']) {
    it(`Given no active mark When ${command} runs Then text and clipboard remain unchanged`, async function () {
      const clipboard = await vscode.env.clipboard.readText();
      try {
        await vscode.env.clipboard.writeText('emacscode region sentinel');
        assert.equal(await vscode.env.clipboard.readText(), 'emacscode region sentinel');
        await vscode.commands.executeCommand(`emacscode.${command}`);
        assert.equal(editor.document.getText(), 'alpha beta');
        assert.equal(await vscode.env.clipboard.readText(), 'emacscode region sentinel');
      } finally {
        await vscode.env.clipboard.writeText(clipboard);
      }
    });
    it(`Given an empty active region When ${command} runs Then no line is removed`, async function () {
      const clipboard = await vscode.env.clipboard.readText();
      try {
        await vscode.env.clipboard.writeText('emacscode region sentinel');
        await vscode.commands.executeCommand('emacscode.setMark');
        await vscode.commands.executeCommand(`emacscode.${command}`);
        assert.equal(editor.document.getText(), 'alpha beta');
        assert.equal(editor.selection.active.character, 0);
        assert.equal(await vscode.env.clipboard.readText(), '');
      } finally {
        await vscode.env.clipboard.writeText(clipboard);
      }
    });
  }
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
  it('Given a register copy When a zero prefix is supplied Then the region is cut and undo restores it', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.copyToRegister', 'q');
    assert.equal(editor.document.getText(), ' beta');
    assert.equal(editor.selection.active.character, 0);
    await vscode.commands.executeCommand('undo');
    assert.equal(editor.document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.endOfBuffer');
    await vscode.commands.executeCommand('emacscode.insertRegister', 'q');
    assert.equal(editor.document.getText(), 'alpha betaalpha');
  });
  it('Given a rejected read-only register copy Then the previous value remains', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.copyToRegister', 'z');
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      'emacscode-copy-readonly',
      {
        provideTextDocumentContent: () => 'protected',
      },
    );
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('emacscode-copy-readonly:/text'),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.setMark');
      await vscode.commands.executeCommand('emacscode.forwardWord');
      await vscode.commands.executeCommand('emacscode.universalArgument');
      await vscode.commands.executeCommand('emacscode.copyToRegister', 'z');
      assert.equal(document.getText(), 'protected');
      const destination = await vscode.workspace.openTextDocument({
        content: '',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(destination);
      await vscode.commands.executeCommand('emacscode.insertRegister', 'z');
      assert.equal(destination.getText(), 'alpha');
    } finally {
      provider.dispose();
    }
  });
  it('Given a text register When appending and cutting a region Then the edit and register are preserved', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.incrementRegister', 'v');
    assert.equal(editor.document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.endOfBuffer');
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.backwardWord');
    await vscode.commands.executeCommand('emacscode.digit0');
    await vscode.commands.executeCommand('emacscode.incrementRegister', 'v');
    assert.equal(editor.document.getText(), 'alpha ');
    assert.equal(editor.selection.active.character, 6);
    await vscode.commands.executeCommand('undo');
    assert.equal(editor.document.getText(), 'alpha beta');
    await vscode.commands.executeCommand('emacscode.endOfBuffer');
    await vscode.commands.executeCommand('emacscode.insertRegister', 'v');
    assert.equal(editor.document.getText(), 'alpha betaalphabeta');
  });
  it('Given a rejected read-only register cut Then the previous register contents survive', async function () {
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.forwardWord');
    await vscode.commands.executeCommand('emacscode.copyToRegister', 'w');
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      'emacscode-register-readonly',
      {
        provideTextDocumentContent: () => 'protected',
      },
    );
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('emacscode-register-readonly:/text'),
      );
      editor = await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('emacscode.setMark');
      await vscode.commands.executeCommand('emacscode.forwardWord');
      await vscode.commands.executeCommand('emacscode.universalArgument');
      await vscode.commands.executeCommand('emacscode.incrementRegister', 'w');
      assert.equal(document.getText(), 'protected');
      const destination = await vscode.workspace.openTextDocument({
        content: '',
        language: 'plaintext',
      });
      editor = await vscode.window.showTextDocument(destination);
      await vscode.commands.executeCommand('emacscode.insertRegister', 'w');
      assert.equal(destination.getText(), 'alpha');
    } finally {
      provider.dispose();
    }
  });
  it('Given a register command after yank When yank-pop runs Then it does not replace text', async function () {
    await vscode.commands.executeCommand('emacscode.killWord');
    await vscode.commands.executeCommand('emacscode.yank');
    await vscode.commands.executeCommand('emacscode.numberToRegister', 'n');
    await vscode.commands.executeCommand('emacscode.yankPop');
    assert.equal(editor.document.getText(), 'alpha beta');
  });
  it('Given rectangle registers When copied or cut Then rows can be inserted and edits undone', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abcde\nfghij\nklmno',
      language: 'plaintext',
    });
    editor = await vscode.window.showTextDocument(document);
    const start = new vscode.Position(0, 2);
    editor.selection = new vscode.Selection(start, start);
    await vscode.commands.executeCommand('emacscode.setMark');
    await vscode.commands.executeCommand('emacscode.nextLine');
    await vscode.commands.executeCommand('emacscode.forwardChar');
    await vscode.commands.executeCommand('emacscode.copyRectangleToRegister', 'r');
    assert.equal(document.getText(), 'abcde\nfghij\nklmno');
    await vscode.commands.executeCommand('emacscode.universalArgument');
    await vscode.commands.executeCommand('emacscode.copyRectangleToRegister', 's');
    assert.equal(document.getText(), 'abde\nfgij\nklmno');
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'abcde\nfghij\nklmno');
    const end = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(end, end);
    await vscode.commands.executeCommand('emacscode.insertRegister', 'r');
    const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    assert.equal(
      document.getText(),
      `abcde${lineEnding}fghij${lineEnding}klmnoc${lineEnding}     h`,
    );
    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'abcde\nfghij\nklmno');
  });
  it('Given a rectangle When killed and yanked Then its text is restored', async function () {
    const document = await vscode.workspace.openTextDocument({
      content: 'abcde\nfghij\nklmno',
      language: 'plaintext',
    });
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
