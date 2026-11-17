export type RegisterValue = { kind: 'text'; text: string } | { kind: 'number'; value: number };

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

  public setNumber(name: string, value: number): void {
    Registers.validateName(name);
    if (!Number.isSafeInteger(value)) throw new Error('Register number must be a safe integer');
    this.values.set(name, { kind: 'number', value });
  }

  public increment(name: string, amount: number): void {
    Registers.validateName(name);
    const value = this.values.get(name);
    if (value && value.kind !== 'number') throw new Error('Register does not contain a number');
    this.setNumber(name, (value?.value ?? 0) + amount);
  }

  public read(name: string): RegisterValue {
    Registers.validateName(name);
    const value = this.values.get(name);
    if (!value) throw new Error('Register is empty');
    return { ...value };
  }
}
