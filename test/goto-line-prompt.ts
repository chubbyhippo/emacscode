import * as assert from 'node:assert/strict';
const Module = require('node:module');
const originalLoad = Module._load;
class Position {
  constructor(public offset: number) {}
}
class Selection {
  constructor(
    public anchor: Position,
    public active: Position,
  ) {}
  isEqual(other: Selection): boolean {
    return this.anchor.offset === other.anchor.offset && this.active.offset === other.active.offset;
  }
}
class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}
async function main(): Promise<void> {
  const callbacks = new Map<string, (...args: any[]) => any>();
  const warnings: string[] = [];
  const disposable = () => ({ dispose() {} });
  const document = {
    version: 1,
    isClosed: false,
    eol: 1,
    getText: () => 'one\ntwo',
    offsetAt: (position: Position) => position.offset,
    positionAt: (offset: number) => new Position(offset),
  };
  const editor = {
    document,
    selection: new Selection(new Position(1), new Position(1)),
    get selections() {
      return [this.selection];
    },
    revealRange() {},
  };
  let resolveInput: (value: string | undefined) => void = () => {};
  const vscode = {
    EndOfLine: { CRLF: 2 },
    Range,
    Selection,
    env: { clipboard: { writeText: async () => {} } },
    window: {
      activeTextEditor: editor,
      visibleTextEditors: [editor],
      showInputBox: () =>
        new Promise<string | undefined>((resolve) => {
          resolveInput = resolve;
        }),
      showWarningMessage: async (message: string) => {
        warnings.push(message);
      },
      onDidChangeTextEditorSelection: disposable,
      onDidChangeActiveTextEditor: disposable,
    },
    workspace: {
      getConfiguration: () => ({ get: (_name: string, fallback: number) => fallback }),
      onDidChangeTextDocument: disposable,
    },
    commands: {
      registerCommand: (name: string, callback: (...args: any[]) => any) => {
        callbacks.set(name, callback);
        return disposable();
      },
      executeCommand: async () => {},
    },
  };
  const extensionPath = require.resolve('../../out/extension');
  const searchPath = require.resolve('../../out/search');
  delete require.cache[extensionPath];
  delete require.cache[searchPath];
  try {
    Module._load = function (request, parent, isMain) {
      return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
    };
    require(extensionPath).activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  const goto = callbacks.get('emacscode.gotoLine');
  assert.ok(goto);
  let pending = goto();
  resolveInput(undefined);
  await pending;
  assert.equal(editor.selection.active.offset, 1);
  pending = goto();
  document.version++;
  resolveInput('2');
  await pending;
  assert.equal(editor.selection.active.offset, 1);
  assert.match(warnings.pop()!, /changed/);
  pending = goto();
  editor.selection = new Selection(new Position(2), new Position(2));
  resolveInput('2');
  await pending;
  assert.equal(editor.selection.active.offset, 2);
  assert.match(warnings.pop()!, /changed/);
  pending = goto();
  resolveInput('2');
  await pending;
  assert.equal(editor.selection.active.offset, 4);
  console.log('Goto-line prompt cancellation and stale-state checks passed');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
