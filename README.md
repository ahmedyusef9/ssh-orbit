# 🚀 SSH Orbit MCP Server

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A secure, high-performance **Model Context Protocol (MCP) server** that enables AI assistants like Claude Desktop to execute SSH commands and perform token-efficient file operations on remote Linux servers. Built with Node.js and the official MCP SDK for maximum compatibility and reliability.

> **License:** MIT  
> **Author:** Ahmad Abo Alhija

---

## ✨ Features

- 🔐 **Secure SSH**: Private key authentication with multiple key format support
- 🔑 **Optional Password Auth**: Non-interactive password auth via environment mapping (discouraged; keys recommended)
- 🛡️ **Target Allowlisting**: Optional allowlist for hosts/users/ports (recommended for production)
- 🔒 **Host Key Verification**: Optional strict verification (known_hosts or fingerprint) with non-interactive allow/deny
- 🤖 **AI-Ready**: Official MCP SDK integration for Claude Desktop and other AI tools
- ⚡ **High Performance**: Node.js async architecture for fast command execution
- 📦 **Zero Setup**: One-command installation via NPX - no compilation required
- 🌐 **Universal Client**: Pure JavaScript runs on Windows, macOS, and Linux
- 🐧 **Linux Remote Targets**: Optimized for POSIX-compliant remote servers
- 🛡️ **Type Safe**: Built with modern JavaScript and comprehensive error handling
- 📋 **Standards Compliant**: Uses official @modelcontextprotocol/sdk
- 💾 **Token-Efficient File Ops**: 80-90% token reduction for remote file operations

---

## 🚀 Quick Start

### Installation & Usage
```bash
# Install dependencies
npm install

# Run locally
npm start
```

