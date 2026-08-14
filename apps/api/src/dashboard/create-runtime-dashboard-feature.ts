import type { DashboardSessionStore } from '@open-channel-hub/domain';

import type {
  RuntimeDashboard,
  RuntimeDashboardPrincipal
} from '../connections/runtime-connection-configuration.js';
import type { InboxFeature } from '../inbox/inbox-feature.js';
import type {
  DashboardFeature,
  DashboardInbox,
  DashboardPrincipal,
  DashboardReplyIntentInput,
  DashboardReplyIntentInbox,
  DashboardTelegramDeliveryAuthorizationInbox,
  DashboardTelegramDeliveryAuthorizationInput
} from './dashboard-feature.js';

/** A non-diagnostic composition failure for an invalid server-only dashboard graph. */
export class RuntimeDashboardFeatureError extends Error {
  public constructor() {
    super('The configured dashboard is invalid.');
    this.name = 'RuntimeDashboardFeatureError';
  }
}

/**
 * Narrows runtime configuration into a dashboard-only capability graph. Inbox
 * bearer tokens intentionally stop at this factory and cannot reach a route or
 * rendered page.
 */
export const createRuntimeDashboardFeature = (
  configuration: RuntimeDashboard,
  inboxes: readonly InboxFeature[],
  sessionStore: DashboardSessionStore
): DashboardFeature => {
  const inboxById = toInboxSnapshot(inboxes);
  const principalById = toPrincipalSnapshot(configuration.principals, inboxById);
  const replyIntentInboxesByPrincipal = toReplyIntentInboxesByPrincipal(principalById, inboxes);
  const telegramDeliveryAuthorizationInboxesByPrincipal =
    toTelegramDeliveryAuthorizationInboxesByPrincipal(principalById, inboxes);
  const inboxesByPrincipal = new Map<string, readonly DashboardInbox[]>();

  for (const principal of principalById.values()) {
    const allowedInboxes = principal.inboxIds.map((inboxId) => {
      const inbox = inboxById.get(inboxId);

      if (inbox === undefined) {
        throw new RuntimeDashboardFeatureError();
      }

      return inbox;
    });

    inboxesByPrincipal.set(principal.id, Object.freeze(allowedInboxes));
  }

  return Object.freeze({
    findInbox: (principalId: string, inboxId: string): DashboardInbox | undefined => {
      const principal = principalById.get(principalId);

      return principal === undefined || !principal.inboxIds.includes(inboxId)
        ? undefined
        : inboxById.get(inboxId);
    },
    findReplyIntentInbox: (
      principalId: string,
      inboxId: string
    ): DashboardReplyIntentInbox | undefined =>
      replyIntentInboxesByPrincipal.get(principalId)?.get(inboxId),
    findTelegramDeliveryAuthorizationInbox: (
      principalId: string,
      inboxId: string
    ): DashboardTelegramDeliveryAuthorizationInbox | undefined =>
      telegramDeliveryAuthorizationInboxesByPrincipal.get(principalId)?.get(inboxId),
    findPrincipal: (principalId: string): DashboardPrincipal | undefined =>
      principalById.get(principalId),
    listInboxes: (principalId: string): readonly DashboardInbox[] =>
      inboxesByPrincipal.get(principalId) ?? Object.freeze([]),
    publicOrigin: configuration.publicOrigin,
    sessionCookieSigningKeys: Object.freeze([...configuration.sessionCookieSigningKeys]),
    sessionIdPepper: configuration.sessionIdPepper,
    sessionStore
  });
};

const toInboxSnapshot = (inboxes: readonly InboxFeature[]): ReadonlyMap<string, DashboardInbox> => {
  const inboxById = new Map<string, DashboardInbox>();

  for (const inbox of inboxes) {
    if (inboxById.has(inbox.id)) {
      throw new RuntimeDashboardFeatureError();
    }

    inboxById.set(
      inbox.id,
      Object.freeze({
        connectionIds: Object.freeze([...inbox.connectionIds]),
        id: inbox.id,
        readInboundEvents: inbox.readInboundEvents,
        readOutboundReplyCommandHistory: inbox.readOutboundReplyCommandHistory
      })
    );
  }

  return inboxById;
};

/**
 * Deliberately creates a second, narrower view rather than adding a write
 * method to DashboardInbox. Read-only rendering code cannot accidentally gain
 * the ability to record an intent.
 */
