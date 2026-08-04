interface Subscriber<T> {
  queue: T[];
  waiters: Array<(result: IteratorResult<T>) => void>;
  returned: boolean;
}

/** A tiny fan-out stream; late subscribers intentionally receive future events only. */
export class EventHub<T> {
  readonly #subscribers = new Set<Subscriber<T>>();
  #closed = false;

  stream(): AsyncIterable<T> {
    const subscriber: Subscriber<T> = { queue: [], waiters: [], returned: false };
    this.#subscribers.add(subscriber);
    const hub = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            if (subscriber.returned) {
              return Promise.resolve({ done: true, value: undefined });
            }
            if (subscriber.queue.length > 0) {
              const queued = subscriber.queue.shift() as T;
              return Promise.resolve({ done: false, value: queued });
            }
            if (hub.#closed) {
              return Promise.resolve({ done: true, value: undefined });
            }
            return new Promise((resolve) => {
              subscriber.waiters.push(resolve);
            });
          },
          return(): Promise<IteratorResult<T>> {
            if (subscriber.returned) {
              return Promise.resolve({ done: true, value: undefined });
            }
            subscriber.returned = true;
            hub.#subscribers.delete(subscriber);
            subscriber.queue.length = 0;
            for (const waiter of subscriber.waiters.splice(0)) {
              waiter({ done: true, value: undefined });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  emit(value: T): void {
    if (this.#closed) return;
    for (const subscriber of this.#subscribers) {
      const waiter = subscriber.waiters.shift();
      if (waiter) {
        waiter({ done: false, value });
      } else {
        subscriber.queue.push(value);
      }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const subscriber of this.#subscribers) {
      for (const waiter of subscriber.waiters.splice(0)) {
        waiter({ done: true, value: undefined });
      }
    }
    this.#subscribers.clear();
  }
}
