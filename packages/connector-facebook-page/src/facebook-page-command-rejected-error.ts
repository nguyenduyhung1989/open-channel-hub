export type FacebookPageCommandRejection = Readonly<{
  capability: 'message.send.text';
  code: 'unsupported_capability';
}>;

/**
 * This inbound-only connector deliberately has no Facebook Graph API send
 * transport. The typed error prevents an accidental outbound path from being
 * treated as a configured capability.
 */
export class FacebookPageCommandRejectedError extends Error {
  readonly code: FacebookPageCommandRejection['code'];
  readonly rejection: FacebookPageCommandRejection;

  public constructor() {
    const rejection: FacebookPageCommandRejection = Object.freeze({
      capability: 'message.send.text',
      code: 'unsupported_capability'
    });

    super('The Facebook Page connection cannot send text messages in this phase.');
    this.name = 'FacebookPageCommandRejectedError';
    this.code = rejection.code;
    this.rejection = rejection;
  }
}
