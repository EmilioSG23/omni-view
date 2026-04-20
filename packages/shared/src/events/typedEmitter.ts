// ─── TypedEventEmitter ────────────────────────────────────────────────────────

type Listener<T> = (payload: T) => void;

/**
 * Lightweight, generic event emitter typed against an event-map interface.
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   ready: { timestamp: number };
 *   error: Error;
 * }
 *
 * const emitter = new TypedEventEmitter<MyEvents>();
 *
 * const off = emitter.on("ready", ({ timestamp }) => console.log(timestamp));
 * emitter.emit("ready", { timestamp: Date.now() });
 * off(); // unsubscribe
 * ```
 */
export class TypedEventEmitter<E extends { [K in keyof E]: unknown }> {
	private readonly listeners: Partial<{ [K in keyof E]: Set<Listener<E[K]>> }> = {};

	/**
	 * Subscribe to an event.  Returns an `off` function that removes the listener
	 * when called (useful for React `useEffect` cleanup).
	 */
	on<K extends keyof E>(event: K, cb: Listener<E[K]>): () => void {
		if (!this.listeners[event]) {
			(this.listeners as unknown as Record<K, Set<Listener<E[K]>>>)[event] = new Set();
		}
		(this.listeners[event] as Set<Listener<E[K]>>).add(cb);
		return () => this.off(event, cb);
	}

	/** Remove a previously registered listener. */
	off<K extends keyof E>(event: K, cb: Listener<E[K]>): void {
		(this.listeners[event] as Set<Listener<E[K]>> | undefined)?.delete(cb);
	}

	/** Remove all listeners for a given event (or all events if none given). */
	offAll<K extends keyof E>(event?: K): void {
		if (event !== undefined) {
			delete this.listeners[event];
		} else {
			for (const key in this.listeners) {
				delete this.listeners[key];
			}
		}
	}

	/** Subscribe to an event once; the listener auto-removes after the first call. */
	once<K extends keyof E>(event: K, cb: Listener<E[K]>): () => void {
		const off = this.on(event, (payload) => {
			off();
			cb(payload);
		});
		return off;
	}

	/** Emit an event, synchronously calling all registered listeners. */
	emit<K extends keyof E>(event: K, payload: E[K]): void {
		(this.listeners[event] as Set<Listener<E[K]>> | undefined)?.forEach((l) => l(payload));
	}

	/** Returns `true` if there is at least one listener registered for the event. */
	hasListeners<K extends keyof E>(event: K): boolean {
		const set = this.listeners[event] as Set<Listener<E[K]>> | undefined;
		return set !== undefined && set.size > 0;
	}
}
