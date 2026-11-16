export type SearchDirection = 1 | -1;
export type SearchMatch = { start: number; end: number };
type Snapshot = { query: string; direction: SearchDirection; match: SearchMatch | undefined; failed: boolean; wrapped: boolean };

export class IncrementalSearch {
  public query = '';
  public direction: SearchDirection;
  public match: SearchMatch | undefined;
  public failed = false;
  public wrapped = false;
  private history: Snapshot[] = [];
  private cachedQuery: string | undefined;
  private cachedMatches: SearchMatch[] = [];
  constructor(private readonly text: string, public readonly origin: number, direction: SearchDirection) { this.direction = direction; }
  private snapshot(): Snapshot { return { query: this.query, direction: this.direction, match: this.match, failed: this.failed, wrapped: this.wrapped }; }
  private restore(snapshot: Snapshot): void { this.query = snapshot.query; this.direction = snapshot.direction; this.match = snapshot.match; this.failed = snapshot.failed; this.wrapped = snapshot.wrapped; }
  private matches(query: string): SearchMatch[] {
    if (this.cachedQuery === query) return this.cachedMatches;
    const matches: SearchMatch[] = [];
    if (query) {
      const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(pattern, query.toLowerCase() === query ? 'giu' : 'gu');
      let result: RegExpExecArray | null;
      while ((result = expression.exec(this.text)) !== null) {
        matches.push({ start: result.index, end: result.index + result[0].length });
        expression.lastIndex = result.index + (this.text.codePointAt(result.index)! > 0xffff ? 2 : 1);
      }
    }
    this.cachedQuery = query; this.cachedMatches = matches;
    return matches;
  }
  public get allMatches(): readonly SearchMatch[] { return this.matches(this.query); }
  public get matchCount(): { current: number; total: number } | undefined {
    if (!this.query) return undefined;
    const matches = this.allMatches;
    const point = this.point;
    const index = matches.findIndex(match => this.direction === 1 ? match.end === point : match.start === point);
    return { current: index + 1, total: matches.length };
  }
  private find(query: string, direction: SearchDirection, position: number): SearchMatch | undefined {
    const matches = this.matches(query);
    if (direction === 1) return matches.find(match => match.start >= position);
    for (let index = matches.length - 1; index >= 0; index--) {
      if (matches[index].end <= position) return matches[index];
    }
    return undefined;
  }
  public setQuery(query: string): void {
    if (query === this.query) return;
    if (query.length < this.query.length && this.query.startsWith(query)) {
      const prior = [...this.history].reverse().find(snapshot => snapshot.query === query);
      if (prior) { this.restore(prior); return; }
    }
    const prior = this.snapshot();
    this.history.push(prior);
    this.query = query; this.wrapped = false;
    if (!query) { this.match = undefined; this.failed = false; return; }
    const start = this.match ? (this.direction === 1 ? this.match.start : this.match.end) : this.origin;
    const found = this.find(query, this.direction, start);
    this.failed = !found;
    if (found) this.match = found;
  }
  public repeat(direction: SearchDirection): void {
    this.history.push(this.snapshot());
    const changed = direction !== this.direction;
    const wasFailed = this.failed;
    this.direction = direction; this.wrapped = false;
    if (!this.query) return;
    const start = this.match ? (direction === 1 ? (changed ? this.match.start : this.match.end) : (changed ? this.match.end : this.match.start)) : this.origin;
    const found = this.find(this.query, direction, wasFailed ? (direction === 1 ? 0 : this.text.length) : start);
    this.failed = !found;
    if (found) { this.match = found; this.wrapped = wasFailed; }
  }
  public rollbackFailure(): boolean {
    if (!this.failed) return false;
    while (this.history.length) {
      const snapshot = this.history.pop()!;
      if (!snapshot.failed) { this.restore(snapshot); return true; }
    }
    this.query = ''; this.match = undefined; this.failed = false; this.wrapped = false;
    return true;
  }
  public get point(): number { return this.match ? (this.direction === 1 ? this.match.end : this.match.start) : this.origin; }
}
