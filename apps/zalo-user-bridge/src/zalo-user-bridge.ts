import type { ZaloUserInboundTextEvent } from '@open-channel-hub/connector-zalo-user';

export const ZALO_USER_GROUP_THREAD_TYPE = 1;
export const ZALO_USER_ABNORMAL_CLOSURE = 1006;
export const ZALO_USER_DUPLICATE_CONNECTION = 3000;
export const ZALO_USER_KICK_CONNECTION = 3003;

const MAXIMUM_GROUP_ID_LENGTH = 512;
const MAXIMUM_TEXT_LENGTH = 16_384;
const MAXIMUM_IMAGE_BYTES = 10 * 1024 * 1024;
const MAXIMUM_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MILLISECONDS = Object.freeze([1_000, 5_000, 30_000] as const);
const IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:jpe?g|png|webp)$/i;

export type ZaloUserBridgeStatus =
  'connected' | 'disconnected' | 'reauthentication_required' | 'error';

export interface ZaloUserBridgeInboundMessage {
  readonly data: Readonly<{
    readonly content: unknown;
    readonly msgId: unknown;
    readonly ts: unknown;
    readonly uidFrom: unknown;
  }>;
  readonly isSelf: unknown;
  readonly threadId: unknown;
  readonly type: unknown;
}

export interface ZaloUserBridgeListener {
  on(event: 'closed', callback: (code: number, reason: string) => unknown): unknown;
  on(event: 'connected', callback: () => unknown): unknown;
  on(event: 'error', callback: (error: unknown) => unknown): unknown;
  on(event: 'message', callback: (message: ZaloUserBridgeInboundMessage) => unknown): unknown;
  start(options?: Readonly<{ retryOnClose?: boolean }>): void;
  stop(): void;
}

export interface ZaloUserBridgeApi {
  readonly listener: ZaloUserBridgeListener;
  getOwnId(): string;
  sendMessage(
    message:
      | string
      | Readonly<{
          readonly attachments?: readonly [ZaloUserBridgeImageAttachment];
          readonly msg: string;
        }>,
    threadId: string,
    type: number
  ): Promise<unknown>;
}

export interface ZaloUserBridgeImageAttachment {
  readonly data: Buffer;
  readonly filename: `${string}.${string}`;
  readonly metadata: Readonly<{
    readonly height?: number;
    readonly totalSize: number;
    readonly width?: number;
  }>;
}

export interface ZaloUserGroupTextReply {
  readonly groupId: string;
  readonly text: string;
}

export interface ZaloUserGroupImageReply {
  readonly caption?: string;
  readonly groupId: string;
  readonly image: ZaloUserBridgeImageAttachment;
}

export interface ZaloUserBridgeOptions {
  readonly accountId: string;
  readonly connectionId: string;
  readonly deliverEvent: (event: ZaloUserInboundTextEvent) => Promise<void>;
  readonly onStateChange?: (status: ZaloUserBridgeStatus) => void;
  readonly reportOperationalFailure?: () => void;
  readonly schedule?: (callback: () => void, delayMilliseconds: number) => unknown;
  readonly cancelScheduled?: (handle: unknown) => void;
}

/**
 * One in-memory Zalo Web session with deliberately limited behavior:
 * - only inbound group text is admitted;
 * - group replies require a group successfully delivered to the Hub in this
 *   running session;
 * - abnormal reconnects are bounded and never ask zca-js to rotate endpoints;
 * - duplicate/kick closures never reconnect automatically.
 */
export class ZaloUserBridge {
  readonly #accountId: string;
  readonly #cancelScheduled: (handle: unknown) => void;
  readonly #deliverEvent: (event: ZaloUserInboundTextEvent) => Promise<void>;
  readonly #knownGroupIds = new Set<string>();
  readonly #onStateChange: (status: ZaloUserBridgeStatus) => void;
  readonly #reportOperationalFailure: () => void;
  readonly #schedule: (callback: () => void, delayMilliseconds: number) => unknown;
  #api: ZaloUserBridgeApi | undefined;
  #reconnectAttempts = 0;
  #reconnectHandle: unknown;
  #stopped = false;
  #status: ZaloUserBridgeStatus = 'disconnected';

  public constructor(options: ZaloUserBridgeOptions) {
    if (!isValidOptions(options)) {
      throw new ZaloUserBridgeConfigurationError();
    }

    this.#accountId = options.accountId;
    this.#deliverEvent = options.deliverEvent;
    this.#onStateChange = options.onStateChange ?? (() => undefined);
    this.#reportOperationalFailure = options.reportOperationalFailure ?? (() => undefined);
    this.#schedule =
      options.schedule ??
      ((callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds));
    this.#cancelScheduled =
      options.cancelScheduled ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
  }

  public start(api: ZaloUserBridgeApi): void {
    if (!isApi(api) || api.getOwnId() !== this.#accountId) {
      throw new ZaloUserBridgeConfigurationError();
    }

    this.stopScheduledReconnect();
    this.#api = api;
    this.#stopped = false;
    this.#reconnectAttempts = 0;
    this.transition('disconnected');
    this.attachListener(api.listener);
    this.startListener(api.listener);
  }

