import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import type { ConnectorAdapter } from '@open-channel-hub/connector-sdk';

import { WhatsAppBusinessCommandRejectedError } from './whatsapp-business-command-rejected-error.js';
import { toWhatsAppBusinessTextEvents } from './whatsapp-business-types.js';

const WHATSAPP_BUSINESS_CHANNEL = 'whatsapp_business' as const;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const WHATSAPP_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;

const whatsappBusinessCapabilities = toCapabilitySnapshot([{ id: 'message.receive.text' }]);

const whatsappBusinessManifest: ConnectorManifest = Object.freeze({
  capabilities: whatsappBusinessCapabilities,
  channel: WHATSAPP_BUSINESS_CHANNEL,
  displayName: 'WhatsApp Business',
  id: 'whatsapp-business',
  tier: 'OFFICIAL'
});

export interface WhatsAppBusinessConnectorOptions {
  readonly appId: string;
  readonly connectionId: string;
  readonly phoneNumberId: string;
  readonly wabaId: string;
}

/** A safe configuration failure that never includes supplied identifiers. */
export class WhatsAppBusinessConnectorConfigurationError extends Error {
  public constructor() {
    super('The WhatsApp Business connector configuration is invalid.');
    this.name = 'WhatsAppBusinessConnectorConfigurationError';
  }
}

/**
 * Official WhatsApp Business Cloud API adapter for the deliberately narrow
 * inbound-text slice. It has no HTTP client, credential storage, subscription
 * behavior, OAuth flow, or outbound path. Raw-body signature verification and
 * App selection stay in the HTTP ingress before this adapter is invoked.
 */
export class WhatsAppBusinessConnectorAdapter implements ConnectorAdapter {
  readonly #connectionId: string;
  readonly #phoneNumberId: string;
  readonly #wabaId: string;
  #status: ConnectionState['status'] = 'connected';

  public constructor(options: WhatsAppBusinessConnectorOptions) {
    const snapshot = toConfigurationSnapshot(options);

    this.#connectionId = snapshot.connectionId;
    this.#phoneNumberId = snapshot.phoneNumberId;
    this.#wabaId = snapshot.wabaId;
  }

  public manifest(): ConnectorManifest {
    return whatsappBusinessManifest;
  }

  public async connect(): Promise<ConnectionState> {
    this.#status = 'connected';
    return this.connectionState();
  }

  public async disconnect(): Promise<ConnectionState> {
    this.#status = 'disconnected';
    return this.connectionState();
  }

  public async health(): Promise<ConnectionState> {
    return this.connectionState();
  }

  public capabilities(): readonly ConnectorCapability[] {
    return whatsappBusinessCapabilities;
  }

  public async execute(command: ProviderCommand): Promise<ProviderReceipt> {
    void command;
    throw new WhatsAppBusinessCommandRejectedError();
  }

  public normalize(rawEvent: unknown): readonly CanonicalEvent[] {
    const canonicalEvents = toWhatsAppBusinessTextEvents(rawEvent)
      .filter(
        (event) => event.wabaId === this.#wabaId && event.phoneNumberId === this.#phoneNumberId
      )
      .map((event) =>
        Object.freeze({
          channel: WHATSAPP_BUSINESS_CHANNEL,
          connectionId: this.#connectionId,
          id: `whatsapp-business:${this.#connectionId}:event:${event.messageId}`,
          message: Object.freeze({
            conversationId: event.senderId,
            id: event.messageId,
            senderId: event.senderId,
            text: event.text
          }),
          occurredAt: new Date(Number(event.timestamp) * 1_000).toISOString(),
          providerEventId: event.messageId,
          type: 'message.received' as const
        })
      );

    return canonicalEvents.length === 0 ? Object.freeze([]) : Object.freeze(canonicalEvents);
  }

  private connectionState(): ConnectionState {
    return Object.freeze({
      capabilities: whatsappBusinessCapabilities,
      channel: WHATSAPP_BUSINESS_CHANNEL,
      connectorId: whatsappBusinessManifest.id,
      id: this.#connectionId,
      status: this.#status
    });
  }
}

type WhatsAppBusinessConfigurationSnapshot = Readonly<{
  connectionId: string;
  phoneNumberId: string;
  wabaId: string;
}>;

const toConfigurationSnapshot = (
  options: WhatsAppBusinessConnectorOptions
): WhatsAppBusinessConfigurationSnapshot => {
  try {
    if (
      !isRecord(options) ||
      !isWhatsAppIdentifier(options.appId) ||
      !isConnectionId(options.connectionId) ||
      !isWhatsAppIdentifier(options.phoneNumberId) ||
      !isWhatsAppIdentifier(options.wabaId)
    ) {
      throw new WhatsAppBusinessConnectorConfigurationError();
    }

    return Object.freeze({
      connectionId: options.connectionId,
      phoneNumberId: options.phoneNumberId,
      wabaId: options.wabaId
    });
  } catch (error) {
    if (error instanceof WhatsAppBusinessConnectorConfigurationError) {
      throw error;
    }

    throw new WhatsAppBusinessConnectorConfigurationError();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConnectionId = (value: unknown): value is string =>
  typeof value === 'string' && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isWhatsAppIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && WHATSAPP_IDENTIFIER_PATTERN.test(value);

function toCapabilitySnapshot(
  capabilities: readonly ConnectorCapability[]
): readonly ConnectorCapability[] {
  return Object.freeze(capabilities.map((capability) => Object.freeze({ id: capability.id })));
}
