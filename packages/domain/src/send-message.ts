import type {
  ConnectorCapability,
  ConnectorCapabilityId,
  ProviderReceipt,
  SendTextProviderCommand
} from '@open-channel-hub/contracts';

import type { OutboundMessagePort } from './ports/outbound-message-port.js';

const SEND_TEXT_CAPABILITY = 'message.send.text' as const;

export interface SendMessageInput {
  readonly connectionId: string;
  readonly recipientId: string;
  readonly text: string;
}

export type SendMessageInvalidInputError = Readonly<{
  code: 'invalid_input';
  field: keyof SendMessageInput;
  reason: 'required_non_blank_string';
}>;

export type SendMessageConnectionMismatchError = Readonly<{
  code: 'connection_mismatch';
  requestedConnectionId: string;
  configuredConnectionId: string;
}>;

export type SendMessageConnectionUnavailableError = Readonly<{
  code: 'connection_unavailable';
  connectionId: string;
}>;

export type SendMessageUnsupportedCapabilityError = Readonly<{
  code: 'unsupported_capability';
  capability: typeof SEND_TEXT_CAPABILITY;
}>;

export type SendMessageError =
  | SendMessageInvalidInputError
  | SendMessageConnectionMismatchError
  | SendMessageConnectionUnavailableError
  | SendMessageUnsupportedCapabilityError;

export type SendMessageResult =
  | Readonly<{
      ok: true;
      receipt: ProviderReceipt;
    }>
  | Readonly<{
      ok: false;
      error: SendMessageError;
    }>;

/**
 * Sends a text message through the injected port after enforcing the shared
 * connection and capability rules. The use case does not perform I/O itself.
 */
export class SendMessage {
  public constructor(private readonly outboundPort: OutboundMessagePort) {}

  public async execute(input: unknown): Promise<SendMessageResult> {
    const validation = validateInput(input);

    if (!validation.ok) {
      return failure(validation.error);
    }

    const { connection } = this.outboundPort;

    if (connection.id !== validation.value.connectionId) {
      return failure({
        code: 'connection_mismatch',
        requestedConnectionId: validation.value.connectionId,
        configuredConnectionId: connection.id
      });
    }

    if (connection.status !== 'connected') {
      return failure({
        code: 'connection_unavailable',
        connectionId: connection.id
      });
    }

    if (!hasCapability(connection.capabilities, SEND_TEXT_CAPABILITY)) {
      return failure({
        code: 'unsupported_capability',
        capability: SEND_TEXT_CAPABILITY
      });
    }

    const command: SendTextProviderCommand = Object.freeze({
      type: SEND_TEXT_CAPABILITY,
      connectionId: validation.value.connectionId,
      recipientId: validation.value.recipientId,
      text: validation.value.text
    });
    const receipt = await this.outboundPort.send(command);

    return Object.freeze({
      ok: true,
      receipt: Object.freeze({
        connectionId: receipt.connectionId,
        providerMessageId: receipt.providerMessageId,
        acceptedAt: receipt.acceptedAt
      })
    });
  }
}

type ValidationResult =
  | Readonly<{ ok: true; value: SendMessageInput }>
  | Readonly<{ ok: false; error: SendMessageInvalidInputError }>;

function validateInput(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return invalidInput('connectionId');
  }

  const connectionId = input.connectionId;
  if (!isNonBlankString(connectionId)) {
    return invalidInput('connectionId');
  }

  const recipientId = input.recipientId;
  if (!isNonBlankString(recipientId)) {
    return invalidInput('recipientId');
  }

  const text = input.text;
  if (!isNonBlankString(text)) {
    return invalidInput('text');
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      connectionId,
      recipientId,
      text
    })
  });
}

function invalidInput(field: keyof SendMessageInput): ValidationResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: 'invalid_input',
      field,
      reason: 'required_non_blank_string'
    })
  });
}

function failure(error: SendMessageError): SendMessageResult {
  return Object.freeze({ ok: false, error: Object.freeze(error) });
}

function hasCapability(
  capabilities: readonly ConnectorCapability[],
  capability: ConnectorCapabilityId
): boolean {
  return capabilities.some((candidate) => candidate.id === capability);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
