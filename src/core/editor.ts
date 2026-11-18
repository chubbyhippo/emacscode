import { moveListDepth, moveStructure, StructureMovementError } from './structure';

export type Direction = 'forward' | 'backward';

export class CharacterBoundaryError extends Error {
  constructor(public readonly boundary: 'beginning-of-buffer' | 'end-of-buffer') {
    super(boundary === 'beginning-of-buffer' ? 'Beginning of buffer' : 'End of buffer');
  }
}

export class MarkParagraphError extends Error {
  constructor() {
    super('Cannot mark zero paragraphs');
  }
}

export class TabStopError extends Error {
  constructor() {
    super('Unsupported display column for tab stop');
  }
}

export class ColumnMovementError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class RegionCaseError extends Error {}

export class FillParagraphError extends Error {}

export class AbbreviationError extends Error {}

export class OpenLineError extends Error {
  constructor() {
    super('Repetition argument has to be non-negative');
  }
}

export class CharacterDeletionRangeError extends Error {
  public readonly code = 'args-out-of-range';
  constructor() {
    super('Character count exceeds buffer bounds');
  }
}

export class KillRing {
  private entries: string[] = [];
  private index = 0;
  constructor(private readonly capacity = 60) {}
  public add(value: string, direction: Direction, append: boolean): void {
    if (append && this.entries.length) {
      this.entries[0] = direction === 'forward' ? this.entries[0] + value : value + this.entries[0];
    } else {
      this.entries.unshift(value);
      this.entries.length = Math.min(this.entries.length, Math.max(1, this.capacity));
    }
    this.index = 0;
  }
  public current(): string | undefined {
    return this.entries[this.index];
  }
  public rotate(amount = 1): string | undefined {
    if (!this.entries.length) return undefined;
    this.index =
      (((this.index + amount) % this.entries.length) + this.entries.length) % this.entries.length;
    return this.current();
  }
  public values(): readonly string[] {
    return this.entries.slice();
  }
  public restore(entries: readonly string[]): void {
    this.entries = [...entries];
    this.index = 0;
  }
}

export class PrefixArgument {
  private value: number | undefined;
  private digits = false;
  private negativeSign = false;
  private universalOnly = false;
  public universal(): void {
    this.universalOnly = this.value === undefined || this.universalOnly;
    this.value = this.value === undefined ? 4 : this.value * 4;
    this.negativeSign = this.value < 0;
    this.digits = false;
  }
  public digit(digit: number): void {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) throw new Error('Invalid digit');
    this.universalOnly = false;
    if (!this.digits) {
      this.value = this.negativeSign ? -digit : digit;
      this.digits = true;
    } else {
      this.value = (this.value ?? 0) * 10 + (this.negativeSign ? -digit : digit);
    }
  }
  public negative(): void {
    this.universalOnly = false;
    this.negativeSign = !this.negativeSign;
    this.value = this.value === undefined ? -1 : -this.value;
    this.digits = false;
  }
  public consume(): number {
    const value = this.value ?? 1;
    this.reset();
    return value;
  }
  public reset(): void {
    this.value = undefined;
    this.digits = false;
    this.negativeSign = false;
    this.universalOnly = false;
  }
  public get rawUniversal(): boolean {
    return this.value !== undefined && this.universalOnly;
  }
  public get pending(): boolean {
    return this.value !== undefined;
  }
}

