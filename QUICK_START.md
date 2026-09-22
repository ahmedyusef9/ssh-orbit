# Quick Setup Guide - SSH Orbit

Get started with SSH Orbit in 5 minutes!

## For End Users (Claude Desktop)

### Step 1: Find Your Config File

#### Claude Desktop

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`

#### Cursor IDE (MCP)

- **macOS/Linux**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\\.cursor\\mcp.json`

### Step 2: Add SSH Orbit Configuration

#### Claude Desktop (example)

```json
{
  "mcpServers": {
    "ssh": {
      "command": "ssh-orbit",
      "args": []
    }
  }
}
```

> `env` is **optional**. Only add it if you want allowlists, custom keys, host-key verification, or password auth.

#### Cursor IDE (global) `~/.cursor/mcp.json` (example)

```json
{
  "mcpServers": {
    "ssh-orbit": {
      "command": "ssh-orbit",
      "args": []
    }
  }
}
```

#### Cursor IDE (per-project) `<your-project>/.cursor/mcp.json` (example)

```json
{
  "mcpServers": {
    "ssh-orbit": {
      "command": "ssh-orbit",
      "args": []
    }
  }
}
```

#### Optional: Add `env` (security + auth)

If you want to restrict which servers can be reached (**recommended for production**) and/or set a key explicitly, add an `env` block:

```json
{
  "mcpServers": {
    "ssh-orbit": {
      "command": "ssh-orbit",
      "args": [],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "ubuntu@prod1.example.com,10.0.1.50",
        "SSH_ORBIT_ALLOWED_PATH_PREFIXES": "/app,/var/log",
        "SSH_PRIVATE_KEY_PATH": "C:\\\\Users\\\\YOUR_USER\\\\.ssh\\\\id_ed25519"
      }
    }
  }
}
```

### Step 3: Set Up SSH Key (Choose One)

**Option A: Use Default Key** (easiest)
- Ensure you have `~/.ssh/id_rsa` or `~/.ssh/id_ed25519`
- Done! SSH Orbit will auto-discover it

**Option B: Specify Custom Key**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "ssh-orbit",
      "args": [],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "",
        "SSH_PRIVATE_KEY_PATH": "/path/to/your/key"
      }
    }
  }
}
```

**Option C: Inline Key (for testing only)**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "ssh-orbit",
      "args": [],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "",
        "SSH_PRIVATE_KEY": "<paste your private key here; never commit this file>"
      }
    }
  }
}
```

### Optional: Password Authentication (Env-only)

If you can’t use SSH keys, SSH Orbit can use passwords **from environment variables** (non-interactive).

Per-target mapping (recommended if you must use passwords):

```json
{
  "mcpServers": {
    "ssh": {
      "command": "ssh-orbit",
      "args": [],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "",
        "SSH_ORBIT_PASSWORDS": "user@host=b64:BASE64_PASSWORD"
      }
    }
  }
}
```

Keys for `SSH_ORBIT_PASSWORDS` can be: `host`, `host:port`, `user@host`, `user@host:port`.
Values can be raw or prefixed with `b64:`.

### Step 4: Restart Claude Desktop

Close and reopen Claude Desktop completely.

### Step 5: Test It!

Ask Claude:
> "Can you check the date and time on my server at your-server.com as user ubuntu?"

Claude should execute: `ssh_execute` and show you the result!

---

## For Developers (Local Development)

### Prerequisites
```bash
node --version  # Must be 18+
npm --version   # Must be 9+
```

### Quick Start
```bash
# Setup
npm install

# Configure environment
# Set SSH_ORBIT_* and SSH_PRIVATE_KEY_* variables in your shell or MCP config.

# Run development server
npm run dev
```

### Install from npm or a local tarball

```bash
# From public npm (after publish)
npx -y ssh-orbit@latest

# Or install globally
npm install -g ssh-orbit

# Or pack from a local checkout and install the tarball
npm pack
# -> ssh-orbit-<version>.tgz
npm install -g ./ssh-orbit-1.0.3.tgz
```

> Windows note: global npm bin path is usually `C:\\Users\\<you>\\AppData\\Roaming\\npm`. If `ssh-orbit` is not found, add that to PATH or restart your terminal.

### If you don't want a global install

You can also run from a repo checkout:
- Set MCP config `command: "node"` and `args: ["<path-to-repo>/bin/ssh-orbit.js"]`

### Test with Claude Desktop
```json
{
  "mcpServers": {
    "ssh-dev": {
      "command": "node",
      "args": ["/full/path/to/ssh-orbit/bin/ssh-orbit.js"],
      "env": {
        "SSH_ORBIT_ALLOWED_TARGETS": "",
        "SSH_PRIVATE_KEY_PATH": "/home/you/.ssh/test_key"
      }
    }
  }
}
```

---

## Troubleshooting

### Problem: "Host not in allowlist"
**Solution**: Add the target to `SSH_ORBIT_ALLOWED_TARGETS`
```json
"SSH_ORBIT_ALLOWED_TARGETS": "ubuntu@host1.com,host2.com:22,10.0.1.50"
```

### Problem: "No private key found"
**Solution**: Specify key location
```json
"SSH_PRIVATE_KEY_PATH": "/path/to/your/private/key"
```

### Problem: "Connection timeout"
**Solution**: 
1. Verify server is reachable: `ssh user@host`
2. Check firewall rules
3. Verify SSH is running on port 22 (or specify custom port)

### Problem: Claude doesn't see the tools
**Solution**:
1. Check Claude Desktop config syntax (valid JSON)
2. Restart Claude Desktop completely
3. Check stderr output: `tail -f ~/Library/Logs/Claude/mcp*.log`

### Problem: "Path not allowed"
**Solution**: If you set `SSH_ORBIT_ALLOWED_PATH_PREFIXES`, ensure your file path starts with an allowed prefix:
```json
"SSH_ORBIT_ALLOWED_PATH_PREFIXES": "/app,/var/log,/home/ubuntu"
```

---

## All 5 Tools Quick Reference

### 1. ssh_execute - Run Commands
```
"Execute 'df -h' on prod1.example.com as ubuntu"
```

### 2. ssh_read_lines - Read File Sections
```
"Read lines 100-150 from /var/log/app.log on prod1.example.com"
```

### 3. ssh_search_code - Search Files
```
"Search for 'ERROR' in /var/log on prod1.example.com"
```

### 4. ssh_write_chunk - Write Files
```
"Create /tmp/test.txt with content 'Hello World' on prod1.example.com"
```

### 5. ssh_edit_block - Edit Text Blocks
```
"In /app/config.json on prod1.example.com, replace '\"version\": \"1.0\"' with '\"version\": \"2.0\"'"
```

---

## Security Checklist

- [x] Set `SSH_ORBIT_ALLOWED_TARGETS` (never use `*`)
- [x] Use SSH key authentication (no passwords)
- [x] Set proper key permissions: `chmod 600 ~/.ssh/id_rsa`
- [ ] Consider `SSH_ORBIT_ALLOWED_PATH_PREFIXES` for production
- [ ] Review SSH access logs regularly
- [ ] Use separate keys for different environments
- [ ] Never commit `.env` with real credentials

---

## Next Steps

1. **Read the Full README**: [README.md](README.md)
2. **Review Security**: [README.md#security](README.md#security)
3. **Contribute**: [CONTRIBUTING.md](CONTRIBUTING.md)
4. **Check Changelog**: [CHANGELOG.md](CHANGELOG.md)

---

**Need Help?**

Issues: https://github.com/ahmedyusef9/ssh-orbit/issues

**License:** MIT — Copyright (c) 2025 Ahmad Abo Alhija

