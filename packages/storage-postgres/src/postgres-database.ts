import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';
import type {
  ConnectionRegistry,
  DashboardGoogleIdentityStore,
  DashboardSessionStore,
  InboundEventFeedReader,
  InboundEventReader,
  InboundEventStore,
  OutboundReplyCommandHistoryReader,
  OutboundReplyCommandStore,
  OutboundTelegramDeliveryAuthorizationStore
} from '@open-channel-hub/domain';

import { PostgresConnectionRegistry } from './postgres-connection-registry.js';
import { PostgresDashboardGoogleIdentityStore } from './postgres-dashboard-google-identity-store.js';
import { PostgresDashboardSessionStore } from './postgres-dashboard-session-store.js';
import { PostgresStorageError } from './postgres-error.js';
import { PostgresInboundEventFeedReader } from './postgres-inbound-event-feed-reader.js';
import { PostgresInboundEventStore } from './postgres-inbound-event-store.js';
import { PostgresInboundEventReader } from './postgres-inbound-event-reader.js';
import { assertPostgresSchemaCurrent, migratePostgresSchema } from './postgres-migrations.js';
import { PostgresOutboundReplyCommandStore } from './postgres-outbound-reply-command-store.js';
import { PostgresOutboundReplyCommandHistoryReader } from './postgres-outbound-reply-command-history-reader.js';
import { PostgresOutboundTelegramDeliveryAuthorizationStore } from './postgres-outbound-telegram-delivery-authorization-store.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

export interface PostgresDatabaseOptions {
  readonly database: string;
  readonly host: string;
  readonly passwordFile: string;
  readonly port: number;
  readonly user: string;
}

export interface PostgresDatabase {
  readonly connectionRegistry: ConnectionRegistry;
  readonly dashboardGoogleIdentityStore: DashboardGoogleIdentityStore;
  readonly dashboardSessionStore: DashboardSessionStore;
  readonly inboundEventFeedReader: InboundEventFeedReader;
  readonly inboundEventReader: InboundEventReader;
  readonly inboundEventStore: InboundEventStore;
  readonly outboundReplyCommandHistoryReader: OutboundReplyCommandHistoryReader;
  readonly outboundReplyCommandStore: OutboundReplyCommandStore;
  readonly outboundTelegramDeliveryAuthorizationStore: OutboundTelegramDeliveryAuthorizationStore;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
  migrate(): Promise<void>;
}

/**
 * Creates the single PostgreSQL resource used by the API composition root.
 * It keeps the credential in this infrastructure adapter and exposes only the
 * domain-owned event-store port to the rest of the application.
 */
export const createPostgresDatabase = async (
  options: PostgresDatabaseOptions
): Promise<PostgresDatabase> => {
  const configuration = toConfigurationSnapshot(options);
  const password = await readPassword(configuration.passwordFile);
  const pool = new Pool({
    connectionTimeoutMillis: 5_000,
    database: configuration.database,
    host: configuration.host,
    idleTimeoutMillis: 30_000,
    max: 5,
    password,
    port: configuration.port,
    user: configuration.user
  });
  let idleClientError = false;

  pool.on('error', () => {
    idleClientError = true;
  });

  const sqlPool = toSqlPool(pool);
  const connectionRegistry = new PostgresConnectionRegistry(sqlPool);
  const dashboardGoogleIdentityStore = new PostgresDashboardGoogleIdentityStore(sqlPool);
  const dashboardSessionStore = new PostgresDashboardSessionStore(sqlPool);
  const inboundEventFeedReader = new PostgresInboundEventFeedReader(sqlPool);
  const inboundEventReader = new PostgresInboundEventReader(sqlPool);
  const inboundEventStore = new PostgresInboundEventStore(sqlPool);
  const outboundReplyCommandStore = new PostgresOutboundReplyCommandStore(sqlPool);
  const outboundReplyCommandHistoryReader = new PostgresOutboundReplyCommandHistoryReader(sqlPool);
  const outboundTelegramDeliveryAuthorizationStore =
    new PostgresOutboundTelegramDeliveryAuthorizationStore(sqlPool);

  return Object.freeze({
    connectionRegistry,
    dashboardGoogleIdentityStore,
    dashboardSessionStore,
    inboundEventFeedReader,
    inboundEventReader,
    inboundEventStore,
    outboundReplyCommandHistoryReader,
    outboundReplyCommandStore,
    outboundTelegramDeliveryAuthorizationStore,
    checkReadiness: async (): Promise<void> => {
      try {
        if (idleClientError) {
          await sqlPool.query('SELECT 1');
        }

        await assertPostgresSchemaCurrent(sqlPool);
        idleClientError = false;
      } catch {
        throw new PostgresStorageError();
      }
    },
    close: async (): Promise<void> => {
      try {
        await pool.end();
      } catch {
        throw new PostgresStorageError();
      }
    },
    migrate: async (): Promise<void> => {
      await migratePostgresSchema(sqlPool);
      idleClientError = false;
    }
  });
};

type ConfigurationSnapshot = Readonly<{
  database: string;
  host: string;
  passwordFile: string;
  port: number;
  user: string;
}>;

const toConfigurationSnapshot = (options: PostgresDatabaseOptions): ConfigurationSnapshot => {
  if (
    !isRecord(options) ||
    !isNonBlankString(options.database) ||
    !isNonBlankString(options.host) ||
    !isAbsolutePath(options.passwordFile) ||
    !isPort(options.port) ||
    !isNonBlankString(options.user)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    database: options.database,
    host: options.host,
    passwordFile: options.passwordFile,
    port: options.port,
    user: options.user
  });
};

const readPassword = async (passwordFile: string): Promise<string> => {
  try {
    const password = await readFile(passwordFile, 'utf8');

    if (!isSafeDatabasePassword(password)) {
      throw new PostgresStorageError();
    }

    return password;
  } catch (error) {
    if (error instanceof PostgresStorageError) {
      throw error;
    }

    throw new PostgresStorageError();
  }
};

const toSqlPool = (pool: Pool): SqlPool =>
  Object.freeze({
    connect: async (): Promise<SqlClient> => {
      const client = await pool.connect();

      return Object.freeze({
        query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> =>
          toSqlQueryResult(await client.query(sql, [...values])),
        release: () => client.release()
      });
    },
    query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> =>
      toSqlQueryResult(await pool.query(sql, [...values]))
  });

const toSqlQueryResult = (
  result: Readonly<{ rows: readonly Readonly<Record<string, unknown>>[] }>
): SqlQueryResult => Object.freeze({ rows: Object.freeze([...result.rows]) });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isAbsolutePath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && value.length <= 1_024;

const isPort = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65_535;

const isSafeDatabasePassword = (value: string): boolean => /^[!-~]{32,512}$/.test(value);
