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
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json()).toEqual({
      success: true,
      data: { service: 'open-channel-hub', status: 'ok' }
    });
  });

  it('does not leak implementation details for unknown routes', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/not-a-real-route' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'not_found', message: 'The requested resource does not exist.' }
    });
  });
});
