import { isUtf8 } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import argon2 from 'argon2';

import {
  ZaloUserBridgeCommandRejectedError,
  ZaloUserBridgeProviderError,
  ZaloUserBridgeRateLimitedError,
  type ZaloUserBridgeGroup,
  type ZaloUserBridgeImageAttachment,
  type ZaloUserBridgeStatus,
  type ZaloUserGroupImageReply,
  type ZaloUserGroupTextReply
} from './zalo-user-bridge.js';

const HOST = '127.0.0.1';
const LOGIN_CSRF_COOKIE = 'och_zalo_user_operator_login_csrf';
const SESSION_COOKIE = 'och_zalo_user_operator_session';
const MAXIMUM_FORM_BYTES = 32 * 1024;
const MAXIMUM_IMAGE_ENVELOPE_BYTES = 14 * 1024 * 1024;
const MAXIMUM_IMAGE_BYTES = 10 * 1024 * 1024;
const MAXIMUM_TEXT_LENGTH = 16_384;
const SESSION_IDLE_MILLISECONDS = 30 * 60 * 1_000;
const SESSION_ABSOLUTE_MILLISECONDS = 8 * 60 * 60 * 1_000;
const MAXIMUM_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MILLISECONDS = 60 * 1_000;
const MAXIMUM_IN_FLIGHT_VERIFICATIONS = 2;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:jpe?g|png|webp)$/i;

export type ZaloUserOperatorUiStatus = 'awaiting_qr' | ZaloUserBridgeStatus;

export interface ZaloUserBridgeOperatorUiSource {
  getQrPng(): Promise<Buffer | undefined>;
  getStatus(): ZaloUserOperatorUiStatus;
  listGroups(): Promise<readonly ZaloUserBridgeGroup[]>;
  sendGroupImage(reply: ZaloUserGroupImageReply): Promise<void>;
  sendGroupText(reply: ZaloUserGroupTextReply): Promise<void>;
}

export interface ZaloUserBridgeOperatorUiServerOptions {
  readonly passwordHash: string;
  readonly port: number;
  readonly sessionPepper: string;
  readonly source: ZaloUserBridgeOperatorUiSource;
}

