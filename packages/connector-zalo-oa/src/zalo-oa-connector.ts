import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import type { ConnectorAdapter } from '@open-channel-hub/connector-sdk';

import { ZaloOaCommandRejectedError } from './zalo-oa-command-rejected-error.js';
import { toZaloOaTextEvent } from './zalo-oa-types.js';

const ZALO_OA_CHANNEL = 'zalo_oa' as const;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;

const zaloOaCapabilities = toCapabilitySnapshot([{ id: 'message.receive.text' }]);

const zaloOaManifest: ConnectorManifest = Object.freeze({
  capabilities: zaloOaCapabilities,
  channel: ZALO_OA_CHANNEL,
  displayName: 'Zalo Official Account',
  id: 'zalo-oa',
  tier: 'OFFICIAL'
});

export interface ZaloOaConnectorOptions {
  readonly appId: string;
  readonly connectionId: string;
  readonly oaId: string;
}

/** A safe configuration failure that never includes supplied identifiers. */
export class ZaloOaConnectorConfigurationError extends Error {
  public constructor() {
    super('The Zalo OA connector configuration is invalid.');
    this.name = 'ZaloOaConnectorConfigurationError';
  }
}

/**
 * Official Zalo OA adapter for the deliberately narrow inbound-text Phase 3a
 * slice. It has no HTTP client, OAuth behavior, credential storage, or
 * outbound path. The HTTP layer verifies signatures from raw bytes and selects
 * the configured app/OA before calling this adapter.
 */
export class ZaloOaConnectorAdapter implements ConnectorAdapter {
  readonly #appId: string;
  readonly #connectionId: string;
  readonly #oaId: string;
  #status: ConnectionState['status'] = 'connected';

  public constructor(options: ZaloOaConnectorOptions) {
    const snapshot = toConfigurationSnapshot(options);

    this.#appId = snapshot.appId;
    this.#connectionId = snapshot.connectionId;
    this.#oaId = snapshot.oaId;
  }

  public manifest(): ConnectorManifest {
    return zaloOaManifest;
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
    return zaloOaCapabilities;
  }

  public async execute(command: ProviderCommand): Promise<ProviderReceipt> {
    void command;
    throw new ZaloOaCommandRejectedError();
  }

  public normalize(rawEvent: unknown): readonly CanonicalEvent[] {
    const event = toZaloOaTextEvent(rawEvent);

    if (event === undefined || event.appId !== this.#appId || event.oaId !== this.#oaId) {
      return Object.freeze([]);
    }

    return Object.freeze([
      Object.freeze({
        channel: ZALO_OA_CHANNEL,
        connectionId: this.#connectionId,
        id: `zalo-oa:${this.#connectionId}:event:${event.messageId}`,
        message: Object.freeze({
          conversationId: event.senderId,
          id: event.messageId,
          senderId: event.senderId,
          text: event.text
        }),
        occurredAt: new Date(Number(event.timestamp)).toISOString(),
        providerEventId: event.messageId,
        type: 'message.received'
      })
    ]);
  }

  private connectionState(): ConnectionState {
    return Object.freeze({
      capabilities: zaloOaCapabilities,
      channel: ZALO_OA_CHANNEL,
      connectorId: zaloOaManifest.id,
      id: this.#connectionId,
      status: this.#status
    });
  }
}

type ZaloOaConfigurationSnapshot = Readonly<{
  appId: string;
  connectionId: string;
  oaId: string;
}>;

const toConfigurationSnapshot = (options: ZaloOaConnectorOptions): ZaloOaConfigurationSnapshot => {
  try {
    if (
      !isRecord(options) ||
      !isZaloIdentifier(options.appId) ||
      !isConnectionId(options.connectionId) ||
      !isZaloIdentifier(options.oaId)
    ) {
      throw new ZaloOaConnectorConfigurationError();
    }

    return Object.freeze({
      appId: options.appId,
      connectionId: options.connectionId,
      oaId: options.oaId
    });
  } catch (error) {
    if (error instanceof ZaloOaConnectorConfigurationError) {
      throw error;
    }

    throw new ZaloOaConnectorConfigurationError();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConnectionId = (value: unknown): value is string =>
  typeof value === 'string' && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isZaloIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && ZALO_IDENTIFIER_PATTERN.test(value);

function toCapabilitySnapshot(
  capabilities: readonly ConnectorCapability[]
): readonly ConnectorCapability[] {
  return Object.freeze(capabilities.map((capability) => Object.freeze({ id: capability.id })));
}