  public stop(): void {
    this.#stopped = true;
    this.stopScheduledReconnect();
    this.#api?.listener.stop();
    this.transition('disconnected');
  }

  public async sendGroupText(reply: ZaloUserGroupTextReply): Promise<void> {
    const groupId = toKnownGroupId(reply?.groupId, this.#knownGroupIds);
    const text = toText(reply?.text);
    const api = this.#api;

    if (
      groupId === undefined ||
      text === undefined ||
      api === undefined ||
      this.#stopped ||
      this.#status !== 'connected'
    ) {
      throw new ZaloUserBridgeCommandRejectedError();
    }

    try {
      await api.sendMessage({ msg: text }, groupId, ZALO_USER_GROUP_THREAD_TYPE);
    } catch {
      throw new ZaloUserBridgeProviderError();
    }
  }

  public async sendGroupImage(reply: ZaloUserGroupImageReply): Promise<void> {
    const groupId = toKnownGroupId(reply?.groupId, this.#knownGroupIds);
    const caption = reply?.caption === undefined ? '' : toTextAllowEmpty(reply.caption);
    const image = toImageAttachment(reply?.image);
    const api = this.#api;

    if (
      groupId === undefined ||
      caption === undefined ||
      image === undefined ||
      api === undefined ||
      this.#stopped ||
      this.#status !== 'connected'
    ) {
      throw new ZaloUserBridgeCommandRejectedError();
    }

    try {
      await api.sendMessage(
        { attachments: [image], msg: caption },
        groupId,
        ZALO_USER_GROUP_THREAD_TYPE
      );
    } catch {
      throw new ZaloUserBridgeProviderError();
    }
  }

  public knowsGroup(groupId: string): boolean {
    return this.#knownGroupIds.has(groupId);
  }

  private attachListener(listener: ZaloUserBridgeListener): void {
    listener.on('connected', () => {
      if (this.#stopped) {
        return;
      }

      this.#reconnectAttempts = 0;
      this.stopScheduledReconnect();
      this.transition('connected');
    });
    listener.on('message', (message) => {
      void this.handleInboundMessage(message);
    });
    listener.on('closed', (code) => {
      this.handleClosed(code);
    });
    listener.on('error', () => {
      this.#reportOperationalFailure();
    });
  }

  private async handleInboundMessage(message: ZaloUserBridgeInboundMessage): Promise<void> {
    const event = toGroupInboundTextEvent({
      accountId: this.#accountId,
      message
    });

    if (event === undefined || this.#stopped || this.#status !== 'connected') {
      return;
    }

    try {
      await this.#deliverEvent(event);
      this.#knownGroupIds.add(event.conversationId);
    } catch {
      this.#reportOperationalFailure();
    }
  }

  private handleClosed(code: number): void {
    if (this.#stopped) {
      return;
    }

    if (code === ZALO_USER_DUPLICATE_CONNECTION || code === ZALO_USER_KICK_CONNECTION) {
      this.stopScheduledReconnect();
      this.transition('reauthentication_required');
      return;
    }

    if (
      code !== ZALO_USER_ABNORMAL_CLOSURE ||
      this.#reconnectAttempts >= MAXIMUM_RECONNECT_ATTEMPTS
    ) {
      this.transition('error');
      return;
    }

    if (this.#reconnectHandle !== undefined) {
      return;
    }

    const delayMilliseconds = RECONNECT_DELAYS_MILLISECONDS[this.#reconnectAttempts];

    if (delayMilliseconds === undefined) {
      this.transition('error');
      return;
    }

    this.#reconnectAttempts += 1;
    this.transition('disconnected');
    this.#reconnectHandle = this.#schedule(() => {
      this.#reconnectHandle = undefined;

      if (!this.#stopped && this.#api !== undefined) {
        this.startListener(this.#api.listener);
      }
    }, delayMilliseconds);
  }

  private startListener(listener: ZaloUserBridgeListener): void {
    // zca-js endpoint rotation/retry is explicitly disabled. This bridge only
    // retries the same in-memory listener after an abnormal network close.
    listener.start({ retryOnClose: false });
  }

  private stopScheduledReconnect(): void {
    if (this.#reconnectHandle !== undefined) {
      this.#cancelScheduled(this.#reconnectHandle);
      this.#reconnectHandle = undefined;
    }
  }

  private transition(status: ZaloUserBridgeStatus): void {
    this.#status = status;
    this.#onStateChange(status);
  }
}

/** Configuration failures omit all account, token, and group values. */
export class ZaloUserBridgeConfigurationError extends Error {
  public constructor() {
    super('The Zalo User bridge configuration is invalid.');
    this.name = 'ZaloUserBridgeConfigurationError';
  }
}

/** Rejected before an untrusted caller can choose an arbitrary Zalo group. */
export class ZaloUserBridgeCommandRejectedError extends Error {
  public constructor() {
    super('The Zalo User group reply is not eligible.');
    this.name = 'ZaloUserBridgeCommandRejectedError';
  }
}

/** Provider details do not cross the bridge boundary. No automatic resend occurs. */
export class ZaloUserBridgeProviderError extends Error {
  public constructor() {
    super('The Zalo User provider request did not complete.');
    this.name = 'ZaloUserBridgeProviderError';
  }
}

const toGroupInboundTextEvent = ({
  accountId,
  message
}: Readonly<{
  accountId: string;
  message: ZaloUserBridgeInboundMessage;
}>): ZaloUserInboundTextEvent | undefined => {
  try {
    if (
      !isRecord(message) ||
      message.isSelf !== false ||
      message.type !== ZALO_USER_GROUP_THREAD_TYPE ||
      !isRecord(message.data)
    ) {
      return undefined;
    }

    const conversationId = toProviderId(message.threadId);
    const providerEventId = toProviderId(message.data.msgId);
    const senderId = toProviderId(message.data.uidFrom);
    const text = toText(message.data.content);
    const occurredAt = toOccurredAt(message.data.ts);

    if (
      conversationId === undefined ||
      providerEventId === undefined ||
      senderId === undefined ||
      text === undefined ||
      occurredAt === undefined
    ) {
      return undefined;
    }

    return Object.freeze({
      accountId,
      conversationId,
      occurredAt,
      providerEventId,
      senderId,
      text,
      threadType: 'group'
    });
  } catch {
    return undefined;
  }
};

const isValidOptions = (value: unknown): value is ZaloUserBridgeOptions =>
  isRecord(value) &&
  typeof value.accountId === 'string' &&
  /^[0-9]{1,32}$/.test(value.accountId) &&
  typeof value.connectionId === 'string' &&
  /^[A-Za-z0-9._:-]{1,128}$/.test(value.connectionId) &&
  value.connectionId !== '.' &&
  value.connectionId !== '..' &&
  typeof value.deliverEvent === 'function';

const isApi = (value: unknown): value is ZaloUserBridgeApi =>
  isRecord(value) &&
  isRecord(value.listener) &&
  typeof value.getOwnId === 'function' &&
  typeof value.listener.on === 'function' &&
  typeof value.listener.start === 'function' &&
  typeof value.listener.stop === 'function' &&
  typeof value.sendMessage === 'function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.charCodeAt(0);

    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const toKnownGroupId = (value: unknown, knownGroupIds: ReadonlySet<string>): string | undefined =>
  typeof value === 'string' && knownGroupIds.has(value) ? value : undefined;

const toProviderId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.trim() === value &&
  value.length >= 1 &&
  value.length <= MAXIMUM_GROUP_ID_LENGTH &&
  !hasAsciiControlCharacter(value)
    ? value
    : undefined;

const toOccurredAt = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) {
    return undefined;
  }

