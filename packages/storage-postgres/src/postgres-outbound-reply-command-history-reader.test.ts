import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresOutboundReplyCommandHistoryReader } from './postgres-outbound-reply-command-history-reader.js';
import type { SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_A = 'connection-a';
const CONNECTION_B = 'connection-b';
const CONNECTION_IDS = Object.freeze([CONNECTION_A, CONNECTION_B]);

describe('PostgresOutboundReplyCommandHistoryReader', () => {
  it('returns a parameterized, inbox-scoped history with only its safe read model', async () => {
    const pool = createPool({
      firstPageRows: [
        row('12', CONNECTION_B, {
          message_text: "Queued reply '; DROP TABLE outbound_commands; --"
        }),
        row('11', CONNECTION_A),
        row('10', CONNECTION_B)
      ],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });

    const result = await new PostgresOutboundReplyCommandHistoryReader(pool).list({
      allowedConnectionIds: CONNECTION_IDS,
      pageSize: 2
    });

    expect(result).toEqual({
      commands: [
        command('12', CONNECTION_B, "Queued reply '; DROP TABLE outbound_commands; --"),
        command('11', CONNECTION_A)
      ],
      nextCursor: {
        beforeSequence: '11',
        snapshotMaxSequence: '12'
      }
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.commands)).toBe(true);
    expect(Object.isFrozen(result.commands[0])).toBe(true);
    expect(pool.queries).toHaveLength(2);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('connection_id = ANY($1::text[])'),
      values: [CONNECTION_IDS]
    });
    expect(pool.queries[1]).toMatchObject({
      sql: expect.stringContaining('outbound_command.connection_id = ANY($1::text[])'),
      values: [CONNECTION_IDS, '12', 3]
    });
    expect(pool.queries[1]?.sql).toContain('outbound_command.command_id <= $2::bigint');
    expect(pool.queries[1]?.sql).toContain('ORDER BY outbound_command.command_id DESC');
    expect(pool.queries[1]?.sql).not.toContain(CONNECTION_A);
    expect(pool.queries[1]?.sql).not.toContain("Queued reply '; DROP TABLE outbound_commands; --");
    expect(pool.queries[1]?.sql).not.toContain('reply_target_id');
    expect(pool.queries[1]?.sql).not.toContain('source_message_id');
    expect(pool.queries[1]?.sql).not.toContain('source_channel');
    expect(pool.queries[1]?.sql).not.toContain('client_operation_id');
    expect(result.commands[0]).not.toHaveProperty('replyTargetId');
    expect(result.commands[0]).not.toHaveProperty('sourceMessageId');
    expect(result.commands[0]).not.toHaveProperty('sourceChannel');
    expect(result.commands[0]).not.toHaveProperty('clientOperationId');
  });

  it('orders the underlying bigint command column numerically rather than the projected text alias', async () => {
    const pool = createPool({
      firstPageRows: [
        row('11', CONNECTION_A),
        row('7', CONNECTION_B),
        row('4', CONNECTION_A),
        row('1', CONNECTION_B)
      ],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '11' })]
    });

    await expect(
      new PostgresOutboundReplyCommandHistoryReader(pool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 4
      })
    ).resolves.toEqual({
      commands: [
        command('11', CONNECTION_A),
        command('7', CONNECTION_B),
        command('4', CONNECTION_A),
        command('1', CONNECTION_B)
      ]
    });
    expect(pool.queries[1]?.sql).toContain('ORDER BY outbound_command.command_id DESC');
    expect(pool.queries[1]?.sql).not.toContain('ORDER BY command_id DESC');
  });

  it('continues below one committed snapshot while ignoring commands committed after that snapshot', async () => {
    const pool = createPool({
      commandRows: [
        row('12', CONNECTION_B),
        row('11', CONNECTION_A),
        row('10', CONNECTION_B),
        row('9', CONNECTION_A)
      ]
    });
    const reader = new PostgresOutboundReplyCommandHistoryReader(pool);

    const first = await reader.list({ allowedConnectionIds: CONNECTION_IDS, pageSize: 2 });
    pool.addCommittedAfterSnapshot(row('13', CONNECTION_A));

    expect(first).toEqual({
      commands: [command('12', CONNECTION_B), command('11', CONNECTION_A)],
      nextCursor: {
        beforeSequence: '11',
        snapshotMaxSequence: '12'
      }
    });

    const firstCursor = first.nextCursor;

    if (firstCursor === undefined) {
      throw new Error('The first synthetic page must have a continuation cursor.');
    }

    await expect(
      reader.list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 2,
        cursor: firstCursor
      })
    ).resolves.toEqual({
      commands: [command('10', CONNECTION_B), command('9', CONNECTION_A)]
    });
    expect(pool.committedAfterSnapshot).toEqual([row('13', CONNECTION_A)]);
    expect(pool.queries).toHaveLength(3);
    expect(pool.queries[2]).toMatchObject({
      sql: expect.stringContaining('outbound_command.command_id < $3::bigint'),
      values: [CONNECTION_IDS, '12', '11', 3]
    });
    expect(pool.queries[2]?.sql).toContain('outbound_command.command_id <= $2::bigint');
  });

  it('returns an empty first page when no authorized connection has a committed command snapshot', async () => {
    const pool = createPool({ snapshotRows: [Object.freeze({ snapshot_max_sequence: null })] });

    await expect(
      new PostgresOutboundReplyCommandHistoryReader(pool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).resolves.toEqual({ commands: [] });
    expect(pool.queries).toHaveLength(1);
  });

  it('filters a future non-queued record from both the snapshot and command page', async () => {
    const pool = createPool({
      commandRows: [
        row('13', CONNECTION_A, { state: 'accepted' }),
        row('12', CONNECTION_B),
        row('11', CONNECTION_A)
      ]
    });

    await expect(
      new PostgresOutboundReplyCommandHistoryReader(pool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 2
      })
    ).resolves.toEqual({
      commands: [command('12', CONNECTION_B), command('11', CONNECTION_A)]
    });
    expect(pool.queries[0]?.sql).toContain("outbound_command.state = 'queued'");
    expect(pool.queries[1]?.sql).toContain("outbound_command.state = 'queued'");
  });

  it('fails closed when a row escapes scope, exposes malformed safe data, or breaks strict reverse order', async () => {
    const outsideScopePool = createPool({
      firstPageRows: [row('12', 'unrelated-connection')],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(outsideScopePool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });

    const malformedRowPool = createPool({
      firstPageRows: [row('12', CONNECTION_A, { state: 'accepted' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(malformedRowPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const malformedLookAheadPool = createPool({
      firstPageRows: [
        row('12', CONNECTION_B),
        row('11', CONNECTION_A, { source_provider_event_id: 'contains a space' })
      ],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(malformedLookAheadPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const unorderedPool = createPool({
      firstPageRows: [row('11', CONNECTION_A), row('12', CONNECTION_B)],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(unorderedPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 2
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });

  it('rejects malformed scope, cursor, row, snapshot, oversized page, and database details before exposing storage data', async () => {
    const invalidInputs: readonly unknown[] = [
      undefined,
      Object.freeze({ allowedConnectionIds: [], pageSize: 1 }),
      Object.freeze({ allowedConnectionIds: [CONNECTION_A, CONNECTION_A], pageSize: 1 }),
      Object.freeze({ allowedConnectionIds: [CONNECTION_B, CONNECTION_A], pageSize: 1 }),
      Object.freeze({ allowedConnectionIds: ['  '], pageSize: 1 }),
      Object.freeze({ allowedConnectionIds: CONNECTION_IDS, pageSize: 0 }),
      Object.freeze({ allowedConnectionIds: CONNECTION_IDS, pageSize: 1.5 }),
      Object.freeze({ allowedConnectionIds: CONNECTION_IDS, pageSize: 101 }),
      Object.freeze({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1,
        cursor: Object.freeze({ beforeSequence: '0009', snapshotMaxSequence: '9' })
      }),
      Object.freeze({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1,
        cursor: Object.freeze({ beforeSequence: '10', snapshotMaxSequence: '9' })
      }),
      Object.freeze({
        allowedConnectionIds: Array.from({ length: 101 }, (_, index) => `connection-${index}`),
        pageSize: 1
      })
    ];

    for (const input of invalidInputs) {
      const pool = createPool();
      await expect(
        new PostgresOutboundReplyCommandHistoryReader(pool).list(input as never)
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.queries).toHaveLength(0);
    }

    const malformedTextPool = createPool({
      firstPageRows: [row('12', CONNECTION_A, { message_text: ' \n\t ' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(malformedTextPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const oversizedPagePool = createPool({
      firstPageRows: [row('12', CONNECTION_B), row('11', CONNECTION_A), row('10', CONNECTION_B)],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(oversizedPagePool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const malformedSnapshotPool = createPool({ snapshotRows: [] });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(malformedSnapshotPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const invalidSnapshotValuePool = createPool({
      snapshotRows: [Object.freeze({ snapshot_max_sequence: 'not-a-bigint' })]
    });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(invalidSnapshotValuePool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const failingPool = createPool({ failOnQuery: true });
    await expect(
      new PostgresOutboundReplyCommandHistoryReader(failingPool).list({
        allowedConnectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });
  });
});

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakePool extends SqlPool {
  readonly committedAfterSnapshot: readonly Readonly<Record<string, unknown>>[];
  readonly queries: readonly RecordedQuery[];
  addCommittedAfterSnapshot(row: Readonly<Record<string, unknown>>): void;
}

interface PoolOptions {
  readonly commandRows?: readonly Readonly<Record<string, unknown>>[];
  readonly continuationPageRows?: readonly Readonly<Record<string, unknown>>[];
  readonly failOnQuery?: boolean;
  readonly firstPageRows?: readonly Readonly<Record<string, unknown>>[];
  readonly snapshotRows?: readonly Readonly<Record<string, unknown>>[];
}

const createPool = (options: PoolOptions = {}): FakePool => {
  const queries: RecordedQuery[] = [];
  const committedAfterSnapshot: Readonly<Record<string, unknown>>[] = [];
  const commandRows = [...(options.commandRows ?? [])];

  return Object.freeze({
    get committedAfterSnapshot(): readonly Readonly<Record<string, unknown>>[] {
      return Object.freeze([...committedAfterSnapshot]);
    },
    get queries(): readonly RecordedQuery[] {
      return Object.freeze([...queries]);
    },
    addCommittedAfterSnapshot: (newRow: Readonly<Record<string, unknown>>): void => {
      committedAfterSnapshot.push(newRow);
      commandRows.push(newRow);
    },
    connect: async () => {
      throw new Error('Read history must not need a dedicated client.');
    },
    query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
      queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (options.failOnQuery === true) {
        throw new Error('Synthetic PostgreSQL details must never cross the adapter boundary.');
      }

      if (sql.includes('MAX(outbound_command.command_id)::text')) {
        if (options.commandRows !== undefined) {
          const allowedConnectionIds = values[0];

          if (!isStringArray(allowedConnectionIds)) {
            throw new Error('Synthetic command-history scope must be an array of strings.');
          }

          const snapshot = commandRows
            .filter(
              (candidate) =>
                typeof candidate.connection_id === 'string' &&
                allowedConnectionIds.includes(candidate.connection_id) &&
                candidate.state === 'queued'
            )
            .map((candidate) => candidate.command_id)
            .filter((candidate): candidate is string => typeof candidate === 'string')
            .sort(compareDecimalStrings)
            .at(-1);

          return Object.freeze({
            rows: [Object.freeze({ snapshot_max_sequence: snapshot ?? null })]
          });
        }

        return Object.freeze({
          rows: options.snapshotRows ?? [Object.freeze({ snapshot_max_sequence: '12' })]
        });
      }

      if (options.commandRows !== undefined) {
        const allowedConnectionIds = values[0];
        const snapshotMaxSequence = values[1];
        const isContinuation = sql.includes('outbound_command.command_id < $3::bigint');
        const beforeSequence = isContinuation ? values[2] : undefined;
        const limit = values[isContinuation ? 3 : 2];

        if (
          !isStringArray(allowedConnectionIds) ||
          typeof snapshotMaxSequence !== 'string' ||
          (beforeSequence !== undefined && typeof beforeSequence !== 'string') ||
          typeof limit !== 'number'
        ) {
          throw new Error('Synthetic command-history query parameters are malformed.');
        }

        const rows = commandRows
          .filter(
            (candidate) =>
              typeof candidate.command_id === 'string' &&
              typeof candidate.connection_id === 'string' &&
              allowedConnectionIds.includes(candidate.connection_id) &&
              candidate.state === 'queued' &&
              compareDecimalStrings(candidate.command_id, snapshotMaxSequence) <= 0 &&
              (beforeSequence === undefined ||
                compareDecimalStrings(candidate.command_id, beforeSequence) < 0)
          )
          .sort((left, right) =>
            compareDecimalStrings(String(right.command_id), String(left.command_id))
          )
          .slice(0, limit);

        return Object.freeze({ rows: Object.freeze(rows) });
      }

      return Object.freeze({
        rows: sql.includes('outbound_command.command_id < $3::bigint')
          ? (options.continuationPageRows ?? [])
          : (options.firstPageRows ?? [])
      });
    }
  });
};

const row = (
  sequence: string,
  connectionId: string,
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    command_id: sequence,
    connection_id: connectionId,
    created_at: '2026-08-13T00:00:00.000Z',
    message_text: `Synthetic reply ${sequence}`,
    source_provider_event_id: `provider-${sequence}`,
    state: 'queued',
    ...overrides
  });

const command = (sequence: string, connectionId: string, text = `Synthetic reply ${sequence}`) => ({
  createdAt: '2026-08-13T00:00:00.000Z',
  id: sequence,
  sourceConnectionId: connectionId,
  sourceProviderEventId: `provider-${sequence}`,
  state: 'queued' as const,
  text
});

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((candidate) => typeof candidate === 'string');

const compareDecimalStrings = (left: string, right: string): number =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length;
