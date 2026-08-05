# Codex App Server client

A small, transport-neutral TypeScript client for the Codex `0.146.0` App
Server non-experimental protocol subset.

The package owns protocol handshake, request correlation, thread/turn state,
and lifecycle event validation. It does **not** spawn Codex, open sockets, own
Unix socket files, control MCP, or know about Agent Factory, HTTP, or React.

## Supported surface

- `initialize` followed by `initialized`
- `thread/start` and exact-ID `thread/resume`
- `turn/start`, exact-active-turn `turn/steer`, and `turn/interrupt`
- `materialize()`: start a non-ephemeral thread and wait for its first terminal
  `turn/completed`
- normalized thread, turn, text-delta, and error events
- observation of turns started by another client on the same App Server

Unknown notifications are forwarded for compatibility. Malformed lifecycle
notifications fail the connection closed. Server-initiated requests are never
approved automatically; the client replies with JSON-RPC error `-32601`.

Detailed terminal completions are retained for the newest 64 turns. When an
older completion is evicted, the client keeps one truncation tombstone for that
thread. Later terminal notifications on that thread must match either a cached
completion or the exact observed active turn; otherwise the connection fails
closed instead of accepting an ambiguous post-eviction outcome.

## Transport boundary

```ts
import type { AppServerTransport } from "@agent-factory/codex-app-server-client";

const transport: AppServerTransport = {
  kind: "unix-websocket",
  async connect() {
    return {
      incoming,
      closed,
      send: async (message) => sendFrame(message),
      close: async () => closeSocket(),
    };
  },
};
```

`incoming` yields already-parsed JSON values. A stdio adapter would own JSONL
framing; a Unix adapter would own the WebSocket handshake and text framing.

## Compatibility

App Server and its remote transports are experimental. This package deliberately
pins Codex CLI `0.146.0`, sends `experimentalApi: false`, and exposes no generic
`request(method, params)` escape hatch. See
`schemas/codex-0.146.0/manifest.json` for the generated schema hash and supported
methods. Upgrade by regenerating the installed CLI schema, reviewing its diff,
updating codecs/tests, and then changing the manifest.

The pin hashes exactly the generated non-experimental v2 bundle
`codex_app_server_protocol.v2.schemas.json`, not the output directory or the
legacy bundle. Codex 0.146.0 does not emit that bundle with stable object-key
order, so the verifier parses it as JSON, recursively sorts object keys
lexicographically while preserving array order, serializes the result as
compact UTF-8 JSON, and hashes those bytes. Reproduce it with an installed
`codex-cli 0.146.0`:

```bash
npm run verify:schema
```

That command checks the CLI version, regenerates with
`codex app-server generate-json-schema --out <temp-dir>` (without
`--experimental`), and compares the generated file's SHA-256 with the
manifest. It does not start App Server or require authentication. No default
test starts Codex or performs an authenticated request.
