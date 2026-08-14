import type { ZaloUserInboundTextEvent } from '@open-channel-hub/connector-zalo-user';

const DELIVERY_TIMEOUT_MILLISECONDS = 10_000;

export interface ZaloUserHubDeliveryOptions {
  readonly bridgeToken: string;
  readonly connectionId: string;
  readonly fetchImplementation?: typeof fetch;
  readonly hubBaseUrl: string;
}

/** A provider-agnostic delivery failure that never exposes Hub or bearer details. */
export class ZaloUserHubDeliveryError extends Error {
  public constructor() {
    super('The Zalo User event could not be delivered to the Hub.');
    this.name = 'ZaloUserHubDeliveryError';
  }
}

/**
 * Builds the bridge-to-Hub one-way event delivery closure. It intentionally
 * performs one request only: a failed/ambiguous HTTP delivery must be visible
 * to the bridge operator instead of replaying Zalo events without a policy.
 */
export const createZaloUserHubDelivery = (
  options: ZaloUserHubDeliveryOptions
): ((event: ZaloUserInboundTextEvent) => Promise<void>) => {
  const snapshot = toSnapshot(options);

  return async (event: ZaloUserInboundTextEvent): Promise<void> => {
    try {
      const response = await snapshot.fetchImplementation(snapshot.endpoint, {
        body: JSON.stringify(event),
        headers: {
          authorization: `Bearer ${snapshot.bridgeToken}`,
          'content-type': 'application/json'
        },
        method: 'POST',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MILLISECONDS)
      });

      if (response.status !== 204) {
        throw new ZaloUserHubDeliveryError();
      }
    } catch (error) {
      if (error instanceof ZaloUserHubDeliveryError) {
        throw error;
      }

      throw new ZaloUserHubDeliveryError();
    }
  };
};

const toSnapshot = (
  options: ZaloUserHubDeliveryOptions
): Readonly<{
  bridgeToken: string;
  endpoint: string;
  fetchImplementation: typeof fetch;
}> => {
  try {
    if (
      !isRecord(options) ||
      typeof options.connectionId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(options.connectionId) ||
      options.connectionId === '.' ||
      options.connectionId === '..' ||
      typeof options.bridgeToken !== 'string' ||
      !/^[!-~]{32,512}$/.test(options.bridgeToken) ||
      typeof options.hubBaseUrl !== 'string' ||
      (typeof options.fetchImplementation !== 'undefined' &&
        typeof options.fetchImplementation !== 'function')
    ) {
      throw new ZaloUserHubDeliveryError();
    }

    const hubBaseUrl = new URL(options.hubBaseUrl);

    if (
      hubBaseUrl.pathname !== '/' ||
      hubBaseUrl.search.length > 0 ||
      hubBaseUrl.hash.length > 0 ||
      hubBaseUrl.username.length > 0 ||
      hubBaseUrl.password.length > 0
    ) {
      throw new ZaloUserHubDeliveryError();
    }

    return Object.freeze({
      bridgeToken: options.bridgeToken,
      endpoint: new URL(
        `/v1/experimental/zalo-user/${encodeURIComponent(options.connectionId)}/events`,
        hubBaseUrl
      ).toString(),
      fetchImplementation: options.fetchImplementation ?? fetch
    });
  } catch (error) {
    if (error instanceof ZaloUserHubDeliveryError) {
      throw error;
    }

    throw new ZaloUserHubDeliveryError();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
