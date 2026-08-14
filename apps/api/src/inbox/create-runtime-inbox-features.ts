import type {
  InboundEventFeedReader,
  OutboundReplyCommandHistoryReader,
  OutboundReplyCommandAuthorization,
  OutboundReplyCommandStore
} from '@open-channel-hub/domain';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import type {
  InboxFeature,
  InboxDashboardReplyIntentCapability,
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
      const createCommand = async (
        input: InboxOutboundReplyCommandInput,
        authorization: OutboundReplyCommandAuthorization
      ) =>
        outboundReplyCommandStore.create(
          Object.freeze({
            allowedConnectionIds: connectionIds,
            authorization,
            clientOperationId: input.clientOperationId,
            sourceConnectionId: input.sourceConnectionId,
            sourceProviderEventId: input.sourceProviderEventId,
            text: input.text
          })
        );
      const createOutboundReplyCommand = async (input: InboxOutboundReplyCommandInput) =>
        createCommand(
          input,
          Object.freeze({
            inboxId: inbox.id,
            kind: 'inbox_bearer'
          })
        );
      const createDashboardReplyIntentCapability = (
        dashboardPrincipalId: string
      ): InboxDashboardReplyIntentCapability =>
        Object.freeze({
          recordReplyIntent: async (input: InboxOutboundReplyCommandInput) =>
            createCommand(
              input,
              Object.freeze({
                dashboardPrincipalId,
                inboxId: inbox.id,
                kind: 'dashboard_principal'
              })
            )
        });

      return Object.freeze({
        connectionIds,
        createDashboardReplyIntentCapability,
        createOutboundReplyCommand,
        id: inbox.id,
        readInboundEvents,
        readOutboundReplyCommandHistory,
        token: inbox.token
      });
    })
  );
