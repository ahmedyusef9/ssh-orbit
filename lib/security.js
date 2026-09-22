/**
 * @fileoverview Security validation for SSH connections
 * @copyright Copyright (c) 2025 Ahmad Abo Alhija
 * @author Ahmad Abo Alhija
 * @license MIT
 */

/**
 * Security configuration and validation
 */
export class SecurityValidator {
  constructor() {
    // Parse allowed targets from environment (optional)
    // Supports entries like:
    // - host
    // - host:port
    // - user@host
    // - user@host:port
    // Back-compat: SSH_ORBIT_ALLOWED_HOSTS (host-only) is also accepted.
    const allowedTargetsEnv =
      process.env.SSH_ORBIT_ALLOWED_TARGETS ||
      process.env.SSH_ORBIT_ALLOWED_HOSTS ||
      '';

    this.allowedTargets = allowedTargetsEnv
      .split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);

    // Parse allowed path prefixes from environment (optional)
    const allowedPathsEnv = process.env.SSH_ORBIT_ALLOWED_PATH_PREFIXES || '';
    this.allowedPathPrefixes = allowedPathsEnv
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Validation strictness
    this.requireTargetAllowlist = this.allowedTargets.length > 0;
    this.requirePathAllowlist = this.allowedPathPrefixes.length > 0;
    this._warnedNoAllowlist = false;
  }

  /**
   * Validate SSH target is in allowlist (if configured)
   * @param {Object} options
   * @param {string} options.host - Hostname/IP
   * @param {string} [options.user] - SSH username
   * @param {number} [options.port=22] - SSH port
   * @throws {Error} If target not allowed
   */
  validateTarget({ host, user, port = 22 }) {
    if (typeof host !== 'string' || host.trim().length === 0) {
      throw new Error('host is required and must be a non-empty string');
    }
    if (user !== undefined && (typeof user !== 'string' || user.trim().length === 0)) {
      throw new Error('user must be a non-empty string');
    }
    this.validatePort(port);

    if (!this.requireTargetAllowlist) {
      if (!this._warnedNoAllowlist) {
        this._warnedNoAllowlist = true;
        console.warn(
          'WARNING: SSH_ORBIT_ALLOWED_TARGETS / SSH_ORBIT_ALLOWED_HOSTS not set. All SSH targets are allowed. ' +
          'This is insecure for production use.'
        );
      }
      return;
    }

    const candidates = [];
    if (user) {
      candidates.push(`${user}@${host}:${port}`);
      candidates.push(`${user}@${host}`);
    }
    candidates.push(`${host}:${port}`);
    candidates.push(host);

    const isAllowed = candidates.some(c => this.allowedTargets.includes(c));

    if (!isAllowed) {
      throw new Error(
        `Target '${user ? `${user}@` : ''}${host}:${port}' is not in the allowlist. ` +
        `Allowed targets: ${this.allowedTargets.join(', ')}`
      );
    }
  }

  /**
   * Validate file path is safe and within allowed prefixes
   * @param {string} filePath - File path to validate
   * @throws {Error} If path is unsafe
   */
  validateFilePath(filePath) {
    // Basic safety checks
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required and must be a string');
    }

    if (filePath.includes('\0')) {
      throw new Error('File path contains null byte');
    }

    if (!filePath.startsWith('/')) {
      throw new Error('File path must be absolute (start with /)');
    }

    // Check against allowed prefixes if configured
    if (this.requirePathAllowlist) {
      const isAllowed = this.allowedPathPrefixes.some((prefix) => {
        if (prefix === '/') return true;
        const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        return filePath === normalizedPrefix || filePath.startsWith(`${normalizedPrefix}/`);
      });

      if (!isAllowed) {
        throw new Error(
          `File path '${filePath}' is not under allowed prefixes. ` +
          `Allowed: ${this.allowedPathPrefixes.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate search path
   * @param {string} searchPath - Search path to validate
   * @throws {Error} If path is unsafe
   */
  validateSearchPath(searchPath) {
    this.validateFilePath(searchPath); // Reuse file path validation
  }

  /**
   * Validate command input
   * @param {string} command - Command to validate
   * @param {number} [maxLength=100000] - Maximum command length
   * @throws {Error} If command is invalid
   */
  validateCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    if (command.length > 100000) {
      throw new Error(`Command too long (max 100000 characters)`);
    }
  }

  /**
   * Validate an SSH port.
   * @param {number} port
   * @throws {Error} If port is invalid
   */
  validatePort(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('port must be an integer between 1 and 65535');
    }
  }

  /**
   * Validate a bounded command timeout.
   * @param {number} timeoutMs
   * @throws {Error} If timeout is invalid
   */
  validateTimeout(timeoutMs) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) {
      throw new Error('timeoutMs must be an integer between 1 and 3600000');
    }
  }

  /**
   * Validate content size
   * @param {string} content - Content to validate
   * @param {number} [maxSize=10485760] - Maximum size in bytes (default 10MB)
   * @throws {Error} If content too large
   */
  validateContent(content, maxSize = 10485760) {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }

    const byteSize = Buffer.byteLength(content, 'utf8');
    if (byteSize > maxSize) {
      throw new Error(
        `Content too large: ${byteSize} bytes (max ${maxSize} bytes)`
      );
    }
  }

  /**
   * Get security configuration summary
   * @returns {Object} Configuration summary
   */
  getConfig() {
    return {
      targetAllowlistEnabled: this.requireTargetAllowlist,
      allowedTargets: this.allowedTargets,
      pathAllowlistEnabled: this.requirePathAllowlist,
      allowedPathPrefixes: this.allowedPathPrefixes
    };
  }
}
