import type {
  InboundEventFeedReader,
  OutboundReplyCommandHistoryReader,
  OutboundReplyCommandAuthorization,
  OutboundReplyCommandStore,
  OutboundTelegramDeliveryAuthorizationStore
} from '@open-channel-hub/domain';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import type {
  InboxFeature,
  InboxDashboardReplyIntentCapability,
  InboxDashboardTelegramDeliveryAuthorizationCapability,
  InboxInboundEventListInput,
  InboxOutboundReplyCommandHistoryListInput,
  InboxOutboundReplyCommandInput,
  InboxTelegramDeliveryAuthorizationInput
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
  outboundReplyCommandHistoryReader: OutboundReplyCommandHistoryReader,
  outboundTelegramDeliveryAuthorizationStore: OutboundTelegramDeliveryAuthorizationStore
): readonly InboxFeature[] =>
  Object.freeze(
    inboxes.map((inbox) => {
      const connectionIds = Object.freeze([...inbox.connectionIds]);
      const readInboundEvents = async (input: InboxInboundEventListInput) =>
        inboundEventFeedReader.list({ connectionIds, ...input });
      const readOutboundReplyCommandHistory = async (
        input: InboxOutboundReplyCommandHistoryListInput
      ) =>
        outboundReplyCommandHistoryReader.list({
          ...input,
          allowedConnectionIds: connectionIds,
          inboxId: inbox.id
        });
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
      const createDashboardTelegramDeliveryAuthorizationCapability = (
        dashboardPrincipalId: string
      ): InboxDashboardTelegramDeliveryAuthorizationCapability =>
        Object.freeze({
          recordTelegramDeliveryAuthorization: async (
            input: InboxTelegramDeliveryAuthorizationInput
          ) =>
            outboundTelegramDeliveryAuthorizationStore.create(
              Object.freeze({
                allowedConnectionIds: connectionIds,
                commandId: input.commandId,
                dashboardPrincipalId,
                inboxId: inbox.id
              })
            )
        });

      return Object.freeze({
        connectionIds,
        createDashboardReplyIntentCapability,
        createDashboardTelegramDeliveryAuthorizationCapability,
        createOutboundReplyCommand,
        id: inbox.id,
        readInboundEvents,
        readOutboundReplyCommandHistory,
        token: inbox.token
      });
    })
  );