### Claude Desktop Configuration
Add to your Claude Desktop MCP configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/absolute/path/to/ssh-orbit/bin/ssh-orbit.js"]
    }
  }
}
```

> `env` is **optional**. Only add it if you want allowlists, custom keys, host-key verification, or password auth.

**That's it!** Claude can now execute SSH commands on your remote servers.

---

## 💬 Usage Examples

Once configured, Claude can help you with commands like:

> **"Check disk usage on my production server at prod1.example.com"**

> **"Read lines 100-150 from /var/log/app.log on server prod1.example.com as user ubuntu"**

> **"Search for 'error' patterns in /var/log on my server"**

> **"Update the version number in /app/config.json on the remote server"**

### Manual Tool Usage Examples

#### Execute Remote Command
```json
{
  "tool": "ssh_execute",
  "arguments": {
    "host": "prod1.example.com",
    "user": "ubuntu",
    "command": "df -h",
    "port": 22
  }
}
```

#### Read Specific Lines (Token-Efficient)
```json
{
  "tool": "ssh_read_lines",
  "arguments": {
    "host": "prod1.example.com",
    "user": "ubuntu",
    "filePath": "/var/log/app.log",
    "startLine": 100,
    "endLine": 150
  }
}
```

#### Search Code Patterns
```json
{
  "tool": "ssh_search_code",
  "arguments": {
    "host": "prod1.example.com",
    "user": "ubuntu",
    "path": "/app",
    "pattern": "function.*export",
    "filePattern": "*.js",
    "maxResults": 50
  }
}
```

#### Write File Content
```json
{
  "tool": "ssh_write_chunk",
  "arguments": {
    "host": "prod1.example.com",
    "user": "ubuntu",
    "filePath": "/app/config.json",
    "content": "{ \"version\": \"2.0.0\" }",
    "mode": "overwrite"
  }
}
```

#### Edit Text Block (80-90% Token Savings)
```json
{
  "tool": "ssh_edit_block",
  "arguments": {
    "host": "prod1.example.com",
    "user": "ubuntu",
    "filePath": "/app/config.json",
    "oldText": "\"version\": \"1.0.0\"",
    "newText": "\"version\": \"2.0.0\""
  }
}
```

---

## 🔧 Configuration

### Optional (Recommended): Target Allowlist

SSH Orbit can run without an allowlist, but that means it can connect to **any** host (insecure).
For production, define an allowlist using `SSH_ORBIT_ALLOWED_TARGETS`.

```bash
export SSH_ORBIT_ALLOWED_TARGETS="prod1.example.com,ubuntu@prod2.example.com:22,10.0.1.50"
```

Or in Claude Desktop config:
```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": ["-y", "ssh-orbit@latest"],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "ubuntu@prod1.example.com,10.0.1.50"
      }
    }
  }
}
```

#### Supported allowlist entry formats
- `host`
- `host:port`
- `user@host`
- `user@host:port`

> Backward compatibility: `SSH_ORBIT_ALLOWED_HOSTS` (host-only) is still accepted, but `SSH_ORBIT_ALLOWED_TARGETS` is preferred.

### Optional: Path Prefix Allowlist

Restrict file operations to specific directories:

```bash
export SSH_ORBIT_ALLOWED_PATH_PREFIXES="/app,/var/log,/home/ubuntu"
```

### SSH Key Authentication

The server supports key-based authentication methods only (in priority order):

#### 1. Explicit Key Path (per-request)
```json
{
  "privateKeyPath": "/path/to/your/private/key"
}
```

#### 2. Environment Variable - Raw Key
```bash
export SSH_PRIVATE_KEY="<paste your private key here; never commit this value>"
```

#### 3. Environment Variable - Base64 Encoded
```bash
export SSH_PRIVATE_KEY_B64="LS0tLS1CRUdJTi..."
```

#### 4. Environment Variable - Custom Path
```bash
export SSH_PRIVATE_KEY_PATH="/custom/path/to/key"
```

#### 5. Auto-Discovery
Automatically searches for keys in:
- `~/.ssh/id_rsa`
- `~/.ssh/id_ed25519` 
- `~/.ssh/id_ecdsa`

### Supported Key Formats
- ✅ RSA keys (`id_rsa`)
- ✅ ED25519 keys (`id_ed25519`)
- ✅ ECDSA keys (`id_ecdsa`)
- ✅ OpenSSH format
- ✅ PEM format

### Optional: Password Authentication (Env-only, Non-interactive)

Password auth is supported **only via environment variables** (no interactive prompts, no tool args).
This is less secure than keys; prefer SSH keys whenever possible.

#### Pairing server/user to password

Use `SSH_ORBIT_PASSWORDS` to map a target to a password:

```bash
# Format: comma-separated key=value pairs
# Keys can be: host | host:port | user@host | user@host:port
export SSH_ORBIT_PASSWORDS="deploy@lab.example.com=b64:BASE64_PASSWORD,lab.example.com:2222=MyOtherPassword"
```

Notes:
- Values can be raw passwords or prefixed with `b64:` to decode base64.
- Matching prefers the most specific form first: `user@host:port` → `user@host` → `host:port` → `host`.

You can also set a default password (applies when no specific mapping matches):

```bash
export SSH_ORBIT_PASSWORD="MyDefaultPassword"
# or
export SSH_ORBIT_PASSWORD_B64="TXlEZWZhdWx0UGFzc3dvcmQ="
```

Security warning:
- Avoid putting passwords in config files where possible.
- Prefer `b64:`/`*_B64` and OS secret managers, and restrict who can read the environment.

### Optional (Recommended): Host Key Verification (No Prompts)

MCP servers are non-interactive, so SSH Orbit will never ask you to “accept a fingerprint”.
Instead, you can choose a strict mode that **fails the connection** if the host key is unknown/mismatched.

#### Modes
- **accept_any** (default): accept any host key (simplest, insecure)
- **known_hosts**: verify against an OpenSSH `known_hosts` file
- **fingerprint**: verify against one or more allowed fingerprints

#### Environment variables
- `SSH_ORBIT_HOSTKEY_MODE`: `accept_any` | `known_hosts` | `fingerprint`
- `SSH_ORBIT_KNOWN_HOSTS_PATH`: path to a known_hosts file (non-hashed host entries)
- `SSH_ORBIT_HOSTKEY_FINGERPRINTS`: comma-separated fingerprints and/or `host=fingerprint` pairs

Examples:

```bash
# Strict via known_hosts
export SSH_ORBIT_HOSTKEY_MODE=known_hosts
export SSH_ORBIT_KNOWN_HOSTS_PATH=/home/me/.ssh/known_hosts

