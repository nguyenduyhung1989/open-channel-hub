import type { Channel } from './connector.js';

/** The only provider command supported by the Phase 0 core. */
export interface SendTextProviderCommand {
  readonly type: 'message.send.text';
  readonly connectionId: string;
  readonly recipientId: string;
  readonly text: string;
}

export type ProviderCommand = SendTextProviderCommand;

/** A deliberately small provider acknowledgement with no raw provider payload. */
export interface ProviderReceipt {
  readonly connectionId: string;
  readonly providerMessageId: string;
  readonly acceptedAt: string;
}

/**
 * The minimum canonical inbound event. Connector adapters normalize provider webhooks
 * or polling updates into this form before application code sees them.
 */
export interface CanonicalEvent {
  readonly id: string;
  readonly providerEventId: string;
  readonly type: 'message.received';
  readonly connectionId: string;
  readonly channel: Channel;
  readonly occurredAt: string;
  readonly message: Readonly<{
    id: string;
    senderId: string;
    conversationId: string;
    text: string;
  }>;
}
