import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GOOGLE_CODE_PATTERN = /^[!-~]{1,2048}$/;
const GOOGLE_SUBJECT_MAXIMUM_BYTES = 255;
const OAUTH_TRANSACTION_TTL_MILLISECONDS = 10 * 60 * 1_000;

export interface DashboardGoogleOAuthFileConfiguration {
  readonly clientIdFile: string;
  readonly clientSecretFile: string;
  readonly redirectUri: string;
}

export interface DashboardGoogleOAuthClient {
  createAuthorizationUrl(input: DashboardGoogleAuthorizationUrlInput): string;
  exchangeAuthorizationCode(
    input: DashboardGoogleAuthorizationCodeInput
  ): Promise<DashboardGoogleIdentity | undefined>;
  subjectHmac(subject: string): string;
}

export interface DashboardGoogleAuthorizationUrlInput {
  readonly codeChallenge: string;
  readonly nonce: string;
  readonly state: string;
}

export interface DashboardGoogleAuthorizationCodeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
}

/** The only Google claim the dashboard retains long enough to HMAC it. */
export interface DashboardGoogleIdentity {
  readonly subject: string;
}

export type DashboardGoogleOAuthTransactionMode = 'link' | 'login';

export interface DashboardGoogleOAuthTransaction {
  readonly codeChallenge: string;
  readonly codeVerifier: string;
  readonly id: string;
  readonly mode: DashboardGoogleOAuthTransactionMode;
  readonly nonce: string;
  readonly principalId?: string;
  readonly state: string;
}

export interface DashboardGoogleOAuthTransactionManager {
  create(input: DashboardGoogleOAuthTransactionCreateInput): DashboardGoogleOAuthTransaction;
  consume(
    input: DashboardGoogleOAuthTransactionConsumeInput
  ): DashboardGoogleOAuthTransaction | undefined;
}

export interface DashboardGoogleOAuthTransactionCreateInput {
  readonly mode: DashboardGoogleOAuthTransactionMode;
  readonly principalId?: string;
}

export interface DashboardGoogleOAuthTransactionConsumeInput {
  readonly id: string;
  readonly state: string;
}

export interface DashboardGoogleOAuthTransactionManagerDependencies {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

/** A non-diagnostic failure at the Google OAuth boundary. */
export class DashboardGoogleOAuthError extends Error {
  public constructor() {
    super('The Google sign-in configuration is invalid.');
    this.name = 'DashboardGoogleOAuthError';
  }
}

/**
 * Loads the shared OAuth client values through files so Docker supplies them
 * as secrets. The returned client never exposes a refresh/access/ID token to
 * a caller or persists one.
 */
export const loadDashboardGoogleOAuthClient = async (
  configuration: DashboardGoogleOAuthFileConfiguration
): Promise<DashboardGoogleOAuthClient> => {
  const validated = validateFileConfiguration(configuration);

  try {
    const [clientId, clientSecret] = await Promise.all([
      readSecretFile(validated.clientIdFile),
      readSecretFile(validated.clientSecretFile)
    ]);

    return createDashboardGoogleOAuthClient({
      clientId,
      clientSecret,
      redirectUri: validated.redirectUri
    });
  } catch (error) {
    if (error instanceof DashboardGoogleOAuthError) {
      throw error;
    }

    throw new DashboardGoogleOAuthError();
  }
};

/** Builds the official Google authorization-code client with PKCE and OIDC nonce verification. */
export const createDashboardGoogleOAuthClient = (
  configuration: Readonly<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }>
): DashboardGoogleOAuthClient => {
  if (
    !isSafeGoogleCredential(configuration.clientId) ||
    !isSafeGoogleCredential(configuration.clientSecret) ||
    !isAbsoluteHttpsUrl(configuration.redirectUri)
  ) {
    throw new DashboardGoogleOAuthError();
  }

  const oauth = new OAuth2Client({
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    redirectUri: configuration.redirectUri
  });

  return Object.freeze({
    createAuthorizationUrl: (input: DashboardGoogleAuthorizationUrlInput): string => {
      if (
        !isOpaqueToken(input.state) ||
        !isOpaqueToken(input.nonce) ||
        !isOpaqueToken(input.codeChallenge)
      ) {
        throw new DashboardGoogleOAuthError();
      }

      return oauth.generateAuthUrl({
        access_type: 'online',
        code_challenge: input.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        nonce: input.nonce,
        prompt: 'select_account',
        scope: ['openid'],
        state: input.state
      });
    },
    exchangeAuthorizationCode: async (
      input: DashboardGoogleAuthorizationCodeInput
    ): Promise<DashboardGoogleIdentity | undefined> => {
      if (
        !isGoogleCode(input.code) ||
        !isOpaqueToken(input.codeVerifier) ||
        !isOpaqueToken(input.nonce)
      ) {
        return undefined;
      }

      try {
        const result = await oauth.getToken({ code: input.code, codeVerifier: input.codeVerifier });
        const idToken = result.tokens.id_token;

        if (typeof idToken !== 'string' || idToken.length < 1 || idToken.length > 8_192) {
          return undefined;
        }

        const ticket = await oauth.verifyIdToken({
          audience: configuration.clientId,
          idToken
        });
        const payload = ticket.getPayload();
        const subject = payload?.sub;

        if (
          !isGoogleSubject(subject) ||
          !isOpaqueToken(payload?.nonce) ||
          !matchesOpaqueToken(input.nonce, payload.nonce)
        ) {
          return undefined;
        }

        return Object.freeze({ subject });
      } catch {
        return undefined;
      }
    },
    // This deliberately stays independent from the dashboard session pepper:
    // forcing a session reset must not orphan a durable Google identity link.
    subjectHmac: (subject: string): string =>
      dashboardGoogleSubjectHmac(configuration.clientSecret, subject)
  });
};

