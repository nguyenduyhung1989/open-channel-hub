import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import type { ConnectorAdapter } from '@open-channel-hub/connector-sdk';

import { ZaloUserCommandRejectedError } from './zalo-user-command-rejected-error.js';
import { toZaloUserInboundTextEvent } from './zalo-user-types.js';

const ZALO_USER_CHANNEL = 'zalo_user' as const;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ZALO_ACCOUNT_ID_PATTERN = /^[0-9]{1,32}$/;

const zaloUserCapabilities = toCapabilitySnapshot([{ id: 'message.receive.text' }]);

const zaloUserManifest: ConnectorManifest = Object.freeze({
  capabilities: zaloUserCapabilities,
  channel: ZALO_USER_CHANNEL,
  displayName: 'Zalo User (experimental)',
  id: 'zalo-user',
  tier: 'EXPERIMENTAL'
});

export interface ZaloUserConnectorOptions {
  readonly accountId: string;
  readonly connectionId: string;
}

/** A safe configuration failure that never includes supplied account data. */
export class ZaloUserConnectorConfigurationError extends Error {
  public constructor() {
    super('The Zalo User connector configuration is invalid.');
    this.name = 'ZaloUserConnectorConfigurationError';
  }
}

/**
 * Transport-neutral experimental Zalo User adapter. It translates only a
 * sanitized inbound direct/group text envelope; the separate bridge owns the
 * short-lived QR session, reconnect behavior, and provider HTTP/WebSocket I/O.
 */
export class ZaloUserConnectorAdapter implements ConnectorAdapter {
  readonly #accountId: string;
  readonly #connectionId: string;
  #status: ConnectionState['status'] = 'connected';

  public constructor(options: ZaloUserConnectorOptions) {
    const snapshot = toConfigurationSnapshot(options);

    this.#accountId = snapshot.accountId;
    this.#connectionId = snapshot.connectionId;
  }

  public manifest(): ConnectorManifest {
    return zaloUserManifest;
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
    return zaloUserCapabilities;
  }

  public async execute(command: ProviderCommand): Promise<ProviderReceipt> {
    void command;
    throw new ZaloUserCommandRejectedError();
  }

  public normalize(rawEvent: unknown): readonly CanonicalEvent[] {
    const event = toZaloUserInboundTextEvent(rawEvent);

    if (event === undefined || event.accountId !== this.#accountId) {
      return Object.freeze([]);
    }

    return Object.freeze([
      Object.freeze({
        channel: ZALO_USER_CHANNEL,
        connectionId: this.#connectionId,
        id: `zalo-user:${this.#connectionId}:event:${event.providerEventId}`,
        message: Object.freeze({
          conversationId: event.conversationId,
          id: event.providerEventId,
          senderId: event.senderId,
          text: event.text
        }),
        occurredAt: event.occurredAt,
        providerEventId: event.providerEventId,
        type: 'message.received',
        zaloUserThreadType: event.threadType
      })
    ]);
  }

  private connectionState(): ConnectionState {
    return Object.freeze({
      capabilities: zaloUserCapabilities,
      channel: ZALO_USER_CHANNEL,
      connectorId: zaloUserManifest.id,
      id: this.#connectionId,
      status: this.#status
    });
  }
}

type ZaloUserConfigurationSnapshot = Readonly<{
  accountId: string;
  connectionId: string;
}>;

const toConfigurationSnapshot = (
  options: ZaloUserConnectorOptions
): ZaloUserConfigurationSnapshot => {
  try {
    if (
      !isRecord(options) ||
      !isZaloAccountId(options.accountId) ||
      !isConnectionId(options.connectionId)
    ) {
      throw new ZaloUserConnectorConfigurationError();
    }

    return Object.freeze({
      accountId: options.accountId,
      connectionId: options.connectionId
    });
  } catch (error) {
    if (error instanceof ZaloUserConnectorConfigurationError) {
      throw error;
    }

    throw new ZaloUserConnectorConfigurationError();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConnectionId = (value: unknown): value is string =>
  typeof value === 'string' && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isZaloAccountId = (value: unknown): value is string =>
  typeof value === 'string' && ZALO_ACCOUNT_ID_PATTERN.test(value);

function toCapabilitySnapshot(
  capabilities: readonly ConnectorCapability[]
): readonly ConnectorCapability[] {
  return Object.freeze(capabilities.map((capability) => Object.freeze({ id: capability.id })));
}
