import { describe, expect, it, vi } from 'vitest';

import {
  ZALO_USER_ABNORMAL_CLOSURE,
  ZALO_USER_DUPLICATE_CONNECTION,
  ZALO_USER_GROUP_THREAD_TYPE,
  ZALO_USER_KICK_CONNECTION,
  ZaloUserBridge,
  ZaloUserBridgeCommandRejectedError,
  ZaloUserBridgeConfigurationError,
  ZaloUserBridgeProviderError,
  type ZaloUserBridgeApi,
  type ZaloUserBridgeInboundMessage,
  type ZaloUserBridgeListener,
  type ZaloUserBridgeOptions
} from './zalo-user-bridge.js';

const ACCOUNT_ID = '1234567890123456789';
const CONNECTION_ID = 'zalo-user-support';
const GROUP_ID = '146845883529197922';

const groupMessage = (
  overrides: Readonly<Partial<ZaloUserBridgeInboundMessage>> = {}
): ZaloUserBridgeInboundMessage => ({
  data: {
    content: 'Tin nhắn nhóm tổng hợp',
    msgId: 'zalo-user-group-message-101',
    ts: '1786701600000',
    uidFrom: '246845883529197923'
  },
  isSelf: false,
  threadId: GROUP_ID,
  type: ZALO_USER_GROUP_THREAD_TYPE,
  ...overrides
});

