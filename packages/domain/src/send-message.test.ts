import type { ConnectionState, ProviderReceipt } from '@open-channel-hub/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { OutboundMessagePort } from './ports/outbound-message-port.js';
import { SendMessage } from './send-message.js';

const ACCEPTED_AT = '2026-08-12T00:00:00.000Z';

describe('SendMessage', () => {
  it('sends a valid text command exactly once through its outbound port', async () => {
    const { port, send } = createPort();
    const useCase = new SendMessage(port);

    const result = await useCase.execute({
      connectionId: 'connection-telegram-1',
      recipientId: 'chat-42',
      text: 'Chào mày'
    });

    expect(result).toEqual({
      ok: true,
      receipt: {
        connectionId: 'connection-telegram-1',
        providerMessageId: 'provider-message-1',
        acceptedAt: ACCEPTED_AT
      }
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      type: 'message.send.text',
      connectionId: 'connection-telegram-1',
      recipientId: 'chat-42',
      text: 'Chào mày'
    });
  });

  it('rejects a connection without text-send capability before calling its port', async () => {
    const { port, send } = createPort({ capabilities: [] });
    const result = await new SendMessage(port).execute(validInput());

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unsupported_capability',
        capability: 'message.send.text'
      }
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a command for another connection before calling its port', async () => {
    const { port, send } = createPort();
    const result = await new SendMessage(port).execute({
      ...validInput(),
      connectionId: 'connection-zalo-2'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'connection_mismatch',
        requestedConnectionId: 'connection-zalo-2',
        configuredConnectionId: 'connection-telegram-1'
      }
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only text before calling its port', async () => {
    const { port, send } = createPort();
    const result = await new SendMessage(port).execute({ ...validInput(), text: ' \n\t ' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        field: 'text',
        reason: 'required_non_blank_string'
      }
    });
    expect(send).not.toHaveBeenCalled();
  });
});

function createPort(connectionOverrides: Partial<ConnectionState> = {}) {
  const connection: ConnectionState = {
    id: 'connection-telegram-1',
    connectorId: 'telegram-bot',
    channel: 'telegram_bot',
    status: 'connected',
    capabilities: [{ id: 'message.send.text' }],
    ...connectionOverrides
  };
  const receipt: ProviderReceipt = {
    connectionId: connection.id,
    providerMessageId: 'provider-message-1',
    acceptedAt: ACCEPTED_AT
  };
  const send = vi.fn(async (): Promise<ProviderReceipt> => receipt);
  const port: OutboundMessagePort = { connection, send };

  return {
    port,
    send
  };
}

function validInput(): Readonly<{
  connectionId: string;
  recipientId: string;
  text: string;
}> {
  return {
    connectionId: 'connection-telegram-1',
    recipientId: 'chat-42',
    text: 'Chào mày'
  };
}
