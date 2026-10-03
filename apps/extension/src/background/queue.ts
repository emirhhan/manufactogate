/**
 * Priority slot queue for market tabs. Pure (no chrome APIs) so it can be unit-tested.
 *  - at most `max` holders at once; the rest wait, lowest priority number first, then FIFO
 *  - each waiter carries a budget: when it has waited longer than that it resolves "expired"
 *    instead of opening a tab minutes after the caller gave up
 *  - an AbortSignal drops the waiter ("aborted"), e.g. when the web page disconnects
 */

export type AcquireOutcome = "ok" | "expired" | "aborted";

interface Waiter {
  seq: number;
  priority: number;
  enqueuedAt: number;
  label: string;
  resolve: (o: AcquireOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface QueueStats {
  active: number;
  max: number;
  queued: { label: string; priority: number; waitedMs: number }[];
}

export class SlotQueue {
  private active = 0;
  private seq = 0;
  private waiters: Waiter[] = [];

  constructor(
    private max: number,
    private readonly now: () => number = Date.now,
  ) {}

  setMax(n: number): void {
    this.max = Math.max(1, Math.floor(n));
    this.pump();
  }

  getMax(): number {
    return this.max;
  }

  acquire(opts: { priority?: number; budgetMs?: number; signal?: AbortSignal; label?: string } = {}): Promise<AcquireOutcome> {
    if (opts.signal?.aborted) return Promise.resolve("aborted");
    if (this.active < this.max && this.waiters.length === 0) {
      this.active++;
      return Promise.resolve("ok");
    }
    return new Promise<AcquireOutcome>((resolve) => {
      const w: Waiter = {
        seq: this.seq++,
        priority: opts.priority ?? 1,
        enqueuedAt: this.now(),
        label: opts.label ?? "",
        resolve,
        timer: null,
        ...(opts.signal ? { signal: opts.signal } : {}),
      };
      if (opts.budgetMs !== undefined && Number.isFinite(opts.budgetMs)) {
        w.timer = setTimeout(() => this.settle(w, "expired"), Math.max(0, opts.budgetMs));
      }
      if (opts.signal) {
        w.onAbort = () => this.settle(w, "aborted");
        opts.signal.addEventListener("abort", w.onAbort, { once: true });
      }
      this.waiters.push(w);
      this.waiters.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      this.pump();
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    this.pump();
  }

  /** Drops every waiter whose label satisfies the predicate (they resolve "aborted"). */
  cancelWhere(pred: (label: string) => boolean): number {
    let n = 0;
    for (const w of [...this.waiters]) {
      if (pred(w.label)) {
        this.settle(w, "aborted");
        n++;
      }
    }
    return n;
  }

  stats(): QueueStats {
    const t = this.now();
    return {
      active: this.active,
      max: this.max,
      queued: this.waiters.map((w) => ({ label: w.label, priority: w.priority, waitedMs: t - w.enqueuedAt })),
    };
  }

  private pump(): void {
    while (this.active < this.max && this.waiters.length) {
      const w = this.waiters.shift()!;
      this.active++;
      this.cleanup(w);
      w.resolve("ok");
    }
  }

  private settle(w: Waiter, outcome: AcquireOutcome): void {
    const i = this.waiters.indexOf(w);
    if (i < 0) return;
    this.waiters.splice(i, 1);
    this.cleanup(w);
    w.resolve(outcome);
  }

  private cleanup(w: Waiter): void {
    if (w.timer) clearTimeout(w.timer);
    w.timer = null;
    if (w.signal && w.onAbort) w.signal.removeEventListener("abort", w.onAbort);
  }
}