export interface ZaloUserBridgeOperatorUiServer {
  start(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * Local server-rendered group control. It binds loopback only and never sends
 * bridge credentials, QR-session data, or raw group identifiers to HTML.
 */
export const createZaloUserBridgeOperatorUiServer = (
  options: ZaloUserBridgeOperatorUiServerOptions
): ZaloUserBridgeOperatorUiServer => {
  const snapshot = toSnapshot(options);
  const sessions = new Map<string, UiSession>();
  const loginThrottle = new LoginThrottle();
  let expectedOrigin = toExpectedOrigin(snapshot.port);
  const server = createServer((request, response) => {
    void handleRequest(request, response, snapshot, sessions, loginThrottle, expectedOrigin);
  });
  let started = false;

  return Object.freeze({
    start: async (): Promise<number> => {
      if (started) {
        throw new ZaloUserBridgeOperatorUiServerError();
      }
      await listen(server, snapshot.port);
      started = true;
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new ZaloUserBridgeOperatorUiServerError();
      }
      expectedOrigin = toExpectedOrigin(address.port);
      return address.port;
    },
    stop: async (): Promise<void> => {
      if (!started) {
        return;
      }
      sessions.clear();
      await close(server);
      started = false;
    }
  });
};

export class ZaloUserBridgeOperatorUiServerError extends Error {
  public constructor() {
    super('The Zalo User local operator UI is unavailable.');
    this.name = 'ZaloUserBridgeOperatorUiServerError';
  }
}

interface Snapshot {
  readonly passwordHash: string;
  readonly port: number;
  readonly sessionPepper: string;
  readonly source: ZaloUserBridgeOperatorUiSource;
}

interface UiSession {
  readonly absoluteExpiresAt: number;
  readonly csrfToken: string;
  readonly groupReferences: Map<string, string>;
  idleExpiresAt: number;
  notice?: 'image' | 'text';
}

interface MultipartImageForm {
  readonly caption: string;
  readonly csrf: string;
  readonly image: Readonly<{ data: Buffer; filename: string }>;
}

const toSnapshot = (value: unknown): Snapshot => {
  if (
    !isRecord(value) ||
    typeof value.passwordHash !== 'string' ||
    !isArgon2idHash(value.passwordHash) ||
    typeof value.sessionPepper !== 'string' ||
    !/^[!-~]{32,512}$/.test(value.sessionPepper) ||
    !isPort(value.port) ||
    !isSource(value.source)
  ) {
    throw new ZaloUserBridgeOperatorUiServerError();
  }
  return Object.freeze({
    passwordHash: value.passwordHash,
    port: value.port,
    sessionPepper: value.sessionPepper,
    source: value.source
  });
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>,
  loginThrottle: LoginThrottle,
  expectedOrigin: string
): Promise<void> => {
  setSecurityHeaders(response);
  const path = toPath(request);
  try {
    if (request.method === 'GET' && path === '/operator/assets/zalo-user.css') {
      response.statusCode = 200;
      response.setHeader('cache-control', 'public, max-age=86400');
      response.setHeader('content-type', 'text/css; charset=utf-8');
      response.end(style);
      return;
    }
    if (request.method === 'GET' && path === '/operator/login') {
      sendLoginPage(response, snapshot, 200);
      return;
    }
    if (request.method === 'POST' && path === '/operator/session') {
      await handleLogin(request, response, snapshot, sessions, loginThrottle, expectedOrigin);
      return;
    }
    if (request.method === 'POST' && path === '/operator/logout') {
      await handleLogout(request, response, snapshot, sessions, expectedOrigin);
      return;
    }
    if (request.method === 'GET' && path === '/operator') {
      await handleOperatorPage(request, response, snapshot, sessions);
      return;
    }
    if (request.method === 'GET' && path === '/operator/qr') {
      await handleQr(request, response, snapshot, sessions);
      return;
    }
    if (request.method === 'POST') {
      const textReference = toReference(path, 'text');
      if (textReference !== undefined) {
        await handleTextSend(request, response, snapshot, sessions, textReference, expectedOrigin);
        return;
      }
      const imageReference = toReference(path, 'image');
      if (imageReference !== undefined) {
        await handleImageSend(
          request,
          response,
          snapshot,
          sessions,
          imageReference,
          expectedOrigin
        );
        return;
      }
    }
    sendFailure(response, 404);
  } catch {
    sendFailure(response, 500);
  }
};

const handleLogin = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>,
  loginThrottle: LoginThrottle,
  expectedOrigin: string
): Promise<void> => {
  if (!hasExpectedOrigin(request, expectedOrigin)) {
    sendLoginPage(response, snapshot, 403, 'invalid');
    return;
  }
  const form = await readUrlEncodedForm(request, ['csrf', 'password']);
  const loginCsrf = readLoginCsrf(request, snapshot.sessionPepper);
  const csrf = form?.csrf;
  const password = form?.password;
  if (
    csrf === undefined ||
    password === undefined ||
    loginCsrf === undefined ||
    !matchesSecret(csrf, loginCsrf) ||
    !isSafePassword(password)
  ) {
    sendLoginPage(response, snapshot, 403, 'invalid');
    return;
  }
  const reservation = loginThrottle.reserve(Date.now());
  if (reservation === undefined) {
    sendLoginPage(response, snapshot, 429, 'throttled');
    return;
  }
  let verified = false;
  try {
    verified = await argon2.verify(snapshot.passwordHash, Buffer.from(password, 'utf8'));
  } catch {
    verified = false;
  } finally {
    reservation.complete(verified);
  }
  if (!verified) {
    sendLoginPage(response, snapshot, 401, 'invalid');
    return;
  }
  const token = createToken();
  const csrfToken = createToken();
  const now = Date.now();
  sessions.set(token, {
    absoluteExpiresAt: now + SESSION_ABSOLUTE_MILLISECONDS,
    csrfToken,
    groupReferences: new Map<string, string>(),
    idleExpiresAt: now + SESSION_IDLE_MILLISECONDS
  });
  response.statusCode = 303;
  response.setHeader('location', '/operator');
  response.setHeader('set-cookie', cookie(SESSION_COOKIE, token));
  response.end();
};

const handleLogout = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>,
  expectedOrigin: string
): Promise<void> => {
  if (!hasExpectedOrigin(request, expectedOrigin)) {
    sendFailure(response, 403);
    return;
  }
  const authenticated = readSession(request, sessions);
  const form = await readUrlEncodedForm(request, ['csrf']);
  if (!isSessionCsrfValid(authenticated, form?.csrf)) {
    clearSession(response);
    redirectLogin(response);
    return;
  }
  sessions.delete(authenticated.token);
  clearSession(response);
  redirectLogin(response);
};

