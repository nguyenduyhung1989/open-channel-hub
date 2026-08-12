import type { CanonicalEvent } from '@open-channel-hub/contracts';

/**
 * Durable boundary owned by the domain for canonical inbound events. Provider
 * adapters normalize untrusted payloads before events reach this port.
 */
export interface InboundEventStore {
  append(events: readonly CanonicalEvent[]): Promise<void>;
}
