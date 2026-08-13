export type WhatsAppBusinessCommandRejection = Readonly<{
  capability: 'message.send.text';
  code: 'unsupported_capability';
}>;

/**
 * This inbound-only connector deliberately has no WhatsApp Cloud API send
 * transport. The typed error prevents an accidental outbound path from being
 * treated as a configured capability.
 */
export class WhatsAppBusinessCommandRejectedError extends Error {
  readonly code: WhatsAppBusinessCommandRejection['code'];
  readonly rejection: WhatsAppBusinessCommandRejection;

  public constructor() {
    const rejection: WhatsAppBusinessCommandRejection = Object.freeze({
      capability: 'message.send.text',
      code: 'unsupported_capability'
    });

    super('The WhatsApp Business connection cannot send text messages in this phase.');
    this.name = 'WhatsAppBusinessCommandRejectedError';
    this.code = rejection.code;
    this.rejection = rejection;
  }
}