const handleOperatorPage = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>
): Promise<void> => {
  const authenticated = readSession(request, sessions);
  if (authenticated === undefined) {
    clearSession(response);
    redirectLogin(response);
    return;
  }
  const status = snapshot.source.getStatus();
  let groups: readonly ZaloUserBridgeGroup[] = [];
  let groupsUnavailable = false;
  if (status === 'connected') {
    try {
      groups = await snapshot.source.listGroups();
    } catch {
      groupsUnavailable = true;
    }
  }
  authenticated.session.groupReferences.clear();
  const cards = groups.map((group) =>
    toGroupCard(group, authenticated.session, status === 'connected')
  );
  const qrAvailable = status === 'awaiting_qr' && (await snapshot.source.getQrPng()) !== undefined;
  const notice = authenticated.session.notice;
  delete authenticated.session.notice;
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    document(
      '<main class="shell"><header><div><p class="eyebrow">OPEN CHANNEL HUB / ZALO USER</p><h1>Điều khiển nhóm cục bộ</h1></div><form action="/operator/logout" method="post"><input type="hidden" name="csrf" value="' +
        escapeAttribute(authenticated.session.csrfToken) +
        '"><button type="submit">Đăng xuất</button></form></header><section class="status"><h2>Trạng thái: ' +
        escapeHtml(statusLabel(status)) +
        '</h2>' +
        noticeMarkup(notice) +
        statusMarkup(status, qrAvailable) +
        '</section><section><div class="section-heading"><h2>Nhóm</h2><a href="/operator">Cập nhật</a></div>' +
        (groupsUnavailable
          ? '<p class="warning">Không tải được danh sách nhóm. Không có lệnh gửi nào được thực hiện.</p>'
          : cards.length === 0
            ? '<p>Chưa có nhóm nào để hiển thị.</p>'
            : '<ol class="groups">' + cards.join('') + '</ol>') +
        '</section></main>'
    )
  );
};

const handleQr = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>
): Promise<void> => {
  if (readSession(request, sessions) === undefined) {
    sendFailure(response, 401);
    return;
  }
  const qr = await snapshot.source.getQrPng();
  if (qr === undefined || qr.length === 0) {
    sendFailure(response, 404);
    return;
  }
  response.statusCode = 200;
  response.setHeader('content-type', 'image/png');
  response.end(qr);
};

const handleTextSend = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>,
  reference: string,
  expectedOrigin: string
): Promise<void> => {
  if (!hasExpectedOrigin(request, expectedOrigin)) {
    sendFailure(response, 403);
    return;
  }
  const authenticated = readSession(request, sessions);
  if (authenticated === undefined) {
    clearSession(response);
    redirectLogin(response);
    return;
  }
  const form = await readUrlEncodedForm(request, ['csrf', 'text']);
  const groupId = authenticated.session.groupReferences.get(reference);
  const csrf = form?.csrf;
  const text = form?.text;
  if (
    csrf === undefined ||
    text === undefined ||
    groupId === undefined ||
    !isSessionCsrfValid(authenticated, csrf) ||
    !isSafeText(text)
  ) {
    sendFailure(response, 400);
    return;
  }
  try {
    await snapshot.source.sendGroupText(Object.freeze({ groupId, text }));
    authenticated.session.notice = 'text';
    redirectOperator(response);
  } catch (error) {
    sendSendFailure(response, error);
  }
};

const handleImageSend = async (
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: Snapshot,
  sessions: Map<string, UiSession>,
  reference: string,
  expectedOrigin: string
): Promise<void> => {
  if (!hasExpectedOrigin(request, expectedOrigin)) {
    sendFailure(response, 403);
    return;
  }
  const authenticated = readSession(request, sessions);
  if (authenticated === undefined) {
    clearSession(response);
    redirectLogin(response);
    return;
  }
  const form = await readMultipartImageForm(request);
  const groupId = authenticated.session.groupReferences.get(reference);
  if (
    form === undefined ||
    groupId === undefined ||
    !isSessionCsrfValid(authenticated, form.csrf)
  ) {
    sendFailure(response, 400);
    return;
  }
  try {
    await snapshot.source.sendGroupImage(
      Object.freeze({
        ...(form.caption === '' ? {} : { caption: form.caption }),
        groupId,
        image: Object.freeze({
          data: form.image.data,
          filename: form.image.filename as ZaloUserBridgeImageAttachment['filename'],
          metadata: Object.freeze({ totalSize: form.image.data.length })
        })
      })
    );
    authenticated.session.notice = 'image';
    redirectOperator(response);
  } catch (error) {
    sendSendFailure(response, error);
  }
};

const sendSendFailure = (response: ServerResponse, error: unknown): void => {
  if (error instanceof ZaloUserBridgeCommandRejectedError) {
    sendFailure(response, 404);
  } else if (error instanceof ZaloUserBridgeRateLimitedError) {
    sendFailure(response, 429);
  } else if (error instanceof ZaloUserBridgeProviderError) {
    sendFailure(response, 502);
  } else {
    sendFailure(response, 500);
  }
};

