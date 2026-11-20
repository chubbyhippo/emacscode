import * as vscode from 'vscode';
import {
  AbbreviationError,
  CharacterBoundaryError,
  CharacterDeletionRangeError,
  ColumnMovementError,
  EditorState,
  FillParagraphError,
  KillRing,
  MarkParagraphError,
  OpenLineError,
  PersistentGoal,
  PrefixArgument,
  RegionCaseError,
  TabStopError,
  ZapSearchError,
} from './core/editor';
import { StructureMovementError } from './core/structure';
import { SearchController } from './search';
import { Registers } from './core/registers';
import { editRectangle, RectangleAction, yankRectangle } from './core/rectangles';

const lineCommentTokens: Record<string, string> = {
  javascript: '//',
  javascriptreact: '//',
  typescript: '//',
  typescriptreact: '//',
  c: '//',
  cpp: '//',
  'objective-c': '//',
  'objective-cpp': '//',
  csharp: '//',
  java: '//',
  go: '//',
  rust: '//',
  php: '//',
  swift: '//',
  kotlin: '//',
  scala: '//',
  dart: '//',
  groovy: '//',
  jsonc: '//',
  less: '//',
  shaderlab: '//',
  python: '#',
  ruby: '#',
  perl: '#',
  shellscript: '#',
  yaml: '#',
  dockerfile: '#',
  toml: '#',
  r: '#',
  powershell: '#',
  makefile: '#',
  coffeescript: '#',
  tcl: '#',
  nim: '#',
  elixir: '#',
  julia: '#',
  lisp: ';',
  clojure: ';',
  scheme: ';',
  racket: ';',
  'emacs-lisp': ';',
  asm: ';',
  sql: '--',
  haskell: '--',
  lua: '--',
  ada: '--',
  vhdl: '--',
  elm: '--',
  vim: '"',
  fortran: '!',
  fortran90: '!',
};

type Action = (
  state: EditorState,
  count: number,
  hasPrefix: boolean,
  lineEnding: string,
  tabSize: number,
  rawUniversal: boolean,
  insertSpaces: boolean,
) => void;

