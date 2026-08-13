/** Serializes ledger identity allocation and commit with binding registration. */
export const INBOUND_EVENT_APPEND_LOCK_KEY = 1_864_659_702;

/** Serializes immutable connection-registration transactions. */
export const CONNECTION_REGISTRY_LOCK_KEY = 1_864_659_703;

/**
 * Serializes a source-bound reply command's idempotency decision. The Phase 4c
 * ledger deliberately favors one unambiguous durable intent over parallel
 * throughput; provider dispatch does not exist at this boundary yet.
 */
export const OUTBOUND_REPLY_COMMAND_CREATE_LOCK_KEY = 1_864_659_704;
