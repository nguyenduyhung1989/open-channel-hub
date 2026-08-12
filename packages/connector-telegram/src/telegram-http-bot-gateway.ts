import type { ProviderReceipt } from '@open-channel-hub/contracts';

import type { TelegramBotGateway, TelegramSendTextMessage } from './telegram-types.js';

const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

type TelegramMethod = 'sendMessage' | 'setWebhook';

export type TelegramHttpBotGatewayErrorCode =
  | 'clock_failure'
  | 'http_failure'
  | 'invalid_configuration'
  | 'invalid_input'
  | 'invalid_response'
  | 'network_failure'
  | 'provider_failure'
  | 'timeout';

/**
 * A deliberately small provider error. It never retains a response body,
 * Telegram error description, request URL, token, or underlying fetch error.
 */
export class TelegramHttpBotGatewayError extends Error {
  readonly code: TelegramHttpBotGatewayErrorCode;

  public constructor(code: TelegramHttpBotGatewayErrorCode) {
    super(messageFor(code));
    this.name = 'TelegramHttpBotGatewayError';
    this.code = code;
  }
}

export interface TelegramHttpBotGatewayOptions {
  readonly botToken: string;
  readonly connectionId: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export interface TelegramSetWebhookInput {
  readonly secretToken: string;
  readonly url: URL;
}

/**
 * Official Telegram Bot API transport. The API origin is deliberately fixed so
 * connector configuration cannot redirect credentials to another host.
 */
export class TelegramHttpBotGateway implements TelegramBotGateway {
  readonly #botToken: string;
  readonly #connectionId: string;
  readonly #fetchImpl: typeof fetch;
  readonly #now: () => Date;
  readonly #timeoutMs: number;

  public constructor(options: TelegramHttpBotGatewayOptions) {
    const snapshot = toConfigurationSnapshot(options);

    this.#botToken = snapshot.botToken;
    this.#connectionId = snapshot.connectionId;
    this.#fetchImpl = snapshot.fetchImpl;
    this.#now = snapshot.now;
    this.#timeoutMs = snapshot.timeoutMs;
  }

  public async sendMessage(input: TelegramSendTextMessage): Promise<ProviderReceipt> {
    const message = toSendMessageSnapshot(input);
    const acceptedAt = this.acceptedAt();
    const payload = await this.post(
      'sendMessage',
      Object.freeze({
        chat_id: message.chatId,
        text: message.text
      })
    );
    const providerMessageId = toProviderMessageId(payload);

    return Object.freeze({
      acceptedAt,
      connectionId: this.#connectionId,
      providerMessageId: String(providerMessageId)
    });
  }

  public async setWebhook(input: TelegramSetWebhookInput): Promise<void> {
    const webhook = toWebhookSnapshot(input);
    const payload = await this.post(
      'setWebhook',
      Object.freeze({
        allowed_updates: Object.freeze(['message']),
        secret_token: webhook.secretToken,
        url: webhook.url
      })
    );

    assertWebhookAccepted(payload);
  }

  private acceptedAt(): string {
    try {
      const currentTime = this.#now();

      if (!(currentTime instanceof Date) || Number.isNaN(currentTime.getTime())) {
        throw new TelegramHttpBotGatewayError('clock_failure');
      }

      return currentTime.toISOString();
    } catch (error) {
      if (error instanceof TelegramHttpBotGatewayError) {
        throw error;
      }

      throw new TelegramHttpBotGatewayError('clock_failure');
    }
  }

  private async post(
    method: TelegramMethod,
    body: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.#timeoutMs);
    let response: Response;

    try {
      try {
        response = await this.#fetchImpl(this.endpointFor(method), {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          redirect: 'error',
          signal: abortController.signal
        });
      } catch {
        throw new TelegramHttpBotGatewayError(
          abortController.signal.aborted ? 'timeout' : 'network_failure'
        );
      }

