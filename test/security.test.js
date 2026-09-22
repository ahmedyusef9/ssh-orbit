import test from 'node:test';
import assert from 'node:assert/strict';

import { SecurityValidator } from '../lib/security.js';

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  try {
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('target validation rejects invalid ports', () => {
  const security = new SecurityValidator();

  assert.throws(
    () => security.validateTarget({ host: 'server.example.com', user: 'ubuntu', port: 0 }),
    /port must be an integer between 1 and 65535/
  );
  assert.throws(
    () => security.validateTarget({ host: 'server.example.com', user: 'ubuntu', port: 22.5 }),
    /port must be an integer between 1 and 65535/
  );
});

test('path allowlists enforce directory boundaries', () => {
  withEnvironment({ SSH_ORBIT_ALLOWED_PATH_PREFIXES: '/app,/var/log' }, () => {
    const security = new SecurityValidator();

    assert.doesNotThrow(() => security.validateFilePath('/app/config.json'));
    assert.doesNotThrow(() => security.validateFilePath('/var/log/service.log'));
    assert.throws(() => security.validateFilePath('/application/secrets.txt'), /not under allowed prefixes/);
  });
});

test('target allowlists match the requested user, host, and port', () => {
  withEnvironment({ SSH_ORBIT_ALLOWED_TARGETS: 'deploy@server.example.com:2222' }, () => {
    const security = new SecurityValidator();

    assert.doesNotThrow(() => security.validateTarget({
      host: 'server.example.com',
      user: 'deploy',
      port: 2222,
    }));
    assert.throws(
      () => security.validateTarget({ host: 'server.example.com', user: 'ubuntu', port: 2222 }),
      /not in the allowlist/
    );
  });
});

test('timeouts are bounded to prevent unmonitored remote sessions', () => {
  const security = new SecurityValidator();

  assert.doesNotThrow(() => security.validateTimeout(30_000));
  assert.throws(() => security.validateTimeout(0), /timeoutMs must be an integer between 1 and 3600000/);
  assert.throws(() => security.validateTimeout(3_600_001), /timeoutMs must be an integer between 1 and 3600000/);
});
