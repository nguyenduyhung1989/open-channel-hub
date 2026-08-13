import type {
  InboundEventFeedReader,
  OutboundReplyCommandHistoryReader,
  OutboundReplyCommandStore
} from '@open-channel-hub/domain';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import type {
  InboxFeature,
  InboxInboundEventListInput,
  InboxOutboundReplyCommandHistoryListInput,
  InboxOutboundReplyCommandInput
} from './inbox-feature.js';

/**
 * Binds a storage feed reader to an already-validated runtime inbox snapshot.
 * The closure deliberately owns the configured connection scope so a route
 * cannot accidentally receive a caller-selected account set.
 */
export const createRuntimeInboxFeatures = (
  inboxes: readonly RuntimeInbox[],
  inboundEventFeedReader: InboundEventFeedReader,
  outboundReplyCommandStore: OutboundReplyCommandStore,
  outboundReplyCommandHistoryReader: OutboundReplyCommandHistoryReader
): readonly InboxFeature[] =>
  Object.freeze(
    inboxes.map((inbox) => {
      const connectionIds = Object.freeze([...inbox.connectionIds]);
      const readInboundEvents = async (input: InboxInboundEventListInput) =>
        inboundEventFeedReader.list({ connectionIds, ...input });
      const readOutboundReplyCommandHistory = async (
        input: InboxOutboundReplyCommandHistoryListInput
      ) =>
        outboundReplyCommandHistoryReader.list({ ...input, allowedConnectionIds: connectionIds });
      const createOutboundReplyCommand = async (input: InboxOutboundReplyCommandInput) =>
        outboundReplyCommandStore.create(
          Object.freeze({
            allowedConnectionIds: connectionIds,
            clientOperationId: input.clientOperationId,
            sourceConnectionId: input.sourceConnectionId,
            sourceProviderEventId: input.sourceProviderEventId,
            text: input.text
          })
        );

      return Object.freeze({
        connectionIds,
        createOutboundReplyCommand,
        id: inbox.id,
        readInboundEvents,
        readOutboundReplyCommandHistory,
        token: inbox.token
      });
    })
  );
