import type {
  AppServerConnection,
  AppServerTransport,
  JsonObject,
  TransportClose,
} from "../src/index.js";

class AsyncQueue<T> implements AsyncIterable<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  push(value: T): void {
    if (this.#closed) throw new Error("queue is closed");
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.#values.push(value);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.#closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}

export class FakeTransport implements AppServerTransport {
  readonly kind = "fake";
  readonly sent: JsonObject[] = [];
  readonly #incoming = new AsyncQueue<unknown>();
  readonly #sentWaiters: Array<() => void> = [];
  #resolveClosed!: (close: TransportClose) => void;
  readonly #closed = new Promise<TransportClose>((resolve) => {
    this.#resolveClosed = resolve;
  });
  closeCalls = 0;

  async connect(): Promise<AppServerConnection> {
    return {
      incoming: this.#incoming,
      closed: this.#closed,
      send: async (message) => {
        this.sent.push(structuredClone(message));
        for (const wake of this.#sentWaiters.splice(0)) wake();
      },
      close: async () => {
        this.closeCalls += 1;
        this.disconnect({ clean: true, reason: "client close" });
      },
    };
  }

  receive(message: unknown): void {
    this.#incoming.push(structuredClone(message));
  }

  disconnect(close: TransportClose = { clean: false, reason: "test disconnect" }): void {
    this.#incoming.close();
    this.#resolveClosed(close);
  }

  async waitForSent(index: number): Promise<JsonObject> {
    while (this.sent.length <= index) {
      await new Promise<void>((resolve) => this.#sentWaiters.push(resolve));
    }
    return this.sent[index] as JsonObject;
  }
}
