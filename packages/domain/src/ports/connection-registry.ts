import type { ConnectionRegistration } from '@open-channel-hub/contracts';

/**
 * Ensures that the durable connection identity ledger agrees with configured
 * runtime connector metadata before provider traffic can be persisted.
 */
export interface ConnectionRegistry {
  ensureRegistered(connections: readonly ConnectionRegistration[]): Promise<void>;
}
