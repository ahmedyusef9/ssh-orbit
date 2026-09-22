# Changelog

All notable changes to SSH Orbit are documented here.

## 1.0.3 - 2026-09-22

- Added automated unit tests and syntax checks.
- Hardened numeric input validation before remote shell command construction.
- Enforced directory-boundary semantics for path allowlists.
- Made heredoc delimiters collision-resistant for remote file writes.
- Bounded command timeouts to one hour or less.
- Added a deployment manual covering key generation, VM access, SCP, Cursor, and Claude Desktop.
- Added copy-ready Cursor and Claude Desktop MCP configuration examples.
- Removed machine-specific paths from public documentation.

## 1.0.0

- Initial SSH MCP server release with command execution and token-efficient file tools.
