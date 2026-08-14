/**
 * A durable reply command intentionally contains only public, operator-safe
 * metadata. Its provider-specific reply target remains private to the storage
 * adapter and is never accepted from a caller.
 */
export interface OutboundReplyCommand {
  readonly createdAt: string;
  readonly id: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly state: 'queued';
}

/**
 * Immutable provenance for the authority that recorded a reply command.
 * It intentionally names an inbox and, for dashboard actions, a principal;
 * credentials, sessions, reply targets, and message content never belong in
 * this boundary.
 */
export type OutboundReplyCommandAuthorization =
  | Readonly<{
      inboxId: string;
      kind: 'inbox_bearer';
    }>
  | Readonly<{
      dashboardPrincipalId: string;
      inboxId: string;
      kind: 'dashboard_principal';
    }>;

/**
 * A caller supplies the exact immutable connection scope it already owns.
 * The source event is the sole authority for a later provider reply target.
 */
export interface OutboundReplyCommandCreateInput {
  readonly allowedConnectionIds: readonly string[];
  readonly authorization: OutboundReplyCommandAuthorization;
  readonly clientOperationId: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly text: string;
}

/**
 * `source_unavailable` deliberately conflates an absent source and a source
 * outside the caller's authorized connection scope. That prevents the store
 * boundary from becoming an account or event-existence oracle.
 */
export type CreateOutboundReplyCommandResult =
  | Readonly<{
      command: OutboundReplyCommand;
      kind: 'created';
    }>
  | Readonly<{
      command: OutboundReplyCommand;
      kind: 'idempotent_replay';
    }>
  | Readonly<{
      kind: 'idempotency_conflict';
    }>
  | Readonly<{
      kind: 'source_unavailable';
    }>;

/**
 * Domain-owned persistence boundary for source-bound outbound reply commands.
 * It only records intent; a later phase owns provider dispatch, receipts,
 * retry policy, and delivery state transitions.
 */
export interface OutboundReplyCommandStore {
  create(input: OutboundReplyCommandCreateInput): Promise<CreateOutboundReplyCommandResult>;
}