const toGroupCard = (
  group: ZaloUserBridgeGroup,
  session: UiSession,
  connected: boolean
): string => {
  const title =
    escapeHtml(group.name) +
    (group.memberCount === undefined ? '' : ' · ' + String(group.memberCount) + ' thành viên');
  if (!connected || !group.sendEligible) {
    return (
      '<li class="group"><h3>' +
      title +
      '</h3><p>Chưa có quyền gửi trong phiên bridge này.</p></li>'
    );
  }
  const reference = createToken();
  session.groupReferences.set(reference, group.id);
  const action = '/operator/groups/' + encodeURIComponent(reference);
  const csrf = escapeAttribute(session.csrfToken);
  return (
    '<li class="group"><h3>' +
    title +
    '</h3><p>Đã nhận và lưu bền ít nhất một tin nhóm trong phiên này.</p><details><summary>Gửi chữ</summary><form action="' +
    action +
    '/text" method="post"><input type="hidden" name="csrf" value="' +
    csrf +
    '"><label>Nội dung <textarea name="text" maxlength="16384" required></textarea></label><button type="submit">Gửi một lần</button></form></details><details><summary>Gửi ảnh</summary><form action="' +
    action +
    '/image" method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="' +
    csrf +
    '"><label>Chú thích <textarea name="caption" maxlength="16384"></textarea></label><label>Ảnh JPEG, PNG hoặc WebP <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label><button type="submit">Gửi một ảnh</button></form></details></li>'
  );
};

const statusMarkup = (status: ZaloUserOperatorUiStatus, qrAvailable: boolean): string => {
  if (status === 'awaiting_qr') {
    return qrAvailable
      ? '<p>Quét mã QR này bằng đúng tài khoản Zalo cần kết nối.</p><img class="qr" src="/operator/qr" alt="Mã QR đăng nhập Zalo User">'
      : '<p>Đang chuẩn bị mã QR. Tải lại trang sau một lát.</p>';
  }
  if (status === 'reauthentication_required') {
    return '<p>Phiên đã bị thay thế hoặc bị đá. Khởi động lại bridge để quét QR mới.</p>';
  }
  if (status === 'disconnected') {
    return '<p>Bridge đang thử nối lại theo giới hạn an toàn. Nó không tự gửi lại tin nhắn.</p>';
  }
  if (status === 'error') {
    return '<p>Bridge đã dừng tự nối lại. Khởi động lại bridge và quét QR mới nếu cần.</p>';
  }
  return '<p>Đã kết nối. Chỉ nhóm đã có tin nhắn được lưu bền trong phiên này mới hiện nút gửi.</p>';
};

const noticeMarkup = (notice: UiSession['notice']): string =>
  notice === undefined
    ? ''
    : '<p class="notice">' +
      (notice === 'text'
        ? 'Đã gửi một lần tới Zalo; đây không phải xác nhận đã đọc.'
        : 'Đã gửi một ảnh tới Zalo; đây không phải xác nhận đã đọc.') +
      '</p>';

const sendLoginPage = (
  response: ServerResponse,
  snapshot: Snapshot,
  statusCode: number,
  error: 'invalid' | 'throttled' | undefined = undefined
): void => {
  const csrf = createToken();
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.setHeader('set-cookie', loginCookie(snapshot.sessionPepper, csrf));
  response.end(
    document(
      '<main class="login-shell"><section class="login-panel"><p class="eyebrow">OPEN CHANNEL HUB / ZALO USER</p><h1>Điều khiển nhóm cục bộ</h1><p>Đăng nhập trên chính máy đang chạy bridge.</p>' +
        (error === undefined
          ? ''
          : '<p class="warning" role="alert">' +
            (error === 'throttled'
              ? 'Đã có quá nhiều lần thử. Hãy chờ một lát.'
              : 'Mật khẩu hoặc biểu mẫu không hợp lệ.') +
            '</p>') +
        '<form action="/operator/session" method="post"><input type="hidden" name="csrf" value="' +
        escapeAttribute(csrf) +
        '"><label>Mật khẩu <input type="password" name="password" autocomplete="current-password" minlength="12" maxlength="512" required></label><button type="submit">Mở điều khiển nhóm</button></form></section></main>'
    )
  );
};

const document = (body: string): string =>
  '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zalo User nhóm</title><link rel="stylesheet" href="/operator/assets/zalo-user.css"></head><body>' +
  body +
  '</body></html>';

const sendFailure = (response: ServerResponse, statusCode: number): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    document('<main class="login-shell"><p>Yêu cầu không thể xử lý an toàn.</p></main>')
  );
};

