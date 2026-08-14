import { describe, expect, it, vi } from 'vitest';

import { ConnectorProviderError } from '@open-channel-hub/connector-sdk';

import { TelegramBotCommandRejectedError } from './telegram-bot-command-rejected-error.js';
import { TelegramBotConnectorAdapter } from './telegram-bot-connector.js';
import type { TelegramBotGateway } from './telegram-types.js';

const receipt = {
  acceptedAt: '2026-08-12T00:00:00.000Z',
  connectionId: 'conn_telegram_1',
  providerMessageId: '301'
} as const;

const createGateway = (): TelegramBotGateway => ({
  sendMessage: vi.fn().mockResolvedValue(receipt)
});

const createAdapter = (gateway = createGateway()): TelegramBotConnectorAdapter =>
  new TelegramBotConnectorAdapter({
    connectionId: 'conn_telegram_1',
    gateway
  });

describe('TelegramBotConnectorAdapter', () => {
  it('declares the official Telegram Bot text receive/send surface', () => {
    const adapter = createAdapter();

    expect(adapter.manifest()).toEqual({
      capabilities: [{ id: 'message.receive.text' }, { id: 'message.send.text' }],
      channel: 'telegram_bot',
      displayName: 'Telegram Bot',
      id: 'telegram-bot',
      tier: 'OFFICIAL'
    });
    expect(adapter.capabilities()).toEqual([
      { id: 'message.receive.text' },
      { id: 'message.send.text' }
    ]);
  });

  it('delegates a text send command to the injected official gateway', async () => {
    const gateway = createGateway();
    const adapter = createAdapter(gateway);

    await expect(
      adapter.execute({
        connectionId: 'conn_telegram_1',
        recipientId: '-1001234567890',
        text: 'Chào mày',
        type: 'message.send.text'
      })
    ).resolves.toEqual(receipt);

    expect(gateway.sendMessage).toHaveBeenCalledOnce();
    expect(gateway.sendMessage).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      text: 'Chào mày'
    });
  });

  it('rejects a command for another connection before calling the gateway', async () => {
    const gateway = createGateway();
    const adapter = createAdapter(gateway);

    const error = await adapter
      .execute({
        connectionId: 'conn_telegram_other',
        recipientId: '42',
        text: 'Không được gửi nhầm nhà.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramBotCommandRejectedError);
    expect(error).toMatchObject({
      code: 'connection_mismatch',
      rejection: {
        code: 'connection_mismatch',
        configuredConnectionId: 'conn_telegram_1',
        requestedConnectionId: 'conn_telegram_other'
      }
    });

    expect(gateway.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a command after disconnecting before calling the gateway', async () => {
    const gateway = createGateway();
    const adapter = createAdapter(gateway);

    await adapter.disconnect();

    const error = await adapter
      .execute({
        connectionId: 'conn_telegram_1',
        recipientId: '42',
        text: 'Không được gửi khi đã ngắt kết nối.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramBotCommandRejectedError);
    expect(error).toMatchObject({
      code: 'connection_unavailable',
      rejection: {
        code: 'connection_unavailable',
        connectionId: 'conn_telegram_1'
      }
    });

    expect(gateway.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a text command when the connection lacks text-send capability', async () => {
    const gateway = createGateway();
    const adapter = new TelegramBotConnectorAdapter({
      capabilities: [],
      connectionId: 'conn_telegram_1',
      gateway
    });

    const error = await adapter
      .execute({
        connectionId: 'conn_telegram_1',
        recipientId: '42',
        text: 'Không có quyền gửi.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramBotCommandRejectedError);
    expect(error).toMatchObject({
      code: 'unsupported_capability',
      rejection: {
        capability: 'message.send.text',
        code: 'unsupported_capability'
      }
    });

    expect(gateway.sendMessage).not.toHaveBeenCalled();
  });

  it('normalizes a Telegram text update into one canonical event', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize({
        message: {
          chat: { id: -1001234567890, type: 'supergroup' },
          date: 1_786_492_800,
          from: { first_name: 'Hưng', id: 42, is_bot: false, username: 'hung' },
          message_id: 301,
          text: 'Xin chào'
        },
        update_id: 9001
      })
    ).toEqual([
      {
        channel: 'telegram_bot',
        connectionId: 'conn_telegram_1',
        id: 'telegram:event:9001',
        message: {
          conversationId: '-1001234567890',
          id: '301',
          senderId: '42',
          text: 'Xin chào'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: '9001',
        telegramChatType: 'supergroup',
        type: 'message.received'
      }
    ]);
  });

  it('normalizes each supported Telegram chat type and rejects an unknown chat type', () => {
    const adapter = createAdapter();

    for (const chatType of ['private', 'group', 'supergroup', 'channel'] as const) {
      expect(
        adapter.normalize({
          message: {
            chat: { id: 42, type: chatType },
            date: 1_786_492_800,
            message_id: 301,
            text: 'Synthetic inbound message'
          },
          update_id: 9001
        })
      ).toEqual([expect.objectContaining({ telegramChatType: chatType })]);
    }

    expect(
      adapter.normalize({
        message: {
          chat: { id: 42, type: 'unknown_chat_kind' },
          date: 1_786_492_800,
          message_id: 301,
          text: 'Synthetic inbound message'
        },
        update_id: 9001
      })
    ).toEqual([]);
  });

  it('ignores a non-text Telegram update without throwing', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize({
        message: {
          chat: { id: 42, type: 'private' },
          date: 1_786_492_800,
          message_id: 302,
          sticker: { file_id: 'synthetic' }
        },
        update_id: 9002
      })
    ).toEqual([]);
  });

  it('ignores a text update with a timestamp outside the JavaScript Date range', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize({
        message: {
          chat: { id: 42, type: 'private' },
          date: Number.MAX_SAFE_INTEGER,
          message_id: 303,
          text: 'Dữ liệu thời gian bị lỗi.'
        },
        update_id: 9003
      })
    ).toEqual([]);
  });

  it('wraps gateway failures as a typed provider failure with the original cause', async () => {
    const cause = new Error('synthetic provider outage');
    const gateway: TelegramBotGateway = {
      sendMessage: vi.fn().mockRejectedValue(cause)
    };
    const adapter = createAdapter(gateway);

    const error = await adapter
      .execute({
        connectionId: 'conn_telegram_1',
        recipientId: '42',
        text: 'Không có mạng thật nào bị gọi cả',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ConnectorProviderError);
    expect(error).toMatchObject({
      cause,
      channel: 'telegram_bot',
      code: 'PROVIDER_FAILURE',
      operation: 'telegram.sendMessage'
    });
  });
});
