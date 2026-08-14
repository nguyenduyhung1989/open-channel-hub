import { isUtf8 } from 'node:buffer';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import {
  ZaloUserBridgeCommandRejectedError,
  ZaloUserBridgeProviderError,
  ZaloUserBridgeRateLimitedError,
  type ZaloUserBridgeImageAttachment,
  type ZaloUserGroupImageReply,
  type ZaloUserGroupTextReply
} from './zalo-user-bridge.js';

const CONTROL_HOST = '127.0.0.1';
const MAXIMUM_TEXT_BODY_BYTES = 32 * 1024;
const MAXIMUM_IMAGE_BODY_BYTES = 14 * 1024 * 1024;
const MAXIMUM_TEXT_LENGTH = 16_384;
const MAXIMUM_IMAGE_BYTES = 10 * 1024 * 1024;
const MAXIMUM_GROUP_ID_LENGTH = 512;
const DEFAULT_MAXIMUM_SENDS_PER_MINUTE = 20;
const IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:jpe?g|png|webp)$/i;

export interface ZaloUserGroupSender {
  sendGroupImage(reply: ZaloUserGroupImageReply): Promise<void>;
  sendGroupText(reply: ZaloUserGroupTextReply): Promise<void>;
}

export interface ZaloUserBridgeControlServerOptions {
  readonly controlToken: string;
  readonly groupSender: ZaloUserGroupSender;
  readonly maximumSendsPerMinute?: number;
  readonly port: number;
}

export interface ZaloUserBridgeControlServer {
  start(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * A loopback-only local control surface. It is deliberately not a Hub API and
 * cannot enumerate groups: the in-memory bridge itself decides whether a group
 * was observed and is eligible for one explicit text/image send.
 */
export const createZaloUserBridgeControlServer = (
  options: ZaloUserBridgeControlServerOptions
): ZaloUserBridgeControlServer => {
  const snapshot = toSnapshot(options);
  const rateLimiter = new ZaloUserBridgeControlRateLimiter(snapshot.maximumSendsPerMinute, 60_000);
  const server = createServer((request, response) => {
    void handleRequest(request, response, snapshot, rateLimiter);
  });
  let started = false;

  return Object.freeze({
    start: async (): Promise<number> => {
      if (started) {
        throw new ZaloUserBridgeControlServerError();
      }

      await listen(server, snapshot.port);
      started = true;
      const address = server.address();

      if (address === null || typeof address === 'string') {
        throw new ZaloUserBridgeControlServerError();
      }

      return address.port;
    },
    stop: async (): Promise<void> => {
      if (!started) {
        return;
      }

      await close(server);
      started = false;
    }
  });
};

/** Deliberately generic: a caller never receives local server or token detail. */
export class ZaloUserBridgeControlServerError extends Error {
  public constructor() {
    super('The Zalo User local control service is unavailable.');
    this.name = 'ZaloUserBridgeControlServerError';
  }
}

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: ControlServerSnapshot,
  rateLimiter: ZaloUserBridgeControlRateLimiter
): Promise<void> => {
  setNoStoreHeaders(response);

  try {
    const route = toRoute(request);

    if (route === undefined) {
      reply(response, 404, 'not_found');
      return;
    }

    if (!matchesBearerToken(request.headers.authorization, snapshot.controlToken)) {
      request.resume();
      reply(response, 401, 'unauthorized');
      return;
    }

    if (!isJsonContentType(request.headers['content-type'])) {
      request.resume();
      reply(response, 415, 'unsupported_media_type');
      return;
    }

    const body = await readBody(
      request,
      route.kind === 'text' ? MAXIMUM_TEXT_BODY_BYTES : MAXIMUM_IMAGE_BODY_BYTES
    );
    const command =
      route.kind === 'text'
        ? toTextCommand(route.groupId, body)
        : toImageCommand(route.groupId, body);

    if (command === undefined) {
      reply(response, 400, 'validation_error');
      return;
    }

    if (!rateLimiter.reserve(Date.now())) {
      reply(response, 429, 'rate_limited');
      return;
    }

    if (command.kind === 'text') {
      await snapshot.groupSender.sendGroupText(command.reply);
    } else {
      await snapshot.groupSender.sendGroupImage(command.reply);
    }

    response.statusCode = 204;
    response.end();
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      reply(response, 413, 'payload_too_large');
      return;
    }

    if (error instanceof ZaloUserBridgeCommandRejectedError) {
      reply(response, 404, 'not_found');
      return;
    }

    if (error instanceof ZaloUserBridgeProviderError) {
      reply(response, 502, 'provider_unavailable');
      return;
    }

    if (error instanceof ZaloUserBridgeRateLimitedError) {
      reply(response, 429, 'rate_limited');
      return;
    }

    reply(response, 500, 'internal_error');
  }
};

