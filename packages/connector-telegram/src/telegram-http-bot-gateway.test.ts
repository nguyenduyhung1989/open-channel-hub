import { describe, expect, it, vi } from 'vitest';

import {
  TelegramHttpBotGateway,
  TelegramHttpBotGatewayError
} from './telegram-http-bot-gateway.js';

const BOT_TOKEN = 'synthetic-bot-token';
const CONNECTION_ID = 'conn_telegram_http';
const ACCEPTED_AT = '2026-08-12T00:00:00.000Z';
const WEBHOOK_SECRET = 'synthetic_webhook_secret_0123456789';

const successfulResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200
  });

const createGateway = (fetchImpl: typeof fetch): TelegramHttpBotGateway =>
  new TelegramHttpBotGateway({
    botToken: BOT_TOKEN,
    connectionId: CONNECTION_ID,
    fetchImpl,
    now: () => new Date(ACCEPTED_AT)
  });

describe('TelegramHttpBotGateway', () => {
  it('sends text through the fixed official endpoint and returns an immutable receipt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: { message_id: 301 } }));
    const gateway = createGateway(fetchImpl);

    const receipt = await gateway.sendMessage({
      chatId: '-1001234567890',
      text: 'Tin nhắn tổng hợp'
    });

    expect(receipt).toEqual({
      acceptedAt: ACCEPTED_AT,
      connectionId: CONNECTION_ID,
      providerMessageId: '301'
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses the expected JSON request shape without allowing a custom API host', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: { message_id: 302 } }));
    const gateway = createGateway(fetchImpl);

    await gateway.sendMessage({ chatId: 42, text: 'Không ra mạng thật.' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/botsynthetic-bot-token/sendMessage',
      expect.objectContaining({
        body: JSON.stringify({ chat_id: 42, text: 'Không ra mạng thật.' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('preserves the colon in an ordinary Telegram token while encoding unsafe path characters', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: { message_id: 302 } }));
    const gateway = new TelegramHttpBotGateway({
      botToken: '123456:synthetic/token',
      connectionId: CONNECTION_ID,
      fetchImpl,
      now: () => new Date(ACCEPTED_AT)
    });

    await gateway.sendMessage({ chatId: 42, text: 'Token có dấu hai chấm.' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123456:synthetic%2Ftoken/sendMessage',
      expect.anything()
    );
  });

  it('turns a Telegram provider rejection into a safe error without its description', async () => {
    const providerDescription = 'Synthetic provider description that must not escape.';
    const providerErrorDescription = `Synthetic error_description with ${BOT_TOKEN} that must not escape.`;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      successfulResponse({
        description: providerDescription,
        error_description: providerErrorDescription,
        error_code: 400,
        ok: false
      })
    );
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'Không được lộ lỗi nhà cung cấp.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'provider_failure' });
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('description');
    expect(error).not.toHaveProperty('error_description');
    expect(error).not.toHaveProperty('error_code');
    expect(error instanceof Error ? error.message : '').not.toContain(providerDescription);
    expect(error instanceof Error ? error.message : '').not.toContain(providerErrorDescription);
    expect(error instanceof Error ? error.message : '').not.toContain(BOT_TOKEN);
  });

  it('turns unsuccessful HTTP responses into safe errors without parsing provider details', async () => {
    const providerDescription = 'Synthetic HTTP provider description that must not escape.';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ description: providerDescription, ok: false }), {
        status: 401
      })
    );
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'HTTP lỗi.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'http_failure' });
    expect(error instanceof Error ? error.message : '').not.toContain(providerDescription);
  });

  it('turns invalid JSON into a safe invalid-response error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{not valid JSON', { status: 200 }));
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'JSON lỗi.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'invalid_response' });
  });

  it('rejects malformed successful send replies instead of fabricating a receipt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: { message_id: '301' } }));
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'Phản hồi sai định dạng.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'invalid_response' });
  });

  it('registers only text updates with the official setWebhook request shape', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: true }));
    const gateway = createGateway(fetchImpl);

    await expect(
      gateway.setWebhook({
        secretToken: WEBHOOK_SECRET,
        url: new URL('https://hooks.example.test/telegram')
      })
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/botsynthetic-bot-token/setWebhook',
      expect.objectContaining({
        body: JSON.stringify({
          allowed_updates: ['message'],
          secret_token: WEBHOOK_SECRET,
          url: 'https://hooks.example.test/telegram'
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('rejects malformed setWebhook replies', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: false }));
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .setWebhook({
        secretToken: WEBHOOK_SECRET,
        url: new URL('https://hooks.example.test/telegram')
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'invalid_response' });
  });

  it('turns network failures into safe errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('synthetic network failure'));
    const gateway = createGateway(fetchImpl);

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'Mạng giả lập lỗi.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'network_failure' });
    expect(error instanceof Error ? error.message : '').not.toContain('synthetic network failure');
  });

  it('aborts a slow injected fetch at the bounded timeout and reports only a safe timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('synthetic aborted transport details')),
            { once: true }
          );
        })
    );
    const gateway = new TelegramHttpBotGateway({
      botToken: BOT_TOKEN,
      connectionId: CONNECTION_ID,
      fetchImpl,
      now: () => new Date(ACCEPTED_AT),
      timeoutMs: 1
    });

    const error = await gateway
      .sendMessage({ chatId: 42, text: 'Hết thời gian chờ giả lập.' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramHttpBotGatewayError);
    expect(error).toMatchObject({ code: 'timeout' });
    expect(error instanceof Error ? error.message : '').not.toContain(
      'synthetic aborted transport details'
    );
  });

  it('rejects an invalid clock before sending, avoiding an ambiguous accepted message', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = new TelegramHttpBotGateway({
      botToken: BOT_TOKEN,
      connectionId: CONNECTION_ID,
      fetchImpl,
      now: () => new Date('not a date')
    });

    await expect(gateway.sendMessage({ chatId: 42, text: 'Đồng hồ lỗi.' })).rejects.toMatchObject({
      code: 'clock_failure'
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects short webhook secrets and non-HTTPS webhook URLs before any fetch call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = createGateway(fetchImpl);

    await expect(
      gateway.setWebhook({
        secretToken: 'short-secret',
        url: new URL('https://hooks.example.test/telegram')
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });

    await expect(
      gateway.setWebhook({
        secretToken: WEBHOOK_SECRET,
        url: new URL('http://hooks.example.test/telegram')
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects webhook URLs with a query or fragment before any fetch call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = createGateway(fetchImpl);

    await expect(
      gateway.setWebhook({
        secretToken: WEBHOOK_SECRET,
        url: new URL('https://hooks.example.test/telegram?next=https://example.test')
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });

    await expect(
      gateway.setWebhook({
        secretToken: WEBHOOK_SECRET,
        url: new URL('https://hooks.example.test/telegram#fragment')
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('snapshots constructor values rather than retaining a mutable options object', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ ok: true, result: { message_id: 303 } }));
    const options = {
      botToken: BOT_TOKEN,
      connectionId: CONNECTION_ID,
      fetchImpl,
      now: () => new Date(ACCEPTED_AT)
    };
    const gateway = new TelegramHttpBotGateway(options);

    options.botToken = 'mutated-token';
    options.connectionId = 'mutated-connection';

    await expect(
      gateway.sendMessage({ chatId: 42, text: 'Giá trị đã chụp.' })
    ).resolves.toMatchObject({
      connectionId: CONNECTION_ID
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/botsynthetic-bot-token/sendMessage',
      expect.anything()
    );
  });
});
