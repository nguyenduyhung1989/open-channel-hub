import { createHash } from 'node:crypto';

const TELEGRAM_BOT_PROVIDER_IDENTITY_DOMAIN =
  'open-channel-hub:telegram-bot:provider-identity:v1\u0000';
const TELEGRAM_BOT_TOKEN_PATTERN = /^(?<botUserId>[1-9][0-9]{0,18}):[!-9;-~]{1,512}$/;

/**
 * A Telegram Bot token has a stable numeric Bot account prefix followed by a
 * rotating secret. This only recognizes that structure; it does not contact
 * Telegram or retain either the secret suffix or the numeric identifier.
 */
export const isTelegramBotToken = (value: unknown): value is string =>
  typeof value === 'string' && TELEGRAM_BOT_TOKEN_PATTERN.test(value);

/**
 * Derives the opaque durable Bot-account binding from the token's stable
 * numeric prefix. A token rotation for the same Bot keeps this fingerprint;
 * changing Bots cannot silently reuse a connection with recorded history.
 */
export const fingerprintTelegramBotProviderIdentity = (botToken: string): string | undefined => {
  const match = TELEGRAM_BOT_TOKEN_PATTERN.exec(botToken);
  const botUserId = match?.groups?.botUserId;

  return botUserId === undefined
    ? undefined
    : createHash('sha256')
        .update(TELEGRAM_BOT_PROVIDER_IDENTITY_DOMAIN, 'utf8')
        .update(botUserId, 'utf8')
        .digest('hex');
};
