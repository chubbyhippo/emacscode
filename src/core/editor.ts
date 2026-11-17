export type Direction = 'forward' | 'backward';

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
  public current(): string | undefined { return this.entries[this.index]; }
  public rotate(amount = 1): string | undefined {
    if (!this.entries.length) return undefined;
    this.index = ((this.index + amount) % this.entries.length + this.entries.length) % this.entries.length;
    return this.current();
  }
  public values(): readonly string[] { return this.entries.slice(); }
  public restore(entries: readonly string[]): void { this.entries = [...entries]; this.index = 0; }
}

export class PrefixArgument {
  private value: number | undefined;
  private digits = false;
  private negativeSign = false;
  public universal(): void { this.value = this.value === undefined ? 4 : this.value * 4; this.negativeSign = this.value < 0; this.digits = false; }
  public digit(digit: number): void {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) throw new Error('Invalid digit');
    if (!this.digits) { this.value = this.negativeSign ? -digit : digit; this.digits = true; }
    else { this.value = (this.value ?? 0) * 10 + (this.negativeSign ? -digit : digit); }
  }
  public negative(): void { this.negativeSign = !this.negativeSign; this.value = this.value === undefined ? -1 : -this.value; this.digits = false; }
  public consume(): number { const value = this.value ?? 1; this.reset(); return value; }
  public reset(): void { this.value = undefined; this.digits = false; this.negativeSign = false; }
  public get pending(): boolean { return this.value !== undefined; }
}

