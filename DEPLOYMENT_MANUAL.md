# SSH Orbit Deployment Manual

This manual configures SSH Orbit on the computer running Cursor or Claude Desktop and connects it to a target Linux VM.

SSH Orbit is an MCP client-side server. It does not need to be installed on the target VM. You may copy this manual to the VM for operational reference.

## 1. Set your variables

Replace these example values in the commands below:

```text
VM_USER=ubuntu
VM_HOST=vm.example.com
KEY_PATH=~/.ssh/ssh_orbit_ed25519
```

Use an IP address instead of `vm.example.com` when DNS is not configured.

## 2. Generate a dedicated SSH key

Run this on the computer where Cursor or Claude Desktop runs:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/ssh_orbit_ed25519 -C "ssh-orbit-client"
chmod 600 ~/.ssh/ssh_orbit_ed25519
chmod 644 ~/.ssh/ssh_orbit_ed25519.pub
```

SSH Orbit is non-interactive. If the private key has a passphrase, unlock it through an SSH agent before starting the MCP client. Never copy the private key to the VM or commit it to a repository.

On Windows PowerShell, use the same `ssh-keygen` command with a forward-slash path:

```powershell
ssh-keygen -t ed25519 -f "$HOME/.ssh/ssh_orbit_ed25519" -C "ssh-orbit-client"
```

## 3. Install the public key on the target VM

The public key belongs in the VM user's `authorized_keys` file. Use an existing login method for the first connection:

```bash
ssh-copy-id -i ~/.ssh/ssh_orbit_ed25519.pub VM_USER@VM_HOST
```

If `ssh-copy-id` is unavailable:

```bash
cat ~/.ssh/ssh_orbit_ed25519.pub | ssh VM_USER@VM_HOST \
  'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys'
```

Verify the key before configuring Cursor or Claude:

```bash
ssh -i ~/.ssh/ssh_orbit_ed25519 VM_USER@VM_HOST 'hostname && whoami && date'
```

## 4. Copy this manual to the VM with SCP

Copy only the documentation manual, not the private key:

```bash
scp -i ~/.ssh/ssh_orbit_ed25519 DEPLOYMENT_MANUAL.md \
  VM_USER@VM_HOST:/tmp/ssh-orbit-deployment-manual.md
```

You can also copy the public README:

```bash
scp -i ~/.ssh/ssh_orbit_ed25519 README.md \
  VM_USER@VM_HOST:/tmp/ssh-orbit-readme.md
```

The copied files are reference material. SSH Orbit remains on the Cursor/Claude computer.

## 5. Install SSH Orbit on the client computer

Install the published package:

```bash
npm install --global ssh-orbit@1.0.3
```

Or run it without a global install from an MCP configuration using `npx`:

```text
npx -y ssh-orbit@1.0.3
```

## 6. Configure Cursor

Copy [examples/cursor-mcp.with-env.optional.json](examples/cursor-mcp.with-env.optional.json) into:

```text
macOS/Linux: ~/.cursor/mcp.json
Windows: %USERPROFILE%/.cursor/mcp.json
```

Set the target, allowed paths, known-hosts path, and private-key path before saving.

On Windows, use forward slashes in JSON, for example:
`C:/Users/YOUR_USER/.ssh/ssh_orbit_ed25519`.

## 7. Configure Claude Desktop

Copy [examples/claude-desktop.mcp.json](examples/claude-desktop.mcp.json) into:

```text
macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
Windows: %APPDATA%/Claude/claude_desktop_config.json
```

Update the target, allowed paths, known-hosts path, and private-key path, then fully restart Claude Desktop.

## 8. Use this operating prompt

Copy and customize this prompt in Cursor or Claude after the MCP server connects:

```text
Use the SSH Orbit MCP server for the target VM.

Target: VM_USER@VM_HOST on port 22.
Private key: the configured SSH_PRIVATE_KEY_PATH.

Rules:
1. Start with read-only checks: hostname, whoami, uptime, df -h, and systemctl status.
2. Use ssh_read_lines or ssh_search_code before reading large files.
3. Before any write, delete, package install, service restart, or reboot, explain the exact command and ask for confirmation.
4. Never print, copy, or modify private keys, authorized_keys, tokens, or passwords unless I explicitly request it.
5. Report the command, exit code, stdout, stderr, and any follow-up action clearly.

First, verify the connection with hostname, whoami, and date.
```

Example first request:

```text
Use SSH Orbit to verify the VM connection. Run hostname, whoami, uptime, and df -h only. Do not change anything.
```

## 9. Security checklist

- Set `SSH_ORBIT_ALLOWED_TARGETS` instead of allowing arbitrary hosts.
- Use `SSH_ORBIT_HOSTKEY_MODE=known_hosts` or `fingerprint` in production.
- Restrict the private key with filesystem permissions and keep it on the client only.
- Use a least-privilege VM account; avoid root unless required.
- Restart Cursor or Claude after changing the MCP configuration.
