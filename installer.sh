#!/usr/bin/env bash
# SSH Orbit - Simple Team Installer (single script)
#
# Goal: 1 command to install + (optional) generate Cursor MCP config.
# - Proxy is optional (enabled only if you pass --proxy or have HTTP(S)_PROXY set)
# - Cursor `env` config is OPTIONAL (you can omit it entirely)
#
# Copyright (c) 2025 Ahmad Abo Alhija
# License: MIT

set -euo pipefail

DEFAULT_SERVER_NAME="ssh-orbit"

usage() {
  cat <<'EOF'
SSH Orbit Installer (simple)

Usage:
  ./installer.sh [options]

Options:
  --tgz <path>              Install from a local .tgz (recommended for teams/offline)
                            Default: auto-detect ./ssh-orbit-*.tgz if present; otherwise install from current directory (.)
  --proxy <url>             Use an HTTP(S) proxy for npm downloads (ex: http://127.0.0.1:8080)
  --no-proxy                Do not set any proxy env vars
  --cursor                  (Optional) write Cursor global MCP config to: %USERPROFILE%\.cursor\mcp.json (Windows) or ~/.cursor/mcp.json (mac/Linux)
  --name <serverName>       MCP server name in mcp.json (default: ssh-orbit)

  # OPTIONAL env settings (only written to mcp.json if provided)
  --allowed-targets <csv>   Sets SSH_ORBIT_ALLOWED_TARGETS (recommended for security but NOT required)
  --allowed-paths <csv>     Sets SSH_ORBIT_ALLOWED_PATH_PREFIXES (optional)
  --key-path <path>         Sets SSH_PRIVATE_KEY_PATH (optional; auto-discovery works too)

Examples:
  ./installer.sh --tgz ./ssh-orbit-1.0.3.tgz --cursor
  ./installer.sh --cursor --allowed-targets "ubuntu@host1,host2:22"
EOF
}

have() { command -v "$1" >/dev/null 2>&1; }

is_windows_git_bash() {
  case "${OSTYPE-}" in
    msys*|cygwin*|win32*) return 0 ;;
    *) return 1 ;;
  esac
}

escape_json_string() {
  # Escapes backslashes and double-quotes for JSON strings.
  # shellcheck disable=SC2001
  echo "$1" | sed 's/\\/\\\\/g; s/\"/\\"/g'
}

cursor_config_path() {
  # Windows: %USERPROFILE%\.cursor\mcp.json
  # mac/Linux: ~/.cursor/mcp.json
  if is_windows_git_bash; then
    local up_win="${USERPROFILE-}"
    if [[ -n "$up_win" ]] && have cygpath; then
      local up_posix
      up_posix="$(cygpath -u "$up_win" 2>/dev/null || echo "")"
      if [[ -n "$up_posix" ]]; then
        echo "${up_posix}/.cursor/mcp.json"
        return 0
      fi
    fi
    # Fallback: best-effort
    echo "${HOME}/.cursor/mcp.json"
    return 0
  fi

  echo "${HOME}/.cursor/mcp.json"
}

ensure_node_npm() {
  if ! have node; then
    echo "ERROR: node is not installed or not in PATH (need Node.js >= 18)"
    exit 1
  fi
  if ! have npm; then
    echo "ERROR: npm is not installed or not in PATH"
    exit 1
  fi

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "${node_major}" -lt 18 ]]; then
    echo "ERROR: Node.js version $(node -v) is too old (need >= 18)"
    exit 1
  fi
}

PROXY=""
USE_PROXY="auto"
TGZ_PATH=""
WRITE_CURSOR=false
SERVER_NAME="$DEFAULT_SERVER_NAME"
ALLOWED_TARGETS=""
ALLOWED_PATHS=""
KEY_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --tgz) TGZ_PATH="${2-}"; shift 2 ;;
    --proxy) PROXY="${2-}"; USE_PROXY="yes"; shift 2 ;;
    --no-proxy) USE_PROXY="no"; shift ;;
    --cursor) WRITE_CURSOR=true; shift ;;
    --name) SERVER_NAME="${2-}"; shift 2 ;;
    --allowed-targets) ALLOWED_TARGETS="${2-}"; shift 2 ;;
    --allowed-paths) ALLOWED_PATHS="${2-}"; shift 2 ;;
    --key-path) KEY_PATH="${2-}"; shift 2 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

ensure_node_npm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -z "$TGZ_PATH" ]]; then
  # Try to find a local tgz in the same directory (team share scenario)
  TGZ_PATH="$(ls -1 ./ssh-orbit-*.tgz 2>/dev/null | head -n 1 || true)"
fi

INSTALL_SOURCE="."
if [[ -n "$TGZ_PATH" ]]; then
  INSTALL_SOURCE="$TGZ_PATH"
fi

# Use proxy only if explicitly requested OR already present in env OR auto-detected via default proxy (safe).
if [[ "$USE_PROXY" == "yes" ]]; then
  if [[ -z "${PROXY}" ]]; then
    echo "ERROR: --proxy requires a URL (e.g. http://127.0.0.1:8080)"
    exit 1
  fi
elif [[ "$USE_PROXY" == "auto" ]]; then
  if [[ -n "${HTTP_PROXY-}" || -n "${HTTPS_PROXY-}" || -n "${http_proxy-}" || -n "${https_proxy-}" ]]; then
    USE_PROXY="env"
  else
    USE_PROXY="no"
  fi
