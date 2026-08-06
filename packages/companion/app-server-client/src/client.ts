import {
  AppServerRequestError,
  ClientStateError,
  MaterializationError,
  ProtocolError,
  TransportClosedError,
} from "./errors.js";
import { EventHub } from "./event-hub.js";
import type { AppServerConnection, AppServerTransport, JsonObject, TransportClose } from "./transport.js";
import type {
  AppServerEvent,
  ClientInfo,
  ClientState,
  MaterializedThread,
  MaterializeOptions,
  ServerIdentity,
  StableUserInput,
  StartThreadOptions,
  StartTurnOptions,
  SteerTurnOptions,
  ThreadHandle,
  ThreadState,
  TurnCompletion,
  TurnRun,
} from "./types.js";
import {
  isRecord,
  parseServerIdentity,
  parseSteerResult,
  parseThreadId,
  parseThreadStartedNotification,
  parseTurn,
  parseTurnCompletedNotification,
  parseTurnStartedNotification,
  requireRecord,
  requireString,
  serializeInputs,
} from "./wire.js";

interface PendingRequest {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

interface InFlightTurnStart {
  observedTurnId?: string;
}

const MAX_DETAILED_TERMINAL_TURNS = 64;

export interface AppServerClientOptions {
  readonly transport: AppServerTransport;
  readonly clientInfo: ClientInfo;
  readonly requestIdPrefix?: string;
}

export interface AppServerClient {
  readonly state: ClientState;
  events(): AsyncIterable<AppServerEvent>;
  getThreadState(threadId: string): ThreadState | undefined;
  initialize(): Promise<ServerIdentity>;
  startThread(options?: StartThreadOptions): Promise<ThreadHandle>;
  resumeThread(threadId: string): Promise<ThreadHandle>;
  materialize(options: MaterializeOptions): Promise<MaterializedThread>;
  startTurn(options: StartTurnOptions): Promise<TurnRun>;
  steerTurn(options: SteerTurnOptions): Promise<{ readonly turnId: string }>;
  interruptTurn(threadId: string, turnId: string): Promise<TurnCompletion>;
  close(): Promise<void>;
}

export function createAppServerClient(options: AppServerClientOptions): AppServerClient {
  return new DefaultAppServerClient(options);
}

class DefaultAppServerClient implements AppServerClient {
  #state: ClientState = "new";
  #connection: AppServerConnection | null = null;
  #initializePromise: Promise<ServerIdentity> | null = null;
  #closePromise: Promise<void> | null = null;
  #failureHandled = false;
  #nextRequest = 0;
  readonly #requestPrefix: string;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #turnWaiters = new Map<string, Deferred<TurnCompletion>>();
  readonly #terminalTurns = new Map<string, TurnCompletion>();
  // One bit per already-tracked thread preserves fail-closed behavior without
  // retaining every evicted turn ID or completion payload.
  readonly #threadsWithTruncatedTerminalHistory = new Set<string>();
  readonly #threadStates = new Map<string, ThreadState>();
  readonly #locallyStartingThreads = new Map<string, InFlightTurnStart>();
  readonly #events = new EventHub<AppServerEvent>();

  constructor(private readonly options: AppServerClientOptions) {
    this.#requestPrefix = options.requestIdPrefix ?? `companion-${crypto.randomUUID()}`;
  }

  get state(): ClientState {
    return this.#state;
  }

  events(): AsyncIterable<AppServerEvent> {
    return this.#events.stream();
  }

  getThreadState(threadId: string): ThreadState | undefined {
    return this.#threadStates.get(threadId);
  }