export class EditorState {
  public text: string;
  public point: number;
  public mark: number | undefined;
  public active = false;
  private previous = '';
  private yankRange: [number, number] | undefined;
  private goalColumn: number | undefined;
  constructor(text: string, point: number, private readonly ring: KillRing) { this.text = text; this.point = this.clamp(point); }
  private clamp(position: number): number { return Math.max(0, Math.min(this.text.length, position)); }
  public sync(text: string, point: number): void {
    if (text !== this.text) { this.text = text; this.mark = undefined; this.active = false; this.yankRange = undefined; this.previous = ''; }
    if (this.point !== point) { this.previous = ''; this.yankRange = undefined; this.goalColumn = undefined; }
    this.point = this.clamp(point);
  }
  private done(command: string): void { this.previous = command; if (command !== 'yank' && command !== 'yank-pop') this.yankRange = undefined; if (command !== 'vertical') this.goalColumn = undefined; }
  public setMark(): void { this.mark = this.point; this.active = true; this.done('mark'); }
  public cancel(): void { this.active = false; this.done('cancel'); }
  public breakCommandChain(): void { this.done('other'); }
  public exchange(): void { if (this.mark === undefined) throw new Error('No mark set'); const point = this.point; this.point = this.mark; this.mark = point; this.active = true; this.done('exchange'); }
  public selectAll(): void { this.mark = 0; this.point = this.text.length; this.active = true; this.done('mark'); }
  public regionBounds(): [number, number] { if (this.mark === undefined || !this.active) throw new Error('No active region'); return [Math.min(this.mark, this.point), Math.max(this.mark, this.point)]; }
  public applyText(text: string, point: number): void { this.text = text; this.point = this.clamp(point); this.mark = undefined; this.active = false; this.done('edit'); }
  public moveCharacter(count: number): void {
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      if (count > 0 && position < this.text.length) { const code = this.text.codePointAt(position); position += this.text.startsWith('\r\n', position) || (code !== undefined && code > 0xffff) ? 2 : 1; }
      else if (count < 0 && position > 0) { position--; if (position > 0 && ((this.text[position] === '\n' && this.text[position - 1] === '\r') || (this.text.charCodeAt(position) >= 0xdc00 && this.text.charCodeAt(position) <= 0xdfff && this.text.charCodeAt(position - 1) >= 0xd800 && this.text.charCodeAt(position - 1) <= 0xdbff))) position--; }
    }
    this.point = position; this.done('move');
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
      if (lineStart === 0) { this.point = 0; this.done('move'); return; }
      lineStart = lineStart <= 1 ? 0 : this.text.lastIndexOf('\n', lineStart - 2) + 1;
      remaining++;
    }
    const newline = this.text.indexOf('\n', lineStart);
    this.point = !end ? lineStart : newline < 0 ? this.text.length : newline > lineStart && this.text[newline - 1] === '\r' ? newline - 1 : newline;
    this.done('move');
  }
  public backToIndentation(): void {
    let position = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    while (position < this.text.length && /[ \t\f\v]/.test(this.text[position])) position++;
    this.point = position; this.done('move');
  }
  public bufferBoundary(end: boolean): void { this.point = end ? this.text.length : 0; this.done('move'); }
  public vertical(count: number): void {
    const start = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
    const goal = this.goalColumn ?? this.point - start;
    let lineStart = start;
    for (let index = 0; index < Math.abs(count); index++) {
      if (count > 0) { const end = this.text.indexOf('\n', lineStart); if (end < 0) { this.point = this.text.length; this.goalColumn = goal; this.done('vertical'); return; } lineStart = end + 1; }
      else { if (lineStart === 0) { this.point = 0; this.goalColumn = goal; this.done('vertical'); return; } lineStart = lineStart <= 1 ? 0 : this.text.lastIndexOf('\n', lineStart - 2) + 1; }
    }
    const end = this.text.indexOf('\n', lineStart);
    const lineEnd = end < 0 ? this.text.length : end > lineStart && this.text[end - 1] === '\r' ? end - 1 : end;
    this.point = Math.min(lineStart + goal, lineEnd);
    if (this.point > lineStart && this.point < lineEnd && this.text.charCodeAt(this.point) >= 0xdc00 && this.text.charCodeAt(this.point) <= 0xdfff && this.text.charCodeAt(this.point - 1) >= 0xd800 && this.text.charCodeAt(this.point - 1) <= 0xdbff) this.point--;
    this.goalColumn = goal; this.done('vertical');
  }
  private isWord(char: string): boolean { return /[\p{L}\p{N}]/u.test(char); }
  public wordPosition(count: number, origin = this.point): number {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid word count');
    let pos = origin;
    const isSplitSurrogate = (offset: number): boolean => offset > 0 && offset < this.text.length && this.text.charCodeAt(offset) >= 0xdc00 && this.text.charCodeAt(offset) <= 0xdfff && this.text.charCodeAt(offset - 1) >= 0xd800 && this.text.charCodeAt(offset - 1) <= 0xdbff;
    if (isSplitSurrogate(pos)) throw new Error('Point is not at a character boundary');
    const next = (offset: number): number => offset + String.fromCodePoint(this.text.codePointAt(offset)!).length;
    const previous = (offset: number): number => isSplitSurrogate(offset - 1) ? offset - 2 : offset - 1;
    const wordAt = (offset: number): boolean => this.isWord(String.fromCodePoint(this.text.codePointAt(offset)!));
    for (let index = 0; index < Math.abs(count); index++) {
      if (count > 0) {
        while (pos < this.text.length && !wordAt(pos)) pos = next(pos);
        while (pos < this.text.length && wordAt(pos)) pos = next(pos);
        if (pos === this.text.length) break;
      } else {
        while (pos > 0 && !wordAt(previous(pos))) pos = previous(pos);
        while (pos > 0 && wordAt(previous(pos))) pos = previous(pos);
        if (pos === 0) break;
      }
    }
    return pos;
  }
  public moveWord(count: number): void { this.point = this.wordPosition(count); this.done('move'); }
  public markWord(count: number, hasPrefix: boolean): void {
    const extend = this.mark !== undefined && (this.active || this.previous === 'mark-word');
    const origin = extend ? this.mark! : this.point;
    const distance = hasPrefix ? count : extend && origin < this.point ? -1 : 1;
    this.mark = this.wordPosition(distance, origin);
    this.active = true;
    this.done('mark-word');
  }
  public changeWordCase(kind: 'upcase' | 'downcase' | 'capitalize', count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid word count');
    const origin = this.point;
    const boundedCount = Math.sign(count) * Math.min(Math.abs(count), this.text.length + 1);
    const boundary = this.wordPosition(boundedCount);
    const start = Math.min(origin, boundary); const end = Math.max(origin, boundary);
    const original = this.text.slice(start, end);
    const converted = kind === 'upcase' ? original.toUpperCase() : kind === 'downcase' ? original.toLowerCase() : original.replace(/[\p{L}\p{N}]+/gu, word => {
      const characters = Array.from(word);
      return characters[0].toUpperCase() + characters.slice(1).join('').toLowerCase();
    });
    if (converted !== original) this.replace(start, end, converted);
    this.point = count < 0 ? start + converted.length : count > 0 ? start + converted.length : origin;
    this.done('case');
  }
  private replace(start: number, end: number, value: string): void {
    this.text = this.text.slice(0, start) + value + this.text.slice(end); this.point = start + value.length;
    if (this.mark !== undefined) { if (this.mark > end) this.mark += value.length - (end - start); else if (this.mark >= start) this.mark = start; }
  }
  public kill(start: number, end: number, direction: Direction, copy = false): string {
    start = this.clamp(start); end = this.clamp(end);
    if (start > end) [start, end] = [end, start];
    const value = this.text.slice(start, end);
    this.ring.add(value, direction, this.previous === 'kill' && !copy);
    if (!copy && value) this.replace(start, end, '');
    this.active = false; this.done(copy ? 'copy' : 'kill'); return value;
  }
  public region(copy = false): string { if (this.mark === undefined || !this.active) throw new Error('No active region'); return this.kill(this.mark, this.point, this.point < this.mark ? 'backward' : 'forward', copy); }
  public killLine(count: number, hasPrefix = false): string {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid line count');
    if (!hasPrefix) {
      if (this.point === this.text.length) throw new Error('End of buffer');
      const newline = this.text.indexOf('\n', this.point);
      const end = newline < 0 ? this.text.length : newline > 0 && this.text[newline - 1] === '\r' ? newline - 1 : newline;
      const includeNewline = newline >= 0 && /^[ \t]*$/.test(this.text.slice(this.point, end));
      return this.kill(this.point, includeNewline ? newline + 1 : end, 'forward');
    }
    if (count <= 0) {
      let start = this.point === 0 ? 0 : this.text.lastIndexOf('\n', this.point - 1) + 1;
      for (let index = 0; index < -count && start > 0; index++) start = start <= 1 ? 0 : this.text.lastIndexOf('\n', start - 2) + 1;
      return this.kill(start, this.point, 'backward');
    }
    let end = this.point;
    for (let index = 0; index < count; index++) {
      const next = this.text.indexOf('\n', end);
      if (next < 0) { end = this.text.length; break; }
      end = next + 1;
    }
    return this.kill(this.point, end, 'forward');
  }
  public killWord(count: number): string { const end = this.wordPosition(count); return this.kill(this.point, end, count < 0 ? 'backward' : 'forward'); }
  public zapToChar(character: string, count: number): string {
    if (Array.from(character).length !== 1 || !Number.isSafeInteger(count)) throw new Error('Invalid zap character or count');
    if (count === 0) return this.kill(this.point, this.point, 'forward');
    const ignoreCase = character.toLowerCase() === character && character.toUpperCase() !== character;
    const target = ignoreCase ? character.toLowerCase() : character;
    let position = this.point;
    for (let index = 0; index < Math.abs(count); index++) {
      let match = -1;
      if (count > 0) {
        for (let cursor = position; cursor < this.text.length;) {
          const current = String.fromCodePoint(this.text.codePointAt(cursor)!);
          if ((ignoreCase ? current.toLowerCase() : current) === target) { match = cursor; break; }
          cursor += current.length;
        }
        if (match < 0) throw new Error('Character not found');
        position = match + String.fromCodePoint(this.text.codePointAt(match)!).length;
      } else {
        for (let cursor = position; cursor > 0;) {
          cursor--;
          if (cursor > 0 && /[\uDC00-\uDFFF]/.test(this.text[cursor]) && /[\uD800-\uDBFF]/.test(this.text[cursor - 1])) cursor--;
          const current = String.fromCodePoint(this.text.codePointAt(cursor)!);
          if ((ignoreCase ? current.toLowerCase() : current) === target) { match = cursor; break; }
        }
        if (match < 0) throw new Error('Character not found');
        position = match;
      }
    }
    return this.kill(this.point, position, count < 0 ? 'backward' : 'forward');
  }
  public yank(lineEnding?: string): void { const value = this.ring.current(); if (value === undefined) throw new Error('Kill ring is empty'); const start = this.point; this.replace(start, start, lineEnding === undefined ? value : value.replace(/\r\n|\n/g, lineEnding)); this.mark = start; this.yankRange = [start, this.point]; this.done('yank'); }
  public yankPop(count = 1, lineEnding?: string): void { if (!this.yankRange || (this.previous !== 'yank' && this.previous !== 'yank-pop')) throw new Error('Previous command was not a yank'); const value = this.ring.rotate(count); if (value === undefined) throw new Error('Kill ring is empty'); const [start, end] = this.yankRange; this.replace(start, end, lineEnding === undefined ? value : value.replace(/\r\n|\n/g, lineEnding)); this.mark = start; this.yankRange = [start, this.point]; this.done('yank-pop'); }
  public deleteCharacter(count: number): void { const origin = this.point; this.moveCharacter(count); const end = this.point; this.replace(Math.min(origin, end), Math.max(origin, end), ''); this.done('delete'); }
  public deleteHorizontalSpace(backwardOnly: boolean): void {
    let start = this.point; let end = this.point;
    while (start > 0 && (this.text[start - 1] === ' ' || this.text[start - 1] === '\t')) start--;
    if (!backwardOnly) while (end < this.text.length && (this.text[end] === ' ' || this.text[end] === '\t')) end++;
    if (start !== end) this.replace(start, end, '');
    this.done('delete');
  }
  public transposeCharacters(count: number): void {
    if (!Number.isSafeInteger(count)) throw new Error('Invalid transpose count');
    const characters = Array.from(this.text.replace(/\r\n/g, '\n'));
    const offsets = [0];
    for (let index = 0; index < this.text.length;) {
      const length = this.text.startsWith('\r\n', index) ? 2 : String.fromCodePoint(this.text.codePointAt(index)!).length;
      index += length; offsets.push(index);
    }
    let position = offsets.indexOf(this.point);
    if (position < 0) throw new Error('Point is not at a character boundary');
    if (position > 0 && (position === characters.length || characters[position] === '\n')) position--;
    let first: number; let second: number; let resultPosition: number;
    if (count === 0) {
      if (this.mark === undefined) throw new Error('No mark set');
      const markPosition = offsets.indexOf(this.mark);
      if (markPosition < 0 || markPosition >= characters.length || position >= characters.length || position === markPosition) throw new Error('Cannot transpose characters');
      first = position; second = markPosition; resultPosition = markPosition;
    } else if (count > 0) {
      first = position - 1; second = position + count - 1; resultPosition = second + 1;
    } else {
      first = position - 1; second = first + count; resultPosition = second + 1;
    }
    if (first < 0 || second < 0 || first >= characters.length || second >= characters.length) throw new Error('Cannot transpose characters');
    const low = Math.min(first, second); const high = Math.max(first, second);
    const pieces = offsets.slice(0, -1).map((offset, index) => this.text.slice(offset, offsets[index + 1]));
    if (count === 0) [pieces[first], pieces[second]] = [pieces[second], pieces[first]];
    else { const moved = pieces.splice(first, 1)[0]; pieces.splice(second, 0, moved); }
    const replacement = pieces.slice(low, high + 1).join('');
    this.replace(offsets[low], offsets[high + 1], replacement);
    this.point = pieces.slice(0, resultPosition).join('').length;
    if (count === 0) this.mark = pieces.slice(0, position).join('').length;
    this.done('transpose');
  }
  public insert(value: string): void { this.replace(this.point, this.point, value); this.done('insert'); }
}
