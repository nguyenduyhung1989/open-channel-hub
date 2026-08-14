/**
 * A durable human authorization to let a future, separately-designed
 * Telegram dispatcher consider one already-queued command. This is evidence
 * only: recording it must never perform provider I/O or create an attempt.
 */
export interface OutboundTelegramDeliveryAuthorization {
  readonly authorizedAt: string;
  readonly commandId: string;
  readonly dashboardPrincipalId: string;
  readonly inboxId: string;
}

/**
 * The caller owns an immutable inbox scope selected by server composition.
 * Neither a reply target nor a Bot credential belongs to this boundary.
 */
export interface OutboundTelegramDeliveryAuthorizationCreateInput {
  readonly allowedConnectionIds: readonly string[];
  readonly commandId: string;
  readonly dashboardPrincipalId: string;
  readonly inboxId: string;
}

/**
 * `command_unavailable` deliberately conflates absent, out-of-scope,
 * historical, non-Telegram, drifted, non-private, and already-attempted
 * commands. The persistence boundary must not become an authorization oracle.
 */
export type CreateOutboundTelegramDeliveryAuthorizationResult =
  | Readonly<{
      authorization: OutboundTelegramDeliveryAuthorization;
      kind: 'created';
    }>
  | Readonly<{
      authorization: OutboundTelegramDeliveryAuthorization;
      kind: 'idempotent_replay';
    }>
  | Readonly<{
      kind: 'authorization_conflict';
    }>
  | Readonly<{
      kind: 'command_unavailable';
    }>;

/**
 * Stores one immutable, dashboard-principal approval for a Telegram command.
 * A later dispatcher must recheck current policy and remains out of scope.
 */
export interface OutboundTelegramDeliveryAuthorizationStore {
  create(
    input: OutboundTelegramDeliveryAuthorizationCreateInput
  ): Promise<CreateOutboundTelegramDeliveryAuthorizationResult>;
}
