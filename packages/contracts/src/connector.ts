/**
 * The transport-neutral vocabulary shared by the domain and connector adapters.
 * It deliberately contains no credentials, provider SDK types, or network details.
 */

export const CHANNELS = Object.freeze([
  'telegram_bot',
  'zalo_oa',
  'facebook_page',
  'whatsapp_business',
  'telegram_user',
  'zalo_user',
  'whatsapp_user',
  'facebook_user'
] as const);

export type Channel = (typeof CHANNELS)[number];

export const CONNECTOR_TIERS = Object.freeze([
  'OFFICIAL',
  'OFFICIAL_CLIENT',
  'EXPERIMENTAL'
] as const);

export type ConnectorTier = (typeof CONNECTOR_TIERS)[number];

export const CONNECTOR_CAPABILITY_IDS = Object.freeze([
  'message.send.text',
  'message.receive.text'
] as const);

export type ConnectorCapabilityId = (typeof CONNECTOR_CAPABILITY_IDS)[number];

export interface ConnectorCapability {
  readonly id: ConnectorCapabilityId;
}

/** A static declaration of what a connector implementation can do. */
export interface ConnectorManifest {
  readonly id: string;
  readonly displayName: string;
  readonly channel: Channel;
  readonly tier: ConnectorTier;
  readonly capabilities: readonly ConnectorCapability[];
}

export const CONNECTION_STATUSES = Object.freeze([
  'connected',
  'disconnected',
  'reauthentication_required',
  'error'
] as const);

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * Runtime state for one configured connector account. It contains identifiers and
 * declared capabilities only; secrets remain inside the adapter's private storage.
 */
export interface ConnectionState {
  readonly id: string;
  readonly connectorId: string;
  readonly channel: Channel;
  readonly status: ConnectionStatus;
  readonly capabilities: readonly ConnectorCapability[];
}