const redirectLogin = (response: ServerResponse): void => {
  response.statusCode = 303;
  response.setHeader('location', '/operator/login');
  response.end();
};

const redirectOperator = (response: ServerResponse): void => {
  response.statusCode = 303;
  response.setHeader('location', '/operator');
  response.end();
};

const readSession = (
  request: IncomingMessage,
  sessions: Map<string, UiSession>
): Readonly<{ session: UiSession; token: string }> | undefined => {
  const token = readCookie(request, SESSION_COOKIE);
  const session = token === undefined ? undefined : sessions.get(token);
  const now = Date.now();
  if (
    token === undefined ||
    session === undefined ||
    session.idleExpiresAt < now ||
    session.absoluteExpiresAt < now
  ) {
    if (token !== undefined) {
      sessions.delete(token);
    }
    return undefined;
  }
  session.idleExpiresAt = Math.min(now + SESSION_IDLE_MILLISECONDS, session.absoluteExpiresAt);
  return Object.freeze({ session, token });
};

const isSessionCsrfValid = (
  authenticated: Readonly<{ session: UiSession; token: string }> | undefined,
  candidate: string | undefined
): authenticated is Readonly<{ session: UiSession; token: string }> =>
  authenticated !== undefined &&
  candidate !== undefined &&
  OPAQUE_TOKEN_PATTERN.test(candidate) &&
  matchesSecret(candidate, authenticated.session.csrfToken);

const clearSession = (response: ServerResponse): void => {
  response.setHeader(
    'set-cookie',
    SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
  );
};

const loginCookie = (pepper: string, token: string): string =>
  cookie(LOGIN_CSRF_COOKIE, token + '.' + tokenHmac(pepper, 'login-csrf', token), 60);

const cookie = (
  name: string,
  value: string,
  maximumAgeSeconds: number | undefined = undefined
): string =>
  name +
  '=' +
  value +
  '; Path=/; HttpOnly; SameSite=Strict' +
  (maximumAgeSeconds === undefined ? '' : '; Max-Age=' + String(maximumAgeSeconds));

const readLoginCsrf = (request: IncomingMessage, pepper: string): string | undefined => {
  const value = readCookie(request, LOGIN_CSRF_COOKIE);
  if (value === undefined) {
    return undefined;
  }
  const parts = value.split('.');
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    !OPAQUE_TOKEN_PATTERN.test(parts[0]) ||
    !/^[a-f0-9]{64}$/.test(parts[1]) ||
    !matchesSecret(parts[1], tokenHmac(pepper, 'login-csrf', parts[0]))
  ) {
    return undefined;
  }
  return parts[0];
};

const readCookie = (request: IncomingMessage, name: string): string | undefined => {
  if (typeof request.headers.cookie !== 'string') {
    return undefined;
  }
  for (const part of request.headers.cookie.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator > 0 && trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1);
    }
  }
  return undefined;
};

const readUrlEncodedForm = async (
  request: IncomingMessage,
  expectedKeys: readonly string[]
): Promise<Readonly<Record<string, string>> | undefined> => {
  if (!isUrlEncoded(request.headers['content-type'])) {
    request.resume();
    return undefined;
  }
  try {
    const body = await readBody(request, MAXIMUM_FORM_BYTES);
    if (!isUtf8(body)) {
      return undefined;
    }
    const values = new URLSearchParams(body.toString('utf8'));
    const keys = [...values.keys()].sort();
    const required = [...expectedKeys].sort();
    if (
      keys.length !== required.length ||
      keys.some((value, index) => value !== required[index]) ||
      required.some((key) => values.getAll(key).length !== 1)
    ) {
      return undefined;
    }
    return Object.freeze(Object.fromEntries(required.map((key) => [key, values.get(key) ?? ''])));
  } catch {
    return undefined;
  }
};

const readMultipartImageForm = async (
  request: IncomingMessage
): Promise<MultipartImageForm | undefined> => {
  const boundary = multipartBoundary(request.headers['content-type']);
  if (boundary === undefined) {
    request.resume();
    return undefined;
  }
  try {
    return parseMultipartImageForm(await readBody(request, MAXIMUM_IMAGE_ENVELOPE_BYTES), boundary);
  } catch {
    return undefined;
  }
};