/**
 * Keeps PKCE verifier, nonce, and state only in-process for ten minutes. The
 * browser receives only one opaque signed transaction ID cookie. A restart
 * safely cancels an in-progress sign-in instead of retaining OAuth material.
 */
export const createDashboardGoogleOAuthTransactionManager = (
  dependencies: DashboardGoogleOAuthTransactionManagerDependencies = {}
): DashboardGoogleOAuthTransactionManager => {
  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.randomBytes ?? randomBytes;
  const transactions = new Map<
    string,
    Readonly<DashboardGoogleOAuthTransaction & { expiresAt: number }>
  >();

  return Object.freeze({
    create: (
      input: DashboardGoogleOAuthTransactionCreateInput
    ): DashboardGoogleOAuthTransaction => {
      purgeExpired(transactions, now);

      if (
        !isTransactionMode(input.mode) ||
        (input.mode === 'link' && !isIdentifier(input.principalId)) ||
        (input.mode === 'login' && input.principalId !== undefined)
      ) {
        throw new DashboardGoogleOAuthError();
      }

      const id = createOpaqueToken(random);
      const state = createOpaqueToken(random);
      const nonce = createOpaqueToken(random);
      const codeVerifier = createOpaqueToken(random);
      const codeChallenge = sha256Base64Url(codeVerifier);
      const current = now();

      if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
        throw new DashboardGoogleOAuthError();
      }

      const transaction = Object.freeze({
        codeChallenge,
        codeVerifier,
        expiresAt: current.getTime() + OAUTH_TRANSACTION_TTL_MILLISECONDS,
        id,
        mode: input.mode,
        nonce,
        ...(input.principalId === undefined ? {} : { principalId: input.principalId }),
        state
      });

      transactions.set(id, transaction);

      return toPublicTransaction(transaction);
    },
    consume: (
      input: DashboardGoogleOAuthTransactionConsumeInput
    ): DashboardGoogleOAuthTransaction | undefined => {
      purgeExpired(transactions, now);

      if (!isOpaqueToken(input.id) || !isOpaqueToken(input.state)) {
        return undefined;
      }

      const transaction = transactions.get(input.id);

      if (transaction === undefined || !matchesOpaqueToken(input.state, transaction.state)) {
        return undefined;
      }

      transactions.delete(input.id);
      return toPublicTransaction(transaction);
    }
  });
};

