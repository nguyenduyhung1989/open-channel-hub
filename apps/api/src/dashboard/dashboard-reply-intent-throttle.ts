const MAXIMUM_WRITES_PER_WINDOW = 20;
const MAXIMUM_TRACKED_PRINCIPALS = 1_024;
const WINDOW_MILLISECONDS = 60 * 1_000;

export interface DashboardReplyIntentThrottleDependencies {
  readonly now?: () => Date;
}

/** A bounded, process-local guard for authenticated dashboard write bursts. */
export interface DashboardReplyIntentThrottle {
  reserve: (principalId: string) => boolean;
}

/**
 * Limits each authenticated principal across all of its sessions. A future
 * reverse proxy still owns cross-process abuse controls; this guard prevents a
 * new login from immediately resetting one principal's local write quota.
 */
export const createDashboardReplyIntentThrottle = (
  dependencies: DashboardReplyIntentThrottleDependencies = {}
): DashboardReplyIntentThrottle => {
  const now = dependencies.now ?? (() => new Date());
  const writesByPrincipal = new Map<string, readonly number[]>();

  const timestamp = (): number => {
    const current = now().getTime();

    return Number.isFinite(current) ? current : Number.MAX_SAFE_INTEGER;
  };
  const prune = (current: number): void => {
    for (const [principalId, writes] of writesByPrincipal) {
      const recentWrites = writes.filter((writeAt) => current - writeAt <= WINDOW_MILLISECONDS);

      if (recentWrites.length === 0) {
        writesByPrincipal.delete(principalId);
      } else if (recentWrites.length !== writes.length) {
        writesByPrincipal.set(principalId, Object.freeze(recentWrites));
      }
    }
  };

  return Object.freeze({
    reserve: (principalId: string): boolean => {
      const current = timestamp();

      prune(current);

      const existingWrites = writesByPrincipal.get(principalId) ?? Object.freeze([]);

      if (existingWrites.length >= MAXIMUM_WRITES_PER_WINDOW) {
        return false;
      }

      if (
        !writesByPrincipal.has(principalId) &&
        writesByPrincipal.size >= MAXIMUM_TRACKED_PRINCIPALS
      ) {
        const oldestPrincipalId = writesByPrincipal.keys().next().value;

        if (oldestPrincipalId !== undefined) {
          writesByPrincipal.delete(oldestPrincipalId);
        }
      }

      writesByPrincipal.delete(principalId);
      writesByPrincipal.set(principalId, Object.freeze([...existingWrites, current]));
      return true;
    }
  });
};
