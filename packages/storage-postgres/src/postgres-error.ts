/**
 * Deliberately generic storage error. PostgreSQL connection details and query
 * failures can contain credentials or provider data, so they never cross this
 * adapter boundary.
 */
export class PostgresStorageError extends Error {
  public constructor() {
    super('PostgreSQL storage is unavailable.');
    this.name = 'PostgresStorageError';
  }
}