const parseMultipartImageForm = (
  body: Buffer,
  boundary: string
): MultipartImageForm | undefined => {
  const start = Buffer.from('--' + boundary + '\r\n');
  const separator = Buffer.from('\r\n--' + boundary);
  if (!body.subarray(0, start.length).equals(start)) {
    return undefined;
  }
  const fields = new Map<string, string>();
  let image: Readonly<{ data: Buffer; filename: string }> | undefined;
  let offset = start.length;
  while (offset <= body.length) {
    const end = body.indexOf(separator, offset);
    if (end < 0) {
      return undefined;
    }
    const part = parseMultipartPart(body.subarray(offset, end));
    if (part === undefined) {
      return undefined;
    }
    if (part.kind === 'image') {
      if (image !== undefined) {
        return undefined;
      }
      image = part.image;
    } else if ((part.name !== 'csrf' && part.name !== 'caption') || fields.has(part.name)) {
      return undefined;
    } else {
      fields.set(part.name, part.value);
    }
    const tail = end + separator.length;
    if (body.subarray(tail, tail + 2).equals(Buffer.from('--'))) {
      const trailing = body.subarray(tail + 2);
      if (!(trailing.length === 0 || trailing.equals(Buffer.from('\r\n')))) {
        return undefined;
      }
      break;
    }
    if (!body.subarray(tail, tail + 2).equals(Buffer.from('\r\n'))) {
      return undefined;
    }
    offset = tail + 2;
  }
  const csrf = fields.get('csrf');
  const caption = fields.get('caption') ?? '';
  return csrf === undefined ||
    image === undefined ||
    !OPAQUE_TOKEN_PATTERN.test(csrf) ||
    !isSafeCaption(caption)
    ? undefined
    : Object.freeze({ caption, csrf, image });
};

type MultipartPart =
  | Readonly<{ image: Readonly<{ data: Buffer; filename: string }>; kind: 'image' }>
  | Readonly<{ kind: 'field'; name: string; value: string }>;

const parseMultipartPart = (value: Buffer): MultipartPart | undefined => {
  const headerEnd = value.indexOf(Buffer.from('\r\n\r\n'));
  if (headerEnd < 0 || headerEnd > 4096) {
    return undefined;
  }
  const headers = parseHeaders(value.subarray(0, headerEnd));
  if (headers === undefined) {
    return undefined;
  }
  const disposition = headers.get('content-disposition');
  const match =
    disposition === undefined
      ? null
      : /^form-data;\s*name="([a-z]+)"(?:;\s*filename="([^"\\]{1,128})")?$/.exec(disposition);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  const data = value.subarray(headerEnd + 4);
  const name = match[1];
  const filename = match[2];
  if (name === 'image') {
    const contentType = headers.get('content-type')?.toLowerCase();
    if (
      filename === undefined ||
      !isImageFileName(filename) ||
      !isImageContentType(contentType) ||
      data.length < 1 ||
      data.length > MAXIMUM_IMAGE_BYTES ||
      !matchesImage(filename, contentType, data)
    ) {
      return undefined;
    }
    return Object.freeze({
      image: Object.freeze({ data: Buffer.from(data), filename }),
      kind: 'image'
    });
  }
  if (filename !== undefined || headers.has('content-type') || !isUtf8(data)) {
    return undefined;
  }
  return Object.freeze({ kind: 'field', name, value: data.toString('utf8') });
};

const parseHeaders = (value: Buffer): ReadonlyMap<string, string> | undefined => {
  if (!isUtf8(value)) {
    return undefined;
  }
  const headers = new Map<string, string>();
  for (const line of value.toString('utf8').split('\r\n')) {
    const index = line.indexOf(':');
    if (index < 1) {
      return undefined;
    }
    const name = line.slice(0, index).toLowerCase();
    const content = line.slice(index + 1).trim();
    if (!/^[a-z-]+$/.test(name) || content.length === 0 || headers.has(name)) {
      return undefined;
    }
    headers.set(name, content);
  }
  return headers;
};

const readBody = async (request: IncomingMessage, maximumBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      request.resume();
      throw new Error('body_too_large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
};

const toPath = (request: IncomingMessage): string | undefined => {
  if (typeof request.url !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    return url.search === '' ? url.pathname : undefined;
  } catch {
    return undefined;
  }
};

const toReference = (path: string | undefined, kind: 'image' | 'text'): string | undefined => {
  if (path === undefined) {
    return undefined;
  }
  const parts = path.split('/');
  return parts.length === 5 &&
    parts[1] === 'operator' &&
    parts[2] === 'groups' &&
    parts[4] === kind &&
    parts[3] !== undefined &&
    OPAQUE_TOKEN_PATTERN.test(parts[3])
    ? parts[3]
    : undefined;
};

const multipartBoundary = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match =
    /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,./:=?-]{1,70})"|([A-Za-z0-9'()+_,./:=?-]{1,70}))$/i.exec(
      value
    );
  return match?.[1] ?? match?.[2];
};

const isUrlEncoded = (value: string | undefined): boolean =>
  typeof value === 'string' && /^application\/x-www-form-urlencoded(?:\s*;.*)?$/i.test(value);

