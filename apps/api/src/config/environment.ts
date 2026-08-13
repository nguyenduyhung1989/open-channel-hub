import { z } from 'zod';

import { DEFAULT_SOURCE_OFFER_URL } from '../source/source-offer.js';

const environmentSchema = z.object({
  DATABASE_HOST: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_PASSWORD_FILE: z.string().optional(),
  DATABASE_PORT: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  CONNECTIONS_CONFIG_BASE64_FILE: z.string().optional(),
  CONNECTIONS_CONFIG_FILE: z.string().optional(),
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

/** A secret-backed JSON file that can configure more than one Telegram Bot connection. */
export interface RuntimeConfiguredTelegramBotsEnvironment {
  readonly configurationEncoding: 'base64url' | 'json';
  readonly configurationFile: string;
  readonly enabled: true;
}

export type TelegramBotEnvironment =
  | DisabledTelegramBotEnvironment
  | EnabledTelegramBotEnvironment
  | RuntimeConfiguredTelegramBotsEnvironment;

export interface PostgresEnvironment {
  readonly database: 'open_channel_hub';
  readonly host: string;
  readonly passwordFile: string;
  readonly port: number;
  readonly user: 'open_channel_hub';
}

export interface AppEnvironment {
  readonly HOST: string;
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly PORT: number;
  readonly postgres?: PostgresEnvironment;
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
  const postgres = postgresEnvironmentFor(configuration);

  if (
    (configuration.SOURCE_OFFER_URL !== undefined &&
      configuration.SOURCE_OFFER_URL.trim().length > 0 &&
      sourceOfferUrl === undefined) ||
    (configuration.NODE_ENV === 'production' && sourceOfferUrl === undefined) ||
    (configuration.NODE_ENV === 'production' && postgres === undefined)
  ) {
    throw new EnvironmentConfigurationError();
  }

  const resolvedSourceOfferUrl = sourceOfferUrl ?? DEFAULT_SOURCE_OFFER_URL;
  const configurationFile = optionalNonBlank(configuration.CONNECTIONS_CONFIG_FILE);
  const base64ConfigurationFile = optionalNonBlank(configuration.CONNECTIONS_CONFIG_BASE64_FILE);
  const configuredConnectionFile = configurationFile ?? base64ConfigurationFile;

  if (configuredConnectionFile !== undefined) {
    if (
      (configurationFile !== undefined && base64ConfigurationFile !== undefined) ||
      !isAbsoluteFilePath(configuredConnectionFile) ||
      postgres === undefined ||
      hasLegacyTelegramConfiguration(configuration)
    ) {
      throw new EnvironmentConfigurationError();
    }

    return Object.freeze({
      HOST: configuration.HOST,
      NODE_ENV: configuration.NODE_ENV,
      PORT: configuration.PORT,
      postgres,
      sourceOfferUrl: resolvedSourceOfferUrl,
      telegramBot: Object.freeze({
        configurationEncoding: base64ConfigurationFile === undefined ? 'json' : 'base64url',
        configurationFile: configuredConnectionFile,
        enabled: true
      })
    });
  }

  if (configuration.TELEGRAM_BOT_ENABLED === 'false') {
    return Object.freeze({
      HOST: configuration.HOST,
      NODE_ENV: configuration.NODE_ENV,
      PORT: configuration.PORT,
      ...(postgres === undefined ? {} : { postgres }),
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
    operatorApiToken === webhookSecret ||
    postgres === undefined
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
    ...(postgres === undefined ? {} : { postgres }),
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

const postgresEnvironmentFor = (
  configuration: Readonly<{
    DATABASE_HOST?: string | undefined;
    DATABASE_NAME?: string | undefined;
    DATABASE_PASSWORD_FILE?: string | undefined;
    DATABASE_PORT?: string | undefined;
    DATABASE_USER?: string | undefined;
  }>
): PostgresEnvironment | undefined => {
  const host = optionalNonBlank(configuration.DATABASE_HOST);
  const database = optionalNonBlank(configuration.DATABASE_NAME);
  const passwordFile = optionalNonBlank(configuration.DATABASE_PASSWORD_FILE);
  const port = optionalNonBlank(configuration.DATABASE_PORT);
  const user = optionalNonBlank(configuration.DATABASE_USER);

  if (
    host === undefined &&
    database === undefined &&
    passwordFile === undefined &&
    port === undefined &&
    user === undefined
  ) {
    return undefined;
  }

  const parsedPort = port === undefined ? undefined : Number(port);

  if (
    host === undefined ||
    database !== 'open_channel_hub' ||
    passwordFile === undefined ||
    !passwordFile.startsWith('/') ||
    passwordFile.length > 1_024 ||
    parsedPort === undefined ||
    !Number.isSafeInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65_535 ||
    user !== 'open_channel_hub'
  ) {
    throw new EnvironmentConfigurationError();
  }

  return Object.freeze({
    database,
    host,
    passwordFile,
    port: parsedPort,
    user
  });
};

const optionalNonBlank = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const isAbsoluteFilePath = (value: string): boolean =>
  value.startsWith('/') && value.length <= 1_024 && !value.includes('\u0000');

const hasLegacyTelegramConfiguration = (
  configuration: Readonly<{
    OPERATOR_API_TOKEN?: string | undefined;
    TELEGRAM_BOT_ENABLED: 'true' | 'false';
    TELEGRAM_BOT_TOKEN?: string | undefined;
    TELEGRAM_WEBHOOK_SECRET?: string | undefined;
    TELEGRAM_WEBHOOK_URL?: string | undefined;
  }>
): boolean =>
  configuration.TELEGRAM_BOT_ENABLED === 'true' ||
  [
    configuration.OPERATOR_API_TOKEN,
    configuration.TELEGRAM_BOT_TOKEN,
    configuration.TELEGRAM_WEBHOOK_SECRET,
    configuration.TELEGRAM_WEBHOOK_URL
  ].some((value) => optionalNonBlank(value) !== undefined);

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
