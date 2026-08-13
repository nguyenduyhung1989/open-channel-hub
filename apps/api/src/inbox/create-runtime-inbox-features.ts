import type { InboundEventFeedReader } from '@open-channel-hub/domain';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import type { InboxFeature, InboxInboundEventListInput } from './inbox-feature.js';

/**
 * Binds a storage feed reader to an already-validated runtime inbox snapshot.
 * The closure deliberately owns the configured connection scope so a route
 * cannot accidentally receive a caller-selected account set.
 */
export const createRuntimeInboxFeatures = (
  inboxes: readonly RuntimeInbox[],
  inboundEventFeedReader: InboundEventFeedReader
): readonly InboxFeature[] =>
  Object.freeze(
    inboxes.map((inbox) => {
      const connectionIds = Object.freeze([...inbox.connectionIds]);
      const readInboundEvents = async (input: InboxInboundEventListInput) =>
        inboundEventFeedReader.list({ connectionIds, ...input });

      return Object.freeze({
        connectionIds,
        id: inbox.id,
        readInboundEvents,
        token: inbox.token
      });
    })
  );
