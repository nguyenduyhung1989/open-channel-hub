import { describe, expect, it } from 'vitest';

import { createPostgresDatabase } from './postgres-database.js';
import { PostgresStorageError } from './postgres-error.js';

describe('createPostgresDatabase', () => {
  it('rejects malformed connection configuration before attempting to read a password file', async () => {
    await expect(
      createPostgresDatabase({
        database: '',
        host: 'postgres',
        passwordFile: '/path-that-must-never-be-read-for-this-test',
        port: 5432,
        user: 'open_channel_hub'
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });
});
