/**
 * Narrows a Google email address to the bounded ASCII form the dashboard may
 * compare against a deployment-local allow-list. It is not a general mailbox
 * validator: Google remains the authority for ownership and verification.
 */
const LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const MAXIMUM_EMAIL_LENGTH = 320;

export const normalizeDashboardGoogleEmail = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length < 3 || value.length > MAXIMUM_EMAIL_LENGTH) {
    return undefined;
  }

  const at = value.indexOf('@');

  if (at < 1 || at !== value.lastIndexOf('@')) {
    return undefined;
  }

  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1);
  const labels = domain.split('.');

  if (
    !LOCAL_PART_PATTERN.test(localPart) ||
    labels.length < 1 ||
    labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    return undefined;
  }

  return value.toLowerCase();
};