      try {
        if (!response.ok) {
          throw new TelegramHttpBotGatewayError('http_failure');
        }

        return await response.json();
      } catch (error) {
        if (error instanceof TelegramHttpBotGatewayError) {
          throw error;
        }

        throw new TelegramHttpBotGatewayError(
          abortController.signal.aborted ? 'timeout' : 'invalid_response'
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private endpointFor(method: TelegramMethod): string {
    const tokenPathSegment = encodeURIComponent(this.#botToken).replaceAll('%3A', ':');

    return `${TELEGRAM_API_ORIGIN}/bot${tokenPathSegment}/${method}`;
  }
}

type GatewayConfigurationSnapshot = Readonly<{
  botToken: string;
  connectionId: string;
  fetchImpl: typeof fetch;
  now: () => Date;
  timeoutMs: number;
}>;

type SendMessageSnapshot = Readonly<{
  chatId: number | string;
  text: string;
}>;

type WebhookSnapshot = Readonly<{
  secretToken: string;
  url: string;
}>;

const toConfigurationSnapshot = (
  options: TelegramHttpBotGatewayOptions
): GatewayConfigurationSnapshot => {
  if (!isRecord(options)) {
    throw new TelegramHttpBotGatewayError('invalid_configuration');
  }

  const botToken = options.botToken;
  const connectionId = options.connectionId;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (
    !isNonBlankString(botToken) ||
    !isNonBlankString(connectionId) ||
    typeof fetchImpl !== 'function' ||
    typeof now !== 'function' ||
    !isBoundedTimeout(timeoutMs)
  ) {
    throw new TelegramHttpBotGatewayError('invalid_configuration');
  }

  return Object.freeze({ botToken, connectionId, fetchImpl, now, timeoutMs });
};

const toSendMessageSnapshot = (input: TelegramSendTextMessage): SendMessageSnapshot => {
  if (!isRecord(input) || !isChatId(input.chatId) || !isNonBlankString(input.text)) {
    throw new TelegramHttpBotGatewayError('invalid_input');
  }

  return Object.freeze({ chatId: input.chatId, text: input.text });
};

const toWebhookSnapshot = (input: TelegramSetWebhookInput): WebhookSnapshot => {
  if (!isRecord(input) || !(input.url instanceof URL) || !isWebhookUrl(input.url)) {
    throw new TelegramHttpBotGatewayError('invalid_input');
  }

  if (!isWebhookSecret(input.secretToken)) {
    throw new TelegramHttpBotGatewayError('invalid_input');
  }

  return Object.freeze({ secretToken: input.secretToken, url: input.url.toString() });
};

const toProviderMessageId = (value: unknown): number => {
  try {
    if (isRecord(value) && value.ok === false) {
      throw new TelegramHttpBotGatewayError('provider_failure');
    }

    if (
      !isRecord(value) ||
      value.ok !== true ||
      !isRecord(value.result) ||
      !isSafeInteger(value.result.message_id)
    ) {
      throw new TelegramHttpBotGatewayError('invalid_response');
    }

    return value.result.message_id;
  } catch (error) {
    if (error instanceof TelegramHttpBotGatewayError) {
      throw error;
    }

    throw new TelegramHttpBotGatewayError('invalid_response');
  }
};

const assertWebhookAccepted = (value: unknown): void => {
  try {
    if (isRecord(value) && value.ok === false) {
      throw new TelegramHttpBotGatewayError('provider_failure');
    }

    if (!isRecord(value) || value.ok !== true || value.result !== true) {
      throw new TelegramHttpBotGatewayError('invalid_response');
    }
  } catch (error) {
    if (error instanceof TelegramHttpBotGatewayError) {
      throw error;
    }

    throw new TelegramHttpBotGatewayError('invalid_response');
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isChatId = (value: unknown): value is number | string =>
  isSafeInteger(value) || isNonBlankString(value);

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const isBoundedTimeout = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS;

const isWebhookSecret = (value: unknown): value is string =>
  typeof value === 'string' && WEBHOOK_SECRET_PATTERN.test(value);

const isWebhookUrl = (url: URL): boolean =>
  url.protocol === 'https:' &&
  url.hostname.length > 0 &&
  url.username === '' &&
  url.password === '' &&
  url.search === '' &&
  url.hash === '';

const messageFor = (code: TelegramHttpBotGatewayErrorCode): string => {
  switch (code) {
    case 'clock_failure':
      return 'The Telegram gateway clock is invalid.';
    case 'http_failure':
      return 'Telegram returned an unsuccessful HTTP response.';
    case 'invalid_configuration':
      return 'The Telegram gateway configuration is invalid.';
    case 'invalid_input':
      return 'The Telegram gateway input is invalid.';
    case 'invalid_response':
      return 'Telegram returned an invalid response.';
    case 'network_failure':
      return 'The Telegram request could not be completed.';
    case 'provider_failure':
      return 'Telegram rejected the request.';
    case 'timeout':
      return 'The Telegram request timed out.';
  }
};
