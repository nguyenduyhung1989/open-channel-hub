/** A deliberately small subset of PostgreSQL client behavior used by this adapter. */
export interface SqlQueryResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

export interface SqlClient {
  query(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
  query(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult>;
}