const toExpectedOrigin = (port: number): string => 'http://' + HOST + ':' + String(port);

const hasExpectedOrigin = (request: IncomingMessage, expectedOrigin: string): boolean =>
  request.headers.origin === expectedOrigin;

const createToken = (): string => randomBytes(32).toString('base64url');

const tokenHmac = (pepper: string, purpose: string, token: string): string =>
  createHmac('sha256', pepper)
    .update('open-channel-hub/zalo-user-operator-ui/' + purpose + '\u0000' + token, 'utf8')
    .digest('hex');

const matchesSecret = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const isSafePassword = (value: string): boolean => {
  const data = Buffer.from(value, 'utf8');
  return (
    data.length >= 12 &&
    data.length <= 512 &&
    Buffer.from(data.toString('utf8'), 'utf8').equals(data) &&
    !value.includes('\u0000') &&
    !value.includes('\n') &&
    !value.includes('\r')
  );
};

const isSafeText = (value: string): boolean =>
  value.length >= 1 &&
  value.length <= MAXIMUM_TEXT_LENGTH &&
  value.trim().length > 0 &&
  !value.includes('\u0000');

const isSafeCaption = (value: string): boolean =>
  value.length <= MAXIMUM_TEXT_LENGTH && !value.includes('\u0000');

const isImageFileName = (value: string): boolean => IMAGE_FILE_NAME_PATTERN.test(value);

const isImageContentType = (
  value: string | undefined
): value is 'image/jpeg' | 'image/png' | 'image/webp' =>
  value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';

const matchesImage = (
  filename: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
  data: Buffer
): boolean => {
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const type = imageType(data);
  return (
    (type === 'jpeg' &&
      contentType === 'image/jpeg' &&
      (extension === 'jpg' || extension === 'jpeg')) ||
    (type === 'png' && contentType === 'image/png' && extension === 'png') ||
    (type === 'webp' && contentType === 'image/webp' && extension === 'webp')
  );
};

const imageType = (data: Buffer): 'jpeg' | 'png' | 'webp' | undefined => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'jpeg';
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  return data.length >= 12 &&
    data.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    data.subarray(8, 12).equals(Buffer.from('WEBP'))
    ? 'webp'
    : undefined;
};

const statusLabel = (status: ZaloUserOperatorUiStatus): string =>
  ({
    awaiting_qr: 'đang chờ quét QR',
    connected: 'đã kết nối',
    disconnected: 'đang nối lại',
    error: 'lỗi kết nối',
    reauthentication_required: 'cần quét QR mới'
  })[status];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = escapeHtml;

const setSecurityHeaders = (response: ServerResponse): void => {
  response.setHeader('cache-control', 'no-store');
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; script-src 'none'; style-src 'self'"
  );
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
};

const isPort = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 65_535;

const isSource = (value: unknown): value is ZaloUserBridgeOperatorUiSource =>
  isRecord(value) &&
  typeof value.getQrPng === 'function' &&
  typeof value.getStatus === 'function' &&
  typeof value.listGroups === 'function' &&
  typeof value.sendGroupImage === 'function' &&
  typeof value.sendGroupText === 'function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArgon2idHash = (value: string): boolean => {
  if (value.length > 512 || !value.startsWith('$argon2id$v=19$')) {
    return false;
  }
  const parts = value.split('$');
  if (
    parts.length !== 6 ||
    parts[3] === undefined ||
    parts[4] === undefined ||
    parts[5] === undefined
  ) {
    return false;
  }
  const values = new Map<string, number>();
  for (const part of parts[3].split(',')) {
    const tuple = part.split('=');
    if (
      tuple.length !== 2 ||
      tuple[0] === undefined ||
      tuple[1] === undefined ||
      !['m', 'p', 't'].includes(tuple[0]) ||
      !/^[1-9][0-9]*$/.test(tuple[1]) ||
      values.has(tuple[0])
    ) {
      return false;
    }
    const number = Number(tuple[1]);
    if (!Number.isSafeInteger(number)) {
      return false;
    }
    values.set(tuple[0], number);
  }
  return (
    values.size === 3 &&
    values.get('m') === 19_456 &&
    values.get('t') === 2 &&
    values.get('p') === 1 &&
    isPhcBase64(parts[4], 8) &&
    isPhcBase64(parts[5], 16)
  );
};

const isPhcBase64 = (value: string, minimumLength: number): boolean =>
  value.length >= minimumLength &&
  /^[A-Za-z0-9+/]+$/.test(value) &&
  Buffer.from(value, 'base64').toString('base64').replace(/=+$/, '') === value;