type ControlServerSnapshot = Readonly<{
  controlToken: string;
  groupSender: ZaloUserGroupSender;
  maximumSendsPerMinute: number;
  port: number;
}>;

type ControlRoute = Readonly<{ groupId: string; kind: 'image' | 'text' }>;
type ControlCommand =
  | Readonly<{ kind: 'text'; reply: ZaloUserGroupTextReply }>
  | Readonly<{ kind: 'image'; reply: ZaloUserGroupImageReply }>;

const toSnapshot = (options: ZaloUserBridgeControlServerOptions): ControlServerSnapshot => {
  try {
    if (
      !isRecord(options) ||
      !isGroupSender(options.groupSender) ||
      typeof options.controlToken !== 'string' ||
      !/^[!-~]{32,512}$/.test(options.controlToken) ||
      !isPort(options.port) ||
      !isMaximumSendsPerMinute(options.maximumSendsPerMinute)
    ) {
      throw new ZaloUserBridgeControlServerError();
    }

    return Object.freeze({
      controlToken: options.controlToken,
      groupSender: options.groupSender,
      maximumSendsPerMinute: options.maximumSendsPerMinute ?? DEFAULT_MAXIMUM_SENDS_PER_MINUTE,
      port: options.port
    });
  } catch (error) {
    if (error instanceof ZaloUserBridgeControlServerError) {
      throw error;
    }

    throw new ZaloUserBridgeControlServerError();
  }
};

const toRoute = (request: IncomingMessage): ControlRoute | undefined => {
  if (request.method !== 'POST' || typeof request.url !== 'string') {
    return undefined;
  }

  try {
    const url = new URL(request.url, 'http://localhost');
    const match = /^\/v1\/groups\/([^/]+)\/(text|image)$/.exec(url.pathname);

    if (url.search.length > 0 || match === null) {
      return undefined;
    }

    const groupId = decodeURIComponent(match[1] ?? '');
    const kind = match[2];

    if (!isGroupId(groupId) || (kind !== 'text' && kind !== 'image')) {
      return undefined;
    }

    return Object.freeze({ groupId, kind });
  } catch {
    return undefined;
  }
};

const toTextCommand = (groupId: string, body: Buffer): ControlCommand | undefined => {
  const parsed = toJson(body);

  if (!isExactRecord(parsed, ['text']) || typeof parsed.text !== 'string' || !isText(parsed.text)) {
    return undefined;
  }

  return Object.freeze({
    kind: 'text',
    reply: Object.freeze({ groupId, text: parsed.text })
  });
};

const toImageCommand = (groupId: string, body: Buffer): ControlCommand | undefined => {
  const parsed = toJson(body);

  if (
    !isExactRecord(parsed, ['caption', 'dataBase64', 'filename', 'height', 'width']) ||
    typeof parsed.filename !== 'string' ||
    typeof parsed.dataBase64 !== 'string' ||
    (parsed.caption !== undefined && !isTextAllowEmpty(parsed.caption)) ||
    !isOptionalDimension(parsed.width) ||
    !isOptionalDimension(parsed.height)
  ) {
    return undefined;
  }

  const data = toCanonicalBase64Data(parsed.dataBase64);

  if (data === undefined || !isImageFileNameForData(parsed.filename, data)) {
    return undefined;
  }

  const image: ZaloUserBridgeImageAttachment = Object.freeze({
    data,
    filename: parsed.filename as `${string}.${string}`,
    metadata: Object.freeze({
      totalSize: data.length,
      ...(parsed.width === undefined ? {} : { width: parsed.width }),
      ...(parsed.height === undefined ? {} : { height: parsed.height })
    })
  });

  return Object.freeze({
    kind: 'image',
    reply: Object.freeze({
      ...(parsed.caption === undefined ? {} : { caption: parsed.caption }),
      groupId,
      image
    })
  });
};