describe('ZaloUserBridge', () => {
  it('delivers only received group text and admits the group after the Hub confirms storage', async () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();

    harness.listener.emitMessage(groupMessage());
    await settle();

    expect(harness.deliverEvent).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      conversationId: GROUP_ID,
      occurredAt: '2026-08-14T10:00:00.000Z',
      providerEventId: 'zalo-user-group-message-101',
      senderId: '246845883529197923',
      text: 'Tin nhắn nhóm tổng hợp',
      threadType: 'group'
    });
    expect(harness.bridge.knowsGroup(GROUP_ID)).toBe(true);
  });

  it.each([
    groupMessage({ isSelf: true }),
    groupMessage({ type: 0 }),
    groupMessage({
      data: { content: { image: true }, msgId: 'event-1', ts: '1786701600000', uidFrom: 'sender-1' }
    }),
    groupMessage({ threadId: '' }),
    groupMessage({ data: { content: 'x', msgId: '', ts: '1786701600000', uidFrom: 'sender-1' } })
  ])('ignores self, direct, non-text, and malformed inbound values', async (message) => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();

    harness.listener.emitMessage(message);
    await settle();

    expect(harness.deliverEvent).not.toHaveBeenCalled();
    expect(harness.bridge.knowsGroup(GROUP_ID)).toBe(false);
  });

  it('does not admit a group when durable inbound delivery fails', async () => {
    const harness = createHarness({
      deliverEvent: vi.fn(async (): Promise<void> => {
        throw new Error('Synthetic Hub failure.');
      })
    });
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();

    harness.listener.emitMessage(groupMessage());
    await settle();

    expect(harness.bridge.knowsGroup(GROUP_ID)).toBe(false);
    expect(harness.reportOperationalFailure).toHaveBeenCalledOnce();
  });

  it('sends text only to a group observed in this running session', async () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();

    await expect(
      harness.bridge.sendGroupText({ groupId: 'untrusted-group', text: 'Không được phép.' })
    ).rejects.toBeInstanceOf(ZaloUserBridgeCommandRejectedError);
    expect(harness.sendMessage).not.toHaveBeenCalled();

    harness.listener.emitMessage(groupMessage());
    await settle();

    await harness.bridge.sendGroupText({ groupId: GROUP_ID, text: 'Đã nhận.' });

    expect(harness.sendMessage).toHaveBeenCalledTimes(1);
    expect(harness.sendMessage).toHaveBeenCalledWith(
      { msg: 'Đã nhận.' },
      GROUP_ID,
      ZALO_USER_GROUP_THREAD_TYPE
    );
  });

  it('sends one bounded JPEG/PNG/WebP buffer to an observed group without reading a caller path', async () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();
    harness.listener.emitMessage(groupMessage());
    await settle();

    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await harness.bridge.sendGroupImage({
      caption: 'Ảnh tình trạng',
      groupId: GROUP_ID,
      image: {
        data: image,
        filename: 'status.png',
        metadata: { height: 1, totalSize: image.length, width: 1 }
      }
    });

    expect(harness.sendMessage).toHaveBeenCalledWith(
      {
        attachments: [
          {
            data: image,
            filename: 'status.png',
            metadata: { height: 1, totalSize: image.length, width: 1 }
          }
        ],
        msg: 'Ảnh tình trạng'
      },
      GROUP_ID,
      ZALO_USER_GROUP_THREAD_TYPE
    );
  });

  it.each([
    { data: Buffer.alloc(0), filename: 'empty.png', metadata: { totalSize: 0 } },
    { data: Buffer.from('x'), filename: 'script.svg', metadata: { totalSize: 1 } },
    { data: Buffer.from('x'), filename: 'not-an-image.png', metadata: { totalSize: 1 } },
    { data: Buffer.from('x'), filename: 'image.png', metadata: { totalSize: 2 } },
    {
      data: Buffer.alloc(10 * 1024 * 1024 + 1),
      filename: 'large.png',
      metadata: { totalSize: 10 * 1024 * 1024 + 1 }
    }
  ])('rejects unsafe image payloads before one provider send', async (image) => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();
    harness.listener.emitMessage(groupMessage());
    await settle();

    await expect(
      harness.bridge.sendGroupImage({ groupId: GROUP_ID, image: image as never })
    ).rejects.toBeInstanceOf(ZaloUserBridgeCommandRejectedError);
    expect(harness.sendMessage).not.toHaveBeenCalled();
  });

  it('does not resend when Zalo rejects a text or image request', async () => {
    const harness = createHarness({
      sendMessage: vi.fn(async (): Promise<unknown> => {
        throw new Error('Synthetic provider rejection.');
      })
    });
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();
    harness.listener.emitMessage(groupMessage());
    await settle();

    await expect(
      harness.bridge.sendGroupText({ groupId: GROUP_ID, text: 'Một lần duy nhất.' })
    ).rejects.toBeInstanceOf(ZaloUserBridgeProviderError);

    expect(harness.sendMessage).toHaveBeenCalledOnce();
  });

  it('reconnects only three abnormal closures with explicit bounded delays and endpoint retry disabled', () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();

    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);
    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);
    expect(harness.scheduled.map((entry) => entry.delayMilliseconds)).toEqual([1_000]);
    harness.scheduled[0]?.callback();

    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);
    expect(harness.scheduled.map((entry) => entry.delayMilliseconds)).toEqual([1_000, 5_000]);
    harness.scheduled[1]?.callback();

    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);
    expect(harness.scheduled.map((entry) => entry.delayMilliseconds)).toEqual([
      1_000, 5_000, 30_000
    ]);
    harness.scheduled[2]?.callback();

    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);

    expect(harness.listener.start).toHaveBeenCalledTimes(4);
    expect(harness.listener.start).toHaveBeenNthCalledWith(1, { retryOnClose: false });
    expect(harness.listener.start).toHaveBeenNthCalledWith(4, { retryOnClose: false });
    expect(harness.states.at(-1)).toBe('error');
  });

  it.each([ZALO_USER_DUPLICATE_CONNECTION, ZALO_USER_KICK_CONNECTION])(
    'requires a new human QR login after close reason %s instead of reconnecting',
    (closeCode) => {
      const harness = createHarness();
      harness.bridge.start(harness.api);
      harness.listener.emitConnected();

      harness.listener.emitClosed(closeCode);

      expect(harness.scheduled).toEqual([]);
      expect(harness.listener.start).toHaveBeenCalledOnce();
      expect(harness.states.at(-1)).toBe('reauthentication_required');
    }
  );

  it('removes the send capability as soon as Zalo requires a new human QR login', async () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();
    harness.listener.emitMessage(groupMessage());
    await settle();

    harness.listener.emitClosed(ZALO_USER_DUPLICATE_CONNECTION);

    await expect(
      harness.bridge.sendGroupText({
        groupId: GROUP_ID,
        text: 'Không gửi sau khi phiên bị thay thế.'
      })
    ).rejects.toBeInstanceOf(ZaloUserBridgeCommandRejectedError);
    expect(harness.sendMessage).not.toHaveBeenCalled();
  });

  it('stops pending reconnect work and refuses sends after an explicit stop', async () => {
    const harness = createHarness();
    harness.bridge.start(harness.api);
    harness.listener.emitConnected();
    harness.listener.emitClosed(ZALO_USER_ABNORMAL_CLOSURE);

    harness.bridge.stop();
    harness.scheduled[0]?.callback();

    await expect(
      harness.bridge.sendGroupText({ groupId: GROUP_ID, text: 'Không gửi sau stop.' })
    ).rejects.toBeInstanceOf(ZaloUserBridgeCommandRejectedError);
    expect(harness.listener.stop).toHaveBeenCalledOnce();
    expect(harness.listener.start).toHaveBeenCalledOnce();
  });

  it('rejects a session whose authenticated account does not match its immutable account binding', () => {
    const harness = createHarness();
    const wrongAccountApi = { ...harness.api, getOwnId: (): string => '1234567890123456790' };

    expect(() => harness.bridge.start(wrongAccountApi)).toThrow(ZaloUserBridgeConfigurationError);
    expect(harness.listener.start).not.toHaveBeenCalled();
  });
});