export class EditorState {
  public text: string;
  public point: number;
  public mark: number | undefined;
  public active = false;
  private previous = '';
  private yankRange: [number, number] | undefined;
  private goalColumn: number | undefined;
  private goalTabSize: number | undefined;
  private abbreviation:
    { prefix: string; start: number; candidates: string[]; index: number } | undefined;
  private spacingCycle:
    { whitespace: string; originalPoint: number; count?: number; step: number } | undefined;
  constructor(
    text: string,
    point: number,
    private readonly ring: KillRing,
  ) {
    this.text = text;
    this.point = this.clamp(point);
  }
  private clamp(position: number): number {
    return Math.max(0, Math.min(this.text.length, position));
  }
  public sync(text: string, point: number): void {
    if (text !== this.text) {
      this.text = text;
      this.mark = undefined;
      this.active = false;
      this.yankRange = undefined;
      this.spacingCycle = undefined;
      this.abbreviation = undefined;
      this.previous = '';
      this.goalColumn = undefined;
      this.goalTabSize = undefined;
    }
    if (this.point !== point) {
      this.previous = '';
      this.spacingCycle = undefined;
      this.abbreviation = undefined;
      this.yankRange = undefined;
      this.goalColumn = undefined;
    }
    this.point = this.clamp(point);
  }
  private done(command: string): void {
    this.previous = command;
    if (command !== 'cycle-spacing') this.spacingCycle = undefined;
    if (command !== 'abbreviation') this.abbreviation = undefined;
    if (command !== 'yank' && command !== 'yank-pop') this.yankRange = undefined;
    if (command !== 'vertical') this.goalColumn = undefined;
  }
  public setMark(): void {
    this.mark = this.point;
    this.active = true;
    this.done('mark');
  }
  public cancel(): void {
    this.active = false;
    this.done('cancel');
  }
  public breakCommandChain(): void {
    this.done('other');
  }
  public exchange(hasPrefix = false): void {
    if (this.mark === undefined) throw new Error('No mark set');
    const point = this.point;
    this.point = this.mark;
    this.mark = point;
    this.active = !hasPrefix;
    this.done('exchange');
  }
  public selectAll(): void {
    this.mark = 0;
    this.point = this.text.length;
    this.active = true;
    this.done('mark');
  }
  public regionBounds(): [number, number] {
    if (this.mark === undefined || !this.active) throw new Error('No active region');
    return [Math.min(this.mark, this.point), Math.max(this.mark, this.point)];
  }
  public applyText(text: string, point: number): void {
    this.text = text;
    this.point = this.clamp(point);
    this.mark = undefined;
    this.active = false;
    this.done('edit');
  }
  public moveCharacter(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid character count');
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      if ((count > 0 && position >= this.text.length) || (count < 0 && position <= 0)) {
        this.point = position;
        this.done('move');
        throw new CharacterBoundaryError(count > 0 ? 'end-of-buffer' : 'beginning-of-buffer');
      }
      if (count > 0 && position < this.text.length) {
        const code = this.text.codePointAt(position);
        position +=
          this.text.startsWith('\r\n', position) || (code !== undefined && code > 0xffff) ? 2 : 1;
      } else if (count < 0 && position > 0) {
        position--;
        if (
          position > 0 &&
          ((this.text[position] === '\n' && this.text[position - 1] === '\r') ||
            (this.text.charCodeAt(position) >= 0xdc00 &&
              this.text.charCodeAt(position) <= 0xdfff &&
              this.text.charCodeAt(position - 1) >= 0xd800 &&
              this.text.charCodeAt(position - 1) <= 0xdbff))
        )
          position--;
      }
    }
    this.point = position;
    this.done('move');
  }
  public lineBoundary(end: boolean, count = 1): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid line count');
    let lineStart = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    let remaining = count - 1;
    while (remaining > 0) {
      const next = this.text.indexOf('\n', lineStart);
      if (next < 0) break;
      lineStart = next + 1;
      remaining--;
    }
    while (remaining < 0) {
      if (lineStart === 0) {
        this.point = 0;
        this.done('move');
        return;
      }
      lineStart = lineStart <= 1 ? 0 : this.text.lastIndexOf('\n', lineStart - 2) + 1;
      remaining++;
    }
    const newline = this.text.indexOf('\n', lineStart);
    this.point = !end
      ? lineStart
      : newline < 0
        ? this.text.length
        : newline > lineStart && this.text[newline - 1] === '\r'
          ? newline - 1
          : newline;
    this.done('move');
  }
  public backToIndentation(): void {
    let position = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    while (position < this.text.length && /[ \t\f\v]/.test(this.text[position])) position++;
    this.point = position;
    this.done('move');
  }
  public bufferBoundary(end: boolean, count?: number, rawUniversal = false): void {
    if (count !== undefined && !Number.isSafeInteger(count)) throw new Error('Invalid prefix');
    if (!rawUniversal && !this.active) this.mark = this.point;
    if (count === undefined) {
      this.point = end ? this.text.length : 0;
    } else {
      const offsets = [0];
      for (let position = 0; position < this.text.length;) {
        position += this.text.startsWith('\r\n', position)
          ? 2
          : String.fromCodePoint(this.text.codePointAt(position)!).length;
        offsets.push(position);
      }
      const size = BigInt(offsets.length - 1);
      const fraction = (size * BigInt(count)) / 10n;
      const index = end ? size - fraction : fraction + 1n;
      const bounded = index < 0n ? 0 : index > size ? Number(size) : Number(index);
      this.point = offsets[bounded];
      const newline = this.text.indexOf('\n', this.point);
      this.point = newline < 0 ? this.text.length : newline + 1;
    }
    this.done('move');
  }
  private structuralMove(action: () => number): void {
    try {
      this.point = action();
    } catch (error) {
      if (error instanceof StructureMovementError && error.position !== undefined)
        this.point = error.position;
      throw error;
    } finally {
      this.done('move');
    }
  }
  public moveStructure(count: number, lists = false): void {
    this.structuralMove(() => moveStructure(this.text, this.point, count, lists));
  }
  public moveListDepth(count: number, outward: boolean): void {
    this.structuralMove(() => moveListDepth(this.text, this.point, count, outward));
  }
  public moveDefun(count: number, end: boolean): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid defun count');
    const starts: number[] = [];
    for (let position = 0; position < this.text.length; position++) {
      if (
        (position === 0 || this.text[position - 1] === '\n') &&
        '([{'.includes(this.text[position])
      )
        starts.push(position);
    }
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      if (!end) {
        position =
          count > 0
            ? (starts.filter((start) => start < position).pop() ?? 0)
            : (starts.find((start) => start > position) ?? this.text.length);
      } else if (count > 0) {
        const start = starts.filter((candidate) => candidate <= position).pop() ?? starts[0];
        if (start === undefined) {
          position = this.text.length;
          break;
        }
        const result = moveStructure(this.text, start, 1);
        if (result <= position) {
          const next = starts.find((candidate) => candidate > position);
          position = next === undefined ? this.text.length : moveStructure(this.text, next, 1);
        } else position = result;
      } else {
        const endings = starts.map((start) => moveStructure(this.text, start, 1));
        position = endings.filter((candidate) => candidate < position).pop() ?? 0;
      }
    }
    this.point = position;
    this.done('move');
  }
  public gotoCharacter(position: number): void {
    if (!Number.isSafeInteger(position)) throw new Error('Invalid character position');
    let offset = 0;
    let remaining = Math.max(0, position - 1);
    while (offset < this.text.length && remaining > 0) {
      offset += this.text.startsWith('\r\n', offset)
        ? 2
        : String.fromCodePoint(this.text.codePointAt(offset)!).length;
      remaining--;
    }
    this.point = offset;
    this.done('move');
  }
  public moveToColumn(column: number, tabSize = 8): void {
    if (
      !Number.isSafeInteger(column) ||
      column < 0 ||
      !Number.isSafeInteger(tabSize) ||
      tabSize < 1
    )
      throw new ColumnMovementError('Invalid column or tab size');
    let position = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    let current = 0;
    while (
      position < this.text.length &&
      this.text[position] !== '\n' &&
      !this.text.startsWith('\r\n', position) &&
      current < column
    ) {
      const character = String.fromCodePoint(this.text.codePointAt(position)!);
      if (!/^[\x20-\x7e\t]$/.test(character))
        throw new ColumnMovementError('Unsupported display column');
      current += character === '\t' ? tabSize - (current % tabSize) : 1;
      position += character.length;
    }
    this.point = position;
    this.done('move');
  }
  public movePage(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid page count');
    const boundaries = [0];
    for (let index = 0; index < this.text.length; index++) {
      if (this.text[index] === '\f' && (index === 0 || this.text[index - 1] === '\n'))
        boundaries.push(index + 1);
    }
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      const next =
        count > 0
          ? (boundaries.find((boundary) => boundary > position) ?? this.text.length)
          : (boundaries.filter((boundary) => boundary < position).pop() ?? 0);
      if (next === position) break;
      position = next;
    }
    this.point = position;
    this.done('move');
  }
  public gotoLine(line: number): void {
    if (!Number.isSafeInteger(line)) throw new Error('Invalid line number');
    let position = 0;
    for (let index = 1; index < line; index++) {
      const newline = this.text.indexOf('\n', position);
      if (newline < 0) {
        position = this.text.length;
        break;
      }
      position = newline + 1;
    }
    this.point = position;
    this.done('move');
  }
  public vertical(count: number, tabSize = 8): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid line count');
    if (!Number.isSafeInteger(tabSize) || tabSize < 1) throw new Error('Invalid tab size');
    const start = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    let column = 0;
    for (let position = start; position < this.point; position++)
      column += this.text[position] === '\t' ? tabSize - (column % tabSize) : 1;
    const goal = this.goalTabSize === tabSize ? (this.goalColumn ?? column) : column;
    this.goalTabSize = tabSize;
    let lineStart = start;
    for (let index = 0; index < Math.abs(count); index++) {
      if (count > 0) {
        const end = this.text.indexOf('\n', lineStart);
        if (end < 0) {
          this.point = this.text.length;
          this.goalColumn = goal;
          this.done('vertical');
          throw new CharacterBoundaryError('end-of-buffer');
        }
        lineStart = end + 1;
      } else {
        if (lineStart === 0) {
          this.point = 0;
          this.goalColumn = goal;
          this.done('vertical');
          throw new CharacterBoundaryError('beginning-of-buffer');
        }
        lineStart = lineStart <= 1 ? 0 : this.text.lastIndexOf('\n', lineStart - 2) + 1;
      }
    }
    const end = this.text.indexOf('\n', lineStart);
    const lineEnd =
      end < 0 ? this.text.length : end > lineStart && this.text[end - 1] === '\r' ? end - 1 : end;
    this.point = lineStart;
    let targetColumn = 0;
    while (this.point < lineEnd && targetColumn < goal) {
      targetColumn += this.text[this.point] === '\t' ? tabSize - (targetColumn % tabSize) : 1;
      this.point++;
    }
    if (
      this.point > lineStart &&
      this.point < lineEnd &&
      this.text.charCodeAt(this.point) >= 0xdc00 &&
      this.text.charCodeAt(this.point) <= 0xdfff &&
      this.text.charCodeAt(this.point - 1) >= 0xd800 &&
      this.text.charCodeAt(this.point - 1) <= 0xdbff
    )
      this.point--;
    this.goalColumn = goal;
    this.done('vertical');
  }
  private isWord(char: string): boolean {
    return /[\p{L}\p{N}]/u.test(char);
  }
  public wordPosition(count: number, origin = this.point): number {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid word count');
    let pos = origin;
    const isSplitSurrogate = (offset: number): boolean =>
      offset > 0 &&
      offset < this.text.length &&
      this.text.charCodeAt(offset) >= 0xdc00 &&
      this.text.charCodeAt(offset) <= 0xdfff &&
      this.text.charCodeAt(offset - 1) >= 0xd800 &&
      this.text.charCodeAt(offset - 1) <= 0xdbff;
    if (isSplitSurrogate(pos)) throw new Error('Point is not at a character boundary');
    const next = (offset: number): number =>
      offset + String.fromCodePoint(this.text.codePointAt(offset)!).length;
    const previous = (offset: number): number =>
      isSplitSurrogate(offset - 1) ? offset - 2 : offset - 1;
    const characterAt = (offset: number): string =>
      String.fromCodePoint(this.text.codePointAt(offset)!);
    const wordAt = (offset: number): boolean => this.isWord(characterAt(offset));
    const markAt = (offset: number): boolean => /\p{M}/u.test(characterAt(offset));
    for (let index = 0; index < Math.abs(count); index++) {
      if (count > 0) {
        let inWord = false;
        if (pos < this.text.length && markAt(pos)) {
          let base = pos;
          while (base > 0 && markAt(base)) base = previous(base);
          inWord = wordAt(base);
        }
        while (!inWord && pos < this.text.length && !wordAt(pos)) pos = next(pos);
        while (pos < this.text.length && (wordAt(pos) || markAt(pos))) pos = next(pos);
        if (pos === this.text.length) break;
      } else {
        while (pos > 0) {
          const candidate = previous(pos);
          if (wordAt(candidate)) {
            pos = candidate;
            break;
          }
          if (markAt(candidate)) {
            let base = candidate;
            while (base > 0 && markAt(base)) base = previous(base);
            if (wordAt(base)) {
              pos = base;
              break;
            }
            pos = candidate;
          } else pos = candidate;
        }
        while (pos > 0) {
          const candidate = previous(pos);
          if (wordAt(candidate)) {
            pos = candidate;
            continue;
          }
          if (markAt(candidate)) {
            let base = candidate;
            while (base > 0 && markAt(base)) base = previous(base);
            if (wordAt(base)) {
              pos = base;
              continue;
            }
          }
          break;
        }
        if (pos === 0) break;
      }
    }
    return pos;
  }
  public moveWord(count: number): void {
    this.point = this.wordPosition(count);
    this.done('move');
  }
  public moveSentence(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid sentence count');
    const offsets = [0];
    let text = '';
    for (let index = 0; index < this.text.length;) {
      const character = this.text.startsWith('\r\n', index)
        ? '\n'
        : String.fromCodePoint(this.text.codePointAt(index)!);
      index += character === '\n' && this.text.startsWith('\r\n', index) ? 2 : character.length;
      text += character;
      offsets.push(index);
    }
    let position = offsets.indexOf(this.point);
    if (position < 0) throw new Error('Point is not at a character boundary');
    const characters = Array.from(text);
    const paragraph = new EditorState(text, 0, new KillRing());
    const utf16 = (character: number): number => characters.slice(0, character).join('').length;
    const characterOffset = (offset: number): number => Array.from(text.slice(0, offset)).length;
    const moveParagraph = (from: number, direction: number): number => {
      paragraph.point = utf16(from);
      paragraph.moveParagraph(direction);
      return characterOffset(paragraph.point);
    };
    const paragraphStart = (from: number): number => {
      let origin = from;
      while (true) {
        const start = moveParagraph(origin, -1);
        let result = start;
        while (result < characters.length && /[ \t\n]/.test(characters[result])) result++;
        if (result >= origin && start < origin) {
          if (start === 0) return start;
          origin = start;
        } else return result;
      }
    };
    const paragraphEnd = (from: number): number => {
      let origin = from;
      while (true) {
        if (origin >= characters.length) {
          if (characters[characters.length - 1] === '\n') return origin;
          throw new CharacterBoundaryError('end-of-buffer');
        }
        let end = moveParagraph(origin, 1);
        if (end > 0 && characters[end - 1] === '\n') end--;
        if (end <= origin && end < characters.length) {
          origin = end + 1;
          if (origin === characters.length) return origin;
        } else return end;
      }
    };
    const endings = (): { start: number; end: number; whitespace: number }[] => {
      const matches: { start: number; end: number; whitespace: number }[] = [];
      const expression =
        /(?:[.?!…‽][\]"'”’)}»›]*(?=\n|$|[ \u00a0]\n|\t|[ \u00a0]{2})|[。．？！]+)[ \u00a0\t\n]*/gu;
      for (const match of text.matchAll(expression)) {
        const start = characterOffset(match.index);
        const end = characterOffset(match.index + match[0].length);
        let whitespace = end;
        while (whitespace > start && /[ \u00a0\t\n]/.test(characters[whitespace - 1])) whitespace--;
        matches.push({ start, end, whitespace });
      }
      return matches;
    };
    const matches = endings();
    for (let iteration = 0; iteration < Math.abs(count); iteration++) {
      const previous = position;
      if (count > 0) {
        this.point = offsets[position];
        const end = paragraphEnd(position);
        const match = matches.find((item) => item.start >= position && item.end <= end);
        position = match ? match.whitespace : end;
        while (match && position < match.end && characters[position] === '\u00a0') position++;
      } else {
        const start = paragraphStart(position);
        let line = start;
        while (line > 0 && characters[line - 1] !== '\n') line--;
        const candidates = matches.filter(
          (item) => item.start >= line && item.whitespace <= position && item.start < position,
        );
        let match = candidates.pop();
        if (match && Math.min(match.end, position) === position) match = candidates.pop();
        position = match ? Math.min(match.end, position) : start;
      }
      if (position === previous) break;
    }
    this.point = offsets[position];
    this.done('move');
  }
  public moveParagraph(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid paragraph count');
    const lines: { start: number; end: number; separator: boolean; starter: boolean }[] = [];
    let start = 0;
    while (start < this.text.length) {
      const newline = this.text.indexOf('\n', start);
      const end = newline < 0 ? this.text.length : newline;
      const value = this.text.slice(start, end).replace(/\r$/, '');
      const separator = /^[ \t\f]*$/.test(value);
      lines.push({ start, end, separator, starter: separator || /^[ \t]*\f/.test(value) });
      if (newline < 0) break;
      start = newline + 1;
    }
    let position = this.point;
    for (let iteration = 0; iteration < Math.abs(count); iteration++) {
      if (count > 0) {
        if (position >= this.text.length) break;
        let line = lines.findIndex(
          (item, index) => position < (lines[index + 1]?.start ?? this.text.length),
        );
        while (line < lines.length && lines[line].separator) line++;
        if (line < lines.length) line++;
        while (line < lines.length && !lines[line].starter) line++;
        position = line < lines.length ? lines[line].start : this.text.length;
      } else {
        if (position <= 0) break;
        let line = lines.findIndex(
          (item, index) => position - 1 < (lines[index + 1]?.start ?? this.text.length),
        );
        const currentLine = lines.find(
          (item, index) => position < (lines[index + 1]?.start ?? this.text.length + 1),
        );
        const currentSuffix = this.text
          .slice(position, currentLine?.end ?? position)
          .replace(/\r$/, '');
        if (
          !/^[ \t\f]*$/.test(currentSuffix) &&
          lines[line]?.separator &&
          /^\r?$/.test(this.text.slice(lines[line].start, lines[line].end)) &&
          position > lines[line].start
        ) {
          position = lines[line].start;
          continue;
        }
        while (line > 0 && lines[line].separator) line--;
        while (line > 0 && !lines[line].starter) line--;
        if (lines[line]?.separator) {
          const value = this.text.slice(lines[line].start, lines[line].end).replace(/\r$/, '');
          position = /^[ \t]*$/.test(value) ? lines[line].start : (lines[line + 1]?.start ?? 0);
          if (value.length > 0 && /^[ \t]+$/.test(value)) position = lines[line + 1]?.start ?? 0;
        } else position = lines[line]?.start ?? 0;
      }
    }
    this.point = position;
    this.done('move');
  }
  public markParagraph(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid paragraph count');
    if (count === 0) throw new MarkParagraphError();
    if (this.mark !== undefined && (this.active || this.previous === 'mark-paragraph')) {
      const origin = this.point;
      this.point = this.mark;
      this.moveParagraph(count);
      this.mark = this.point;
      this.point = origin;
    } else {
      this.moveParagraph(count);
      this.mark = this.point;
      this.moveParagraph(-count);
    }
    this.active = true;
    this.done('mark-paragraph');
  }
  public markWord(count: number, hasPrefix: boolean): void {
    const extend = this.mark !== undefined && (this.active || this.previous === 'mark-word');
    const origin = extend ? this.mark! : this.point;
    const distance = hasPrefix ? count : extend && origin < this.point ? -1 : 1;
    this.mark = this.wordPosition(distance, origin);
    this.active = true;
    this.done('mark-word');
  }
  public markSexp(count: number, hasPrefix: boolean): void {
    const extend = this.mark !== undefined && (this.active || this.previous === 'mark-sexp');
    const origin = extend ? this.mark! : this.point;
    const distance = hasPrefix ? count : extend && origin < this.point ? -1 : 1;
    this.mark = moveStructure(this.text, origin, distance);
    this.active = true;
    this.done('mark-sexp');
  }
  public changeRegionCase(kind: 'upcase' | 'downcase'): void {
    if (this.mark === undefined || !this.active) throw new RegionCaseError('No active region');
    const [start, end] = this.regionBounds();
    const splitCharacter = (offset: number): boolean =>
      offset > 0 &&
      offset < this.text.length &&
      ((this.text[offset - 1] === '\r' && this.text[offset] === '\n') ||
        (/[\uD800-\uDBFF]/.test(this.text[offset - 1]) &&
          /[\uDC00-\uDFFF]/.test(this.text[offset])));
    if (splitCharacter(start) || splitCharacter(end))
      throw new RegionCaseError('Region is not at a character boundary');
    const original = this.text.slice(start, end);
    const converted = kind === 'upcase' ? original.toUpperCase() : original.toLowerCase();
    if (converted.length !== original.length)
      throw new RegionCaseError('Case conversion changes character length');
    if (start !== end) {
      this.text = this.text.slice(0, start) + converted + this.text.slice(end);
      this.active = false;
    }
    this.done('case');
  }
  public changeWordCase(kind: 'upcase' | 'downcase' | 'capitalize', count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid word count');
    const origin = this.point;
    const boundedCount = Math.sign(count) * Math.min(Math.abs(count), this.text.length + 1);
    const boundary = this.wordPosition(boundedCount);
    const start = Math.min(origin, boundary);
    const end = Math.max(origin, boundary);
    const original = this.text.slice(start, end);
    const prefix = this.text.slice(0, start);
    const continuesWord = /[\p{L}\p{N}]\p{M}*$/u.test(prefix) && /^\p{M}/u.test(original);
    const converted =
      kind === 'upcase'
        ? original.toUpperCase()
        : kind === 'downcase'
          ? original.toLowerCase()
          : original.replace(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu, (word, offset: number) => {
              if (continuesWord && /^\p{M}+$/u.test(original.slice(0, offset)))
                return word.toLowerCase();
              const characters = Array.from(word);
              return characters[0].toUpperCase() + characters.slice(1).join('').toLowerCase();
            });
    if (converted !== original) this.replace(start, end, converted);
    this.point =
      count < 0 ? start + converted.length : count > 0 ? start + converted.length : origin;
    this.done('case');
  }
  private replace(start: number, end: number, value: string): void {
    this.text = this.text.slice(0, start) + value + this.text.slice(end);
    this.point = start + value.length;
    if (this.mark !== undefined) {
      if (this.mark > end) this.mark += value.length - (end - start);
      else if (this.mark >= start) this.mark = start;
    }
  }
  public kill(start: number, end: number, direction: Direction, copy = false): string {
    start = this.clamp(start);
    end = this.clamp(end);
    if (start > end) [start, end] = [end, start];
    const value = this.text.slice(start, end);
    this.ring.add(value, direction, this.previous === 'kill' && !copy);
    if (!copy && value) this.replace(start, end, '');
    this.active = false;
    this.done(copy ? 'copy' : 'kill');
    return value;
  }
  public region(copy = false): string {
    if (this.mark === undefined || !this.active) throw new Error('No active region');
    return this.kill(this.mark, this.point, this.point < this.mark ? 'backward' : 'forward', copy);
  }
  public killLine(count: number, hasPrefix = false): string {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid line count');
    if (!hasPrefix) {
      if (this.point === this.text.length) throw new Error('End of buffer');
      const newline = this.text.indexOf('\n', this.point);
      const end =
        newline < 0
          ? this.text.length
          : newline > 0 && this.text[newline - 1] === '\r'
            ? newline - 1
            : newline;
      const includeNewline = newline >= 0 && /^[ \t]*$/.test(this.text.slice(this.point, end));
      return this.kill(this.point, includeNewline ? newline + 1 : end, 'forward');
    }
    if (count <= 0) {
      let start = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
      for (let index = 0; index < -count && start > 0; index++)
        start = start <= 1 ? 0 : this.text.lastIndexOf('\n', start - 2) + 1;
      return this.kill(start, this.point, 'backward');
    }
    let end = this.point;
    for (let index = 0; index < count; index++) {
      const next = this.text.indexOf('\n', end);
      if (next < 0) {
        end = this.text.length;
        break;
      }
      end = next + 1;
    }
    return this.kill(this.point, end, 'forward');
  }
  public killWord(count: number): string {
    const end = this.wordPosition(count);
    return this.kill(this.point, end, count < 0 ? 'backward' : 'forward');
  }
  public killSexp(count: number): string {
    const end = moveStructure(this.text, this.point, count);
    return this.kill(this.point, end, count < 0 ? 'backward' : 'forward');
  }
  public killSentence(count: number): string {
    const origin = this.point;
    const previous = this.previous;
    try {
      this.moveSentence(count);
    } catch (error) {
      this.done('other');
      throw error;
    }
    const end = this.point;
    this.previous = previous;
    return this.kill(origin, end, end < origin ? 'backward' : 'forward');
  }
  public zapToChar(character: string, count: number): string {
    if (Array.from(character).length !== 1 || !Number.isSafeInteger(count))
      throw new Error('Invalid zap character or count');
    if (count === 0) return this.kill(this.point, this.point, 'forward');
    const ignoreCase =
      character.toLowerCase() === character && character.toUpperCase() !== character;
    const target = ignoreCase ? character.toLowerCase() : character;
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      let match = -1;
      if (count > 0) {
        for (let cursor = position; cursor < this.text.length;) {
          const current = String.fromCodePoint(this.text.codePointAt(cursor)!);
          if ((ignoreCase ? current.toLowerCase() : current) === target) {
            match = cursor;
            break;
          }
          cursor += current.length;
        }
        if (match < 0) throw new Error('Character not found');
        position = match + String.fromCodePoint(this.text.codePointAt(match)!).length;
      } else {
        for (let cursor = position; cursor > 0;) {
          cursor--;
          if (
            cursor > 0 &&
            /[\uDC00-\uDFFF]/.test(this.text[cursor]) &&
            /[\uD800-\uDBFF]/.test(this.text[cursor - 1])
          )
            cursor--;
          const current = String.fromCodePoint(this.text.codePointAt(cursor)!);
          if ((ignoreCase ? current.toLowerCase() : current) === target) {
            match = cursor;
            break;
          }
        }
        if (match < 0) throw new Error('Character not found');
        position = match;
      }
    }
    return this.kill(this.point, position, count < 0 ? 'backward' : 'forward');
  }
  public yank(lineEnding?: string): void {
    const value = this.ring.current();
    if (value === undefined) throw new Error('Kill ring is empty');
    const start = this.point;
    this.replace(
      start,
      start,
      lineEnding === undefined ? value : value.replace(/\r\n|\n/g, lineEnding),
    );
    this.mark = start;
    this.yankRange = [start, this.point];
    this.done('yank');
  }
  public yankPop(count = 1, lineEnding?: string): void {
    if (!this.yankRange || (this.previous !== 'yank' && this.previous !== 'yank-pop'))
      throw new Error('Previous command was not a yank');
    const value = this.ring.rotate(count);
    if (value === undefined) throw new Error('Kill ring is empty');
    const [start, end] = this.yankRange;
    this.replace(
      start,
      end,
      lineEnding === undefined ? value : value.replace(/\r\n|\n/g, lineEnding),
    );
    this.mark = start;
    this.yankRange = [start, this.point];
    this.done('yank-pop');
  }
  public deleteCharacter(count: number, hasPrefix = false): void {
    const origin = this.point;
    const previous = this.previous;
    try {
      this.moveCharacter(count);
    } catch (error) {
      this.point = origin;
      if (!(error instanceof CharacterBoundaryError)) throw error;
      if (!hasPrefix && count === 1 && origin === this.text.length) throw error;
      throw new CharacterDeletionRangeError();
    }
    const end = this.point;
    if (hasPrefix) {
      this.previous = previous;
      this.kill(origin, end, count < 0 ? 'backward' : 'forward');
    } else {
      if (origin !== end) this.replace(Math.min(origin, end), Math.max(origin, end), '');
      this.active = false;
      this.done('delete');
    }
  }
  public backwardDeleteCharacter(count: number, hasPrefix = false): void {
    if (!hasPrefix && this.active && this.mark !== undefined && this.mark !== this.point) {
      this.replace(Math.min(this.mark, this.point), Math.max(this.mark, this.point), '');
      this.active = false;
      this.done('delete');
      return;
    }
    if (!hasPrefix && count === 1 && this.point === 0)
      throw new CharacterBoundaryError('beginning-of-buffer');
    this.deleteCharacter(-count, hasPrefix);
  }
  public cycleSpacing(count?: number): void {
    if (count !== undefined && !Number.isSafeInteger(count))
      throw new Error('Invalid spacing count');
    const allWhitespace = (character: string): boolean => /[ \t\r\n]/.test(character);
    const range = (position: number): [number, number] => {
      let start = position;
      let end = position;
      while (start > 0 && allWhitespace(this.text[start - 1])) start--;
      while (end < this.text.length && allWhitespace(this.text[end])) end++;
      return [start, end];
    };
    if (
      this.previous !== 'cycle-spacing' ||
      !this.spacingCycle ||
      (count !== undefined && count !== this.spacingCycle.count)
    ) {
      const [start, end] = range(this.point);
      this.spacingCycle = {
        whitespace: this.text.slice(start, end),
        originalPoint: this.point - start,
        count,
        step: 0,
      };
    }
    const cycle = this.spacingCycle;
    const [start, end] = range(this.point);
    const original = cycle.whitespace;
    if (this.text.slice(start, end) !== original) this.replace(start, end, original);
    this.point = start + cycle.originalPoint;
    if (cycle.step !== 2) {
      const includeNewlines = (cycle.count ?? 1) < 0;
      const isWhitespace = (character: string): boolean =>
        includeNewlines ? allWhitespace(character) : character === ' ' || character === '\t';
      let left = this.point;
      let right = this.point;
      while (left > 0 && isWhitespace(this.text[left - 1])) left--;
      while (right < this.text.length && isWhitespace(this.text[right])) right++;
      const value = cycle.step === 0 ? ' '.repeat(Math.abs(cycle.count ?? 1)) : '';
      if (this.text.slice(left, right) !== value) this.replace(left, right, value);
      this.point = left + value.length;
    }
    cycle.step = (cycle.step + 1) % 3;
    this.active = false;
    this.done('cycle-spacing');
  }
  public deleteBlankLines(): void {
    const originalText = this.text;
    const lineStart = (position: number): number =>
      position === 0 ? 0 : this.text.lastIndexOf('\n', position - 1) + 1;
    const lineEnd = (start: number): number => {
      const newline = this.text.indexOf('\n', start);
      return newline < 0
        ? this.text.length
        : newline > start && this.text[newline - 1] === '\r'
          ? newline - 1
          : newline;
    };
    const nextLine = (start: number): number => {
      const newline = this.text.indexOf('\n', start);
      return newline < 0 ? this.text.length : newline + 1;
    };
    const blank = (start: number): boolean =>
      /^[ \t]*$/.test(this.text.slice(start, lineEnd(start)));
    const remove = (start: number, end: number): void => {
      const point = this.point;
      if (start !== end) this.replace(start, end, '');
      this.point = point <= start ? point : point <= end ? start : point - (end - start);
    };
    let start = lineStart(this.point);
    const isBlank = blank(start);
    const following = nextLine(start);
    const previous =
      start === 0 ? undefined : lineStart(start - (this.text[start - 2] === '\r' ? 2 : 1));
    const single =
      isBlank &&
      !(following < this.text.length && blank(following)) &&
      (previous === undefined || !blank(previous));
    if (isBlank) {
      let first = start;
      while (first > 0) {
        const prior = lineStart(first - (this.text[first - 2] === '\r' ? 2 : 1));
        if (!blank(prior)) break;
        first = prior;
      }
      const end = single ? following : start;
      remove(first, end);
      this.point = first;
      start = first;
    }
    if (!(isBlank && single)) {
      const from = nextLine(start);
      let end = from;
      while (end < this.text.length && blank(end)) end = nextLine(end);
      remove(from, end);
    }
    start = lineStart(this.point);
    if (
      this.point === start &&
      blank(start) &&
      nextLine(start) === this.text.length &&
      this.text.endsWith('\n')
    )
      remove(start, this.text.length);
    if (this.text !== originalText) this.active = false;
    this.done('delete');
  }
  public deleteIndentation(hasPrefix: boolean): void {
    const lineStart = (position: number): number =>
      position === 0 ? 0 : this.text.lastIndexOf('\n', position - 1) + 1;
    const lineEnd = (position: number): number => {
      const newline = this.text.indexOf('\n', position);
      return newline < 0
        ? this.text.length
        : newline > 0 && this.text[newline - 1] === '\r'
          ? newline - 1
          : newline;
    };
    let begin: number;
    if (!hasPrefix && this.active && this.mark !== undefined && this.mark !== this.point) {
      begin = Math.min(this.point, this.mark);
      const end = Math.max(this.point, this.mark);
      this.point = end > lineEnd(begin) ? end : begin;
    } else {
      const start = lineStart(this.point);
      const next = this.text.indexOf('\n', start);
      begin = (hasPrefix ? (next >= 0 ? next + 1 : this.text.length) : start) - 1;
      if (hasPrefix && next >= 0) this.point = next + 1;
      else if (hasPrefix) this.point = this.text.length;
      else this.point = start;
    }
    while (lineStart(this.point) > begin && lineStart(this.point) > 0) {
      const current = lineStart(this.point);
      const newlineStart =
        current > 1 && this.text[current - 2] === '\r' ? current - 2 : current - 1;
      this.replace(newlineStart, current, '');
      let left = this.point;
      let right = this.point;
      while (left > 0 && (this.text[left - 1] === ' ' || this.text[left - 1] === '\t')) left--;
      while (right < this.text.length && (this.text[right] === ' ' || this.text[right] === '\t'))
        right++;
      const before = this.text[left - 1];
      const after = this.text[right];
      const space =
        before &&
        after &&
        before !== '\n' &&
        after !== '\r' &&
        after !== '\n' &&
        !/[([{']/u.test(before) &&
        !/[)\]}]/u.test(after)
          ? ' '
          : '';
      if (left !== right || space) this.replace(left, right, space);
      this.point = left;
    }
    this.active = false;
    this.done('delete');
  }
  public expandAbbreviation(count = 1, hasPrefix = false): void {
    if (!Number.isSafeInteger(count)) throw new AbbreviationError('Invalid abbreviation count');
    if (hasPrefix || this.previous !== 'abbreviation' || !this.abbreviation) {
      const prefix = this.text.slice(0, this.point).match(/[\p{L}\p{N}_]+$/u)?.[0];
      if (!prefix) throw new AbbreviationError('No abbreviation at point');
      const start = this.point - prefix.length;
      const candidates: string[] = [];
      const words = [...this.text.matchAll(/[\p{L}\p{N}_]+/gu)];
      const backward = words.filter((word) => word.index! < start).reverse();
      const forward = words.filter((word) => word.index! >= this.point);
      const ordered =
        count < 0 ? forward : hasPrefix && count > 0 ? backward : [...backward, ...forward];
      const lower = prefix.toLowerCase();
      const caseExpansion = (value: string): string => {
        if (prefix === prefix.toUpperCase() && prefix !== lower) return value.toUpperCase();
        if (prefix === lower) return value.toLowerCase();
        if (
          prefix[0] === prefix[0].toUpperCase() &&
          prefix.slice(1) === prefix.slice(1).toLowerCase()
        )
          return value[0].toUpperCase() + value.slice(1).toLowerCase();
        return prefix + value.slice(prefix.length);
      };
      for (const word of ordered) {
        if (word[0].toLowerCase().startsWith(lower) && word[0].length > prefix.length) {
          const candidate = caseExpansion(word[0]);
          if (!candidates.includes(candidate)) candidates.push(candidate);
        }
      }
      const index = hasPrefix ? Math.max(0, Math.abs(count) - 1) : 0;
      if (index >= candidates.length)
        throw new AbbreviationError('No abbreviation expansion found');
      this.abbreviation = { prefix, start, candidates, index };
    }
    const cycle = this.abbreviation;
    if (cycle.index >= cycle.candidates.length) {
      this.replace(cycle.start, this.point, cycle.prefix);
      this.active = false;
      this.done('other');
      throw new AbbreviationError('No further abbreviation expansion');
    }
    const replacement = cycle.candidates[cycle.index++];
    this.replace(cycle.start, this.point, replacement);
    this.active = false;
    this.done('abbreviation');
  }
  public fillParagraph(width = 70, lineEnding = '\n', justify = false): void {
    if (!Number.isSafeInteger(width) || width < 1 || (lineEnding !== '\n' && lineEnding !== '\r\n'))
      throw new FillParagraphError('Invalid fill settings');
    if (justify || (this.active && this.mark !== undefined && this.mark !== this.point))
      throw new FillParagraphError('Justification and active-region filling are not supported');
    if (
      (lineEnding === '\r\n' && /(?<!\r)\n/.test(this.text)) ||
      (lineEnding === '\n' && /\r\n/.test(this.text))
    )
      throw new FillParagraphError('Mixed line endings are not supported');
    const lines = this.text.split(lineEnding);
    const starts: number[] = [];
    let offset = 0;
    for (const text of lines) {
      starts.push(offset);
      offset += text.length + lineEnding.length;
    }
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= this.point) line++;
    while (line < lines.length && /^[ \t]*$/.test(lines[line])) line++;
    if (line === lines.length) {
      this.done('fill');
      return;
    }
    let first = line;
    let last = line;
    while (first > 0 && !/^[ \t]*$/.test(lines[first - 1])) first--;
    while (last + 1 < lines.length && !/^[ \t]*$/.test(lines[last + 1])) last++;
    const start = starts[first];
    const end = starts[last] + lines[last].length;
    const original = this.text.slice(start, end);
    if (/[^\x20-\x7e\t\r\n]/.test(original))
      throw new FillParagraphError('Unsupported fill characters');
    const indent = lines[first].match(/^[ \t]*/)?.[0] ?? '';
    if (indent.includes('\t')) throw new FillParagraphError('Tab indentation is not supported');
    const words = [...original.matchAll(/[^\s]+/g)];
    if (!words.length) {
      this.done('fill');
      return;
    }
    const replacements: { start: number; end: number; value: string }[] = [];
    let column = indent.length + words[0][0].length;
    for (let index = 1; index < words.length; index++) {
      const previous = words[index - 1];
      const word = words[index];
      const gapStart = previous.index! + previous[0].length;
      const gapEnd = word.index!;
      const gap = original.slice(gapStart, gapEnd);
      const sentence =
        /[.?!][\]"')}]?$/.test(previous[0]) && (gap.includes('\n') || gap.length > 1);
      const spacing = sentence ? '  ' : ' ';
      const replacement =
        column + spacing.length + word[0].length > width ? lineEnding + indent : spacing;
      if (gap !== replacement)
        replacements.push({ start: start + gapStart, end: start + gapEnd, value: replacement });
      column = replacement.includes('\n')
        ? indent.length + word[0].length
        : column + replacement.length + word[0].length;
    }
    const mapOffset = (position: number): number => {
      let delta = 0;
      for (const edit of replacements) {
        if (position < edit.start) break;
        if (position === edit.end) return edit.start + delta + edit.value.length;
        if (position < edit.end) {
          const logicalValue = edit.value.replace(/\r\n/g, '\n');
          const logical = Math.min(position - edit.start, logicalValue.length);
          return (
            edit.start +
            delta +
            (lineEnding === '\r\n'
              ? logicalValue.slice(0, logical).replace(/\n/g, '\r\n').length
              : logical)
          );
        }
        delta += edit.value.length - (edit.end - edit.start);
      }
      return position + delta;
    };
    const point = mapOffset(this.point);
    const mark = this.mark === undefined ? undefined : mapOffset(this.mark);
    for (let index = replacements.length - 1; index >= 0; index--) {
      const edit = replacements[index];
      this.text = this.text.slice(0, edit.start) + edit.value + this.text.slice(edit.end);
    }
    this.point = point;
    this.mark = mark;
    if (replacements.length) this.active = false;
    this.done('fill');
  }
  public tabToTabStop(tabSize = 8, insertSpaces = false): void {
    if (!Number.isSafeInteger(tabSize) || tabSize < 1) throw new Error('Invalid tab size');
    const lineStart = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    const prefix = this.text.slice(lineStart, this.point);
    if (/[^\x20-\x7e\t]/.test(prefix)) throw new TabStopError();
    let column = 0;
    for (const character of prefix) column += character === '\t' ? tabSize - (column % tabSize) : 1;
    const target = column + tabSize - (column % tabSize);
    let start = this.point;
    while (start > lineStart && (this.text[start - 1] === ' ' || this.text[start - 1] === '\t'))
      start--;
    if (start !== this.point) this.replace(start, this.point, '');
    let startColumn = 0;
    for (const character of this.text.slice(lineStart, start))
      startColumn += character === '\t' ? tabSize - (startColumn % tabSize) : 1;
    let value = '';
    while (!insertSpaces && startColumn + tabSize - (startColumn % tabSize) <= target) {
      const distance = tabSize - (startColumn % tabSize);
      value += '\t';
      startColumn += distance;
    }
    value += ' '.repeat(target - startColumn);
    this.replace(start, start, value);
    this.active = false;
    this.done('insert');
  }
  public deleteHorizontalSpace(backwardOnly: boolean): void {
    let start = this.point;
    let end = this.point;
    while (start > 0 && (this.text[start - 1] === ' ' || this.text[start - 1] === '\t')) start--;
    if (!backwardOnly)
      while (end < this.text.length && (this.text[end] === ' ' || this.text[end] === '\t')) end++;
    if (start !== end) this.replace(start, end, '');
    this.done('delete');
  }
  public transposeLines(count: number, lineEnding = '\n'): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid transpose count');
    if (lineEnding !== '\n' && lineEnding !== '\r\n') throw new Error('Invalid line ending');
    if (count === 0 && this.mark === undefined) throw new Error('No mark set');
    if (Math.abs(count) > this.text.length + 10000) throw new Error('Transpose count is too large');
    const originalText = this.text;
    const originalPoint = this.point;
    const originalMark = this.mark;
    let text = originalText;
    let position = originalPoint;
    const move = (distance: number): void => {
      if (distance < 0) {
        for (let index = 0; index < -distance; index++) {
          const start = position === 0 ? 0 : text.lastIndexOf('\n', position - 1) + 1;
          position = start <= 1 ? 0 : text.lastIndexOf('\n', start - 2) + 1;
        }
      } else {
        let remaining = distance;
        while (remaining > 0) {
          const newline = text.indexOf('\n', position);
          if (newline < 0) break;
          position = newline + 1;
          remaining--;
        }
        if (position === text.length && !text.endsWith('\n')) remaining++;
        if (remaining > 0) {
          text += lineEnding.repeat(remaining);
          position = text.length;
        }
      }
    };
    const pair = (distance: number): [number, number] => {
      move(distance);
      const first = position;
      move(-distance);
      return [first, position];
    };
    const first = pair(count === 0 ? 1 : -1);
    if (count === 0) position = originalMark!;
    else if (count < 0) position = first[0];
    const second = pair(count === 0 ? 1 : count);
    const firstStart = Math.min(...first);
    const firstEnd = Math.max(...first);
    const secondStart = Math.min(...second);
    const secondEnd = Math.max(...second);
    const leftStart = Math.min(firstStart, secondStart);
    const leftEnd = firstStart <= secondStart ? firstEnd : secondEnd;
    const rightStart = firstStart <= secondStart ? secondStart : firstStart;
    const rightEnd = firstStart <= secondStart ? secondEnd : firstEnd;
    if (leftEnd > rightStart || leftStart === leftEnd || rightStart === rightEnd)
      throw new Error('Cannot transpose lines');
    const left = text.slice(leftStart, leftEnd);
    const right = text.slice(rightStart, rightEnd);
    const middle = text.slice(leftEnd, rightStart);
    const transform = (offset: number): number => {
      if (offset >= leftEnd) offset += right.length;
      if (offset > leftEnd) offset -= left.length;
      else if (offset >= leftStart) offset = leftStart;
      const boundary = rightStart + right.length - left.length;
      if (offset > boundary) offset += left.length;
      const deletionStart = boundary + left.length;
      if (offset > deletionStart + right.length) offset -= right.length;
      else if (offset >= deletionStart) offset = deletionStart;
      return offset;
    };
    this.text = text.slice(0, leftStart) + right + middle + left + text.slice(rightEnd);
    if (originalMark !== undefined) this.mark = transform(originalMark);
    if (count === 0) {
      this.point = transform(originalMark!);
      this.mark = transform(originalPoint);
    } else this.point = count > 0 ? second[0] : second[0] + firstEnd - firstStart;
    this.active = false;
    this.done('transpose');
  }
  public transposeSexps(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid transpose count');
    const originalPoint = this.point;
    const originalMark = this.mark;
    const pair = (origin: number, distance: number): [number, number] => {
      const first = moveStructure(this.text, origin, distance);
      return [first, moveStructure(this.text, first, -distance)];
    };
    let first: [number, number];
    let second: [number, number];
    if (count === 0) {
      if (this.mark === undefined) throw new Error('No mark set');
      first = pair(this.point, 1);
      second = pair(this.mark, 1);
    } else {
      first = pair(this.point, -1);
      second = pair(count > 0 ? first[1] : first[0], count);
    }
    let firstStart = Math.min(...first);
    let firstEnd = Math.max(...first);
    let secondStart = Math.min(...second);
    let secondEnd = Math.max(...second);
    if (firstStart > secondStart) {
      [firstStart, secondStart] = [secondStart, firstStart];
      [firstEnd, secondEnd] = [secondEnd, firstEnd];
    }
    if (firstStart === firstEnd || secondStart === secondEnd || firstEnd > secondStart)
      throw new Error('Cannot transpose expressions');
    const left = this.text.slice(firstStart, firstEnd);
    const right = this.text.slice(secondStart, secondEnd);
    const middle = this.text.slice(firstEnd, secondStart);
    const transform = (position: number): number => {
      if (position >= firstEnd) position += right.length;
      if (position > firstEnd) position -= left.length;
      else if (position >= firstStart) position = firstStart;
      const boundary = secondStart + right.length - left.length;
      if (position > boundary) position += left.length;
      const deletionStart = boundary + left.length;
      if (position > deletionStart + right.length) position -= right.length;
      else if (position >= deletionStart) position = deletionStart;
      return position;
    };
    const before = this.text;
    this.replace(firstStart, secondEnd, right + middle + left);
    if (originalMark !== undefined) this.mark = transform(originalMark);
    this.point =
      count === 0 ? (this.mark ?? originalPoint) : count > 0 ? second[0] : second[0] + right.length;
    if (count === 0) this.mark = transform(originalPoint);
    this.active = count === 0 && this.text === before;
    this.done('transpose');
  }
  public transposeWords(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid transpose count');
    const originalPoint = this.point;
    const originalMark = this.mark;
    const pair = (origin: number, distance: number): [number, number] => {
      const first = this.wordPosition(distance, origin);
      return [first, this.wordPosition(-distance, first)];
    };
    let first: [number, number];
    let second: [number, number];
    if (count === 0) {
      if (this.mark === undefined) throw new Error('No mark set');
      first = pair(this.point, 1);
      second = pair(this.mark, 1);
    } else {
      first = pair(this.point, -1);
      second = pair(count > 0 ? first[1] : first[0], count);
      this.point = second[1];
    }
    let firstStart = Math.min(...first);
    let firstEnd = Math.max(...first);
    let secondStart = Math.min(...second);
    let secondEnd = Math.max(...second);
    if (firstStart > secondStart) {
      [firstStart, secondStart] = [secondStart, firstStart];
      [firstEnd, secondEnd] = [secondEnd, firstEnd];
    }
    if (firstEnd > secondStart) {
      if (count === 0) this.point = originalPoint;
      throw new Error('Cannot transpose overlapping words');
    }
    const left = this.text.slice(firstStart, firstEnd);
    const right = this.text.slice(secondStart, secondEnd);
    const originalText = this.text;
    const middle = this.text.slice(firstEnd, secondStart);
    const transform = (position: number): number => {
      if (position >= firstEnd) position += right.length;
      if (position > firstEnd) position -= left.length;
      else if (position >= firstStart) position = firstStart;
      const boundary = secondStart + right.length - left.length;
      if (position > boundary) position += left.length;
      const deletionStart = boundary + left.length;
      if (position > deletionStart + right.length) position -= right.length;
      else if (position >= deletionStart) position = deletionStart;
      return position;
    };
    this.replace(firstStart, secondEnd, right + middle + left);
    if (originalMark !== undefined) this.mark = transform(originalMark);
    this.point =
      count === 0
        ? (this.mark ?? originalPoint)
        : count > 0
          ? Math.max(...second)
          : Math.min(...second) + right.length;
    if (count === 0) this.mark = transform(originalPoint);
    if (this.text !== originalText) this.active = false;
    else if (count === 0) this.active = true;
    this.done('transpose');
  }
  public transposeCharacters(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid transpose count');
    const characters = Array.from(this.text.replace(/\r\n/g, '\n'));
    const offsets = [0];
    for (let index = 0; index < this.text.length;) {
      const length = this.text.startsWith('\r\n', index)
        ? 2
        : String.fromCodePoint(this.text.codePointAt(index)!).length;
      index += length;
      offsets.push(index);
    }
    let position = offsets.indexOf(this.point);
    if (position < 0) throw new Error('Point is not at a character boundary');
    if (position > 0 && (position === characters.length || characters[position] === '\n'))
      position--;
    let first: number;
    let second: number;
    let resultPosition: number;
    if (count === 0) {
      if (this.mark === undefined) throw new Error('No mark set');
      const markPosition = offsets.indexOf(this.mark);
      if (
        markPosition < 0 ||
        markPosition >= characters.length ||
        position >= characters.length ||
        position === markPosition
      )
        throw new Error('Cannot transpose characters');
      first = position;
      second = markPosition;
      resultPosition = markPosition;
    } else if (count > 0) {
      first = position - 1;
      second = position + count - 1;
      resultPosition = second + 1;
    } else {
      first = position - 1;
      second = first + count;
      resultPosition = second + 1;
    }
    if (first < 0 || second < 0 || first >= characters.length || second >= characters.length)
      throw new Error('Cannot transpose characters');
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    const pieces = offsets
      .slice(0, -1)
      .map((offset, index) => this.text.slice(offset, offsets[index + 1]));
    if (count === 0) [pieces[first], pieces[second]] = [pieces[second], pieces[first]];
    else {
      const moved = pieces.splice(first, 1)[0];
      pieces.splice(second, 0, moved);
    }
    const originalMark = this.mark;
    const markPosition = originalMark === undefined ? -1 : offsets.indexOf(originalMark);
    const replacement = pieces.slice(low, high + 1).join('');
    this.replace(offsets[low], offsets[high + 1], replacement);
    this.point = pieces.slice(0, resultPosition).join('').length;
    if (count === 0) this.mark = pieces.slice(0, position).join('').length;
    else if (markPosition >= 0) {
      const transformed =
        count > 0 && markPosition > first && markPosition <= second
          ? Math.min(second + 1, markPosition + count - 1)
          : count < 0 && markPosition > second && markPosition <= first
            ? Math.max(second, markPosition + count + 1)
            : markPosition;
      this.mark = pieces.slice(0, transformed).join('').length;
    } else this.mark = originalMark;
    this.active = false;
    this.done('transpose');
  }
  public openLine(count: number, lineEnding = '\n'): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new OpenLineError();
    if (lineEnding !== '\n' && lineEnding !== '\r\n') throw new Error('Invalid line ending');
    if (count === 0) {
      this.lineBoundary(true);
      return;
    }
    const origin = this.point;
    this.replace(origin, origin, lineEnding.repeat(count));
    this.point = origin;
    this.active = false;
    this.done('insert');
  }
  public quotedInsert(value: string, count: number, lineEnding = '\n'): void {
    if (
      Array.from(value).length !== 1 ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 100000
    )
      throw new Error('Invalid quoted character or count');
    const text = value === '\n' ? lineEnding : value;
    if (value === '\r' || (value.length === 1 && /[\uD800-\uDFFF]/.test(value)))
      throw new Error('Unsupported quoted character');
    if (count > 0) {
      this.replace(this.point, this.point, text.repeat(count));
      this.active = false;
    }
    this.done('insert');
  }
  public insert(value: string): void {
    this.replace(this.point, this.point, value);
    this.done('insert');
  }
}