  const milliseconds = Number(value);
  const occurredAt = new Date(milliseconds);

  return Number.isSafeInteger(milliseconds) && !Number.isNaN(occurredAt.getTime())
    ? occurredAt.toISOString()
    : undefined;
};

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= MAXIMUM_TEXT_LENGTH
    ? value
    : undefined;

const toTextAllowEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= MAXIMUM_TEXT_LENGTH ? value : undefined;

const toImageAttachment = (value: unknown): ZaloUserBridgeImageAttachment | undefined => {
  if (!isRecord(value) || !Buffer.isBuffer(value.data) || typeof value.filename !== 'string') {
    return undefined;
  }

  const metadata = value.metadata;

  if (
    !isRecord(metadata) ||
    typeof metadata.totalSize !== 'number' ||
    !Number.isSafeInteger(metadata.totalSize) ||
    metadata.totalSize !== value.data.length ||
    metadata.totalSize < 1 ||
    metadata.totalSize > MAXIMUM_IMAGE_BYTES ||
    !IMAGE_FILE_NAME_PATTERN.test(value.filename) ||
    !isImageFileNameForData(value.filename, value.data) ||
    !isOptionalImageDimension(metadata.width) ||
    !isOptionalImageDimension(metadata.height)
  ) {
    return undefined;
  }

  return Object.freeze({
    data: Buffer.from(value.data),
    filename: value.filename as `${string}.${string}`,
    metadata: Object.freeze({
      totalSize: metadata.totalSize,
      ...(metadata.width === undefined ? {} : { width: metadata.width }),
      ...(metadata.height === undefined ? {} : { height: metadata.height })
    })
  });
};

const isOptionalImageDimension = (value: unknown): value is number | undefined =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65_535);

const isImageFileNameForData = (filename: string, data: Buffer): boolean => {
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const type = toImageType(data);

  return (
    (type === 'jpeg' && (extension === 'jpg' || extension === 'jpeg')) ||
    (type === 'png' && extension === 'png') ||
    (type === 'webp' && extension === 'webp')
  );
};

const toImageType = (data: Buffer): 'jpeg' | 'png' | 'webp' | undefined => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'jpeg';
  }

  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }

  if (
    data.length >= 12 &&
    data.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    data.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return 'webp';
  }

  return undefined;
};
