export type JsonObject = Record<string, unknown>;

export interface TransportClose {
  readonly clean: boolean;
  readonly reason?: string;
  readonly cause?: unknown;
}

/**
 * A connected message channel. Parsing and framing belong to the transport;
 * request correlation and protocol semantics belong to AppServerClient.
 */
export interface AppServerConnection {
  readonly incoming: AsyncIterable<unknown>;
  readonly closed: Promise<TransportClose>;

  send(message: JsonObject): Promise<void>;
  close(): Promise<void>;
}

/**
 * Transport-neutral connection factory. Implementations may use stdio, a Unix
 * WebSocket, or an in-memory test channel without changing the client.
 */
export interface AppServerTransport {
  readonly kind: string;
  connect(): Promise<AppServerConnection>;
}
