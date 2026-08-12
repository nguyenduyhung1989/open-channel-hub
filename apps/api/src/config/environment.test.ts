import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseEnvironment } from './environment.js';

describe('parseEnvironment', () => {
  it('returns only the documented runtime settings with safe defaults', () => {
    expect(parseEnvironment({})).toEqual({
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3000
    });
  });

  it('does not make an unused log-level variable part of application configuration', () => {
    expect(parseEnvironment({ LOG_LEVEL: 'trace', PORT: '3010' })).toEqual({
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3010
    });
  });

  it('rejects an invalid port before the server starts', () => {
    expect(() => parseEnvironment({ PORT: '0' })).toThrow(EnvironmentConfigurationError);
  });
});
