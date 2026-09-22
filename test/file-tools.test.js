import test from 'node:test';
import assert from 'node:assert/strict';

import { FileTools } from '../lib/file-tools.js';

class RecordingSshClient {
  constructor(result = { output: '', error: null, exitCode: 0 }) {
    this.commands = [];
    this.result = result;
  }

  async executeCommand(options) {
    this.commands.push(options);
    return this.result;
  }
}

test('readLines validates integer line ranges before creating a command', async () => {
  const tools = new FileTools(new RecordingSshClient());

  await assert.rejects(
    () => tools.readLines({
      host: 'server.example.com',
      user: 'ubuntu',
      filePath: '/var/log/app.log',
      startLine: '1; touch /tmp/unexpected',
      endLine: 2,
    }),
    /line numbers must be integers/
  );
});

test('searchCode bounds the result count before interpolating it into the command', async () => {
  const client = new RecordingSshClient({ output: '', error: null, exitCode: 0 });
  const tools = new FileTools(client);

  await tools.searchCode({
    host: 'server.example.com',
    user: 'ubuntu',
    path: '/app',
    pattern: 'error',
    maxResults: 3,
  });

  assert.match(client.commands[0].command, /head -n 3$/);
  await assert.rejects(
    () => tools.searchCode({
      host: 'server.example.com',
      user: 'ubuntu',
      path: '/app',
      pattern: 'error',
      maxResults: '3; touch /tmp/unexpected',
    }),
    /maxResults must be an integer/
  );
});

test('writeChunk uses a content-derived heredoc delimiter that cannot collide with a full content line', async () => {
  const content = 'first line\nSSH_ORBIT_EOF\nlast line';
  const client = new RecordingSshClient();
  const tools = new FileTools(client);

  await tools.writeChunk({
    host: 'server.example.com',
    user: 'ubuntu',
    filePath: '/app/config.txt',
    content,
    mode: 'overwrite',
  });

  const command = client.commands[0].command;
  const delimiter = command.split('\n')[0].match(/<<'([^']+)'/)[1];
  assert.notEqual(delimiter, 'SSH_ORBIT_EOF');
  assert.equal(content.split('\n').includes(delimiter), false);
});
