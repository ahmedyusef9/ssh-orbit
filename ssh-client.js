/**
 * @fileoverview SSH Client for executing remote commands
 * @copyright Copyright (c) 2025 Ahmad Abo Alhija
 * @author Ahmad Abo Alhija
 * @license MIT
 */

import { Client } from 'ssh2';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * SSH Client for executing remote commands
 * Handles private key authentication and secure connections
 */
export class SSHClient {
  constructor() {
    this.defaultKeyPaths = [
      join(homedir(), '.ssh', 'id_rsa'),
      join(homedir(), '.ssh', 'id_ed25519'),
      join(homedir(), '.ssh', 'id_ecdsa')
    ];

    // Host key verification (optional, non-interactive)
    // Default is accept_any (ssh2 default behavior) unless configured via env:
    // - SSH_ORBIT_HOSTKEY_MODE: accept_any | known_hosts | fingerprint
    // - SSH_ORBIT_KNOWN_HOSTS_PATH: path to OpenSSH known_hosts file (non-hashed entries only)
    // - SSH_ORBIT_HOSTKEY_FINGERPRINTS: comma-separated fingerprints and/or host=fingerprint pairs
    this.hostKeyMode = (process.env.SSH_ORBIT_HOSTKEY_MODE || '').trim() || 'accept_any';
    this.knownHostsPath = (process.env.SSH_ORBIT_KNOWN_HOSTS_PATH || '').trim() || null;
    this.fingerprintSpec = (process.env.SSH_ORBIT_HOSTKEY_FINGERPRINTS || '').trim() || null;

    // Auto-enable modes if config exists
    if (this.hostKeyMode === 'accept_any') {
      if (this.knownHostsPath) this.hostKeyMode = 'known_hosts';
      else if (this.fingerprintSpec) this.hostKeyMode = 'fingerprint';
    }

    this._knownHostFingerprints = null;
    this._fingerprintRules = null;
    if (this.hostKeyMode === 'known_hosts' && this.knownHostsPath) {
      this._knownHostFingerprints = this.loadKnownHosts(this.knownHostsPath);
    }
    if (this.hostKeyMode === 'fingerprint' && this.fingerprintSpec) {
      this._fingerprintRules = this.parseFingerprintRules(this.fingerprintSpec);
    }

    // Password authentication (optional, non-interactive; env only)
    // - SSH_ORBIT_PASSWORD: default password for any target (discouraged; prefer per-target map)
    // - SSH_ORBIT_PASSWORD_B64: base64 default password
    // - SSH_ORBIT_PASSWORDS: comma-separated map entries:
    //     user@host=password
    //     user@host:port=password
    //     host=password
    //     host:port=password
    //   Values may optionally be prefixed with "b64:" to decode base64.
    this.defaultPassword = this.getDefaultPasswordFromEnv();
    this.passwordMap = this.parsePasswordMap(process.env.SSH_ORBIT_PASSWORDS || '');
  }

