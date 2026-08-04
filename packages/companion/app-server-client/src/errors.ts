import type { TurnCompletion } from "./types.js";

export class AppServerClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ClientStateError extends AppServerClientError {}

export class ProtocolError extends AppServerClientError {}

export class TransportClosedError extends AppServerClientError {}

export class AppServerRequestError extends AppServerClientError {
  constructor(
    public readonly method: string,
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(`${method} failed (${code}): ${message}`);
  }
}

export class MaterializationError extends AppServerClientError {
  constructor(public readonly completion: TurnCompletion) {
    super(
      `Thread ${completion.threadId} was not materialized: first turn ${completion.turnId} ended with ${completion.status}`,
    );
  }
}
