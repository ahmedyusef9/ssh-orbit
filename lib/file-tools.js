/**
 * @fileoverview Token-efficient remote file operations over SSH
 * @copyright Copyright (c) 2025 Ahmad Abo Alhija
 * @author Ahmad Abo Alhija
 * @license MIT
 */

import { createHash } from 'crypto';

/**
 * Remote file operations using Linux shell commands
 */
export class FileTools {
  constructor(sshClient) {
    this.sshClient = sshClient;
  }

  /**
   * Read specific lines from a remote file
   * @param {Object} options - Read options
   * @param {string} options.host - Remote host
   * @param {string} options.user - SSH user
   * @param {number} [options.port=22] - SSH port
   * @param {string} options.filePath - Remote file path
   * @param {number} options.startLine - Starting line number (1-indexed)
   * @param {number} options.endLine - Ending line number (inclusive)
   * @param {string} [options.privateKeyPath] - Private key path
   * @returns {Promise<Object>} Lines and metadata
   */
  async readLines({ host, user, port = 22, filePath, startLine, endLine, privateKeyPath }) {
    // Validate line numbers
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
      throw new Error('line numbers must be integers');
    }
    if (startLine < 1 || endLine < startLine) {
      throw new Error('Invalid line range: startLine must be >= 1 and endLine must be >= startLine');
    }

    // Escape file path for shell
    const escapedPath = this.escapeShellArg(filePath);
    
    // Use sed to extract line range efficiently
    const command = `sed -n '${startLine},${endLine}p' ${escapedPath}`;

