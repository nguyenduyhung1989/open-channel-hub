import { timingSafeEqual } from 'node:crypto';

export const matchesBearerToken = (header: string | undefined, expectedToken: string): boolean => {
  if (header === undefined || !header.startsWith('Bearer ')) {
    return false;
  }

  return matchesSecret(header.slice('Bearer '.length), expectedToken);
};

export const matchesSecret = (provided: string | undefined, expected: string): boolean => {
  if (provided === undefined) {
    return false;
  }

  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};
