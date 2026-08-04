export type ClientState =
  | "new"
  | "initializing"
  | "ready"
  | "closing"
  | "closed"
  | "failed";

export interface ClientInfo {
  readonly name: string;
  readonly title?: string;
  readonly version: string;
}

export interface ServerIdentity {
  readonly userAgent: string;
  readonly codexHome: string;
  readonly platformFamily: string;
  readonly platformOs: string;
}

export type ApprovalPolicy = "untrusted" | "on-request" | "never";
export type SandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export type StableUserInput =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string }
  | { readonly type: "localImage"; readonly path: string };

export interface StartThreadOptions {
  readonly cwd?: string;
  readonly model?: string;
  readonly approvalPolicy?: ApprovalPolicy;
  readonly sandbox?: SandboxMode;
  readonly developerInstructions?: string;
}

export interface MaterializeOptions extends StartThreadOptions {
  readonly firstInput: readonly StableUserInput[];
}

export interface ThreadHandle {
  readonly threadId: string;
  readonly materialized: boolean;
}

export interface MaterializedThread extends ThreadHandle {
  readonly materialized: true;
  readonly firstTurn: TurnCompletion;
}

export interface StartTurnOptions {
  readonly threadId: string;
  readonly input: readonly StableUserInput[];
}

export interface SteerTurnOptions extends StartTurnOptions {
  readonly expectedTurnId: string;
}

export interface TurnRun {
  readonly threadId: string;
  readonly turnId: string;
  readonly completion: Promise<TurnCompletion>;
}

export type TerminalTurnStatus = "completed" | "interrupted" | "failed";

export interface TurnCompletion {
  readonly threadId: string;
  readonly turnId: string;
  readonly status: TerminalTurnStatus;
  readonly error: string | null;
}

export type ThreadState =
  | { readonly type: "unmaterialized"; readonly threadId: string }
  | { readonly type: "idle"; readonly threadId: string; readonly materialized: boolean }
  | {
      readonly type: "active";
      readonly threadId: string;
      readonly turnId: string;
      readonly owner: "local" | "external" | "unknown";
      readonly materialized: boolean;
    }
  | { readonly type: "detached"; readonly threadId: string; readonly reason: string };

export type AppServerEvent =
  | { readonly type: "thread-started"; readonly threadId: string }
  | {
      readonly type: "turn-started";
      readonly threadId: string;
      readonly turnId: string;
      readonly owner: "local" | "external" | "unknown";
    }
  | { readonly type: "turn-completed"; readonly completion: TurnCompletion }
  | {
      readonly type: "agent-message-delta";
      readonly threadId: string;
      readonly turnId: string;
      readonly itemId: string;
      readonly delta: string;
    }
  | {
      readonly type: "server-error";
      readonly threadId: string;
      readonly turnId: string;
      readonly message: string;
      readonly willRetry: boolean;
    }
  | { readonly type: "unknown-notification"; readonly method: string; readonly params: unknown }
  | { readonly type: "unknown-response"; readonly id: string | number }
  | { readonly type: "unsupported-server-request"; readonly method: string }
  | { readonly type: "protocol-error"; readonly message: string }
  | { readonly type: "transport-closed"; readonly clean: boolean; readonly reason?: string };
