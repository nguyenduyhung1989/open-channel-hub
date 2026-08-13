import argon2 from 'argon2';

import type { DashboardPrincipal } from './dashboard-feature.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$Ptqr8WX2T/i48xoNgnQmLQ$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150';
const MAXIMUM_FAILURES = 5;
const MAXIMUM_IN_FLIGHT_VERIFICATIONS = 2;
const THROTTLE_WINDOW_MILLISECONDS = 5 * 60 * 1_000;
const THROTTLE_BLOCK_MILLISECONDS = 10 * 60 * 1_000;

export interface DashboardLoginThrottleDependencies {
  readonly now?: () => Date;
}

/** A bounded local guard; a production proxy still owns cross-instance rate limiting. */
export interface DashboardLoginThrottle {
  reserveVerification: () => DashboardLoginVerificationReservation | undefined;
}

/** A one-shot reservation that must be completed after the password check. */
export interface DashboardLoginVerificationReservation {
  complete: (succeeded: boolean) => void;
}

/**
 * Verifies one configured password hash while ensuring an unknown principal
 * still performs one Argon2id verification. Callers receive only a boolean.
 */
export const verifyDashboardPassword = async (
  principal: DashboardPrincipal | undefined,
  password: string
): Promise<boolean> => {
  if (!isBoundedPassword(password)) {
    return false;
  }

  try {
    const valid = await argon2.verify(principal?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

    return principal !== undefined && valid;
  } catch {
    return false;
  }
};

/**
 * Limits aggregate failed attempts in this process without storing a remote IP,
 * password, raw form value, or provider identity. It is intentionally bounded.
 */
export const createDashboardLoginThrottle = (
  dependencies: DashboardLoginThrottleDependencies = {}
): DashboardLoginThrottle => {
  const now = dependencies.now ?? (() => new Date());
  let failedAt: number[] = [];
  let blockedUntil = 0;
  let inFlight = 0;

  const timestamp = (): number => {
    const current = now().getTime();

    return Number.isFinite(current) ? current : Number.MAX_SAFE_INTEGER;
  };
  const recentFailures = (current: number): number[] =>
    failedAt.filter((value) => current - value <= THROTTLE_WINDOW_MILLISECONDS);
  const recordFailure = (current: number): void => {
    failedAt = recentFailures(current);
    failedAt.push(current);

    if (failedAt.length >= MAXIMUM_FAILURES) {
      blockedUntil = current + THROTTLE_BLOCK_MILLISECONDS;
      failedAt = [];
    }
  };

  return Object.freeze({
    reserveVerification: (): DashboardLoginVerificationReservation | undefined => {
      const current = timestamp();
      failedAt = recentFailures(current);

      if (current < blockedUntil || inFlight >= MAXIMUM_IN_FLIGHT_VERIFICATIONS) {
        return undefined;
      }

      inFlight += 1;
      let completed = false;

      return Object.freeze({
        complete: (succeeded: boolean): void => {
          if (completed) {
            return;
          }

          completed = true;
          inFlight -= 1;

          if (succeeded) {
            failedAt = [];
            blockedUntil = 0;
            return;
          }

          recordFailure(timestamp());
        }
      });
    }
  });
};

const isBoundedPassword = (value: string): boolean =>
  value.length >= 1 && value.length <= 512 && !value.includes('\u0000');
