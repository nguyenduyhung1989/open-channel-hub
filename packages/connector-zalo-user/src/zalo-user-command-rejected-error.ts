export type ZaloUserCommandRejection = Readonly<{
  capability: 'message.send.text';
  code: 'unsupported_capability';
}>;

/**
 * The pure adapter is deliberately not the Zalo Web session. Sending remains
 * owned by the isolated bridge, where a durable source-bound command can be
 * checked before provider I/O is ever considered.
 */
export class ZaloUserCommandRejectedError extends Error {
  readonly code: ZaloUserCommandRejection['code'];
  readonly rejection: ZaloUserCommandRejection;

  public constructor() {
    const rejection: ZaloUserCommandRejection = Object.freeze({
      capability: 'message.send.text',
      code: 'unsupported_capability'
    });

    super('The Zalo User adapter does not own an outbound session.');
    this.name = 'ZaloUserCommandRejectedError';
    this.code = rejection.code;
    this.rejection = rejection;
  }
}
