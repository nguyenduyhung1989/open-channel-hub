import argon2 from 'argon2';

const MAXIMUM_PASSWORD_BYTES = 512;
const MINIMUM_PASSWORD_BYTES = 12;

/** A non-diagnostic failure so a password never reaches a command error. */
export class DashboardPasswordHashError extends Error {
  public constructor() {
    super('The dashboard password input is invalid.');
    this.name = 'DashboardPasswordHashError';
  }
}

/**
 * Produces the bounded Argon2id PHC value accepted by runtime configuration.
 * The caller supplies bytes from a private standard-input stream; this module
 * never logs or returns those bytes.
 */
export const hashDashboardPassword = async (password: Buffer): Promise<string> => {
  if (!isSafePasswordInput(password)) {
    throw new DashboardPasswordHashError();
  }

  try {
    return await argon2.hash(password, {
      memoryCost: 19456,
      parallelism: 1,
      timeCost: 2,
      type: argon2.argon2id,
      version: 0x13
    });
  } catch {
    throw new DashboardPasswordHashError();
  }
};

const isSafePasswordInput = (value: Buffer): boolean => {
  const text = value.toString('utf8');

  return (
    value.length >= MINIMUM_PASSWORD_BYTES &&
    value.length <= MAXIMUM_PASSWORD_BYTES &&
    Buffer.from(text, 'utf8').equals(value) &&
    !text.includes('\u0000') &&
    !text.includes('\n') &&
    !text.includes('\r')
  );
};