# Strict via fingerprints
export SSH_ORBIT_HOSTKEY_MODE=fingerprint
export SSH_ORBIT_HOSTKEY_FINGERPRINTS="prod1.example.com=SHA256:abc123,10.0.1.50=SHA256:def456"
```

---

## 🆕 Token-Efficient File Operations

SSH Orbit includes 4 powerful tools inspired by best practices for optimal token usage:

### 🎯 Token-Efficient Tools

1. **ssh_read_lines** - Read file sections by line numbers (massive savings for large files)
2. **ssh_search_code** - Pattern search without reading full files
3. **ssh_write_chunk** - Efficient content writing with append/overwrite modes
4. **ssh_edit_block** - Edit specific text blocks (80-90% token reduction vs full rewrites)

### 💡 Benefits

- **80-90% fewer tokens** for file operations
- **No more full file rewrites** for small changes
- **Partial file reading** for large codebases
- **Pattern searching** without token overhead

### 📖 Tool Details

#### ssh_read_lines
Read only the lines you need from large files:
- Uses efficient `sed` commands on remote host
- Perfect for log analysis and code inspection
- Returns line range with metadata

#### ssh_search_code
Search for patterns across directories:
- Uses `grep` with regex support on remote host
- Optional file pattern filtering (`*.js`, `*.py`, etc.)
- Configurable result limits
- Returns file:line:content matches

#### ssh_write_chunk
Write or append content efficiently:
- Two modes: `overwrite` (replace file) or `append`
- Uses safe heredoc syntax for content transfer
- No intermediate temporary files
- Content size validation

#### ssh_edit_block
Replace specific text blocks:
- Find and replace unique text blocks
- Uses Python or Perl on remote host for literal matching
- Validates uniqueness (prevents ambiguous replacements)
- Massive token savings vs reading/writing entire files

---

## 🛠️ Development

### Prerequisites
- **Node.js 18+** (check: `node --version`)
- **NPM 9+** (check: `npm --version`)

### Install Node.js

#### Windows:
Download from [nodejs.org](https://nodejs.org/) or use Chocolatey:
```bash
choco install nodejs
```

#### Linux (Ubuntu/Debian):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Linux (CentOS/RHEL):
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

#### macOS:
```bash
brew install node
```

### Build from Source
```bash
# Install dependencies
npm install

# Run locally
npm start

# Development with auto-reload
npm run dev
```

---

## 🏗️ Architecture

```
ssh-orbit/
├── package.json          # NPM configuration & dependencies
├── bin/
│   └── ssh-orbit.js      # MCP server entrypoint (stdio)
├── lib/
│   ├── security.js       # Host/path allowlist validation
│   └── file-tools.js     # Token-efficient file operations
├── ssh-client.js         # SSH connection management
├── README.md             # Documentation
└── LICENSE               # MIT license
```

### Technology Stack
- **Runtime**: Node.js 18+ with ES Modules
- **MCP SDK**: @modelcontextprotocol/sdk (Official)
- **SSH**: ssh2 library for Node.js
- **Distribution**: NPM with direct NPX execution
- **Remote Target**: Linux servers (POSIX shell + common tools)

### Security Architecture

```
┌─────────────────┐
│  Claude Desktop │
└────────┬────────┘
         │ MCP Protocol (stdio)
         ▼
┌─────────────────┐
│   SSH Orbit     │
│   MCP Server    │
│  ┌───────────┐  │
│  │ Security  │  │ ◄─── SSH_ORBIT_ALLOWED_TARGETS
│  │ Validator │  │ ◄─── SSH_ORBIT_ALLOWED_PATH_PREFIXES
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │ SSH Client│  │
│  └─────┬─────┘  │
└────────┼────────┘
         │ SSH (port 22)
         ▼