export function activate(context: vscode.ExtensionContext): void {
  const ring = new KillRing(
    vscode.workspace.getConfiguration('emacscode').get<number>('killRingSize', 60),
  );
  const prefix = new PrefixArgument();
  const search = new SearchController();
  context.subscriptions.push(search);
  const states = new WeakMap<vscode.TextEditor, EditorState>();
  const goals = new WeakMap<vscode.TextDocument, PersistentGoal>();
  const registers = new Registers();
  let killedRectangle: string[] = [];
  let queue: Promise<void> = Promise.resolve();
  let activeEditor = vscode.window.activeTextEditor;
  let recenterEditor: vscode.TextEditor | undefined;
  let recenterSelection: vscode.Selection | undefined;
  let recenterStep = 0;
  let windowLineEditor: vscode.TextEditor | undefined;
  let windowLineSelection: vscode.Selection | undefined;
  let windowLineStep = 0;
  const stateFor = (editor: vscode.TextEditor): EditorState => {
    let state = states.get(editor);
    const point = editor.document.offsetAt(editor.selection.active);
    if (!state) {
      let goal = goals.get(editor.document);
      if (!goal) {
        goal = {};
        goals.set(editor.document, goal);
      }
      state = new EditorState(editor.document.getText(), point, ring, goal);
      states.set(editor, state);
    } else state.sync(editor.document.getText(), point);
    return state;
  };
  const contextUpdate = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    const state = editor && states.get(editor);
    await Promise.all([
      vscode.commands.executeCommand('setContext', 'emacscode.prefixPending', prefix.pending),
      vscode.commands.executeCommand(
        'setContext',
        'emacscode.markActive',
        !!state?.active &&
          state.text === editor?.document.getText() &&
          editor.selections.length === 1,
      ),
    ]);
  };
  const apply = async (
    editor: vscode.TextEditor,
    state: EditorState,
    before: string,
    afterEdit: () => void = () => {},
    reveal = true,
  ): Promise<void> => {
    if (state.text !== before) {
      if (editor.document.eol === vscode.EndOfLine.CRLF && /(?<!\r)\n/.test(state.text))
        throw new Error('Edit contains incompatible line endings');
      let start = 0;
      while (
        start < before.length &&
        start < state.text.length &&
        before[start] === state.text[start]
      )
        start++;
      let oldEnd = before.length;
      let newEnd = state.text.length;
      while (oldEnd > start && newEnd > start && before[oldEnd - 1] === state.text[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      const splitsCRLF = (text: string, offset: number): boolean =>
        offset > 0 && text[offset - 1] === '\r' && text[offset] === '\n';
      if (splitsCRLF(before, start) || splitsCRLF(state.text, start)) start--;
      if (splitsCRLF(before, oldEnd) || splitsCRLF(state.text, newEnd)) {
        oldEnd++;
        newEnd++;
      }
      const ok = await editor.edit((builder) =>
        builder.replace(
          new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(oldEnd)),
          state.text.slice(start, newEnd),
        ),
      );
      if (!ok || editor.document.getText() !== state.text) {
        states.delete(editor);
        throw new Error('The editor rejected the edit');
      }
    }
    afterEdit();
    const point = editor.document.positionAt(state.point);
    const anchor =
      state.active && state.mark !== undefined ? editor.document.positionAt(state.mark) : point;
    editor.selection = new vscode.Selection(anchor, point);
    await contextUpdate();
    if (reveal) editor.revealRange(new vscode.Range(point, point));
  };
  const runSpecial = (
    editor: vscode.TextEditor,
    action: (state: EditorState) => (() => void) | void,
    expected?: { version: number; selection: vscode.Selection },
  ): Promise<void> => {
    queue = queue
      .then(async () => {
        if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
          throw new Error('The original editor is no longer active');
        if (editor.selections.length !== 1)
          throw new Error('emacscode supports one cursor at a time');
        if (
          expected &&
          (editor.document.version !== expected.version ||
            !editor.selection.isEqual(expected.selection))
        )
          throw new Error('Document or selection changed while choosing a register');
        const state = stateFor(editor);
        recenterEditor = undefined;
        windowLineEditor = undefined;
        const before = state.text;
        try {
          state.breakCommandChain();
          const commit = action(state);
          await apply(editor, state, before, commit || undefined);
        } catch (error) {
          states.delete(editor);
          throw error;
        }
      })
      .catch((error) => {
        void vscode.window.showWarningMessage(
          `emacscode: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    return queue;
  };
  const register = (name: string, action: Action): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const hasPrefix = prefix.pending;
        const rawUniversal = prefix.rawUniversal;
        const count = prefix.consume();
        contextUpdate();
        queue = queue
          .then(async () => {
            if (editor.selections.length !== 1)
              throw new Error('emacscode supports one cursor at a time');
            const state = stateFor(editor);
            recenterEditor = undefined;
            windowLineEditor = undefined;
            const before = state.text;
            const ringSnapshot = ring.snapshot();
            const ringVersion = ring.version;
            let editCommitted = false;
            try {
              action(
                state,
                count,
                hasPrefix,
                editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
                typeof editor.options?.tabSize === 'number' ? editor.options.tabSize : 8,
                rawUniversal,
                editor.options?.insertSpaces !== false,
              );
              if (state.text !== before && editor.document.isClosed)
                throw new Error('The document is closed');
              await apply(editor, state, before, () => {
                editCommitted = true;
              });
              const newest = ring.values()[0];
              if (newest !== undefined && ring.version !== ringVersion) {
                try {
                  await vscode.env.clipboard.writeText(newest);
                } catch {
                  void vscode.window.showWarningMessage(
                    'emacscode: could not update the system clipboard',
                  );
                }
              }
            } catch (error) {
              if (error instanceof AbbreviationError) {
                try {
                  await apply(editor, state, before);
                } catch (applyError) {
                  states.delete(editor);
                  throw applyError;
                }
                throw error;
              }
              if (
                (error instanceof CharacterBoundaryError ||
                  error instanceof ColumnMovementError ||
                  error instanceof FillParagraphError ||
                  error instanceof StructureMovementError ||
                  error instanceof CharacterDeletionRangeError ||
                  error instanceof MarkParagraphError ||
                  error instanceof RegionCaseError ||
                  error instanceof OpenLineError ||
                  error instanceof TabStopError) &&
                state.text === before
              ) {
                try {
                  await apply(editor, state, before);
                } catch (applyError) {
                  states.delete(editor);
                  throw applyError;
                }
                throw error;
              }
              if (!editCommitted) ring.restore(ringSnapshot.entries, ringSnapshot.index);
              states.delete(editor);
              throw error;
            }
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  };
  const actions: Record<string, Action> = {
    backwardChar: (state, count) => state.moveCharacter(-count),
    forwardChar: (state, count) => state.moveCharacter(count),
    previousLine: (state, count, _hasPrefix, _lineEnding, tabSize) =>
      state.vertical(-count, tabSize),
    nextLine: (state, count, _hasPrefix, _lineEnding, tabSize) => state.vertical(count, tabSize),
    setGoalColumn: (state, _count, hasPrefix, _lineEnding, tabSize) =>
      state.setGoalColumn(hasPrefix, tabSize),
    beginningOfLine: (state, count) => state.lineBoundary(false, count),
    endOfLine: (state, count) => state.lineBoundary(true, count),
    backToIndentation: (state) => state.backToIndentation(),
    backwardWord: (state, count) => state.moveWord(-count),
    forwardWord: (state, count) => state.moveWord(count),
    backwardSentence: (state, count) => state.moveSentence(-count),
    forwardSentence: (state, count) => state.moveSentence(count),
    backwardParagraph: (state, count) => state.moveParagraph(-count),
    forwardParagraph: (state, count) => state.moveParagraph(count),
    backwardPage: (state, count) => state.movePage(-count),
    forwardPage: (state, count) => state.movePage(count),
    backwardSexp: (state, count) => state.moveStructure(-count),
    forwardSexp: (state, count) => state.moveStructure(count),
    beginningOfDefun: (state, count) => state.moveDefun(count, false),
    endOfDefun: (state, count) => state.moveDefun(count, true),
    backwardList: (state, count) => state.moveStructure(-count, true),
    forwardList: (state, count) => state.moveStructure(count, true),
    backwardUpList: (state, count) => state.moveListDepth(count, true),
    downList: (state, count) => state.moveListDepth(count, false),
    moveToColumn: (state, count, _hasPrefix, _lineEnding, tabSize) =>
      state.moveToColumn(count, tabSize),
    upcaseWord: (state, count) => state.changeWordCase('upcase', count),
    downcaseWord: (state, count) => state.changeWordCase('downcase', count),
    capitalizeWord: (state, count) => state.changeWordCase('capitalize', count),
    upcaseRegion: (state) => state.changeRegionCase('upcase'),
    downcaseRegion: (state) => state.changeRegionCase('downcase'),
    beginningOfBuffer: (state, count, hasPrefix, _lineEnding, _tabSize, rawUniversal) =>
      state.bufferBoundary(false, hasPrefix && !rawUniversal ? count : undefined, rawUniversal),
    endOfBuffer: (state, count, hasPrefix, _lineEnding, _tabSize, rawUniversal) =>
      state.bufferBoundary(true, hasPrefix && !rawUniversal ? count : undefined, rawUniversal),
    setMark: (state) => state.setMark(),
    markWord: (state, count, hasPrefix) => state.markWord(count, hasPrefix),
    markSexp: (state, count, hasPrefix) => state.markSexp(count, hasPrefix),
    markParagraph: (state, count) => state.markParagraph(count),
    exchangePointAndMark: (state, _count, hasPrefix) => state.exchange(hasPrefix),
    markWholeBuffer: (state) => state.selectAll(),
    appendNextKill: (state) => state.appendNextKill(),
    killRegion: (state) => {
      state.region();
    },
    copyRegion: (state) => {
      state.region(true);
    },
    killLine: (state, count, hasPrefix) => {
      state.killLine(count, hasPrefix);
    },
    killWord: (state, count) => {
      state.killWord(count);
    },
    backwardKillWord: (state, count) => {
      state.killWord(-count);
    },
    killSexp: (state, count) => {
      state.killSexp(count);
    },
    killSentence: (state, count) => {
      state.killSentence(count);
    },
    backwardKillSentence: (state, count) => {
      state.killSentence(-count);
    },
    yank: (state, count, _hasPrefix, lineEnding, _tabSize, rawUniversal) =>
      state.yank(lineEnding, count, rawUniversal),
    yankPop: (state, count, _hasPrefix, lineEnding) => state.yankPop(count, lineEnding),
    deleteChar: (state, count, hasPrefix) => state.deleteCharacter(count, hasPrefix),
    backwardDeleteChar: (state, count, hasPrefix) =>
      state.backwardDeleteCharacter(count, hasPrefix),
    deleteHorizontalSpace: (state, _count, hasPrefix) => state.deleteHorizontalSpace(hasPrefix),
    tabToTabStop: (state, _count, _hasPrefix, _lineEnding, tabSize, _rawUniversal, insertSpaces) =>
      state.tabToTabStop(tabSize, insertSpaces),
    cycleSpacing: (state, count, hasPrefix) => state.cycleSpacing(hasPrefix ? count : undefined),
    deleteBlankLines: (state) => state.deleteBlankLines(),
    fillParagraph: (state, _count, hasPrefix, lineEnding) =>
      state.fillParagraph(70, lineEnding, hasPrefix),
    expandAbbreviation: (state, count, hasPrefix) => state.expandAbbreviation(count, hasPrefix),
    deleteIndentation: (state, _count, hasPrefix) => state.deleteIndentation(hasPrefix),
    transposeCharacters: (state, count) => state.transposeCharacters(count),
    transposeWords: (state, count) => state.transposeWords(count),
    transposeSexps: (state, count) => state.transposeSexps(count),
    transposeLines: (state, count, _hasPrefix, lineEnding) =>
      state.transposeLines(count, lineEnding),
    openLine: (state, count, _hasPrefix, lineEnding) => state.openLine(count, lineEnding),
    cancel: (state) => {
      prefix.reset();
      contextUpdate();
      state.cancel();
    },
  };
  for (const [name, action] of Object.entries(actions)) register(name, action);
  for (const [name, command, needsRegion] of [
    ['newlineIndent', 'type', false],
    ['indentRegion', 'editor.action.indentLines', true],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        prefix.reset();
        void contextUpdate();
        queue = queue
          .then(async () => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            if (editor.selections.length !== 1)
              throw new Error('emacscode supports one cursor at a time');
            const state = stateFor(editor);
            if (needsRegion) state.regionBounds();
            state.breakCommandChain();
            if (name === 'newlineIndent')
              await vscode.commands.executeCommand(command, { text: '\n' });
            else await vscode.commands.executeCommand(command);
            states.delete(editor);
            await contextUpdate();
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.comment', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const hasPrefix = prefix.pending;
      const rawUniversal = prefix.rawUniversal;
      const count = prefix.consume();
      void contextUpdate();
      queue = queue
        .then(async () => {
          if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
            throw new Error('The original editor is no longer active');
          if (editor.selections.length !== 1)
            throw new Error('emacscode supports one cursor at a time');
          const state = stateFor(editor);
          state.breakCommandChain();
          const before = state.text;
          const snapshot = ring.snapshot();
          let committed = false;
          try {
            const killed = state.commentDwim(
              lineCommentTokens[editor.document.languageId],
              typeof editor.options?.tabSize === 'number' ? editor.options.tabSize : 8,
              editor.options?.insertSpaces !== false,
              32,
              hasPrefix ? count : undefined,
              rawUniversal,
            );
            await apply(editor, state, before, () => {
              committed = true;
            });
            const newest = ring.values()[0];
            if (killed && newest !== undefined) {
              try {
                await vscode.env.clipboard.writeText(newest);
              } catch {
                void vscode.window.showWarningMessage(
                  'emacscode: could not update the system clipboard',
                );
              }
            }
          } catch (error) {
            if (!committed) ring.restore(snapshot.entries, snapshot.index);
            if (state.text !== before) states.delete(editor);
            throw error;
          }
        })
        .catch((error) => {
          void vscode.window.showWarningMessage(
            `emacscode: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return queue;
    }),
  );
  for (const [name, direction] of [
    ['textScaleIncrease', 1],
    ['textScaleDecrease', -1],
    ['textScaleReset', 0],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const count = prefix.consume();
        void contextUpdate();
        queue = queue
          .then(async () => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            stateFor(editor).breakCommandChain();
            recenterEditor = undefined;
            windowLineEditor = undefined;
            if (!Number.isSafeInteger(count) || Math.abs(count) > 100)
              throw new Error('Text scale count is too large');
            if (direction === 0 || count === 0) {
              await vscode.commands.executeCommand('editor.action.fontZoomReset');
              return;
            }
            const command =
              count * direction > 0 ? 'editor.action.fontZoomIn' : 'editor.action.fontZoomOut';
            for (let index = 0; index < Math.abs(count); index++) {
              if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
                throw new Error('The original editor is no longer active');
              await vscode.commands.executeCommand(command);
            }
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  for (const [name, command] of [
    ['navigateBack', 'workbench.action.navigateBack'],
    ['navigateForward', 'workbench.action.navigateForward'],
    ['gotoDefinition', 'editor.action.revealDefinition'],
    ['gotoReferences', 'editor.action.goToReferences'],
    ['nextDiagnostic', 'editor.action.marker.nextInFiles'],
    ['previousDiagnostic', 'editor.action.marker.prevInFiles'],
    ['gotoSymbol', 'workbench.action.gotoSymbol'],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, async () => {
        prefix.reset();
        const editor = vscode.window.activeTextEditor;
        if (editor) stateFor(editor).breakCommandChain();
        await contextUpdate();
        await vscode.commands.executeCommand(command);
      }),
    );
  }
  for (const [name, direction] of [
    ['scrollOtherForward', 1],
    ['scrollOtherBackward', -1],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const hasPrefix = prefix.pending;
        const count = prefix.consume() * direction;
        void contextUpdate();
        queue = queue
          .then(async () => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            const other = vscode.window.visibleTextEditors.find(
              (candidate) => candidate !== editor && candidate.viewColumn !== editor.viewColumn,
            );
            if (!other || other.viewColumn === undefined)
              throw new Error('No other visible text editor');
            if (!count) return;
            let focusedOther: vscode.TextEditor | undefined;
            try {
              focusedOther = await vscode.window.showTextDocument(other.document, {
                viewColumn: other.viewColumn,
                preserveFocus: false,
                preview: false,
              });
              if (vscode.window.activeTextEditor !== focusedOther)
                throw new Error('The target editor is no longer active');
              await vscode.commands.executeCommand('editorScroll', {
                to: count > 0 ? 'down' : 'up',
                by: hasPrefix ? 'line' : 'page',
                value: hasPrefix ? Math.abs(count) : 1,
                revealCursor: false,
              });
            } finally {
              if (
                vscode.window.activeTextEditor === focusedOther &&
                !editor.document.isClosed &&
                editor.viewColumn !== undefined
              )
                await vscode.window.showTextDocument(editor.document, {
                  viewColumn: editor.viewColumn,
                  preserveFocus: false,
                  preview: false,
                });
            }
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  for (const [name, direction] of [
    ['scrollLeft', 1],
    ['scrollRight', -1],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const hasPrefix = prefix.pending;
        const count = prefix.consume() * direction;
        void contextUpdate();
        queue = queue
          .then(async () => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            if (!count) return;
            stateFor(editor).breakCommandChain();
            await vscode.commands.executeCommand('editorScroll', {
              to: count > 0 ? 'right' : 'left',
              by: hasPrefix ? 'column' : 'halfPage',
              value: hasPrefix ? Math.abs(count) : 1,
              revealCursor: false,
            });
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  for (const [name, direction] of [
    ['scrollForward', 1],
    ['scrollBackward', -1],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const hasPrefix = prefix.pending;
        const count = prefix.consume() * direction;
        void contextUpdate();
        queue = queue
          .then(async () => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            if (editor.selections.length !== 1)
              throw new Error('emacscode supports one cursor at a time');
            const state = stateFor(editor);
            state.breakCommandChain();
            recenterEditor = undefined;
            windowLineEditor = undefined;
            if (count === 0) return;
            await vscode.commands.executeCommand('editorScroll', {
              to: count > 0 ? 'down' : 'up',
              by: hasPrefix ? 'line' : 'page',
              value: hasPrefix ? Math.abs(count) : 1,
              revealCursor: true,
            });
            state.sync(
              editor.document.getText(),
              editor.document.offsetAt(editor.selection.active),
            );
            await apply(editor, state, state.text, undefined, false);
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.recenter', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const hasPrefix = prefix.pending;
      const count = prefix.consume();
      void contextUpdate();
      queue = queue
        .then(async () => {
          if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
            throw new Error('The original editor is no longer active');
          if (editor.selections.length !== 1)
            throw new Error('emacscode supports one cursor at a time');
          const state = stateFor(editor);
          state.breakCommandChain();
          const repeated =
            recenterEditor === editor && recenterSelection?.isEqual(editor.selection);
          const step = hasPrefix ? -1 : repeated ? (recenterStep + 1) % 3 : 0;
          const point = editor.selection.active;
          if (step === 0)
            editor.revealRange(
              new vscode.Range(point, point),
              vscode.TextEditorRevealType.InCenter,
            );
          else if (step === 1)
            editor.revealRange(new vscode.Range(point, point), vscode.TextEditorRevealType.AtTop);
          else {
            const range = editor.visibleRanges[0];
            const height = range ? Math.max(1, range.end.line - range.start.line) : 1;
            const offset = step === 2 ? height : count < 0 ? height + count + 1 : count;
            const top = Math.max(0, Math.min(editor.document.lineCount - 1, point.line - offset));
            const position = new vscode.Position(top, 0);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.AtTop,
            );
          }
          recenterEditor = editor;
          recenterSelection = editor.selection;
          recenterStep = step;
          windowLineEditor = undefined;
        })
        .catch((error) => {
          void vscode.window.showWarningMessage(
            `emacscode: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return queue;
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.moveToWindowLine', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const hasPrefix = prefix.pending;
      const count = prefix.consume();
      void contextUpdate();
      queue = queue
        .then(async () => {
          if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
            throw new Error('The original editor is no longer active');
          if (editor.selections.length !== 1)
            throw new Error('emacscode supports one cursor at a time');
          const range = editor.visibleRanges[0];
          if (!range) throw new Error('Editor viewport is unavailable');
          const first = range.start.line;
          const last = range.end.line;
          const repeated =
            windowLineEditor === editor && windowLineSelection?.isEqual(editor.selection);
          const step = hasPrefix ? -1 : repeated ? (windowLineStep + 1) % 3 : 0;
          const line = Math.max(
            first,
            Math.min(
              last,
              step === 1
                ? first
                : step === 2
                  ? last
                  : hasPrefix
                    ? count >= 0
                      ? first + count
                      : last + count + 1
                    : first + Math.floor((last - first) / 2),
            ),
          );
          const state = stateFor(editor);
          state.gotoLine(line + 1);
          state.backToIndentation();
          await apply(editor, state, state.text, undefined, false);
          windowLineEditor = editor;
          windowLineSelection = editor.selection;
          windowLineStep = step;
          recenterEditor = undefined;
        })
        .catch((error) => {
          void vscode.window.showWarningMessage(
            `emacscode: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return queue;
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.gotoLine', async (supplied?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const version = editor.document.version;
      const selections = editor.selections.slice();
      const hasPrefix = prefix.pending;
      const count = prefix.consume();
      void contextUpdate();
      const valid = (value: string): boolean =>
        /^[+-]?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value.trim()));
      const input =
        supplied !== undefined || hasPrefix
          ? String(supplied ?? count)
          : await vscode.window.showInputBox({
              prompt: 'Go to line',
              validateInput: (value) => (valid(value) ? undefined : 'Enter a whole line number'),
            });
      if (input === undefined) return;
      if (!valid(input)) {
        void vscode.window.showWarningMessage('emacscode: invalid line number');
        return;
      }
      queue = queue
        .then(async () => {
          if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
            throw new Error('The original editor is no longer active');
          if (selections.length !== 1 || editor.selections.length !== 1)
            throw new Error('emacscode supports one cursor at a time');
          if (editor.document.version !== version || !editor.selection.isEqual(selections[0]))
            throw new Error('Document or selection changed while choosing a line');
          const state = stateFor(editor);
          const before = state.text;
          state.gotoLine(Number(input));
          await apply(editor, state, before);
        })
        .catch((error) => {
          void vscode.window.showWarningMessage(
            `emacscode: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return queue;
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.gotoCharacter', async (supplied?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const version = editor.document.version;
      const selection = editor.selection;
      const hasPrefix = prefix.pending;
      const count = prefix.consume();
      void contextUpdate();
      const valid = (value: string): boolean =>
        /^[+-]?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value.trim()));
      const input =
        supplied !== undefined || hasPrefix
          ? String(supplied ?? count)
          : await vscode.window.showInputBox({
              prompt: 'Go to character',
              validateInput: (value) =>
                valid(value) ? undefined : 'Enter a whole character position',
            });
      if (input === undefined) return;
      if (!valid(input)) {
        void vscode.window.showWarningMessage('emacscode: invalid character position');
        return;
      }
      return runSpecial(editor, (state) => state.gotoCharacter(Number(input)), {
        version,
        selection,
      });
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.quotedInsert', async (supplied?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const version = editor.document.version;
      const selection = editor.selection;
      const count = prefix.consume();
      void contextUpdate();
      const value =
        supplied ??
        (await vscode.window.showInputBox({
          prompt: 'Quoted character (press Enter to confirm)',
          validateInput: (input) =>
            Array.from(input).length === 1 ? undefined : 'Enter one character',
        }));
      if (value === undefined) return;
      return runSpecial(
        editor,
        (state) => {
          state.quotedInsert(
            value,
            count,
            editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
          );
        },
        { version, selection },
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.zapToChar', async (supplied?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const version = editor.document.version;
      const selections = editor.selections.slice();
      const count = prefix.consume();
      contextUpdate();
      const character =
        supplied ??
        (await vscode.window.showInputBox({
          prompt: 'Zap to character (press Enter to confirm)',
          validateInput: (value) =>
            Array.from(value).length === 1 ? undefined : 'Enter one character',
        }));
      if (character === undefined) return;
      queue = queue
        .then(async () => {
          if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
            throw new Error('The original editor is no longer active');
          if (selections.length !== 1 || editor.selections.length !== 1)
            throw new Error('emacscode supports one cursor at a time');
          if (editor.document.version !== version || !editor.selection.isEqual(selections[0]))
            throw new Error('Document or selection changed while choosing a character');
          const state = stateFor(editor);
          const before = state.text;
          const ringSnapshot = ring.snapshot();
          const ringVersion = ring.version;
          let editCommitted = false;
          try {
            state.zapToChar(character, count);
            await apply(editor, state, before, () => {
              editCommitted = true;
            });
            const newest = ring.values()[0];
            if (newest !== undefined && ring.version !== ringVersion) {
              try {
                await vscode.env.clipboard.writeText(newest);
              } catch {
                void vscode.window.showWarningMessage(
                  'emacscode: could not update the system clipboard',
                );
              }
            }
          } catch (error) {
            if (!editCommitted) ring.restore(ringSnapshot.entries, ringSnapshot.index);
            if (!(error instanceof ZapSearchError)) states.delete(editor);
            throw error;
          }
        })
        .catch((error) => {
          void vscode.window.showWarningMessage(
            `emacscode: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return queue;
    }),
  );
  const registerCommand = (
    name: string,
    action: (
      state: EditorState,
      character: string,
      count: number,
      hasPrefix: boolean,
    ) => (() => void) | void,
  ): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, async (supplied?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const version = editor.document.version;
        const selection = editor.selection;
        const hasPrefix = prefix.pending;
        const count = prefix.consume();
        contextUpdate();
        const character =
          supplied ??
          (await vscode.window.showInputBox({
            prompt: 'Register character',
            validateInput: (value) =>
              Array.from(value).length === 1 && !/[\r\n]/.test(value)
                ? undefined
                : 'Enter one character',
          }));
        if (character === undefined) return;
        if (editor.document.version !== version) {
          void vscode.window.showWarningMessage(
            'emacscode: document changed while choosing a register',
          );
          return;
        }
        return runSpecial(
          editor,
          (state) => {
            Registers.validateName(character);
            return action(state, character, count, hasPrefix);
          },
          { version, selection },
        );
      }),
    );
  };
  registerCommand('copyToRegister', (state, character, _count, hasPrefix) =>
    registers.prepareCopy(state, character, hasPrefix),
  );
  registerCommand('copyRectangleToRegister', (state, character, _count, hasPrefix) => {
    const [start, end] = state.regionBounds();
    const result = editRectangle(state.text, start, end, hasPrefix ? 'delete' : 'copy');
    if (hasPrefix) state.applyText(result.text, result.point);
    return () => registers.setRectangle(character, result.rows);
  });
  registerCommand('insertRegister', (state, character) => {
    const value = registers.read(character);
    if (value.kind === 'rectangle') {
      const result = yankRectangle(state.text, state.point, value.rows);
      state.applyText(result.text, result.point);
      return;
    }
    const text = value.kind === 'text' ? value.text : String(value.value);
    const lineEnding =
      vscode.window.activeTextEditor?.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    state.insert(text.replace(/\r\n|\r|\n/g, lineEnding));
  });
  registerCommand(
    'numberToRegister',
    (_state, character, count) => () => registers.setNumber(character, count),
  );
  registerCommand('incrementRegister', (state, character, count, hasPrefix) =>
    registers.prepareIncrement(state, character, count, hasPrefix),
  );
  for (const action of ['copy', 'kill', 'delete', 'clear', 'open'] as const) {
    const title = action[0].toUpperCase() + action.slice(1);
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.rectangle${title}`, () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        prefix.reset();
        contextUpdate();
        return runSpecial(editor, (state) => {
          if (!state.active || state.mark === undefined) throw new Error('No active region');
          const result = editRectangle(
            state.text,
            state.mark,
            state.point,
            action as RectangleAction,
          );
          if (action !== 'copy') state.applyText(result.text, result.point);
          return action === 'copy' || action === 'kill'
            ? () => {
                killedRectangle = result.rows;
              }
            : undefined;
        });
      }),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.rectangleYank', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      prefix.reset();
      contextUpdate();
      return runSpecial(editor, (state) => {
        const result = yankRectangle(state.text, state.point, killedRectangle);
        state.applyText(result.text, result.point);
      });
    }),
  );
  for (const [name, direction] of [
    ['searchForward', 1],
    ['searchBackward', -1],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, (initialQuery?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        prefix.reset();
        void contextUpdate();
        queue = queue
          .then(() => {
            if (vscode.window.activeTextEditor !== editor || editor.document.isClosed)
              throw new Error('The original editor is no longer active');
            stateFor(editor).breakCommandChain();
            search.start(editor, direction, initialQuery);
          })
          .catch((error) => {
            void vscode.window.showWarningMessage(
              `emacscode: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return queue;
      }),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.isearchForward', () => search.repeat(1)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.isearchBackward', () => search.repeat(-1)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.isearchCancel', () => search.cancel()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.isearchPreviousHistory', () =>
      search.historyMove(1),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.isearchNextHistory', () => search.historyMove(-1)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.universalArgument', () => {
      prefix.universal();
      contextUpdate();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.negativeArgument', () => {
      prefix.negative();
      contextUpdate();
    }),
  );
  for (let digit = 0; digit <= 9; digit++)
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.digit${digit}`, () => {
        prefix.digit(digit);
        contextUpdate();
      }),
    );
  context.subscriptions.push(
    vscode.commands.registerCommand('emacscode.toggle', async () => {
      const configuration = vscode.workspace.getConfiguration('emacscode');
      await configuration.update(
        'enabled',
        !configuration.get<boolean>('enabled', true),
        vscode.ConfigurationTarget.Global,
      );
      prefix.reset();
      contextUpdate();
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      const state = states.get(editor);
      if (!state || !state.active || state.mark === undefined) return;
      if (
        editor.document.getText() !== state.text ||
        event.selections.length !== 1 ||
        editor.selections.length !== 1
      ) {
        contextUpdate();
        return;
      }
      if (
        event.kind !== vscode.TextEditorSelectionChangeKind.Keyboard ||
        !event.selections[0].isEqual(editor.selection)
      )
        return;
      const point = editor.selection.active;
      state.sync(state.text, editor.document.offsetAt(point));
      const anchor = editor.document.positionAt(state.mark);
      if (!editor.selection.anchor.isEqual(anchor))
        editor.selection = new vscode.Selection(anchor, point);
      contextUpdate();
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document !== event.document) continue;
        const state = states.get(editor);
        if (state && state.text !== event.document.getText())
          state.sync(event.document.getText(), event.document.offsetAt(editor.selection.active));
      }
      if (vscode.window.activeTextEditor?.document === event.document) contextUpdate();
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const previousEditor = activeEditor;
      activeEditor = editor;
      prefix.reset();
      recenterEditor = undefined;
      windowLineEditor = undefined;
      if (previousEditor !== editor) {
        queue = queue.then(() => {
          if (previousEditor) states.get(previousEditor)?.breakCommandChain();
          if (editor) states.get(editor)?.breakCommandChain();
        });
      }
      contextUpdate();
    }),
  );
  contextUpdate();
}

export function deactivate(): void {}
