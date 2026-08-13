import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import type { ConnectorAdapter } from '@open-channel-hub/connector-sdk';

import { FacebookPageCommandRejectedError } from './facebook-page-command-rejected-error.js';
import { toFacebookPageTextEvents } from './facebook-page-types.js';

const FACEBOOK_PAGE_CHANNEL = 'facebook_page' as const;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const FACEBOOK_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;

const facebookPageCapabilities = toCapabilitySnapshot([{ id: 'message.receive.text' }]);

const facebookPageManifest: ConnectorManifest = Object.freeze({
  capabilities: facebookPageCapabilities,
  channel: FACEBOOK_PAGE_CHANNEL,
  displayName: 'Facebook Page',
  id: 'facebook-page',
  tier: 'OFFICIAL'
});

export interface FacebookPageConnectorOptions {
  readonly appId: string;
  readonly connectionId: string;
  readonly pageId: string;
}

/** A safe configuration failure that never includes supplied identifiers. */
export class FacebookPageConnectorConfigurationError extends Error {
  public constructor() {
    super('The Facebook Page connector configuration is invalid.');
    this.name = 'FacebookPageConnectorConfigurationError';
  }
}

/**
 * Official Facebook Page adapter for the deliberately narrow inbound-text
 * slice. It has no Graph API client, credential storage, OAuth behavior, or
 * outbound path. The HTTP layer owns raw-body HMAC verification and maps Page
 * IDs to the App configuration before invoking this adapter.
 */
export class FacebookPageConnectorAdapter implements ConnectorAdapter {
  readonly #connectionId: string;
  readonly #pageId: string;
  #status: ConnectionState['status'] = 'connected';

  public constructor(options: FacebookPageConnectorOptions) {
    const snapshot = toConfigurationSnapshot(options);

    this.#connectionId = snapshot.connectionId;
    this.#pageId = snapshot.pageId;
  }

  public manifest(): ConnectorManifest {
    return facebookPageManifest;
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
    return facebookPageCapabilities;
  }

  public async execute(command: ProviderCommand): Promise<ProviderReceipt> {
    void command;
    throw new FacebookPageCommandRejectedError();
  }

  public normalize(rawEvent: unknown): readonly CanonicalEvent[] {
    const textEvents = toFacebookPageTextEvents(rawEvent);
    const canonicalEvents = textEvents
      .filter((event) => event.pageId === this.#pageId)
      .map((event) =>
        Object.freeze({
          channel: FACEBOOK_PAGE_CHANNEL,
          connectionId: this.#connectionId,
          id: `facebook-page:${this.#connectionId}:event:${event.messageId}`,
          message: Object.freeze({
            conversationId: event.senderId,
            id: event.messageId,
            senderId: event.senderId,
            text: event.text
          }),
          occurredAt: new Date(event.timestamp).toISOString(),
          providerEventId: event.messageId,
          type: 'message.received' as const
        })
      );

    return canonicalEvents.length === 0 ? Object.freeze([]) : Object.freeze(canonicalEvents);
  }

  private connectionState(): ConnectionState {
    return Object.freeze({
      capabilities: facebookPageCapabilities,
      channel: FACEBOOK_PAGE_CHANNEL,
      connectorId: facebookPageManifest.id,
      id: this.#connectionId,
      status: this.#status
    });
  }
}

type FacebookPageConfigurationSnapshot = Readonly<{
  appId: string;
  connectionId: string;
  pageId: string;
}>;

const toConfigurationSnapshot = (
  options: FacebookPageConnectorOptions
): FacebookPageConfigurationSnapshot => {
  try {
    if (
      !isRecord(options) ||
      !isFacebookIdentifier(options.appId) ||
      !isConnectionId(options.connectionId) ||
      !isFacebookIdentifier(options.pageId)
    ) {
      throw new FacebookPageConnectorConfigurationError();
    }

    return Object.freeze({
      appId: options.appId,
      connectionId: options.connectionId,
      pageId: options.pageId
    });
  } catch (error) {
    if (error instanceof FacebookPageConnectorConfigurationError) {
      throw error;
    }

    throw new FacebookPageConnectorConfigurationError();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConnectionId = (value: unknown): value is string =>
  typeof value === 'string' && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isFacebookIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && FACEBOOK_IDENTIFIER_PATTERN.test(value);

function toCapabilitySnapshot(
  capabilities: readonly ConnectorCapability[]
): readonly ConnectorCapability[] {
  return Object.freeze(capabilities.map((capability) => Object.freeze({ id: capability.id })));
}
