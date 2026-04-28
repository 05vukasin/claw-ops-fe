/**
 * Generic factory for module-level singleton stores backed by useSyncExternalStore.
 *
 * Eliminates the boilerplate listeners Set + notify + subscribe + getSnapshot pattern
 * that every singleton store (use-agents, use-claude-accounts, use-github-accounts)
 * previously repeated verbatim.
 *
 * Usage:
 *   const store = createExternalStore<MyState[]>([]);
 *
 *   // Read current state (outside React):
 *   store.getState()
 *
 *   // Write state and notify all subscribers:
 *   store.setState(newValue)
 *
 *   // Wire into React:
 *   useSyncExternalStore(store.subscribe, store.getSnapshot, () => initialValue)
 *
 *   // Notify without replacing state (e.g. after an in-place mutation):
 *   store.notify()
 */
export function createExternalStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): T {
      return state;
    },

    getState(): T {
      return state;
    },

    setState(next: T): void {
      state = next;
      notify();
    },

    /** Trigger a re-render without replacing state (useful after targeted mutations). */
    notify,
  };
}
