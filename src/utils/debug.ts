/**
 * zenType unified debug infrastructure.
 * Namespace-isolated event streams + state snapshots.
 * DevTools access via window.__ztDebug.
 *
 * Usage (DevTools console):
 *   __ztDebug.namespace("typewriter").enable()
 *   __ztDebug.state()
 *   __ztDebug.log("typewriter")
 *   __ztDebug.clear()
 *   __ztDebug.configure({ maxEvents: 100 })
 */

interface DebugEvent {
  t: number;
  namespace: string;
  type: string;
  data?: unknown;
  important: boolean;
}

class DebugNamespace {
  readonly name: string;
  private enabled = false;
  private fields: Record<string, unknown> = {};
  private manager: DebugManager;

  constructor(manager: DebugManager, name: string) {
    this.manager = manager;
    this.name = name;
  }

  enable(): void {
    this.enabled = true;
    console.log(`[zt-${this.name}] debug ON — call __ztDebug.namespace("${this.name}").disable() to turn off`);
  }

  disable(): void {
    this.enabled = false;
    console.log(`[zt-${this.name}] debug OFF`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setField(key: string, value: unknown): void {
    this.fields[key] = value;
  }

  setFields(fields: Record<string, unknown>): void {
    Object.assign(this.fields, fields);
  }

  getField<T = unknown>(key: string): T | undefined {
    return this.fields[key] as T | undefined;
  }

  clearFields(): void {
    this.fields = {};
  }

  push(type: string, data?: unknown, important = false): void {
    // Buffer: important → always buffer; non-important → buffer only when enabled
    // Log: only when BOTH enabled AND important (avoids rAF-frame noise at 60fps)
    if (!important && !this.enabled) return;
    this.manager.pushEvent({
      t: Date.now(),
      namespace: this.name,
      type,
      data,
      important,
    });
    if (important && this.enabled) {
      console.log(`[zt-${this.name}]`, type, data ?? "");
    }
  }

  state(): { enabled: boolean; fields: Record<string, unknown>; events: DebugEvent[] } {
    return {
      enabled: this.enabled,
      fields: { ...this.fields },
      events: this.manager.events.filter((e) => e.namespace === this.name),
    };
  }
}

class DebugManager {
  private namespaces = new Map<string, DebugNamespace>();
  events: DebugEvent[] = [];
  maxEvents = 50;

  namespace(name: string): DebugNamespace {
    let ns = this.namespaces.get(name);
    if (!ns) {
      ns = new DebugNamespace(this, name);
      this.namespaces.set(name, ns);
    }
    return ns;
  }

  on(): void {
    for (const ns of this.namespaces.values()) ns.enable();
  }

  off(): void {
    for (const ns of this.namespaces.values()) ns.disable();
  }

  state(): {
    namespaces: Record<string, ReturnType<DebugNamespace["state"]>>;
    events: DebugEvent[];
    maxEvents: number;
  } {
    const namespaces: Record<string, ReturnType<DebugNamespace["state"]>> = {};
    for (const [name, ns] of this.namespaces) {
      namespaces[name] = ns.state();
    }
    return {
      namespaces,
      events: this.events.slice(),
      maxEvents: this.maxEvents,
    };
  }

  log(namespace?: string): void {
    const events = namespace
      ? this.events.filter((e) => e.namespace === namespace)
      : this.events;
    console.table(events.slice(-20));
  }

  clear(): void {
    this.events = [];
    console.log("[zt-debug] events cleared");
  }

  configure(opts: { maxEvents?: number }): void {
    if (opts.maxEvents !== undefined) {
      this.maxEvents = opts.maxEvents;
      while (this.events.length > this.maxEvents) {
        this.events.shift();
      }
    }
  }

  pushEvent(ev: DebugEvent): void {
    this.events.push(ev);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }
}

export const Debug = new DebugManager();

if (typeof window !== "undefined") {
  (window as unknown as { __ztDebug: DebugManager }).__ztDebug = Debug;
}