    const result = await this.sshClient.executeCommand({
      host,
      user,
      port,
      command,
      privateKeyPath
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read lines: ${result.error || result.output}`);
    }

    const lines = result.output.split('\n');
    
    return {
      lines,
      startLine,
      endLine,
      totalLines: lines.length,
      content: result.output
    };
  }

  /**
   * Search for pattern in remote files
   * @param {Object} options - Search options
   * @param {string} options.host - Remote host
   * @param {string} options.user - SSH user
   * @param {number} [options.port=22] - SSH port
   * @param {string} options.path - Remote search path
   * @param {string} options.pattern - Search pattern (grep regex)
   * @param {string} [options.filePattern] - File pattern (e.g., '*.js')
   * @param {number} [options.maxResults=100] - Maximum results
   * @param {string} [options.privateKeyPath] - Private key path
   * @returns {Promise<Object>} Search results
   */
  async searchCode({ host, user, port = 22, path, pattern, filePattern, maxResults = 100, privateKeyPath }) {
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10000) {
      throw new Error('maxResults must be an integer between 1 and 10000');
    }

    const escapedPath = this.escapeShellArg(path);
    const escapedPattern = this.escapeShellArg(pattern);
    
    // Build grep command with optional file pattern
    let command = `grep -r -n -H ${escapedPattern} ${escapedPath}`;
    
    if (filePattern) {
      const escapedFilePattern = this.escapeShellArg(filePattern);
      command += ` --include=${escapedFilePattern}`;
    }
    
    // Limit results
    command += ` | head -n ${maxResults}`;

    const result = await this.sshClient.executeCommand({
      host,
      user,
      port,
      command,
      privateKeyPath,
      timeoutMs: 60000 // Longer timeout for searches
    });

    // grep returns exit code 1 if no matches found, which is not an error
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(`Search failed: ${result.error || result.output}`);
    }

    // Parse grep output: filename:linenum:content
    const matches = [];
    const lines = result.output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        matches.push({
          file: match[1],
          line: parseInt(match[2], 10),
          content: match[3]
        });
      }
    }

    return {
      matches,
      totalMatches: matches.length,
      truncated: matches.length >= maxResults
    };
  }

  /**
   * Write or append content to remote file
   * @param {Object} options - Write options
   * @param {string} options.host - Remote host
   * @param {string} options.user - SSH user
   * @param {number} [options.port=22] - SSH port
   * @param {string} options.filePath - Remote file path
   * @param {string} options.content - Content to write
   * @param {string} options.mode - 'overwrite' or 'append'
   * @param {string} [options.privateKeyPath] - Private key path
   * @returns {Promise<Object>} Write result
   */
  async writeChunk({ host, user, port = 22, filePath, content, mode, privateKeyPath }) {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    if (mode !== 'overwrite' && mode !== 'append') {
      throw new Error("Mode must be 'overwrite' or 'append'");
    }

    const escapedPath = this.escapeShellArg(filePath);
    const operator = mode === 'append' ? '>>' : '>';
    
    // Use a content-derived delimiter so user content cannot terminate the heredoc.
    let delimiter = `SSH_ORBIT_EOF_${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
    while (content.split('\n').includes(delimiter)) delimiter += '_X';
    const command = `cat ${operator} ${escapedPath} <<'${delimiter}'\n${content}\n${delimiter}`;

    const result = await this.sshClient.executeCommand({
      host,
      user,
      port,
      command,
      privateKeyPath,
      timeoutMs: 60000
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.error || result.output}`);
    }

    return {
      success: true,
      mode,
      bytesWritten: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Edit specific text block in remote file
   * @param {Object} options - Edit options
   * @param {string} options.host - Remote host
   * @param {string} options.user - SSH user
   * @param {number} [options.port=22] - SSH port
   * @param {string} options.filePath - Remote file path
   * @param {string} options.oldText - Text to replace
   * @param {string} options.newText - Replacement text
   * @param {string} [options.privateKeyPath] - Private key path
   * @returns {Promise<Object>} Edit result
   */
  async editBlock({ host, user, port = 22, filePath, oldText, newText, privateKeyPath }) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new Error('oldText and newText must be strings');
    }

    // Try Python first (most reliable for literal string replacement)
    const pythonCommand = this.buildPythonEditCommand(filePath, oldText, newText);
    
    // Check if Python is available
    const checkPython = await this.sshClient.executeCommand({
      host,
      user,
      port,
      command: 'command -v python3',
      privateKeyPath,
      timeoutMs: 5000
    });

    let command;
    if (checkPython.exitCode === 0) {
      command = pythonCommand;
    } else {
      // Fallback to Perl (common on Linux systems)
      command = this.buildPerlEditCommand(filePath, oldText, newText);
    }

    const result = await this.sshClient.executeCommand({
      host,
      user,
      port,
      command,
      privateKeyPath,
      timeoutMs: 60000
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to edit file: ${result.error || result.output}`);
    }

    return {
      success: true,
      message: result.output.trim() || 'Text replaced successfully'
    };
  }

  /**
   * Build Python command for text replacement
   * @private
   */
  buildPythonEditCommand(filePath, oldText, newText) {
    const escapedPath = this.escapeShellArg(filePath);
    
    // Use heredoc to pass the Python script safely
    const pythonScript = `
import sys
with open(${JSON.stringify(filePath)}, 'r') as f:
    content = f.read()
old_text = ${JSON.stringify(oldText)}
new_text = ${JSON.stringify(newText)}
if old_text not in content:
    print("Error: Text not found in file", file=sys.stderr)
    sys.exit(1)
occurrences = content.count(old_text)
if occurrences > 1:
    print(f"Error: Text appears {occurrences} times (must be unique)", file=sys.stderr)
    sys.exit(1)
content = content.replace(old_text, new_text, 1)
with open(${JSON.stringify(filePath)}, 'w') as f:
    f.write(content)
print("Replaced 1 occurrence")
`;

    return `python3 <<'SSH_ORBIT_PYTHON_EOF'${pythonScript}
SSH_ORBIT_PYTHON_EOF`;
  }

  /**
   * Build Perl command for text replacement
   * @private
   */
  buildPerlEditCommand(filePath, oldText, newText) {
    const escapedPath = this.escapeShellArg(filePath);
    
    // Escape text for Perl - using quotemeta for literal matching
    const perlScript = `
use strict;
use warnings;
my $file = ${JSON.stringify(filePath)};
my $old = ${JSON.stringify(oldText)};
my $new = ${JSON.stringify(newText)};
open my $fh, '<', $file or die "Cannot read: $!";
my $content = do { local $/; <$fh> };
close $fh;
my $quoted = quotemeta($old);
my $count = () = $content =~ /$quoted/g;
die "Text not found" if $count == 0;
die "Text appears $count times (must be unique)" if $count > 1;
$content =~ s/$quoted/$new/;
open $fh, '>', $file or die "Cannot write: $!";
print $fh $content;
close $fh;
print "Replaced 1 occurrence\\n";
`;

    return `perl <<'SSH_ORBIT_PERL_EOF'${perlScript}
SSH_ORBIT_PERL_EOF`;
  }

  /**
   * Escape shell argument for safe command execution
   * @private
   * @param {string} arg - Argument to escape
   * @returns {string} Escaped argument
   */
  escapeShellArg(arg) {
    // Use single quotes and escape any single quotes in the argument
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}
