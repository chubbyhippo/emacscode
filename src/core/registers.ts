import type { EditorState } from './editor';

export type RegisterValue =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'rectangle'; rows: string[] };

export class Registers {
  private readonly values = new Map<string, RegisterValue>();

  public static validateName(name: string): void {
    if (Array.from(name).length !== 1 || /[\r\n]/.test(name))
      throw new Error('Register must be one character');
  }

  public setText(name: string, text: string): void {
    Registers.validateName(name);
    this.values.set(name, { kind: 'text', text });
  }

  public setRectangle(name: string, rows: readonly string[]): void {
    Registers.validateName(name);
    this.values.set(name, { kind: 'rectangle', rows: [...rows] });
  }

  public setNumber(name: string, value: number): void {
    Registers.validateName(name);
    if (!Number.isSafeInteger(value)) throw new Error('Register number must be a safe integer');
    this.values.set(name, { kind: 'number', value });
  }

  public prepareIncrement(
    state: EditorState,
    name: string,
    amount: number,
    hasPrefix: boolean,
  ): () => void {
    Registers.validateName(name);
    const current = this.values.get(name);
    if (current?.kind === 'number') {
      const value = current.value + amount;
      if (!Number.isSafeInteger(value)) throw new Error('Register number must be a safe integer');
      return () => this.setNumber(name, value);
    }
    if (current?.kind === 'rectangle')
      throw new Error('Register does not contain a number or text');
    const [start, end] = state.regionBounds();
    const text = (current?.text ?? '') + state.text.slice(start, end);
    if (hasPrefix && start !== end) {
      state.text = state.text.slice(0, start) + state.text.slice(end);
      state.point = start;
      state.mark = start;
    }
    state.active = false;
    return () => this.setText(name, text);
  }

  public read(name: string): RegisterValue {
    Registers.validateName(name);
    const value = this.values.get(name);
    if (!value) throw new Error('Register is empty');
    return value.kind === 'rectangle' ? { kind: 'rectangle', rows: [...value.rows] } : { ...value };
  }
}
