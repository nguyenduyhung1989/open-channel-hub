export type ZaloOaCommandRejection = Readonly<{
  capability: 'message.send.text';
  code: 'unsupported_capability';
}>;

/**
 * Phase 3a deliberately has no Zalo OA outbound transport. This typed error
 * makes that absence explicit before any provider action can be attempted.
 */
export class ZaloOaCommandRejectedError extends Error {
  readonly code: ZaloOaCommandRejection['code'];
  readonly rejection: ZaloOaCommandRejection;

  public constructor() {
    const rejection: ZaloOaCommandRejection = Object.freeze({
      capability: 'message.send.text',
      code: 'unsupported_capability'
    });

    super('The Zalo OA connection cannot send text messages in this phase.');
    this.name = 'ZaloOaCommandRejectedError';
    this.code = rejection.code;
    this.rejection = rejection;
  }
}
