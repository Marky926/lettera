/**
 * Command bus + undo/redo.
 *
 * Mutations to the document never happen directly. Instead, callers dispatch
 * `Command` objects against the `CommandBus`, which:
 *
 *   1. Runs the command's `apply(state, payload)` inside an Immer producer.
 *   2. Captures forward + inverse JSON patches.
 *   3. Pushes a history entry (with optional coalescing).
 *   4. Notifies subscribers with the new state.
 *
 * The bus is intentionally framework-agnostic. Editor wraps it in a Zustand
 * store; CLI/SDK consumers can use it standalone.
 */
import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer';

enablePatches();

export interface CommandContext<TState> {
  state: TState;
}

export interface CommandDefinition<TState, TPayload> {
  type: string;
  /** Optional human label used in history UIs ("Edit text"). */
  label?: string | ((payload: TPayload) => string);
  /** Mutation against a draft (Immer). Mutate in place; return is ignored. */
  apply: (draft: TState, payload: TPayload, ctx: CommandContext<TState>) => void;
  /**
   * If two consecutive history entries share the same key, the new one replaces
   * the previous one (the inverse patch is rebased). Used to coalesce typing.
   */
  coalesceKey?: (payload: TPayload) => string | undefined;
}

export interface HistoryEntry {
  type: string;
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  coalesceKey: string | undefined;
  timestamp: number;
}

export interface BusOptions {
  /** Max history entries before the oldest is dropped. */
  maxHistory?: number;
  /** Coalescing window in ms. */
  coalesceWindowMs?: number;
}

export type Listener<TState> = (state: TState, change: HistoryChange) => void;

export type HistoryChange =
  | { kind: 'apply'; entry: HistoryEntry }
  | { kind: 'undo'; entry: HistoryEntry }
  | { kind: 'redo'; entry: HistoryEntry }
  | { kind: 'replace' };

export class CommandBus<TState> {
  private state: TState;
  private commands = new Map<string, CommandDefinition<TState, unknown>>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<Listener<TState>>();
  private readonly maxHistory: number;
  private readonly coalesceWindowMs: number;

  constructor(initial: TState, opts: BusOptions = {}) {
    this.state = initial;
    this.maxHistory = opts.maxHistory ?? 200;
    this.coalesceWindowMs = opts.coalesceWindowMs ?? 500;
  }

  getState(): TState {
    return this.state;
  }

  subscribe(listener: Listener<TState>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register<TPayload>(def: CommandDefinition<TState, TPayload>): void {
    this.commands.set(def.type, def as CommandDefinition<TState, unknown>);
  }

  /** Replace state without producing a history entry (e.g. on document load). */
  replaceState(next: TState): void {
    this.state = next;
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ kind: 'replace' });
  }

  dispatch<TPayload>(type: string, payload: TPayload): void {
    const def = this.commands.get(type) as CommandDefinition<TState, TPayload> | undefined;
    if (!def) {
      throw new Error(`[CommandBus] Unknown command "${type}"`);
    }

    const [next, patches, inversePatches] = produceWithPatches(this.state, (draft) => {
      def.apply(draft as TState, payload, { state: this.state });
    });

    if (patches.length === 0) return; // no-op

    const label = typeof def.label === 'function' ? def.label(payload) : (def.label ?? def.type);
    const key = def.coalesceKey?.(payload);
    const now = Date.now();

    const last = this.undoStack[this.undoStack.length - 1];
    const canCoalesce =
      last !== undefined &&
      key !== undefined &&
      last.coalesceKey === key &&
      now - last.timestamp <= this.coalesceWindowMs;

    let entry: HistoryEntry;
    if (canCoalesce && last) {
      // Keep the *original* inverse so a single undo reverts the whole burst.
      entry = {
        type: def.type,
        label,
        patches: [...last.patches, ...patches],
        inversePatches: [...inversePatches, ...last.inversePatches],
        coalesceKey: key,
        timestamp: now,
      };
      this.undoStack[this.undoStack.length - 1] = entry;
    } else {
      entry = {
        type: def.type,
        label,
        patches,
        inversePatches,
        coalesceKey: key,
        timestamp: now,
      };
      this.undoStack.push(entry);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    }

    this.redoStack = [];
    this.state = next;
    this.emit({ kind: 'apply', entry });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.state = applyPatches(this.state as object, entry.inversePatches) as TState;
    this.redoStack.push(entry);
    this.emit({ kind: 'undo', entry });
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.state = applyPatches(this.state as object, entry.patches) as TState;
    this.undoStack.push(entry);
    this.emit({ kind: 'redo', entry });
  }

  history(): readonly HistoryEntry[] {
    return this.undoStack;
  }

  private emit(change: HistoryChange): void {
    for (const l of this.listeners) l(this.state, change);
  }
}
