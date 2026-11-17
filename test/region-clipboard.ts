import * as assert from 'node:assert/strict';
const Module = require('node:module');
const originalLoad = Module._load;

class Position {
  constructor(public offset: number) {}
}
class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}
class Selection extends Range {
  constructor(
    public anchor: Position,
    public active: Position,
  ) {
    super(anchor, active);
  }
  isEqual(other: Selection): boolean {
    return this.anchor.offset === other.anchor.offset && this.active.offset === other.active.offset;
  }
}

async function runCase(command: string, mark: 'unset' | 'inactive' | 'empty'): Promise<void> {
  const writes: string[] = [];
  const warnings: string[] = [];
  const callbacks = new Map<string, (...args: any[]) => any>();
  const disposable = () => ({ dispose() {} });
  const document = {
    eol: 1,
    isClosed: false,
    getText: () => 'alpha beta',
    offsetAt: (position: Position) => position.offset,
    positionAt: (offset: number) => new Position(offset),
  };
  const editor = {
    document,
    selection: new Selection(new Position(0), new Position(0)),
    get selections() {
      return [this.selection];
    },
    edit: async () => {
      throw new Error('Unexpected document edit');
    },
    revealRange() {},
  };
  const vscode = {
    EndOfLine: { CRLF: 2 },
    Range,
    Selection,
    env: {
      clipboard: {
        writeText: async (value: string) => {
          writes.push(value);
        },
      },
    },
    window: {
      activeTextEditor: editor,
      visibleTextEditors: [editor],
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
  let extension: { activate(context: { subscriptions: any[] }): void };
  try {
    Module._load = function (request, parent, isMain) {
      return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
    };
    extension = require(extensionPath);
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  const invoke = async (name: string) => {
    const callback = callbacks.get(`emacscode.${name}`);
    assert.ok(callback, name);
    await callback();
  };
  if (mark !== 'unset') await invoke('setMark');
  if (mark === 'inactive') {
    await invoke('forwardChar');
    await invoke('cancel');
  }
  const before = editor.selection;
  await invoke(command);
  assert.equal(document.getText(), 'alpha beta');
  assert.ok(editor.selection.isEqual(before));
  if (mark === 'empty') {
    assert.deepEqual(writes, ['']);
    assert.deepEqual(warnings, []);
  } else {
    assert.deepEqual(writes, []);
    assert.deepEqual(warnings, ['emacscode: No active region']);
  }
}

async function main(): Promise<void> {
  for (const command of ['killRegion', 'copyRegion']) {
    for (const mark of ['unset', 'inactive', 'empty'] as const) await runCase(command, mark);
  }
  console.log('Mock clipboard: rejected regions perform no writes; empty regions write once');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
