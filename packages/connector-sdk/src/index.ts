import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';

export { ConnectorProviderError } from './errors.js';
export type { ConnectorProviderErrorInput } from './errors.js';

/**
 * Stable boundary between the hub and a provider-specific connector.
 * Adapters own provider translation only; they never own credentials or retries.
 */
export interface ConnectorAdapter {
  manifest(): ConnectorManifest;
  connect(): Promise<ConnectionState>;
  disconnect(): Promise<ConnectionState>;
  health(): Promise<ConnectionState>;
  capabilities(): readonly ConnectorCapability[];
  execute(command: ProviderCommand): Promise<ProviderReceipt>;
  normalize(rawEvent: unknown): readonly CanonicalEvent[];
}
