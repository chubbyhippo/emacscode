import * as vscode from 'vscode';
import {
  CharacterBoundaryError,
  CharacterDeletionRangeError,
  EditorState,
  KillRing,
  MarkParagraphError,
  OpenLineError,
  PrefixArgument,
} from './core/editor';
import { SearchController } from './search';
import { Registers } from './core/registers';
import { editRectangle, RectangleAction, yankRectangle } from './core/rectangles';

type Action = (
  state: EditorState,
  count: number,
  hasPrefix: boolean,
  lineEnding: string,
  tabSize: number,
  rawUniversal: boolean,
) => void;

export function activate(context: vscode.ExtensionContext): void {
  const ring = new KillRing(
    vscode.workspace.getConfiguration('emacscode').get<number>('killRingSize', 60),
  );
  const prefix = new PrefixArgument();
  const search = new SearchController();
  context.subscriptions.push(search);
  const states = new WeakMap<vscode.TextEditor, EditorState>();
  const registers = new Registers();
  let killedRectangle: string[] = [];
  let queue: Promise<void> = Promise.resolve();
  const stateFor = (editor: vscode.TextEditor): EditorState => {
    let state = states.get(editor);
    const point = editor.document.offsetAt(editor.selection.active);
    if (!state) {
      state = new EditorState(editor.document.getText(), point, ring);
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
    editor.revealRange(new vscode.Range(point, point));
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
            const before = state.text;
            const oldRing = ring.values();
            let editCommitted = false;
            try {
              action(
                state,
                count,
                hasPrefix,
                editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
                typeof editor.options?.tabSize === 'number' ? editor.options.tabSize : 8,
                rawUniversal,
              );
              if (state.text !== before && editor.document.isClosed)
                throw new Error('The document is closed');
              await apply(editor, state, before, () => {
                editCommitted = true;
              });
              const newest = ring.values()[0];
              if (
                newest !== undefined &&
                (newest !== oldRing[0] || ring.values().length !== oldRing.length)
              ) {
                try {
                  await vscode.env.clipboard.writeText(newest);
                } catch {
                  void vscode.window.showWarningMessage(
                    'emacscode: could not update the system clipboard',
                  );
                }
              }
            } catch (error) {
              if (
                (error instanceof CharacterBoundaryError ||
                  error instanceof CharacterDeletionRangeError ||
                  error instanceof MarkParagraphError ||
                  error instanceof OpenLineError) &&
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
              if (!editCommitted) ring.restore(oldRing);
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
    beginningOfLine: (state, count) => state.lineBoundary(false, count),
    endOfLine: (state, count) => state.lineBoundary(true, count),
    backToIndentation: (state) => state.backToIndentation(),
    backwardWord: (state, count) => state.moveWord(-count),
    forwardWord: (state, count) => state.moveWord(count),
    backwardSentence: (state, count) => state.moveSentence(-count),
    forwardSentence: (state, count) => state.moveSentence(count),
    backwardParagraph: (state, count) => state.moveParagraph(-count),
    forwardParagraph: (state, count) => state.moveParagraph(count),
    upcaseWord: (state, count) => state.changeWordCase('upcase', count),
    downcaseWord: (state, count) => state.changeWordCase('downcase', count),
    capitalizeWord: (state, count) => state.changeWordCase('capitalize', count),
    beginningOfBuffer: (state, count, hasPrefix, _lineEnding, _tabSize, rawUniversal) =>
      state.bufferBoundary(false, hasPrefix && !rawUniversal ? count : undefined, rawUniversal),
    endOfBuffer: (state, count, hasPrefix, _lineEnding, _tabSize, rawUniversal) =>
      state.bufferBoundary(true, hasPrefix && !rawUniversal ? count : undefined, rawUniversal),
    setMark: (state) => state.setMark(),
    markWord: (state, count, hasPrefix) => state.markWord(count, hasPrefix),
    markParagraph: (state, count) => state.markParagraph(count),
    exchangePointAndMark: (state, _count, hasPrefix) => state.exchange(hasPrefix),
    markWholeBuffer: (state) => state.selectAll(),
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
    killSentence: (state, count) => {
      state.killSentence(count);
    },
    backwardKillSentence: (state, count) => {
      state.killSentence(-count);
    },
    yank: (state, _count, _hasPrefix, lineEnding) => state.yank(lineEnding),
    yankPop: (state, count, _hasPrefix, lineEnding) => state.yankPop(count, lineEnding),
    deleteChar: (state, count, hasPrefix) => state.deleteCharacter(count, hasPrefix),
    backwardDeleteChar: (state, count, hasPrefix) =>
      state.backwardDeleteCharacter(count, hasPrefix),
    deleteHorizontalSpace: (state, _count, hasPrefix) => state.deleteHorizontalSpace(hasPrefix),
    cycleSpacing: (state, count, hasPrefix) => state.cycleSpacing(hasPrefix ? count : undefined),
    deleteBlankLines: (state) => state.deleteBlankLines(),
    deleteIndentation: (state, _count, hasPrefix) => state.deleteIndentation(hasPrefix),
    transposeCharacters: (state, count) => state.transposeCharacters(count),
    transposeWords: (state, count) => state.transposeWords(count),
    openLine: (state, count, _hasPrefix, lineEnding) => state.openLine(count, lineEnding),
    cancel: (state) => {
      prefix.reset();
      contextUpdate();
      state.cancel();
    },
  };
  for (const [name, action] of Object.entries(actions)) register(name, action);
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
          const oldRing = ring.values();
          let editCommitted = false;
          try {
            state.zapToChar(character, count);
            await apply(editor, state, before, () => {
              editCommitted = true;
            });
            const newest = ring.values()[0];
            if (
              newest !== undefined &&
              (newest !== oldRing[0] || ring.values().length !== oldRing.length)
            ) {
              try {
                await vscode.env.clipboard.writeText(newest);
              } catch {
                void vscode.window.showWarningMessage(
                  'emacscode: could not update the system clipboard',
                );
              }
            }
          } catch (error) {
            if (!editCommitted) ring.restore(oldRing);
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
  const registerCommand = (
    name: string,
    action: (state: EditorState, character: string, count: number) => (() => void) | void,
  ): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(`emacscode.${name}`, async (supplied?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const version = editor.document.version;
        const selection = editor.selection;
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
            return action(state, character, count);
          },
          { version, selection },
        );
      }),
    );
  };
  registerCommand('copyToRegister', (state, character) => {
    const [start, end] = state.regionBounds();
    const text = state.text.slice(start, end);
    return () => registers.setText(character, text);
  });
  registerCommand('insertRegister', (state, character) => {
    const value = registers.read(character);
    const text = value.kind === 'text' ? value.text : String(value.value);
    const lineEnding =
      vscode.window.activeTextEditor?.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    state.insert(text.replace(/\r\n|\r|\n/g, lineEnding));
  });
  registerCommand(
    'numberToRegister',
    (_state, character, count) => () => registers.setNumber(character, count),
  );
  registerCommand('incrementRegister', (_state, character, count) => {
    const current = (() => {
      try {
        return registers.read(character);
      } catch {
        return undefined;
      }
    })();
    if (current && current.kind !== 'number') throw new Error('Register does not contain a number');
    if (!Number.isSafeInteger((current?.value ?? 0) + count))
      throw new Error('Register number must be a safe integer');
    return () => registers.increment(character, count);
  });
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
        if (editor) {
          prefix.reset();
          void contextUpdate();
          search.start(editor, direction, initialQuery);
        }
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
    vscode.window.onDidChangeActiveTextEditor(() => {
      prefix.reset();
      contextUpdate();
    }),
  );
  contextUpdate();
}

export function deactivate(): void {}
