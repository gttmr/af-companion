#!/usr/bin/env python3
"""Localhost-only MCP HTTP fixture for exact ADK 2.4 transport probes."""

from __future__ import annotations

import argparse

from mcp.server.fastmcp import FastMCP
import uvicorn


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--transport", choices=("streamable_http", "sse"), required=True)
  parser.add_argument("--port", type=int, required=True)
  args = parser.parse_args()

  server = FastMCP(
      f"af-{args.transport}",
      stateless_http=args.transport == "streamable_http",
  )

  @server.tool()
  def http_echo(value: str) -> dict[str, str]:
    return {"echo": value, "transport": args.transport}

  app = (
      server.streamable_http_app()
      if args.transport == "streamable_http"
      else server.sse_app()
  )
  uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="error")


if __name__ == "__main__":
  main()
