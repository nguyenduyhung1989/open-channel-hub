import { describe, expect, it } from 'vitest';

import {
  createDashboardGoogleOAuthClient,
  createDashboardGoogleOAuthTransactionManager,
  dashboardGoogleSubjectHmac,
  DashboardGoogleOAuthError
} from './dashboard-google-oauth.js';

const FIXED_RANDOM = (size: number): Buffer => Buffer.alloc(size, 7);
const IDENTITY_KEY = 'synthetic_dashboard_google_identity_key_012345678901234';

describe('dashboard Google OAuth boundary', () => {
  it('creates one-time PKCE transactions whose browser cookie need only carry an opaque ID', () => {
    let current = new Date('2026-08-17T10:00:00.000Z');
    const manager = createDashboardGoogleOAuthTransactionManager({
      now: () => current,
      randomBytes: FIXED_RANDOM
    });

    const transaction = manager.create({ mode: 'link', principalId: 'support-agent' });

    expect(transaction).toEqual({
      codeChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      mode: 'link',
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      principalId: 'support-agent',
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    });
    expect(transaction.codeChallenge).not.toBe(transaction.codeVerifier);
    expect(manager.consume({ id: transaction.id, state: 'a'.repeat(43) })).toBeUndefined();
    expect(manager.consume({ id: transaction.id, state: transaction.state })).toEqual(transaction);
    expect(manager.consume({ id: transaction.id, state: transaction.state })).toBeUndefined();

    const expiring = manager.create({ mode: 'login' });
    current = new Date('2026-08-17T10:10:00.000Z');
    expect(manager.consume({ id: expiring.id, state: expiring.state })).toBeUndefined();
  });

  it('rejects an invalid transaction shape before any OAuth redirect is created', () => {
    const manager = createDashboardGoogleOAuthTransactionManager({ randomBytes: FIXED_RANDOM });

    expect(() => manager.create({ mode: 'link' })).toThrow(DashboardGoogleOAuthError);
    expect(() => manager.create({ mode: 'login', principalId: 'support-agent' })).toThrow(
      DashboardGoogleOAuthError
    );
    expect(manager.consume({ id: 'short', state: 'also-short' })).toBeUndefined();
  });

  it('generates an official authorization URL with online-only OIDC, PKCE, state, and nonce', () => {
    const client = createDashboardGoogleOAuthClient({
      clientId: 'synthetic-client.apps.googleusercontent.com',
      clientSecret: 'synthetic-client-secret-012345678901234567890',
      redirectUri: 'https://dashboard.example.test/operator/auth/google/callback'
    });
    const url = new URL(
      client.createAuthorizationUrl({
        codeChallenge: 'c'.repeat(43),
        nonce: 'n'.repeat(43),
        state: 's'.repeat(43)
      })
    );

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('synthetic-client.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://dashboard.example.test/operator/auth/google/callback'
    );
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('access_type')).toBe('online');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('c'.repeat(43));
    expect(url.searchParams.get('nonce')).toBe('n'.repeat(43));
    expect(url.searchParams.get('state')).toBe('s'.repeat(43));
  });

  it('HMACs a Google subject with a separate domain and never returns the raw subject', () => {
    const first = dashboardGoogleSubjectHmac(IDENTITY_KEY, '110012345678901234567');
    const second = dashboardGoogleSubjectHmac(IDENTITY_KEY, '110012345678901234568');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('110012345678901234567');
    expect(() => dashboardGoogleSubjectHmac(IDENTITY_KEY, '')).toThrow(DashboardGoogleOAuthError);
    expect(() => dashboardGoogleSubjectHmac(IDENTITY_KEY, 'subject\nwith-control')).toThrow(
      DashboardGoogleOAuthError
    );
  });

  it('derives the identity HMAC inside the OAuth-client boundary instead of from session state', () => {
    const clientSecret = 'synthetic-client-secret-012345678901234567890';
    const client = createDashboardGoogleOAuthClient({
      clientId: 'synthetic-client.apps.googleusercontent.com',
      clientSecret,
      redirectUri: 'https://dashboard.example.test/operator/auth/google/callback'
    });

    expect(client.subjectHmac('110012345678901234567')).toBe(
      dashboardGoogleSubjectHmac(clientSecret, '110012345678901234567')
    );
  });
});
