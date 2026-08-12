import type { Channel } from '@open-channel-hub/contracts';

export interface ConnectorProviderErrorInput {
  readonly channel: Channel;
  readonly operation: string;
  readonly cause: unknown;
}

/**
 * A provider call failed after the connector accepted a supported command.
 * The original error stays available through `cause` for observability.
 */
export class ConnectorProviderError extends Error {
  readonly channel: Channel;
  readonly code = 'PROVIDER_FAILURE';
  readonly operation: string;

  constructor(input: ConnectorProviderErrorInput) {
    super(`Provider call failed for ${input.operation}.`, { cause: input.cause });
    this.name = 'ConnectorProviderError';
    this.channel = input.channel;
    this.operation = input.operation;
  }
}