  /**
   * Execute command on remote SSH server
   * @param {Object} options - SSH connection options
   * @param {string} options.host - Remote hostname/IP
   * @param {string} options.user - SSH username  
   * @param {string} options.command - Command to execute
   * @param {string} [options.privateKeyPath] - Path to private key
   * @param {number} [options.port=22] - SSH port
   * @param {number} [options.timeoutMs=30000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command execution result
   */
  async executeCommand({ host, user, command, privateKeyPath, port = 22, timeoutMs = 30000 }) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) {
      throw new Error('timeoutMs must be an integer between 1 and 3600000');
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      let errorOutput = '';
      let timeoutHandle;
      let isFinished = false;
      
      // Resolve authentication (password preferred if configured for this target)
      const password = this.resolvePassword({ host, user, port });
      let privateKey;
      if (!password) {
        try {
          privateKey = this.getPrivateKey(privateKeyPath);
        } catch (error) {
          return reject(new Error(`Private key error: ${error.message}`));
        }
      }

      // Set up timeout
      const cleanup = (result) => {
        if (isFinished) return;
        isFinished = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        conn.end();
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      };

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          cleanup(new Error(`Command execution timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      // Connection configuration
      const config = {
        host,
        port,
        username: user,
        ...(password ? { password } : { privateKey }),
        algorithms: {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384', 
            'ecdh-sha2-nistp521',
            'diffie-hellman-group14-sha256'
          ]
        },
        readyTimeout: 20000,
        keepaliveInterval: 30000
      };

      // Optional host key verification (no interactive prompts)
      if (this.hostKeyMode !== 'accept_any') {
        config.hostVerifier = (key) => {
          try {
            return this.verifyHostKey({ host, port, key });
          } catch (e) {
            return false;
          }
        };
      }

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            return cleanup(new Error(`Execution failed: ${err.message}`));
          }

          stream.on('close', (code, signal) => {
            cleanup({
              output: output.trim(),
              error: errorOutput.trim() || null,
              exitCode: code
            });
          });

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        cleanup(new Error(`SSH connection failed: ${err.message}`));
      });

      conn.connect(config);
    });
  }

  /**
   * Get private key from file or environment
   * @param {string} [keyPath] - Optional path to private key
   * @returns {Buffer} Private key buffer
   */
  getPrivateKey(keyPath) {
    // Priority 1: Explicit key path provided
    if (keyPath) {
      try {
        return readFileSync(keyPath);
      } catch (error) {
        throw new Error(`Failed to read private key from ${keyPath}: ${error.message}`);
      }
    }

    // Priority 2: Environment variable with raw key content
    if (process.env.SSH_PRIVATE_KEY) {
      return Buffer.from(process.env.SSH_PRIVATE_KEY);
    }

    // Priority 3: Environment variable with base64-encoded key
    if (process.env.SSH_PRIVATE_KEY_B64) {
      try {
        return Buffer.from(process.env.SSH_PRIVATE_KEY_B64, 'base64');
      } catch (error) {
        throw new Error(`Failed to decode SSH_PRIVATE_KEY_B64: ${error.message}`);
      }
    }

    // Priority 4: Environment variable with custom path
    if (process.env.SSH_PRIVATE_KEY_PATH) {
      try {
        return readFileSync(process.env.SSH_PRIVATE_KEY_PATH);
      } catch (error) {
        throw new Error(`Failed to read SSH_PRIVATE_KEY_PATH (${process.env.SSH_PRIVATE_KEY_PATH}): ${error.message}`);
      }
    }

    // Priority 5: Try default key paths
    const paths = this.defaultKeyPaths;
    for (const path of paths) {
      try {
        return readFileSync(path);
      } catch (error) {
        continue; // Try next path
      }
    }
    
    throw new Error(
      `No private key found. Tried: ${paths.join(', ')}\n` +
      'Please provide privateKeyPath, or set SSH_PRIVATE_KEY, SSH_PRIVATE_KEY_B64, or SSH_PRIVATE_KEY_PATH environment variable'
    );
  }

  /**
   * Verify remote host key based on configured mode.
   * @private
   * @param {Object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {Buffer} options.key - raw host public key provided by ssh2
   * @returns {boolean}
   */
  verifyHostKey({ host, port, key }) {
    if (this.hostKeyMode === 'accept_any') return true;
    const { sha256, md5 } = this.computeFingerprints(key);

    if (this.hostKeyMode === 'fingerprint') {
      if (!this._fingerprintRules) {
        throw new Error('SSH_ORBIT_HOSTKEY_FINGERPRINTS not set');
      }
      const candidates = [`${host}:${port}`, host, `[${host}]:${port}`];
      for (const rule of this._fingerprintRules) {
        const fpMatch = rule.fingerprint === sha256 || rule.fingerprint === md5;
        if (!fpMatch) continue;
        if (!rule.target) return true;
        if (candidates.includes(rule.target)) return true;
      }
      return false;
    }

    if (this.hostKeyMode === 'known_hosts') {
      if (!this._knownHostFingerprints) {
        throw new Error('SSH_ORBIT_KNOWN_HOSTS_PATH not set or unreadable');
      }
      const candidates = [`${host}:${port}`, host, `[${host}]:${port}`];
      for (const c of candidates) {
        const set = this._knownHostFingerprints.get(c);
        if (set && (set.has(sha256) || set.has(md5))) return true;
      }
      return false;
    }

    // Unknown mode => fail closed
    return false;
  }

  /**
   * Compute common SSH-style fingerprints for a raw host public key.
   * @private
   * @param {Buffer} key
   * @returns {{sha256: string, md5: string}}
   */
  computeFingerprints(key) {
    const sha256b64 = createHash('sha256').update(key).digest('base64').replace(/=+$/g, '');
    const md5hex = createHash('md5').update(key).digest('hex').match(/.{2}/g).join(':');
    return {
      sha256: `SHA256:${sha256b64}`,
      md5: `MD5:${md5hex}`
    };
  }

  /**
   * Parse SSH_ORBIT_HOSTKEY_FINGERPRINTS.
   * Format: comma-separated entries. Each entry can be:
   * - SHA256:xxxxx (applies to any host)
   * - host=SHA256:xxxxx
   * - host:port=SHA256:xxxxx
   * - [host]:port=SHA256:xxxxx
   * @private
   * @param {string} spec
   * @returns {Array<{target?: string, fingerprint: string}>}
   */
  parseFingerprintRules(spec) {
    return spec
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(entry => {
        const idx = entry.indexOf('=');
        if (idx === -1) return { fingerprint: entry };
        return { target: entry.slice(0, idx).trim(), fingerprint: entry.slice(idx + 1).trim() };
      });
  }

  /**
   * Load OpenSSH known_hosts (non-hashed hostnames only).
   * Stores host -> set of fingerprints (SHA256 and MD5).
   * @private
   * @param {string} filePath
   * @returns {Map<string, Set<string>>}
   */
  loadKnownHosts(filePath) {
    const text = readFileSync(filePath, 'utf8');
    const map = new Map();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('|')) continue; // hashed hosts not supported
      if (trimmed.startsWith('@')) continue; // ignore markers like @cert-authority/@revoked

      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;
      const hostsPart = parts[0];
      const keyBase64 = parts[2];

      let key;
      try {
        key = Buffer.from(keyBase64, 'base64');
      } catch {
        continue;
      }

      const { sha256, md5 } = this.computeFingerprints(key);
      for (const hostEntry of hostsPart.split(',')) {
        if (!hostEntry) continue;
        if (!map.has(hostEntry)) map.set(hostEntry, new Set());
        map.get(hostEntry).add(sha256);
        map.get(hostEntry).add(md5);
      }
    }

    return map;
  }

  /**
   * Resolve password for a given SSH target.
   * Preference order:
   * - per-target entries in SSH_ORBIT_PASSWORDS
   * - default password (SSH_ORBIT_PASSWORD / SSH_ORBIT_PASSWORD_B64)
   * @private
   * @param {Object} options
   * @param {string} options.host
   * @param {string} options.user
   * @param {number} options.port
   * @returns {string|null}
   */
  resolvePassword({ host, user, port }) {
    if (!this.passwordMap || this.passwordMap.size === 0) {
      return this.defaultPassword || null;
    }

    const candidates = [];
    if (user) {
      candidates.push(`${user}@${host}:${port}`);
      candidates.push(`${user}@${host}`);
    }
    candidates.push(`${host}:${port}`);
    candidates.push(host);

    for (const c of candidates) {
      const pw = this.passwordMap.get(c);
      if (typeof pw === 'string' && pw.length > 0) return pw;
    }

    return this.defaultPassword || null;
  }

  /**
   * Parse SSH_ORBIT_PASSWORDS env into a Map.
   * @private
   * @param {string} spec
   * @returns {Map<string,string>}
   */
  parsePasswordMap(spec) {
    const map = new Map();
    const trimmed = (spec || '').trim();
    if (!trimmed) return map;

    const entries = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    for (const entry of entries) {
      const idx = entry.indexOf('=');
      if (idx === -1) continue;
      const key = entry.slice(0, idx).trim();
      const rawVal = entry.slice(idx + 1).trim();
      if (!key || !rawVal) continue;
      map.set(key, this.decodeMaybeB64(rawVal));
    }
    return map;
  }

  /**
   * Read a default password from env (raw or base64).
   * @private
   * @returns {string|null}
   */
  getDefaultPasswordFromEnv() {
    if (process.env.SSH_ORBIT_PASSWORD && process.env.SSH_ORBIT_PASSWORD.trim()) {
      return process.env.SSH_ORBIT_PASSWORD;
    }
    if (process.env.SSH_ORBIT_PASSWORD_B64 && process.env.SSH_ORBIT_PASSWORD_B64.trim()) {
      try {
        return Buffer.from(process.env.SSH_ORBIT_PASSWORD_B64, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Decode values prefixed with b64:... otherwise return as-is.
   * @private
   * @param {string} value
   * @returns {string}
   */
  decodeMaybeB64(value) {
    const v = (value || '').trim();
    if (v.toLowerCase().startsWith('b64:')) {
      const b64 = v.slice(4).trim();
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    return v;
  }
}