  initialize(): Promise<ServerIdentity> {
    if (this.#initializePromise) return this.#initializePromise;
    if (this.#state !== "new") {
      return Promise.reject(new ClientStateError(`cannot initialize client in ${this.#state} state`));
    }
    this.#initializePromise = this.#doInitialize();
    return this.#initializePromise;
  }

  async #doInitialize(): Promise<ServerIdentity> {
    this.#state = "initializing";
    try {
      const connection = await this.options.transport.connect();
      this.#connection = connection;
      void this.#readIncoming(connection);
      void connection.closed.then((close) => this.#handleTransportClosed(close));

      const result = await this.#request("initialize", {
        clientInfo: {
          name: this.options.clientInfo.name,
          title: this.options.clientInfo.title ?? null,
          version: this.options.clientInfo.version,
        },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
        },
      });
      const identity = parseServerIdentity(result);
      await connection.send({ method: "initialized", params: {} });
      this.#state = "ready";
      return identity;
    } catch (error) {
      await this.#fail(error);
      throw error;
    }
  }

  async startThread(options: StartThreadOptions = {}): Promise<ThreadHandle> {
    this.#assertReady();
    const params: JsonObject = { ephemeral: false };
    if (options.cwd !== undefined) params.cwd = options.cwd;
    if (options.model !== undefined) params.model = options.model;
    if (options.approvalPolicy !== undefined) params.approvalPolicy = options.approvalPolicy;
    if (options.sandbox !== undefined) params.sandbox = options.sandbox;
    if (options.developerInstructions !== undefined) {
      params.developerInstructions = options.developerInstructions;
    }
    const result = await this.#request("thread/start", params);
    const threadId = parseThreadId(result, "thread/start result");
    this.#markThreadMaterialized(threadId, false);
    return { threadId, materialized: false };
  }

  async resumeThread(threadId: string): Promise<ThreadHandle> {
    this.#assertReady();
    requireString(threadId, "threadId");
    const result = await this.#request("thread/resume", { threadId });
    const resumedId = parseThreadId(result, "thread/resume result");
    if (resumedId !== threadId) {
      throw new ProtocolError(`thread/resume returned ${resumedId}, expected ${threadId}`);
    }
    this.#markThreadMaterialized(threadId, true);
    return { threadId, materialized: true };
  }

  async materialize(options: MaterializeOptions): Promise<MaterializedThread> {
    const thread = await this.startThread(options);
    const run = await this.startTurn({ threadId: thread.threadId, input: options.firstInput });
    const completion = await run.completion;
    if (completion.status !== "completed") throw new MaterializationError(completion);
    this.#markThreadMaterialized(thread.threadId, true);
    return { threadId: thread.threadId, materialized: true, firstTurn: completion };
  }

  async startTurn(options: StartTurnOptions): Promise<TurnRun> {
    this.#assertReady();
    requireString(options.threadId, "threadId");
    const current = this.#threadStates.get(options.threadId);
    if (this.#locallyStartingThreads.has(options.threadId)) {
      throw new ClientStateError(
        `thread ${options.threadId} already has a turn/start request in flight`,
      );
    }
    if (current?.type === "active") {
      throw new ClientStateError(
        `thread ${options.threadId} already has active turn ${current.turnId}`,
      );
    }
    const inFlight: InFlightTurnStart = {};
    this.#locallyStartingThreads.set(options.threadId, inFlight);
    try {
      const result = await this.#request("turn/start", {
        threadId: options.threadId,
        input: serializeInputs(options.input),
      });
      const turn = parseTurn(result, "turn/start result");
      if (turn.status !== "inProgress") {
        throw new ProtocolError("turn/start result.turn.status must be inProgress");
      }
      if (inFlight.observedTurnId !== undefined && inFlight.observedTurnId !== turn.id) {
        const error = new ProtocolError(
          `turn/start returned ${turn.id} after observing ${inFlight.observedTurnId} for thread ${options.threadId}`,
        );
        await this.#fail(error);
        throw error;
      }
      const previous = this.#threadStates.get(options.threadId);
      if (previous?.type === "active" && previous.turnId !== turn.id) {
        const error = new ProtocolError(
          `turn/start returned ${turn.id} while thread ${options.threadId} has active turn ${previous.turnId}`,
        );
        await this.#fail(error);
        throw error;
      }
      const materialized = previous?.type === "idle" || previous?.type === "active"
        ? previous.materialized
        : false;
      if (!this.#terminalTurns.has(turnKey(options.threadId, turn.id))) {
        this.#threadStates.set(options.threadId, {
          type: "active",
          threadId: options.threadId,
          turnId: turn.id,
          owner: "local",
          materialized,
        });
      }
      return {
        threadId: options.threadId,
        turnId: turn.id,
        completion: this.#waitForTurn(options.threadId, turn.id),
      };
    } finally {
      this.#locallyStartingThreads.delete(options.threadId);
    }
  }

  async steerTurn(options: SteerTurnOptions): Promise<{ readonly turnId: string }> {
    this.#assertReady();
    const state = this.#threadStates.get(options.threadId);
    if (state?.type !== "active") {
      throw new ClientStateError(`thread ${options.threadId} has no observed active turn`);
    }
    if (state.turnId !== options.expectedTurnId) {
      throw new ClientStateError(
        `active turn is ${state.turnId}, not ${options.expectedTurnId}`,
      );
    }
    const result = await this.#request("turn/steer", {
      threadId: options.threadId,
      expectedTurnId: options.expectedTurnId,
      input: serializeInputs(options.input),
    });
    const turnId = parseSteerResult(result);
    if (turnId !== options.expectedTurnId) {
      throw new ProtocolError(`turn/steer returned ${turnId}, expected ${options.expectedTurnId}`);
    }
    return { turnId };
  }

  async interruptTurn(threadId: string, turnId: string): Promise<TurnCompletion> {
    this.#assertReady();
    const state = this.#threadStates.get(threadId);
    if (state?.type !== "active" || state.turnId !== turnId) {
      throw new ClientStateError(`turn ${turnId} is not the observed active turn for ${threadId}`);
    }
    const completion = this.#waitForTurn(threadId, turnId);
    // The request and terminal waiter are both rejected on disconnect. Attach a
    // handler immediately so the waiter cannot become an orphan if the request
    // rejection wins the race.
    void completion.catch(() => undefined);
    const result = await this.#request("turn/interrupt", { threadId, turnId });
    requireRecord(result, "turn/interrupt result");
    return completion;
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closePromise = this.#doClose();
    return this.#closePromise;
  }

  async #doClose(): Promise<void> {
    if (this.#state === "closed") return;
    this.#state = "closing";
    this.#rejectOutstanding(new TransportClosedError("App Server client closed"));
    try {
      await this.#connection?.close();
    } finally {
      this.#state = "closed";
      this.#events.close();
    }
  }

  #assertReady(): void {
    if (this.#state !== "ready") {
      throw new ClientStateError(`client is not ready (state: ${this.#state})`);
    }
  }

  #request(method: string, params: JsonObject): Promise<unknown> {
    const connection = this.#connection;
    if (!connection) return Promise.reject(new ClientStateError("transport is not connected"));
    const id = `${this.#requestPrefix}:${++this.#nextRequest}`;
    const deferred = createDeferred<unknown>();
    this.#pending.set(id, { method, resolve: deferred.resolve, reject: deferred.reject });
    void connection.send({ method, id, params }).catch((error) => {
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      pending.reject(error);
    });
    return deferred.promise;
  }

  async #readIncoming(connection: AppServerConnection): Promise<void> {
    try {
      for await (const message of connection.incoming) this.#handleMessage(message);
      if (this.#state !== "closing" && this.#state !== "closed") {
        await this.#handleTransportClosed(await connection.closed);
      }
    } catch (error) {
      await this.#fail(error);
    }
  }

  #handleMessage(value: unknown): void {
    const message = requireRecord(value, "App Server message");
    const hasMethod = typeof message.method === "string";
    const hasId = typeof message.id === "string" || typeof message.id === "number";
    if (hasMethod && hasId) {
      this.#handleServerRequest(message as JsonObject & { method: string; id: string | number });
      return;
    }
    if (hasMethod) {
      this.#handleNotification(message.method as string, message.params);
      return;
    }
    if (hasId) {
      this.#handleResponse(message as JsonObject & { id: string | number });
      return;
    }
    throw new ProtocolError("App Server message must be a request, response, or notification");
  }

  #handleResponse(message: JsonObject & { id: string | number }): void {
    const pending = this.#pending.get(String(message.id));
    if (!pending) {
      this.#events.emit({ type: "unknown-response", id: message.id });
      return;
    }
    this.#pending.delete(String(message.id));
    const hasResult = Object.hasOwn(message, "result");
    const hasError = Object.hasOwn(message, "error");
    if (hasResult === hasError) {
      pending.reject(new ProtocolError(`response for ${pending.method} must contain exactly one of result or error`));
      return;
    }
    if (hasError) {
      try {
        const error = requireRecord(message.error, `${pending.method} error`);
        if (typeof error.code !== "number") throw new ProtocolError(`${pending.method} error.code must be a number`);
        pending.reject(
          new AppServerRequestError(
            pending.method,
            error.code,
            requireString(error.message, `${pending.method} error.message`),
            error.data,
          ),
        );
      } catch (error) {
        pending.reject(error);
      }
      return;
    }
    pending.resolve(message.result);
  }

  #handleServerRequest(message: JsonObject & { method: string; id: string | number }): void {
    this.#events.emit({ type: "unsupported-server-request", method: message.method });
    void this.#connection?.send({
      id: message.id,
      error: { code: -32601, message: `Client does not support server request: ${message.method}` },
    });
  }

  #handleNotification(method: string, params: unknown): void {
    switch (method) {
      case "thread/started": {
        const threadId = parseThreadStartedNotification(params);
        if (!this.#threadStates.has(threadId)) {
          this.#threadStates.set(threadId, { type: "unmaterialized", threadId });
        }
        this.#events.emit({ type: "thread-started", threadId });
        return;
      }
      case "turn/started": {
        const { threadId, turnId } = parseTurnStartedNotification(params);
        const previous = this.#threadStates.get(threadId);
        if (this.#terminalTurns.has(turnKey(threadId, turnId))) {
          throw new ProtocolError(
            `turn/started observed terminal turn ${turnId} for thread ${threadId}`,
          );
        }
        if (previous?.type === "active" && previous.turnId !== turnId) {
          throw new ProtocolError(
            `turn/started for ${turnId} conflicts with active turn ${previous.turnId} on thread ${threadId}`,
          );
        }
        const inFlight = this.#locallyStartingThreads.get(threadId);
        this.#observeInFlightTurn(threadId, turnId, inFlight);
        const owner = previous?.type === "active"
          ? previous.owner
          : inFlight === undefined ? "external" : "unknown";
        const materialized = previous?.type === "idle" || previous?.type === "active"
          ? previous.materialized
          : false;
        this.#threadStates.set(threadId, {
          type: "active",
          threadId,
          turnId,
          owner,
          materialized,
        });
        this.#events.emit({ type: "turn-started", threadId, turnId, owner });
        return;
      }
      case "turn/completed": {
        const completion = parseTurnCompletedNotification(params);
        const recorded = this.#terminalTurns.get(
          turnKey(completion.threadId, completion.turnId),
        );
        if (recorded !== undefined) {
          if (recorded.status === completion.status && recorded.error === completion.error) {
            return;
          }
          throw new ProtocolError(
            `turn/completed for ${completion.turnId} on thread ${completion.threadId} contradicts recorded terminal completion`,
          );
        }
        const previous = this.#threadStates.get(completion.threadId);
        if (previous?.type === "active" && previous.turnId !== completion.turnId) {
          throw new ProtocolError(
            `turn/completed for ${completion.turnId} conflicts with active turn ${previous.turnId} on thread ${completion.threadId}`,
          );
        }
        if (
          previous?.type !== "active"
          && this.#threadsWithTruncatedTerminalHistory.has(completion.threadId)
        ) {
          throw new ProtocolError(
            `turn/completed for ${completion.turnId} on thread ${completion.threadId} is ambiguous because terminal history is truncated`,
          );
        }
        this.#observeInFlightTurn(
          completion.threadId,
          completion.turnId,
          this.#locallyStartingThreads.get(completion.threadId),
        );
        this.#rememberCompletion(completion);
        const wasMaterialized = previous?.type === "idle" || previous?.type === "active"
          ? previous.materialized
          : false;
        if (completion.status === "completed" || wasMaterialized) {
          this.#threadStates.set(completion.threadId, {
            type: "idle",
            threadId: completion.threadId,
            materialized: true,
          });
        } else {
          this.#threadStates.set(completion.threadId, {
            type: "unmaterialized",
            threadId: completion.threadId,
          });
        }
        this.#events.emit({ type: "turn-completed", completion });
        return;
      }
      case "item/agentMessage/delta": {
        const value = requireRecord(params, "item/agentMessage/delta params");
        this.#events.emit({
          type: "agent-message-delta",
          threadId: requireString(value.threadId, "item/agentMessage/delta params.threadId"),
          turnId: requireString(value.turnId, "item/agentMessage/delta params.turnId"),
          itemId: requireString(value.itemId, "item/agentMessage/delta params.itemId"),
          delta: typeof value.delta === "string"
            ? value.delta
            : (() => { throw new ProtocolError("item/agentMessage/delta params.delta must be a string"); })(),
        });
        return;
      }
      case "error": {
        const value = requireRecord(params, "error params");
        const error = requireRecord(value.error, "error params.error");
        if (typeof value.willRetry !== "boolean") {
          throw new ProtocolError("error params.willRetry must be a boolean");
        }
        this.#events.emit({
          type: "server-error",
          threadId: requireString(value.threadId, "error params.threadId"),
          turnId: requireString(value.turnId, "error params.turnId"),
          message: requireString(error.message, "error params.error.message"),
          willRetry: value.willRetry,
        });
        return;
      }
      default:
        this.#events.emit({ type: "unknown-notification", method, params });
    }
  }

  #waitForTurn(threadId: string, turnId: string): Promise<TurnCompletion> {
    const key = turnKey(threadId, turnId);
    const cached = this.#terminalTurns.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.#turnWaiters.get(key);
    if (existing) return existing.promise;
    const waiter = createDeferred<TurnCompletion>();
    this.#turnWaiters.set(key, waiter);
    return waiter.promise;
  }

  #markThreadMaterialized(threadId: string, materialized: boolean): void {
    const current = this.#threadStates.get(threadId);
    if (current?.type === "active" || current?.type === "idle") {
      if (materialized && !current.materialized) {
        this.#threadStates.set(threadId, { ...current, materialized: true });
      }
      return;
    }
    if (current?.type === "detached") return;
    this.#threadStates.set(
      threadId,
      materialized
        ? { type: "idle", threadId, materialized: true }
        : { type: "unmaterialized", threadId },
    );
  }

  #observeInFlightTurn(
    threadId: string,
    turnId: string,
    inFlight: InFlightTurnStart | undefined,
  ): void {
    if (inFlight === undefined) return;
    if (inFlight.observedTurnId !== undefined && inFlight.observedTurnId !== turnId) {
      throw new ProtocolError(
        `observed turn ${turnId} after ${inFlight.observedTurnId} during turn/start for thread ${threadId}`,
      );
    }
    inFlight.observedTurnId = turnId;
  }

  #rememberCompletion(completion: TurnCompletion): void {
    const key = turnKey(completion.threadId, completion.turnId);
    this.#terminalTurns.set(key, completion);
    while (this.#terminalTurns.size > MAX_DETAILED_TERMINAL_TURNS) {
      const oldest = this.#terminalTurns.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = this.#terminalTurns.get(oldest);
      this.#terminalTurns.delete(oldest);
      if (evicted !== undefined) {
        this.#threadsWithTruncatedTerminalHistory.add(evicted.threadId);
      }
    }
    const waiter = this.#turnWaiters.get(key);
    if (waiter) {
      this.#turnWaiters.delete(key);
      waiter.resolve(completion);
    }
  }

  async #handleTransportClosed(close: TransportClose): Promise<void> {
    if (this.#state === "closing" || this.#state === "closed" || this.#failureHandled) return;
    this.#failureHandled = true;
    const error = new TransportClosedError(close.reason ?? "App Server transport closed", {
      cause: close.cause,
    });
    for (const [threadId] of this.#threadStates) {
      this.#threadStates.set(threadId, { type: "detached", threadId, reason: error.message });
    }
    this.#state = "failed";
    this.#rejectOutstanding(error);
    this.#events.emit({ type: "transport-closed", clean: close.clean, reason: close.reason });
    this.#events.close();
  }

  async #fail(reason: unknown): Promise<void> {
    if (this.#failureHandled || this.#state === "closing" || this.#state === "closed") return;
    this.#failureHandled = true;
    const error = reason instanceof Error ? reason : new ProtocolError(String(reason));
    this.#state = "failed";
    this.#rejectOutstanding(error);
    this.#events.emit({ type: "protocol-error", message: error.message });
    this.#events.close();
    try {
      await this.#connection?.close();
    } catch {
      // The original protocol/transport failure remains authoritative.
    }
  }

  #rejectOutstanding(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    for (const waiter of this.#turnWaiters.values()) waiter.reject(error);
    this.#turnWaiters.clear();
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function turnKey(threadId: string, turnId: string): string {
  return `${threadId}:${turnId}`;
}
