import { z } from 'zod';

import { DEFAULT_SOURCE_OFFER_URL } from '../source/source-offer.js';

const environmentSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPERATOR_API_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SOURCE_OFFER_URL: z.string().optional(),
  TELEGRAM_BOT_ENABLED: z.enum(['true', 'false']).default('false'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CONNECTION_ID: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .default('telegram-bot-default'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional()
});

export interface DisabledTelegramBotEnvironment {
  readonly enabled: false;
}

export interface EnabledTelegramBotEnvironment {
  readonly enabled: true;
  readonly botToken: string;
  readonly connectionId: string;
  readonly operatorApiToken: string;
  readonly webhookSecret: string;
  readonly webhookUrl?: string;
}

export type TelegramBotEnvironment = DisabledTelegramBotEnvironment | EnabledTelegramBotEnvironment;

export interface AppEnvironment {
  readonly HOST: string;
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly PORT: number;
  readonly sourceOfferUrl: string;
  readonly telegramBot: TelegramBotEnvironment;
}

export class EnvironmentConfigurationError extends Error {
  public constructor() {
    super('Invalid application environment. Check the documented environment variables.');
    this.name = 'EnvironmentConfigurationError';
  }
}

export const parseEnvironment = (environment: NodeJS.ProcessEnv): AppEnvironment => {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError();
  }

  const configuration = result.data;
  const sourceOfferUrl = sourceOfferUrlFor(configuration.SOURCE_OFFER_URL);

  if (
    (configuration.SOURCE_OFFER_URL !== undefined &&
      configuration.SOURCE_OFFER_URL.trim().length > 0 &&
      sourceOfferUrl === undefined) ||
    (configuration.NODE_ENV === 'production' && sourceOfferUrl === undefined)
  ) {
    throw new EnvironmentConfigurationError();
  }

  const resolvedSourceOfferUrl = sourceOfferUrl ?? DEFAULT_SOURCE_OFFER_URL;

  if (configuration.TELEGRAM_BOT_ENABLED === 'false') {
    return Object.freeze({
      HOST: configuration.HOST,
      NODE_ENV: configuration.NODE_ENV,
      PORT: configuration.PORT,
      sourceOfferUrl: resolvedSourceOfferUrl,
      telegramBot: Object.freeze({ enabled: false })
    });
  }

  const botToken = requireNonBlank(configuration.TELEGRAM_BOT_TOKEN);
  const operatorApiToken = requireOperatorApiToken(configuration.OPERATOR_API_TOKEN);
  const webhookSecret = requireWebhookSecret(configuration.TELEGRAM_WEBHOOK_SECRET);
  const webhookUrl = optionalHttpsUrl(configuration.TELEGRAM_WEBHOOK_URL);

  if (
    botToken === undefined ||
    operatorApiToken === undefined ||
    webhookSecret === undefined ||
    operatorApiToken === webhookSecret
  ) {
    throw new EnvironmentConfigurationError();
  }

  if (
    configuration.TELEGRAM_WEBHOOK_URL !== undefined &&
    configuration.TELEGRAM_WEBHOOK_URL.trim().length > 0 &&
    webhookUrl === undefined
  ) {
    throw new EnvironmentConfigurationError();
  }

  return Object.freeze({
    HOST: configuration.HOST,
    NODE_ENV: configuration.NODE_ENV,
    PORT: configuration.PORT,
    sourceOfferUrl: resolvedSourceOfferUrl,
    telegramBot: Object.freeze({
      botToken,
      connectionId: configuration.TELEGRAM_CONNECTION_ID,
      enabled: true,
      operatorApiToken,
      webhookSecret,
      ...(webhookUrl === undefined ? {} : { webhookUrl })
    })
  });
};

const requireNonBlank = (value: string | undefined): string | undefined =>
  value === undefined || value.trim().length === 0 ? undefined : value;

const requireOperatorApiToken = (value: string | undefined): string | undefined => {
  const token = requireNonBlank(value);

  return token === undefined || token.length < 32 || token.length > 512 ? undefined : token;
};

const requireWebhookSecret = (value: string | undefined): string | undefined => {
  const secret = requireNonBlank(value);

  return secret === undefined || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) ? undefined : secret;
};

const optionalHttpsUrl = (value: string | undefined): string | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const sourceOfferUrlFor = (value: string | undefined): string | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === 'https:' &&
      parsed.hostname.length > 0 &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