┌─────────────────┐
│  Remote Linux   │
│     Server      │
└─────────────────┘
```

---

## 🔒 Security

### Built-in Security Features
- ✅ **Optional host allowlist** (SSH_ORBIT_ALLOWED_TARGETS; strongly recommended for production)
- ✅ **Optional path allowlist** (SSH_ORBIT_ALLOWED_PATH_PREFIXES)
- ✅ **Private key authentication by default** with optional non-interactive password mapping
- ✅ **Configurable SSH algorithms and timeouts**
- ✅ **No persistent connections** (session-based)
- ✅ **Input validation and sanitization**
- ✅ **Shell injection protection** (proper escaping)
- ✅ **Content size limits** (prevents DoS)
- ✅ **Comprehensive error handling**

### Security Best Practices
- 🔐 **Store private keys with restrictive permissions** (`chmod 600`)
- 🌐 **Use SSH key passphrases** when possible
- 🛡️ **Restrict SSH keys to specific hosts** in `~/.ssh/config`
- 📝 **Monitor SSH access logs** on remote servers
- 🚫 **Never run as root** unless absolutely necessary
- ⚠️ **Always set SSH_ORBIT_ALLOWED_TARGETS** in production
- 🔒 **Consider SSH_ORBIT_ALLOWED_PATH_PREFIXES** for additional file operation restrictions

### Network Security Example
```bash
# Example SSH config for restricted access
Host production-server
    HostName prod1.example.com
    User deploy
    IdentityFile ~/.ssh/production_key
    IdentitiesOnly yes
    StrictHostKeyChecking yes
```

### Environment Configuration Template
```bash
# Required for security
export SSH_ORBIT_ALLOWED_TARGETS="prod1.example.com,prod2.example.com"

# Optional: Restrict file operations
export SSH_ORBIT_ALLOWED_PATH_PREFIXES="/app,/var/log"

# SSH authentication (choose one)
export SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)"
# OR
export SSH_PRIVATE_KEY_PATH="/path/to/custom/key"
```

---

## 🧪 Testing

### Local Testing
```bash
# Test the MCP server startup
npm start

# Verify security configuration output
# Should show allowlist status
```

### Integration Testing
```bash
# Verify Node.js installation
node --version  # Should be 18+
npm --version   # Should be 9+

# Test NPX execution
npx ssh-orbit@latest
```

### Testing with Claude Desktop
1. Configure `claude_desktop_config.json` with your settings
2. Restart Claude Desktop
3. Check Claude's MCP server status (should show "ssh-orbit: Connected")
4. Ask Claude to execute a simple command like "Check the date on prod1.example.com"

---

## 🌍 Compatibility

### Operating Systems (Client)
- ✅ **Windows** 10/11 (x64, ARM64)
- ✅ **macOS** 12+ (Intel & Apple Silicon)
- ✅ **Linux** (x64, ARM64) - All major distributions

### Remote Targets
- ✅ **Linux** (Ubuntu, Debian, CentOS, RHEL, etc.)
- ✅ **POSIX-compliant systems** with standard tools (sed, grep, cat, perl/python)

### AI Platforms
- 🤖 **Claude Desktop** (Primary target)
- 🤖 **Cursor IDE** 
- 🤖 **Any MCP-compatible application**

### Node.js Compatibility
- ✅ **Node.js 18.x** (LTS)
- ✅ **Node.js 20.x** (LTS) 
- ✅ **Node.js 22.x** (Current)

### Remote Host Requirements
- Linux/POSIX shell (`bash` or compatible)
- Standard utilities: `sed`, `grep`, `cat`
- Optional but recommended: `python3` or `perl` (for ssh_edit_block)

---

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly: `npm test` (if tests available)
5. Submit a pull request

### Code Style
- Use ES6+ modern JavaScript
- Follow Node.js best practices
- Add JSDoc comments for functions
- Validate with existing patterns
- Maintain security-first approach

---

## 📄 License

MIT License — see [LICENSE](LICENSE).

**Author:** Ahmad Abo Alhija

---

## 🙏 Acknowledgments

- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)** - Official MCP SDK
- **[ssh2](https://github.com/mscdex/ssh2)** - Node.js SSH client
- **[Claude Desktop](https://claude.ai)** - Primary target platform
- **[Model Context Protocol](https://modelcontextprotocol.io)** - Standard specification

---

## 📞 Support

- 📋 **Issues**: https://github.com/ahmedyusef9/ssh-orbit/issues

---

## 🔄 Version History

### v1.0.3 - Public release
- ✨ Core SSH command execution
- ✨ Token-efficient file operations (read, search, write, edit)
- ✨ Host allowlist security
- ✨ Path prefix restrictions
- ✨ Multiple private key authentication methods
- ✨ Official MCP SDK integration
- ✨ Comprehensive documentation

---

*Built with ❤️ by Ahmad Abo Alhija using Node.js and the official MCP SDK*