const toReplyIntentInboxesByPrincipal = (
  principals: ReadonlyMap<string, DashboardPrincipal>,
  inboxes: readonly InboxFeature[]
): ReadonlyMap<string, ReadonlyMap<string, DashboardReplyIntentInbox>> => {
  const inboxById = new Map<string, InboxFeature>();

  for (const inbox of inboxes) {
    if (inboxById.has(inbox.id)) {
      throw new RuntimeDashboardFeatureError();
    }

    inboxById.set(inbox.id, inbox);
  }

  const replyIntentInboxesByPrincipal = new Map<
    string,
    ReadonlyMap<string, DashboardReplyIntentInbox>
  >();

  for (const principal of principals.values()) {
    const writableInboxes = new Map<string, DashboardReplyIntentInbox>();

    for (const inboxId of principal.replyIntentInboxIds) {
      const inbox = inboxById.get(inboxId);

      if (inbox === undefined) {
        throw new RuntimeDashboardFeatureError();
      }

      const capability = inbox.createDashboardReplyIntentCapability(principal.id);

      writableInboxes.set(
        inboxId,
        Object.freeze({
          id: inboxId,
          recordReplyIntent: async (input: DashboardReplyIntentInput) =>
            capability.recordReplyIntent(
              Object.freeze({
                clientOperationId: input.clientOperationId,
                sourceConnectionId: input.sourceConnectionId,
                sourceProviderEventId: input.sourceProviderEventId,
                text: input.text
              })
            )
        })
      );
    }

    replyIntentInboxesByPrincipal.set(principal.id, writableInboxes);
  }

  return replyIntentInboxesByPrincipal;
};

/**
 * This stays separate from reply-intent recording. A principal may review and
 * authorize a queued command without gaining any ability to create new ones.
 */
const toTelegramDeliveryAuthorizationInboxesByPrincipal = (
  principals: ReadonlyMap<string, DashboardPrincipal>,
  inboxes: readonly InboxFeature[]
): ReadonlyMap<string, ReadonlyMap<string, DashboardTelegramDeliveryAuthorizationInbox>> => {
  const inboxById = new Map<string, InboxFeature>();

  for (const inbox of inboxes) {
    if (inboxById.has(inbox.id)) {
      throw new RuntimeDashboardFeatureError();
    }

    inboxById.set(inbox.id, inbox);
  }

  const authorizationInboxesByPrincipal = new Map<
    string,
    ReadonlyMap<string, DashboardTelegramDeliveryAuthorizationInbox>
  >();

  for (const principal of principals.values()) {
    const authorizationInboxes = new Map<string, DashboardTelegramDeliveryAuthorizationInbox>();

    for (const inboxId of principal.telegramDeliveryAuthorizationInboxIds) {
      const inbox = inboxById.get(inboxId);

      if (inbox === undefined) {
        throw new RuntimeDashboardFeatureError();
      }

      const capability = inbox.createDashboardTelegramDeliveryAuthorizationCapability(principal.id);

      authorizationInboxes.set(
        inboxId,
        Object.freeze({
          id: inboxId,
          recordTelegramDeliveryAuthorization: async (
            input: DashboardTelegramDeliveryAuthorizationInput
          ) =>
            capability.recordTelegramDeliveryAuthorization(
              Object.freeze({ commandId: input.commandId })
            )
        })
      );
    }

    authorizationInboxesByPrincipal.set(principal.id, authorizationInboxes);
  }

  return authorizationInboxesByPrincipal;
};

const toPrincipalSnapshot = (
  principals: readonly RuntimeDashboardPrincipal[],
  inboxById: ReadonlyMap<string, DashboardInbox>
): ReadonlyMap<string, DashboardPrincipal> => {
  const principalById = new Map<string, DashboardPrincipal>();

  for (const principal of principals) {
    if (
      principalById.has(principal.id) ||
      principal.inboxIds.some((inboxId) => !inboxById.has(inboxId)) ||
      principal.replyIntentInboxIds.some(
        (inboxId) => !inboxById.has(inboxId) || !principal.inboxIds.includes(inboxId)
      ) ||
      principal.telegramDeliveryAuthorizationInboxIds.some(
        (inboxId) => !inboxById.has(inboxId) || !principal.inboxIds.includes(inboxId)
      )
    ) {
      throw new RuntimeDashboardFeatureError();
    }

    principalById.set(
      principal.id,
      Object.freeze({
        id: principal.id,
        inboxIds: Object.freeze([...principal.inboxIds]),
        passwordHash: principal.passwordHash,
        replyIntentInboxIds: Object.freeze([...principal.replyIntentInboxIds]),
        telegramDeliveryAuthorizationInboxIds: Object.freeze([
          ...principal.telegramDeliveryAuthorizationInboxIds
        ])
      })
    );
  }

  return principalById;
};
