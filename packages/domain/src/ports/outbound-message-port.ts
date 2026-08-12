import type {
  ConnectionState,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';

/**
 * Outbound boundary owned by the domain. A provider adapter implements this port;
 * the domain never imports a connector implementation or provider SDK.
 */
export interface OutboundMessagePort {
  readonly connection: ConnectionState;
  send(command: ProviderCommand): Promise<ProviderReceipt>;
}
