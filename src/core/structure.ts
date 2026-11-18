export class StructureMovementError extends Error {
  constructor(
    message = 'Unbalanced expression',
    public readonly position?: number,
  ) {
    super(message);
  }
}

type Token = {
  start: number;
  end: number;
  kind: 'open' | 'close' | 'atom' | 'invalid';
  character: string;
};

function tokens(text: string): Token[] {
  const result: Token[] = [];
  let position = 0;
  while (position < text.length) {
    const character = String.fromCodePoint(text.codePointAt(position)!);
    if (/\s/u.test(character)) {
      position += character.length;
      continue;
    }
    const start = position;
    if ('([{'.includes(character) || ')]}'.includes(character)) {
      position += character.length;
      result.push({
        start,
        end: position,
        character,
        kind: '([{'.includes(character) ? 'open' : 'close',
      });
    } else if (character === '\\') {
      position += character.length;
      if (position < text.length)
        position += String.fromCodePoint(text.codePointAt(position)!).length;
      result.push({ start, end: position, character, kind: 'atom' });
    } else if (character === '"') {
      position++;
      let closed = false;
      while (position < text.length) {
        if (text[position] === '\\') {
          position += Math.min(2, text.length - position);
        } else if (text[position++] === '"') {
          closed = true;
          break;
        }
      }
      result.push({ start, end: position, character, kind: closed ? 'atom' : 'invalid' });
    } else if (/[\p{L}\p{N}_]/u.test(character)) {
      position += character.length;
      while (position < text.length) {
        const next = String.fromCodePoint(text.codePointAt(position)!);
        if (!/[\p{L}\p{N}_\p{M}]/u.test(next)) break;
        position += next.length;
      }
      result.push({ start, end: position, character, kind: 'atom' });
    } else {
      position += character.length;
    }
  }
  return result;
}

function firstTokenEndingAfter(items: Token[], position: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (items[middle].end <= position) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstTokenStartingAtOrAfter(items: Token[], position: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (items[middle].start < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function moveListDepth(
  text: string,
  origin: number,
  count: number,
  outward: boolean,
): number {
  if (!Number.isSafeInteger(count)) throw new StructureMovementError('Invalid count');
  if (count === 0) return origin;
  const items = tokens(text);
  let position = origin;
  for (let iteration = 0; iteration < Math.abs(count); iteration++) {
    const forward = outward ? count < 0 : count > 0;
    const desired = outward ? (forward ? 'close' : 'open') : forward ? 'open' : 'close';
    let index = forward
      ? firstTokenStartingAtOrAfter(items, position)
      : firstTokenEndingAfter(items, position) - 1;
    let depth = 0;
    let found: Token | undefined;
    for (; index >= 0 && index < items.length; index += forward ? 1 : -1) {
      const token = items[index];
      if (token.kind === 'invalid')
        throw new StructureMovementError('Unterminated string', position);
      if (token.kind === 'atom') continue;
      if (token.kind === desired) {
        if (depth === 0) {
          found = token;
          break;
        }
        depth--;
      } else depth++;
    }
    if (!found) throw new StructureMovementError('No containing list', position);
    position = forward ? found.end : found.start;
  }
  return position;
}

export function moveStructure(text: string, origin: number, count: number, lists = false): number {
  if (!Number.isSafeInteger(count)) throw new StructureMovementError('Invalid count');
  if (count === 0) return origin;
  const items = tokens(text);
  const matches: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let position = origin;
  for (let iteration = 0; iteration < Math.abs(count); iteration++) {
    const forward = count > 0;
    let index = forward
      ? firstTokenEndingAfter(items, position)
      : firstTokenStartingAtOrAfter(items, position) - 1;
    let depth = 0;
    const stack: string[] = [];
    let moved = false;
    for (; index >= 0 && index < items.length; index += forward ? 1 : -1) {
      const token = items[index];
      if (token.kind === 'invalid') throw new StructureMovementError('Unterminated string', origin);
      const opening = forward ? token.kind === 'open' : token.kind === 'close';
      const closing = forward ? token.kind === 'close' : token.kind === 'open';
      if (opening) {
        stack.push(token.character);
        depth++;
      } else if (closing) {
        if (depth === 0) throw new StructureMovementError('Unbalanced expression', origin);
        const previous = stack.pop()!;
        if (forward ? matches[previous] !== token.character : matches[token.character] !== previous)
          throw new StructureMovementError('Unbalanced expression', origin);
        depth--;
        if (depth === 0) {
          position = forward ? token.end : token.start;
          moved = true;
          break;
        }
      } else if (depth === 0 && !lists) {
        position = forward ? token.end : token.start;
        moved = true;
        break;
      }
    }
    if (!moved) {
      if (depth !== 0) throw new StructureMovementError('Unbalanced expression', origin);
      position = forward ? text.length : 0;
      break;
    }
  }
  return position;
}
