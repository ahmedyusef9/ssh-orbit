#!/usr/bin/env node
/**
 * @fileoverview SSH Orbit MCP Server - Secure SSH command execution and file operations
 * @copyright Copyright (c) 2025 Ahmad Abo Alhija
 * @author Ahmad Abo Alhija
 * @license MIT
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SSHClient } from '../ssh-client.js';
import { SecurityValidator } from '../lib/security.js';
import { FileTools } from '../lib/file-tools.js';

// Initialize components
const sshClient = new SSHClient();
const security = new SecurityValidator();
const fileTools = new FileTools(sshClient);

// Create MCP server
const server = new Server(
    {
      name: 'ssh-orbit',
      version: '1.0.3',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: 'ssh_execute',
    description: 'Execute a command on a remote SSH server and return the output, stderr, and exit code',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote hostname or IP address',
        },
        user: {
          type: 'string',
          description: 'SSH username',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
          default: 22,
          minimum: 1,
          maximum: 65535,
        },
        command: {
          type: 'string',
          description: 'Command to execute on the remote server',
        },
        privateKeyPath: {
          type: 'string',
          description: 'Optional path to private key file (if not using default or env)',
        },
        timeoutMs: {
          type: 'number',
          description: 'Command timeout in milliseconds (default: 30000)',
          default: 30000,
          minimum: 1,
          maximum: 3600000,
        },
      },
      required: ['host', 'user', 'command'],
    },
  },
  {
    name: 'ssh_read_lines',
    description: 'Read specific lines from a remote file (token-efficient for large files)',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote hostname or IP address',
        },
        user: {
          type: 'string',
          description: 'SSH username',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
          default: 22,
        },
        filePath: {
          type: 'string',
          description: 'Absolute path to remote file',
        },
        startLine: {
          type: 'number',
          description: 'Starting line number (1-indexed, inclusive)',
          minimum: 1,
          multipleOf: 1,
        },
        endLine: {
          type: 'number',
          description: 'Ending line number (inclusive)',
          minimum: 1,
          multipleOf: 1,
        },
        privateKeyPath: {
          type: 'string',
          description: 'Optional path to private key file',
        },
      },
      required: ['host', 'user', 'filePath', 'startLine', 'endLine'],
    },
  },
  {
    name: 'ssh_search_code',
    description: 'Search for pattern in remote files using grep (token-efficient pattern search)',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote hostname or IP address',
        },
        user: {
          type: 'string',
          description: 'SSH username',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
          default: 22,
        },
        path: {
          type: 'string',
          description: 'Absolute path to search in (file or directory)',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern (grep extended regex)',
        },
        filePattern: {
          type: 'string',
          description: 'Optional file pattern filter (e.g., "*.js", "*.py")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
          default: 100,
          minimum: 1,
          maximum: 10000,
          multipleOf: 1,
        },
        privateKeyPath: {
          type: 'string',
          description: 'Optional path to private key file',
        },
      },
      required: ['host', 'user', 'path', 'pattern'],
    },
  },
  {
    name: 'ssh_write_chunk',
    description: 'Write or append content to a remote file (token-efficient file writing)',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote hostname or IP address',
        },
        user: {
          type: 'string',
          description: 'SSH username',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
          default: 22,
        },
        filePath: {
          type: 'string',
          description: 'Absolute path to remote file',
        },
        content: {
          type: 'string',
          description: 'Content to write',
        },
        mode: {
          type: 'string',
          enum: ['overwrite', 'append'],
          description: 'Write mode: overwrite (replace file) or append',
        },
        privateKeyPath: {
          type: 'string',
          description: 'Optional path to private key file',
        },
      },
      required: ['host', 'user', 'filePath', 'content', 'mode'],
    },
  },
  {
    name: 'ssh_edit_block',
    description: 'Replace a specific text block in a remote file (80-90% token reduction vs full file rewrite)',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote hostname or IP address',
        },
        user: {
          type: 'string',
          description: 'SSH username',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
          default: 22,
        },
        filePath: {
          type: 'string',
          description: 'Absolute path to remote file',
        },
        oldText: {
          type: 'string',
          description: 'Exact text to replace (must be unique in file)',
        },
        newText: {
          type: 'string',
          description: 'Replacement text',
        },
        privateKeyPath: {
          type: 'string',
          description: 'Optional path to private key file',
        },
      },
      required: ['host', 'user', 'filePath', 'oldText', 'newText'],
    },
  },
];

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    // Validate target for all operations (if allowlist configured)
    const port = args.port ?? 22;
        security.validateTarget({ host: args.host, user: args.user, port });

    switch (name) {
      case 'ssh_execute': {
        security.validateCommand(args.command);
        const timeoutMs = args.timeoutMs ?? 30000;
        security.validateTimeout(timeoutMs);
        
        const result = await sshClient.executeCommand({
          host: args.host,
          user: args.user,
          port,
          command: args.command,
          privateKeyPath: args.privateKeyPath,
          timeoutMs,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                stdout: result.output,
                stderr: result.error,
                exitCode: result.exitCode,
              }, null, 2),
            },
          ],
        };
      }

      case 'ssh_read_lines': {
        security.validateFilePath(args.filePath);
        
        const result = await fileTools.readLines({
          host: args.host,
          user: args.user,
          port,
          filePath: args.filePath,
          startLine: args.startLine,
          endLine: args.endLine,
          privateKeyPath: args.privateKeyPath,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'ssh_search_code': {
        security.validateSearchPath(args.path);
        
        const result = await fileTools.searchCode({
          host: args.host,
          user: args.user,
          port,
          path: args.path,
          pattern: args.pattern,
          filePattern: args.filePattern,
          maxResults: args.maxResults ?? 100,
          privateKeyPath: args.privateKeyPath,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'ssh_write_chunk': {
        security.validateFilePath(args.filePath);
        security.validateContent(args.content);
        
        const result = await fileTools.writeChunk({
          host: args.host,
          user: args.user,
          port,
          filePath: args.filePath,
          content: args.content,
          mode: args.mode,
          privateKeyPath: args.privateKeyPath,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'ssh_edit_block': {
        security.validateFilePath(args.filePath);
        security.validateContent(args.oldText, 1048576); // 1MB limit for search text
        security.validateContent(args.newText);
        
        const result = await fileTools.editBlock({
          host: args.host,
          user: args.user,
          port,
          filePath: args.filePath,
          oldText: args.oldText,
          newText: args.newText,
          privateKeyPath: args.privateKeyPath,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            tool: name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup info to stderr (stdout is reserved for MCP protocol)
  const config = security.getConfig();
  console.error('SSH Orbit MCP Server v1.0.3');
  console.error('Copyright (c) 2025 Ahmad Abo Alhija');
  console.error('Author: Ahmad Abo Alhija (MIT License)');
  console.error('---');
  console.error('Security Configuration:');
  console.error(`  Target Allowlist: ${config.targetAllowlistEnabled ? 'ENABLED' : 'DISABLED (INSECURE)'}`);
  if (config.targetAllowlistEnabled) {
    console.error(`  Allowed Targets: ${config.allowedTargets.join(', ')}`);
  }
  console.error(`  Path Allowlist: ${config.pathAllowlistEnabled ? 'ENABLED' : 'DISABLED'}`);
  if (config.pathAllowlistEnabled) {
    console.error(`  Allowed Paths: ${config.allowedPathPrefixes.join(', ')}`);
  }
  console.error('---');
  console.error('Server ready on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