/**
 * Produces a domain-separated opaque lookup key. The raw Google `sub` stops
 * in the route and is never written to PostgreSQL, HTML, a cookie, or a log.
 */
export const dashboardGoogleSubjectHmac = (identityKey: string, subject: string): string => {
  if (!isSafeGoogleCredential(identityKey) || !isGoogleSubject(subject)) {
    throw new DashboardGoogleOAuthError();
  }

  return createHmac('sha256', identityKey)
    .update(`open-channel-hub/dashboard/google-subject\u0000${subject}`, 'utf8')
    .digest('hex');
};

const validateFileConfiguration = (
  value: DashboardGoogleOAuthFileConfiguration
): Readonly<DashboardGoogleOAuthFileConfiguration> => {
  if (
    !isRecord(value) ||
    !isAbsoluteFilePath(value.clientIdFile) ||
    !isAbsoluteFilePath(value.clientSecretFile) ||
    value.clientIdFile === value.clientSecretFile ||
    !isAbsoluteHttpsUrl(value.redirectUri)
  ) {
    throw new DashboardGoogleOAuthError();
  }

  return Object.freeze({
    clientIdFile: value.clientIdFile,
    clientSecretFile: value.clientSecretFile,
    redirectUri: value.redirectUri
  });
};

const readSecretFile = async (path: string): Promise<string> => {
  try {
    const value = (await readFile(path, 'utf8')).trim();

    if (!isSafeGoogleCredential(value)) {
      throw new DashboardGoogleOAuthError();
    }

    return value;
  } catch (error) {
    if (error instanceof DashboardGoogleOAuthError) {
      throw error;
    }

    throw new DashboardGoogleOAuthError();
  }
};

const toPublicTransaction = (
  transaction: Readonly<DashboardGoogleOAuthTransaction & { expiresAt: number }>
): DashboardGoogleOAuthTransaction =>
  Object.freeze({
    codeChallenge: transaction.codeChallenge,
    codeVerifier: transaction.codeVerifier,
    id: transaction.id,
    mode: transaction.mode,
    nonce: transaction.nonce,
    ...(transaction.principalId === undefined ? {} : { principalId: transaction.principalId }),
    state: transaction.state
  });

const purgeExpired = (
  transactions: Map<string, Readonly<DashboardGoogleOAuthTransaction & { expiresAt: number }>>,
  now: () => Date
): void => {
  const current = now();

  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
    throw new DashboardGoogleOAuthError();
  }

  for (const [id, transaction] of transactions) {
    if (transaction.expiresAt <= current.getTime()) {
      transactions.delete(id);
    }
  }
};

const createOpaqueToken = (random: (size: number) => Buffer): string => {
  const value = random(32).toString('base64url');

  if (!isOpaqueToken(value)) {
    throw new DashboardGoogleOAuthError();
  }

  return value;
};

const sha256Base64Url = (value: string): string => {
  const result = createHash('sha256').update(value, 'utf8').digest('base64url');

  if (!isOpaqueToken(result)) {
    throw new DashboardGoogleOAuthError();
  }

  return result;
};

const matchesOpaqueToken = (left: string, right: string): boolean => {
  if (!isOpaqueToken(left) || !isOpaqueToken(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

const isTransactionMode = (value: unknown): value is DashboardGoogleOAuthTransactionMode =>
  value === 'link' || value === 'login';

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
  value !== '.' &&
  value !== '..';

const isOpaqueToken = (value: unknown): value is string =>
  typeof value === 'string' && OPAQUE_TOKEN_PATTERN.test(value);

const isGoogleCode = (value: unknown): value is string =>
  typeof value === 'string' && GOOGLE_CODE_PATTERN.test(value);

const isGoogleSubject = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  !hasUnsafeControlCharacter(value) &&
  Buffer.byteLength(value, 'utf8') <= GOOGLE_SUBJECT_MAXIMUM_BYTES;

const hasUnsafeControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
};

const isSafeGoogleCredential = (value: unknown): value is string =>
  typeof value === 'string' && /^[!-~]{1,512}$/.test(value);

const isAbsoluteFilePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  value.length <= 1_024 &&
  !value.includes('\u0000');

const isAbsoluteHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