const toJson = (body: Buffer): unknown => {
  try {
    return isUtf8(body) ? JSON.parse(body.toString('utf8')) : undefined;
  } catch {
    return undefined;
  }
};

const toCanonicalBase64Data = (value: string): Buffer | undefined => {
  if (
    value.length === 0 ||
    value.length > MAXIMUM_IMAGE_BODY_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return undefined;
  }

  try {
    const data = Buffer.from(value, 'base64');

    return data.length >= 1 &&
      data.length <= MAXIMUM_IMAGE_BYTES &&
      data.toString('base64') === value
      ? data
      : undefined;
  } catch {
    return undefined;
  }
};

const isImageFileNameForData = (filename: string, data: Buffer): boolean => {
  if (!IMAGE_FILE_NAME_PATTERN.test(filename)) {
    return false;
  }

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

const readBody = async (request: IncomingMessage, maximumBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maximumBytes) {
      request.resume();
      throw new BodyTooLargeError();
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks, size);
};

const matchesBearerToken = (authorization: string | undefined, token: string): boolean => {
  const prefix = 'Bearer ';

  if (authorization === undefined || !authorization.startsWith(prefix)) {
    return false;
  }

  const candidate = Buffer.from(authorization.slice(prefix.length));
  const expected = Buffer.from(token);

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

const isJsonContentType = (value: string | undefined): boolean =>
  typeof value === 'string' && /^application\/json(?:\s*;.*)?$/i.test(value);

const isGroupSender = (value: unknown): value is ZaloUserGroupSender =>
  isRecord(value) &&
  typeof value.sendGroupImage === 'function' &&
  typeof value.sendGroupText === 'function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.charCodeAt(0);

    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const isExactRecord = (
  value: unknown,
  allowedKeys: readonly string[]
): value is Record<string, unknown> =>
  isRecord(value) && Object.keys(value).every((key) => allowedKeys.includes(key));

const isGroupId = (value: string): boolean =>
  value.length >= 1 &&
  value.length <= MAXIMUM_GROUP_ID_LENGTH &&
  value.trim() === value &&
  !hasAsciiControlCharacter(value) &&
  !value.includes('/') &&
  !value.includes('?') &&
  !value.includes('#');

const isText = (value: string): boolean =>
  value.length >= 1 && value.length <= MAXIMUM_TEXT_LENGTH && !value.includes('\u0000');

const isTextAllowEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAXIMUM_TEXT_LENGTH && !value.includes('\u0000');

const isOptionalDimension = (value: unknown): value is number | undefined =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65_535);

const isPort = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 65_535;

const isMaximumSendsPerMinute = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100);

const reply = (response: ServerResponse, statusCode: number, code: string): void => {
  if (response.writableEnded) {
    return;
  }

  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(
    JSON.stringify({
      success: false,
      error: { code, message: 'The local bridge request is invalid.' }
    })
  );
};

const setNoStoreHeaders = (response: ServerResponse): void => {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
};

const listen = async (server: Server, port: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: CONTROL_HOST, port });
  });

const close = async (server: Server): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });

class BodyTooLargeError extends Error {}

class ZaloUserBridgeControlRateLimiter {
  readonly #maximumSends: number;
  readonly #windowMilliseconds: number;
  #timestamps: number[] = [];

  public constructor(maximumSends: number, windowMilliseconds: number) {
    this.#maximumSends = maximumSends;
    this.#windowMilliseconds = windowMilliseconds;
  }

  public reserve(now: number): boolean {
    const minimumTimestamp = now - this.#windowMilliseconds;
    this.#timestamps = this.#timestamps.filter((timestamp) => timestamp > minimumTimestamp);

    if (this.#timestamps.length >= this.#maximumSends) {
      return false;
    }

    this.#timestamps = [...this.#timestamps, now];
    return true;
  }
}
