# Companion Graph Control Server

The single-writer, project-contained Graph workspace. It owns atomic Graph and
sidecar persistence, reconciliation of direct file edits, a serialized mutation
queue, Context v2 publication, and the loopback HTTP/SSE control API.