const listen = async (server: Server, port: number): Promise<void> =>
  await new Promise<void>((resolve, reject) => {
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
    server.listen({ host: HOST, port });
  });

const close = async (server: Server): Promise<void> =>
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });

class LoginThrottle {
  #failures: number[] = [];
  #inFlight = 0;

  public reserve(now: number): Readonly<{ complete(success: boolean): void }> | undefined {
    this.#failures = this.#failures.filter(
      (timestamp) => timestamp > now - LOGIN_FAILURE_WINDOW_MILLISECONDS
    );
    if (
      this.#inFlight >= MAXIMUM_IN_FLIGHT_VERIFICATIONS ||
      this.#failures.length >= MAXIMUM_LOGIN_FAILURES
    ) {
      return undefined;
    }
    this.#inFlight += 1;
    let done = false;
    return Object.freeze({
      complete: (success: boolean): void => {
        if (done) {
          return;
        }
        done = true;
        this.#inFlight -= 1;
        if (success) {
          this.#failures = [];
        } else {
          this.#failures = [...this.#failures, Date.now()];
        }
      }
    });
  }
}

const style = [
  ':root { --canvas: oklch(16% .018 252); --panel: oklch(21% .024 252); --panel-hi: oklch(26% .035 252); --ink: oklch(94% .012 235); --muted: oklch(76% .025 235); --line: oklch(43% .04 247); --signal: oklch(78% .12 205); --signal-ink: oklch(21% .03 240); --warning: oklch(83% .14 78); --success: oklch(82% .12 150); --danger: oklch(74% .15 25); --space: clamp(1rem, .65rem + 1.2vw, 1.75rem); --radius: .75rem; --focus: oklch(89% .12 205); color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--canvas); color: var(--ink); }',
  '* { box-sizing: border-box; } body { background: radial-gradient(circle at 88% 0%, oklch(30% .06 205 / .35), transparent 32rem), var(--canvas); margin: 0; min-height: 100dvh; }',
  '.shell,.login-shell { margin: 0 auto; max-width: 76rem; padding: var(--space); } .login-shell { align-items: center; display: flex; min-height: 100dvh; max-width: 34rem; }',
  'header,.section-heading { align-items: center; display: flex; flex-wrap: wrap; gap: .9rem; justify-content: space-between; } h1 { font-size: clamp(2rem, 7vw, 3.8rem); letter-spacing: -.05em; margin: 0; } h2 { font-size: clamp(1.2rem, 4vw, 1.75rem); letter-spacing: -.03em; margin: 0; } h3 { font-size: 1.05rem; margin: 0; }',
  '.eyebrow { color: var(--signal); font-family: ui-monospace, SFMono-Regular, monospace; font-size: .74rem; font-weight: 800; letter-spacing: .12em; margin: 0 0 .45rem; }',
  '.status,.group,.login-panel { background: color-mix(in srgb, var(--panel) 94%, transparent); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 1.25rem 3.5rem oklch(8% .02 252 / .28); margin: 1rem 0; padding: var(--space); } .status { border-left: .32rem solid var(--signal); } .group { background: var(--panel); }',
  '.groups { display: grid; gap: .9rem; list-style: none; margin: 1rem 0; padding: 0; } form { display: grid; gap: .7rem; margin: .8rem 0; } label { display: grid; font-weight: 750; gap: .4rem; } input,textarea,button { font: inherit; } input,textarea { background: var(--canvas); border: 1px solid var(--line); border-radius: .5rem; color: var(--ink); min-height: 2.8rem; padding: .65rem .75rem; } textarea { min-height: 6.5rem; resize: vertical; }',
  'button { background: var(--signal); border: 1px solid var(--signal); border-radius: .5rem; color: var(--signal-ink); cursor: pointer; font-weight: 800; min-height: 2.8rem; padding: .65rem 1rem; transition: transform 150ms cubic-bezier(.16,1,.3,1), filter 150ms cubic-bezier(.16,1,.3,1); } button:hover { filter: brightness(1.08); transform: translateY(-1px); } button:active { transform: translateY(0) scale(.98); } button:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible { outline: .18rem solid var(--focus); outline-offset: .18rem; }',
  'a { color: var(--signal); font-weight: 750; } details { border-top: 1px solid var(--line); margin-top: .8rem; padding-top: .8rem; } summary { cursor: pointer; font-weight: 800; } .warning { color: var(--warning); } .notice { color: var(--success); font-weight: 750; } .qr { background: white; border-radius: .35rem; display: block; margin-top: 1rem; max-width: 18rem; width: 100%; }',
  '@media (min-width: 48rem) { .groups { grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); } } @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }'
].join('\n');
