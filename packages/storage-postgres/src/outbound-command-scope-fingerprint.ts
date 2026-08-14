import { createHash } from 'node:crypto';

const AUTHORIZATION_SCOPE_FINGERPRINT_PREFIX =
  'open-channel-hub/outbound-command-authorization-scope/v1\u0000';

/**
 * Produces the non-secret scope binding used by immutable command provenance
 * and later dashboard approvals. Callers validate and freeze the ascending
 * connection list before reaching this helper.
 */
export const createOutboundCommandScopeFingerprint = (
  allowedConnectionIds: readonly string[]
): string =>
  createHash('sha256')
    .update(AUTHORIZATION_SCOPE_FINGERPRINT_PREFIX)
    .update(allowedConnectionIds.join('\u0000'))
    .digest('hex');
