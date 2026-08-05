"""Deterministic stdio MCP fixture for the ADK 2.4 capability matrix."""

from mcp.server.fastmcp import FastMCP


server = FastMCP("af-skills-vnext-adk24")


@server.tool()
def local_echo(value: str) -> dict[str, str]:
  """Return a synthetic value without network or model access."""

  return {"echo": value}


@server.tool()
def hidden_tool(value: str) -> dict[str, str]:
  """Exist only to verify exact tool filtering."""

  return {"hidden": value}


if __name__ == "__main__":
  server.run(transport="stdio")