fi

echo "Installing SSH Orbit from: ${INSTALL_SOURCE}"
echo "Proxy mode: ${USE_PROXY}"

# Install globally (Windows-safe: omit optional deps to avoid node-gyp)
NPM_ENV=()
if [[ "$USE_PROXY" == "yes" ]]; then
  NPM_ENV+=(HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY" http_proxy="$PROXY" https_proxy="$PROXY")
  # Optional: disable strict SSL only when using an intercepting proxy.
  # NPM_ENV+=(npm_config_strict_ssl=false)
fi

if [[ ${#NPM_ENV[@]} -gt 0 ]]; then
  env "${NPM_ENV[@]}" npm install -g "$INSTALL_SOURCE" --omit=optional --no-audit --no-fund
else
  npm install -g "$INSTALL_SOURCE" --omit=optional --no-audit --no-fund
fi

# Ensure runtime dependencies exist in the installed package directory.
# Some environments (e.g. MCP managers) may install as a link into a folder that doesn't have node_modules yet.
NPM_ROOT_GLOBAL="$(npm root -g)"
if is_windows_git_bash && have cygpath; then
  # npm outputs Windows paths on Git Bash; normalize.
  NPM_ROOT_GLOBAL="$(cygpath -u "$NPM_ROOT_GLOBAL" 2>/dev/null || echo "$NPM_ROOT_GLOBAL")"
fi
PKG_DIR="${NPM_ROOT_GLOBAL}/ssh-orbit"

if [[ -d "$PKG_DIR" ]]; then
  if ! (cd "$PKG_DIR" && node -e "import('@modelcontextprotocol/sdk/server/index.js').catch(()=>process.exit(1))" >/dev/null 2>&1); then
    echo ""
    echo "Installing runtime dependencies (one-time) in: $PKG_DIR"
    if [[ ${#NPM_ENV[@]} -gt 0 ]]; then
      (cd "$PKG_DIR" && env "${NPM_ENV[@]}" npm install --omit=dev --omit=optional --no-audit --no-fund)
    else
      (cd "$PKG_DIR" && npm install --omit=dev --omit=optional --no-audit --no-fund)
    fi
  fi
fi

# Compute an absolute command for Cursor to run (avoid PATH issues)
NPM_PREFIX="$(npm prefix -g)"
CMD_PATH=""
if is_windows_git_bash; then
  CMD_PATH="${NPM_PREFIX}\\ssh-orbit.cmd"
else
  CMD_PATH="ssh-orbit"
fi

echo ""
echo "Installed. Cursor command will be: ${CMD_PATH}"

if [[ "$WRITE_CURSOR" != true ]]; then
  echo ""
  echo "Cursor MCP config (minimal; env is OPTIONAL):"
  echo "{"
  echo "  \"mcpServers\": {"
  echo "    \"${SERVER_NAME}\": {"
  echo "      \"command\": \"$(escape_json_string "$CMD_PATH")\","
  echo "      \"args\": []"
  echo "    }"
  echo "  }"
  echo "}"
  echo ""
  echo "Tip: rerun with --cursor to write it automatically."
  exit 0
fi

# Write/merge Cursor MCP config (safe: creates if missing, overwrites this server key only)
CONFIG_PATH="$(cursor_config_path)"
CONFIG_DIR="$(dirname "$CONFIG_PATH")"
mkdir -p "$CONFIG_DIR"

CONFIG_PATH_ENV="$CONFIG_PATH" \
SERVER_NAME_ENV="$SERVER_NAME" \
CMD_PATH_ENV="$CMD_PATH" \
ALLOWED_TARGETS_ENV="$ALLOWED_TARGETS" \
ALLOWED_PATHS_ENV="$ALLOWED_PATHS" \
KEY_PATH_ENV="$KEY_PATH" \
node <<'NODE'
const fs = require("fs");
const path = require("path");

const configPath = process.env.CONFIG_PATH_ENV;
const serverName = process.env.SERVER_NAME_ENV || "ssh-orbit";
const command = process.env.CMD_PATH_ENV;

const allowedTargets = process.env.ALLOWED_TARGETS_ENV || "";
const allowedPaths = process.env.ALLOWED_PATHS_ENV || "";
const keyPath = process.env.KEY_PATH_ENV || "";

let root = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  try {
    root = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    const backup = configPath + ".bak";
    fs.copyFileSync(configPath, backup);
    root = { mcpServers: {} };
  }
}
if (!root || typeof root !== "object") root = { mcpServers: {} };
if (!root.mcpServers || typeof root.mcpServers !== "object") root.mcpServers = {};

const server = { command, args: [] };

// Only add env if the user provided values (env is OPTIONAL)
const env = {};
if (allowedTargets) env.SSH_ORBIT_ALLOWED_TARGETS = allowedTargets;
if (allowedPaths) env.SSH_ORBIT_ALLOWED_PATH_PREFIXES = allowedPaths;
if (keyPath) env.SSH_PRIVATE_KEY_PATH = keyPath;
if (Object.keys(env).length > 0) server.env = env;

root.mcpServers[serverName] = server;

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(root, null, 2) + "\\n", "utf8");
console.log("Wrote:", configPath);
NODE

echo ""
echo "Done. Restart Cursor to load the MCP server."

