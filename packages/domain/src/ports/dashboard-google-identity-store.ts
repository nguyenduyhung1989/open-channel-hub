/**
 * A durable, privacy-minimized link from one verified Google account subject
 * to one configured dashboard principal. The application HMACs the Google
 * `sub` claim before this port sees it; no email address, ID token, refresh
 * token, or access token is ever persisted here.
 */
export interface DashboardGoogleIdentityStore {
  bind(input: DashboardGoogleIdentityBindInput): Promise<DashboardGoogleIdentityBindResult>;
  findPrincipalId(input: DashboardGoogleIdentityLookupInput): Promise<string | undefined>;
}

/** The only durable fields accepted while linking an already-authenticated principal. */
export interface DashboardGoogleIdentityBindInput {
  readonly principalId: string;
  readonly subjectHmac: string;
}

/** A Google login only needs its opaque, application-HMACed subject lookup key. */
export interface DashboardGoogleIdentityLookupInput {
  readonly subjectHmac: string;
}

/**
 * `idempotent_replay` means the same Google identity is already bound to the
 * same principal. `conflict` intentionally hides which unique constraint
 * prevented a link, so an authenticated principal cannot enumerate bindings.
 */
export type DashboardGoogleIdentityBindResult =
  | Readonly<{ kind: 'created' }>
  | Readonly<{ kind: 'idempotent_replay' }>
  | Readonly<{ kind: 'conflict' }>;
