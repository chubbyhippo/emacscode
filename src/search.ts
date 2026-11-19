import * as vscode from 'vscode';
import { IncrementalSearch, SearchDirection } from './core/search';

type SearchState = {
  editor: vscode.TextEditor;
  origin: vscode.Selection;
  selection: vscode.Selection;
  version: number;
  input: vscode.InputBox;
  decorations: vscode.TextEditorDecorationType;
  currentDecoration: vscode.TextEditorDecorationType;
  model: IncrementalSearch;
  listeners: vscode.Disposable[];
  historyIndex: number;
};

export class SearchController implements vscode.Disposable {
  private state: SearchState | undefined;
  private history: string[] = [];
  public start(editor: vscode.TextEditor, direction: SearchDirection, initialQuery?: string): void {
    this.disposeState(true);
    if (editor.selections.length !== 1) {
      void vscode.window.showWarningMessage('emacscode: incremental search supports one cursor');
      return;
    }
    const input = vscode.window.createInputBox();
    const state: SearchState = {
      editor,
      origin: editor.selection,
      selection: editor.selection,
      version: editor.document.version,
      input,
      decorations: vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      }),
      currentDecoration: vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
      }),
      model: new IncrementalSearch(
        editor.document.getText(),
        editor.document.offsetAt(editor.selection.active),
        direction,
      ),
      listeners: [],
      historyIndex: -1,
    };
    this.state = state;
    void vscode.commands.executeCommand('setContext', 'emacscode.isearchActive', true);
    input.prompt = 'Ctrl+S/R: next/previous; Ctrl+G: abort; Enter: accept';
    state.listeners.push(
      input.onDidChangeValue((value) => {
        if (this.state !== state) return;
        state.model.setQuery(value);
        this.render(state);
      }),
    );
    state.listeners.push(
      input.onDidAccept(() => {
        if (this.state !== state) return;
        if (!this.ownsSelection(state)) this.disposeState(false, false);
        else if (!state.model.failed) this.disposeState(false);
      }),
    );
    state.listeners.push(
      input.onDidHide(() => {
        if (this.state === state) this.disposeState(true);
      }),
    );
    state.listeners.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === editor.document && event.contentChanges.length)
          this.disposeState(false);
      }),
    );
    state.listeners.push(
      vscode.window.onDidChangeActiveTextEditor((active) => {
        if (active !== editor) this.disposeState(true);
      }),
    );
    state.listeners.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (this.state === state && event.textEditor === editor && !this.ownsSelection(state))
          this.disposeState(false, false);
      }),
    );
    input.show();
    if (initialQuery !== undefined) {
      input.value = initialQuery;
      state.model.setQuery(initialQuery);
    }
    this.render(state);
  }
  public repeat(direction: SearchDirection): void {
    const state = this.state;
    if (!state) return;
    if (!state.model.query && this.history.length) {
      if (state.model.direction !== direction) state.model.repeat(direction);
      state.input.value = this.history[0];
      state.model.setQuery(this.history[0]);
    } else state.model.repeat(direction);
    this.render(state);
  }
  public cancel(): void {
    const state = this.state;
    if (!state) return;
    if (state.model.rollbackFailure()) {
      state.input.value = state.model.query;
      this.render(state);
    } else this.disposeState(true);
  }
  public historyMove(delta: number): void {
    const state = this.state;
    if (!state || !this.history.length) return;
    state.historyIndex = Math.max(
      -1,
      Math.min(this.history.length - 1, state.historyIndex + delta),
    );
    const query = state.historyIndex < 0 ? '' : this.history[state.historyIndex];
    state.input.value = query;
    state.model.setQuery(query);
    this.render(state);
  }
  private ownsSelection(state: SearchState): boolean {
    const selections = state.editor.selections;
    return selections.length === 1 && selections[0].isEqual(state.selection);
  }
  private render(state: SearchState): void {
    if (
      this.state !== state ||
      state.editor.document.isClosed ||
      state.editor.document.version !== state.version
    )
      return;
    if (!this.ownsSelection(state)) {
      this.disposeState(false, false);
      return;
    }
    const { editor, input, model } = state;
    const count = model.matchCount;
    input.title = `${count ? `${count.current}/${count.total} ` : ''}${model.failed ? 'Failing ' : ''}${model.wrapped ? 'Wrapped ' : ''}I-search ${model.direction === 1 ? 'forward' : 'backward'}`;
    input.validationMessage = model.failed
      ? 'No match; Ctrl+G restores the last successful search'
      : undefined;
    const matches = model.allMatches;
    const current = !model.failed ? model.match : undefined;
    editor.setDecorations(
      state.decorations,
      matches
        .filter((match) => !current || match.start !== current.start || match.end !== current.end)
        .map(
          (match) =>
            new vscode.Range(
              editor.document.positionAt(match.start),
              editor.document.positionAt(match.end),
            ),
        ),
    );
    editor.setDecorations(
      state.currentDecoration,
      current
        ? [
            new vscode.Range(
              editor.document.positionAt(current.start),
              editor.document.positionAt(current.end),
            ),
          ]
        : [],
    );
    if (model.match) {
      const begin = editor.document.positionAt(model.match.start);
      const end = editor.document.positionAt(model.match.end);
      const point = editor.document.positionAt(model.point);
      state.selection = new vscode.Selection(point, point);
      editor.selection = state.selection;
      editor.revealRange(new vscode.Range(begin, end));
    } else {
      state.selection = state.origin;
      editor.selection = state.selection;
    }
  }
  private disposeState(restore: boolean, saveHistory = true): void {
    const state = this.state;
    if (!state) return;
    this.state = undefined;
    void vscode.commands.executeCommand('setContext', 'emacscode.isearchActive', false);
    if (saveHistory && !restore && !state.model.failed && state.model.query)
      this.history = [
        state.model.query,
        ...this.history.filter((query) => query !== state.model.query),
      ].slice(0, 50);
    if (
      restore &&
      !state.editor.document.isClosed &&
      state.editor.document.version === state.version &&
      this.ownsSelection(state)
    )
      state.editor.selection = state.origin;
    for (const listener of state.listeners) listener.dispose();
    state.decorations.dispose();
    state.currentDecoration.dispose();
    state.input.hide();
    state.input.dispose();
  }
  public dispose(): void {
    this.disposeState(true);
  }
}
