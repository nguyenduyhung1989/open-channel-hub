/**
 * Decodes a request body only when it is a lossless UTF-8 Buffer. Webhook
 * signatures commonly cover the original bytes, so callers can validate a
 * signature before deciding whether the parsed JSON is trustworthy.
 */
export const toRawUtf8Json = (value: unknown): string | undefined => {
  if (!Buffer.isBuffer(value)) {
    return undefined;
  }

  const decoded = value.toString('utf8');

  return Buffer.from(decoded, 'utf8').equals(value) ? decoded : undefined;
};

/** Parses JSON without exposing parser details across an untrusted boundary. */
export const parseRawJson = (value: string): unknown | undefined => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
