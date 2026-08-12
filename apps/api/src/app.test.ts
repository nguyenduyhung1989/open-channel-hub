import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

describe('Open Channel Hub API', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('reports the service as healthy without binding a public port', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers.link).toBe(
      '<https://github.com/nguyenduyhung1989/open-channel-hub>; rel="source"'
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json()).toEqual({
      success: true,
      data: { service: 'open-channel-hub', status: 'ok' }
    });
  });

  it('reports readiness only after its injected dependencies are ready', async () => {
    const app = await buildApp({
      readiness: Object.freeze({
        check: async (): Promise<void> => undefined
      })
    });
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { service: 'open-channel-hub', status: 'ready' }
    });
  });

  it('returns a safe readiness failure without leaking database details', async () => {
    const app = await buildApp({
      readiness: Object.freeze({
        check: async (): Promise<void> => {
          throw new Error('Synthetic database host and password detail must never reach callers.');
        }
      })
    });
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'not_ready',
        message: 'The service is not ready to receive requests.'
      }
    });
    expect(response.body).not.toContain('Synthetic database host');
  });

  it('offers the configured corresponding source without authentication', async () => {
    const app = await buildApp({
      sourceOfferUrl: 'https://example.test/open-channel-hub/source/phase-1a'
    });
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/source' });

    expect(response.statusCode).toBe(200);
    expect(response.headers.link).toBe(
      '<https://example.test/open-channel-hub/source/phase-1a>; rel="source"'
    );
    expect(response.json()).toEqual({
      success: true,
      data: {
        license: 'AGPL-3.0-or-later',
        sourceOfferUrl: 'https://example.test/open-channel-hub/source/phase-1a'
      }
    });
  });

  it('does not leak implementation details for unknown routes', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/not-a-real-route' });

    expect(response.statusCode).toBe(404);
    expect(response.headers.link).toBe(
      '<https://github.com/nguyenduyhung1989/open-channel-hub>; rel="source"'
    );
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'not_found', message: 'The requested resource does not exist.' }
    });
  });
});
