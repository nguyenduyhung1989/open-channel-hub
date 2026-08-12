export type TelegramBotCommandRejection =
  | Readonly<{
      code: 'connection_mismatch';
      configuredConnectionId: string;
      requestedConnectionId: string;
    }>
  | Readonly<{
      code: 'connection_unavailable';
      connectionId: string;
    }>
  | Readonly<{
      capability: 'message.send.text';
      code: 'unsupported_capability';
    }>;

/**
 * The adapter rejected a command before contacting Telegram. Its `code` and
 * fields deliberately mirror the Phase 0 domain rejection vocabulary.
 */
export class TelegramBotCommandRejectedError extends Error {
  readonly code: TelegramBotCommandRejection['code'];
  readonly rejection: TelegramBotCommandRejection;

  constructor(rejection: TelegramBotCommandRejection) {
    super(messageFor(rejection));
    this.name = 'TelegramBotCommandRejectedError';
    this.code = rejection.code;
    this.rejection = rejection;
  }
}

const messageFor = (rejection: TelegramBotCommandRejection): string => {
  switch (rejection.code) {
    case 'connection_mismatch':
      return 'The command targets a different Telegram connection.';
    case 'connection_unavailable':
      return 'The Telegram connection is not available.';
    case 'unsupported_capability':
      return 'The Telegram connection cannot send text messages.';
  }
};