const createHarness = (
  overrides: Readonly<{
    deliverEvent?: ZaloUserBridgeOptions['deliverEvent'];
    sendMessage?: ZaloUserBridgeApi['sendMessage'];
  }> = {}
) => {
  const listener = new FakeListener();
  const scheduled: ScheduledCallback[] = [];
  const states: string[] = [];
  const reportOperationalFailure = vi.fn();
  const deliverEvent =
    overrides.deliverEvent ??
    vi.fn<ZaloUserBridgeOptions['deliverEvent']>(async (): Promise<void> => undefined);
  const sendMessage =
    overrides.sendMessage ??
    vi.fn<ZaloUserBridgeApi['sendMessage']>(async (): Promise<unknown> => undefined);
  const api: ZaloUserBridgeApi = {
    getOwnId: (): string => ACCOUNT_ID,
    listener,
    sendMessage
  };
  const bridge = new ZaloUserBridge({
    accountId: ACCOUNT_ID,
    cancelScheduled: (handle: unknown): void => {
      const entry = handle as ScheduledCallback;
      entry.cancelled = true;
    },
    connectionId: CONNECTION_ID,
    deliverEvent,
    onStateChange: (state): void => {
      states.push(state);
    },
    reportOperationalFailure,
    schedule: (callback, delayMilliseconds): ScheduledCallback => {
      const entry: ScheduledCallback = { callback, cancelled: false, delayMilliseconds };
      scheduled.push(entry);
      return entry;
    }
  });

  return {
    api,
    bridge,
    deliverEvent,
    listener,
    reportOperationalFailure,
    scheduled,
    sendMessage,
    states
  };
};

class FakeListener implements ZaloUserBridgeListener {
  readonly start = vi.fn<(options?: Readonly<{ retryOnClose?: boolean }>) => void>();
  readonly stop = vi.fn<() => void>();
  #closed: ((code: number, reason: string) => unknown) | undefined;
  #connected: (() => unknown) | undefined;
  #error: ((error: unknown) => unknown) | undefined;
  #message: ((message: ZaloUserBridgeInboundMessage) => unknown) | undefined;

  public on(
    event: 'closed' | 'connected' | 'error' | 'message',
    callback:
      | ((code: number, reason: string) => unknown)
      | (() => unknown)
      | ((error: unknown) => unknown)
      | ((message: ZaloUserBridgeInboundMessage) => unknown)
  ): unknown {
    if (event === 'closed') {
      this.#closed = callback as (code: number, reason: string) => unknown;
    } else if (event === 'connected') {
      this.#connected = callback as () => unknown;
    } else if (event === 'error') {
      this.#error = callback as (error: unknown) => unknown;
    } else {
      this.#message = callback as (message: ZaloUserBridgeInboundMessage) => unknown;
    }

    return undefined;
  }

  public emitClosed(code: number): void {
    this.#closed?.(code, 'Synthetic close.');
  }

  public emitConnected(): void {
    this.#connected?.();
  }

  public emitError(error: unknown): void {
    this.#error?.(error);
  }

  public emitMessage(message: ZaloUserBridgeInboundMessage): void {
    this.#message?.(message);
  }
}

interface ScheduledCallback {
  callback(): void;
  cancelled: boolean;
  delayMilliseconds: number;
}

const settle = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};
