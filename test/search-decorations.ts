const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const decorations = [];
const listeners: Record<string, (...args: any[]) => void> = {};
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
}
const input = {
  value: '',
  title: '',
  onDidChangeValue: (callback) => {
    listeners.change = callback;
    return { dispose() {} };
  },
  onDidAccept: (callback) => {
    listeners.accept = callback;
    return { dispose() {} };
  },
  onDidHide: (callback) => {
    listeners.hide = callback;
    return { dispose() {} };
  },
  show() {},
  hide() {},
  dispose() {},
};
const doc = {
  version: 1,
  isClosed: false,
  getText: () => 'one one one',
  offsetAt: (position) => position.offset,
  positionAt: (offset) => new Position(offset),
};
const applied = new Map();
const editor = {
  document: doc,
  selections: [new Selection(new Position(0), new Position(0))],
  selection: new Selection(new Position(0), new Position(0)),
  setDecorations: (type, ranges) =>
    applied.set(
      type,
      ranges.map((range) => [range.start.offset, range.end.offset]),
    ),
  revealRange() {},
};
const vscode = {
  window: {
    createInputBox: () => input,
    createTextEditorDecorationType: (options) => {
      const decoration = {
        color: options.backgroundColor.id,
        disposed: false,
        dispose() {
          this.disposed = true;
        },
      };
      decorations.push(decoration);
      return decoration;
    },
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    showWarningMessage() {},
  },
  workspace: { onDidChangeTextDocument: () => ({ dispose() {} }) },
  commands: { executeCommand: () => Promise.resolve() },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  Range,
  Selection,
};
Module._load = function (request, parent, isMain) {
  return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
};
const { SearchController } = require('../../out/search');
Module._load = originalLoad;
const search = new SearchController();
search.start(editor, 1, 'one');
assert.equal(input.title, '1/3 I-search forward');
assert.deepEqual(applied.get(decorations[0]), [
  [4, 7],
  [8, 11],
]);
assert.deepEqual(applied.get(decorations[1]), [[0, 3]]);
search.repeat(1);
assert.equal(input.title, '2/3 I-search forward');
assert.deepEqual(applied.get(decorations[0]), [
  [0, 3],
  [8, 11],
]);
assert.deepEqual(applied.get(decorations[1]), [[4, 7]]);
input.value = 'missing';
listeners.change('missing');
assert.equal(input.title, '0/0 Failing I-search forward');
assert.deepEqual(applied.get(decorations[0]), []);
assert.deepEqual(applied.get(decorations[1]), []);
input.value = '';
listeners.change('');
assert.deepEqual(applied.get(decorations[0]), []);
assert.deepEqual(applied.get(decorations[1]), []);
search.cancel();
assert.ok(decorations.every((decoration) => decoration.disposed));
console.log('Search decoration rendering and cleanup verified');
