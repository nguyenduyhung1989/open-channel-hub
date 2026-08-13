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
  DashboardReplyIntentInbox
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
  const replyIntentInboxById = toReplyIntentInboxSnapshot(inboxes);
  const principalById = toPrincipalSnapshot(configuration.principals, inboxById);
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
    ): DashboardReplyIntentInbox | undefined => {
      const principal = principalById.get(principalId);

      return principal === undefined || !principal.replyIntentInboxIds.includes(inboxId)
        ? undefined
        : replyIntentInboxById.get(inboxId);
    },
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
const toReplyIntentInboxSnapshot = (
  inboxes: readonly InboxFeature[]
): ReadonlyMap<string, DashboardReplyIntentInbox> => {
  const inboxById = new Map<string, DashboardReplyIntentInbox>();

  for (const inbox of inboxes) {
    if (inboxById.has(inbox.id)) {
      throw new RuntimeDashboardFeatureError();
    }

    const recordReplyIntent = inbox.createOutboundReplyCommand;

    inboxById.set(
      inbox.id,
      Object.freeze({
        id: inbox.id,
        recordReplyIntent: async (input: DashboardReplyIntentInput) =>
          recordReplyIntent(
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

  return inboxById;
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
        replyIntentInboxIds: Object.freeze([...principal.replyIntentInboxIds])
      })
    );
  }

  return principalById;
};
