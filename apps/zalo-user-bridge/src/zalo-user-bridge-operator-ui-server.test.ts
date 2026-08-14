import { randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createZaloUserBridgeOperatorUiServer,
  type ZaloUserBridgeOperatorUiSource,
  type ZaloUserOperatorUiStatus
} from './zalo-user-bridge-operator-ui-server.js';

const PASSWORD = 'synthetic local operator password';
const PEPPER = 'synthetic_zalo_user_operator_ui_pepper_0123456789012';
const ELIGIBLE_GROUP_ID = '146845883529197922';
const INELIGIBLE_GROUP_ID = '246845883529197923';
const QR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let passwordHash = '';
const runningServers: Array<ReturnType<typeof createZaloUserBridgeOperatorUiServer>> = [];

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id
  });
});

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(async (server) => await server.stop()));
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('ZaloUserBridgeOperatorUiServer', () => {
  it('renders only opaque group references and permits one authenticated text send to a durable group', async () => {
    const source = createSource();
    const login = await loginTo(createServer(source));
    const home = await get(login, '/operator');
    const html = await home.text();
    const textPath = requiredMatch(html, /action="(\/operator\/groups\/[A-Za-z0-9_-]{43}\/text)"/);

    expect(home.status).toBe(200);
    expect(home.headers.get('cache-control')).toBe('no-store');
    expect(home.headers.get('content-security-policy')).toContain("script-src 'none'");
    expect(html).toContain('Nhóm hỗ trợ');
    expect(html).toContain('Nhóm chỉ xem');
    expect(html).not.toContain(ELIGIBLE_GROUP_ID);
    expect(html).not.toContain(INELIGIBLE_GROUP_ID);
    expect(html).not.toContain(PEPPER);
    expect(html).not.toContain(passwordHash);
    expect(html).not.toContain(
      'Gửi một lần</button></form></details></li><li class="group"><h3>Nhóm chỉ xem'
    );

    const response = await postForm(login, textPath, {
      csrf: login.csrf,
      text: 'Đã nhận, tao xử lý ngay.'
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/operator');
    expect(source.sendGroupText).toHaveBeenCalledWith({
      groupId: ELIGIBLE_GROUP_ID,
      text: 'Đã nhận, tao xử lý ngay.'
    });
    expect(source.sendGroupImage).not.toHaveBeenCalled();

    const afterSend = await get(login, '/operator');
    expect(await afterSend.text()).toContain(
      'Đã gửi một lần tới Zalo; đây không phải xác nhận đã đọc.'
    );
  });

  it('accepts one canonical image buffer and never accepts a filesystem path from the browser', async () => {
    const source = createSource();
    const login = await loginTo(createServer(source));
    const home = await get(login, '/operator');
    const imagePath = requiredMatch(
      await home.text(),
      /action="(\/operator\/groups\/[A-Za-z0-9_-]{43}\/image)"/
    );
    const boundary = '----open-channel-hub-' + randomBytes(8).toString('hex');
    const body = multipart(boundary, {
      caption: 'Ảnh tiến độ',
      csrf: login.csrf,
      image: Object.freeze({ data: QR, filename: 'progress.png', contentType: 'image/png' })
    });

    const response = await fetch(login.origin + imagePath, {
      body,
      headers: {
        cookie: login.sessionCookie,
        'content-type': 'multipart/form-data; boundary=' + boundary,
        origin: login.origin
      },
      method: 'POST',
      redirect: 'manual'
    });

    expect(response.status).toBe(303);
    expect(source.sendGroupImage).toHaveBeenCalledWith({
      caption: 'Ảnh tiến độ',
      groupId: ELIGIBLE_GROUP_ID,
      image: {
        data: QR,
        filename: 'progress.png',
        metadata: { totalSize: QR.length }
      }
    });
    expect(JSON.stringify(vi.mocked(source.sendGroupImage).mock.calls)).not.toContain('/etc/');
  });

  it('keeps QR private to an authenticated local session and renders reconnect state without send controls', async () => {
    const source = createSource('awaiting_qr');
    const server = createServer(source);
    const port = await server.start();
    const origin = 'http://127.0.0.1:' + String(port);

    const anonymousQr = await fetch(origin + '/operator/qr', { redirect: 'manual' });
    const login = await loginToStartedServer(origin);
    const home = await get(login, '/operator');
    const qr = await get(login, '/operator/qr');
    const homeHtml = await home.text();

    expect(anonymousQr.status).toBe(401);
    expect(homeHtml).toContain('Quét mã QR này bằng đúng tài khoản Zalo cần kết nối.');
    expect(homeHtml).not.toContain('login.png');
    expect(qr.status).toBe(200);
    expect(Buffer.from(await qr.arrayBuffer())).toEqual(QR);
    expect(source.listGroups).not.toHaveBeenCalled();
  });

  it('rejects a forged or stale group reference before invoking either Zalo send method', async () => {
    const source = createSource();
    const login = await loginTo(createServer(source));
    const response = await postForm(
      login,
      '/operator/groups/' + randomBytes(32).toString('base64url') + '/text',
      {
        csrf: login.csrf,
        text: 'Không có nhóm.'
      }
    );

    expect(response.status).toBe(400);
    expect(source.sendGroupText).not.toHaveBeenCalled();
    expect(source.sendGroupImage).not.toHaveBeenCalled();
  });

  it('fails a cross-origin write before parsing a send body or invoking Zalo', async () => {
    const source = createSource();
    const login = await loginTo(createServer(source));
    const home = await get(login, '/operator');
    const textPath = requiredMatch(
      await home.text(),
      /action="(\/operator\/groups\/[A-Za-z0-9_-]{43}\/text)"/
    );

    const response = await fetch(login.origin + textPath, {
      body: 'not-a-form',
      headers: {
        cookie: login.sessionCookie,
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://evil.example.test'
      },
      method: 'POST',
      redirect: 'manual'
    });

    expect(response.status).toBe(403);
    expect(source.sendGroupText).not.toHaveBeenCalled();
  });
});

type TestSource = ZaloUserBridgeOperatorUiSource &
  Readonly<{
    sendGroupImage: ReturnType<typeof vi.fn>;
    sendGroupText: ReturnType<typeof vi.fn>;
    listGroups: ReturnType<typeof vi.fn>;
  }>;

const createSource = (status: ZaloUserOperatorUiStatus = 'connected'): TestSource =>
  Object.freeze({
    getQrPng: vi.fn(async (): Promise<Buffer | undefined> =>
      status === 'awaiting_qr' ? QR : undefined
    ),
    getStatus: vi.fn((): ZaloUserOperatorUiStatus => status),
    listGroups: vi.fn(async () =>
      Object.freeze([
        Object.freeze({
          id: ELIGIBLE_GROUP_ID,
          memberCount: 12,
          name: 'Nhóm hỗ trợ',
          sendEligible: true
        }),
        Object.freeze({
          id: INELIGIBLE_GROUP_ID,
          memberCount: 3,
          name: 'Nhóm chỉ xem',
          sendEligible: false
        })
      ])
    ),
    sendGroupImage: vi.fn(async (): Promise<void> => undefined),
    sendGroupText: vi.fn(async (): Promise<void> => undefined)
  });

const createServer = (source: ZaloUserBridgeOperatorUiSource) => {
  const server = createZaloUserBridgeOperatorUiServer({
    passwordHash,
    port: 0,
    sessionPepper: PEPPER,
    source
  });
  runningServers.push(server);
  return server;
};

interface Login {
  readonly csrf: string;
  readonly origin: string;
  readonly sessionCookie: string;
}

const loginTo = async (
  server: ReturnType<typeof createZaloUserBridgeOperatorUiServer>
): Promise<Login> => {
  const port = await server.start();
  return await loginToStartedServer('http://127.0.0.1:' + String(port));
};

const loginToStartedServer = async (origin: string): Promise<Login> => {
  const page = await fetch(origin + '/operator/login', { redirect: 'manual' });
  const loginCookie = requiredCookie(page);
  const csrf = requiredMatch(await page.text(), /name="csrf" value="([A-Za-z0-9_-]{43})"/);
  const response = await fetch(origin + '/operator/session', {
    body: new URLSearchParams({ csrf, password: PASSWORD }).toString(),
    headers: {
      cookie: loginCookie,
      'content-type': 'application/x-www-form-urlencoded',
      origin
    },
    method: 'POST',
    redirect: 'manual'
  });

  expect(response.status).toBe(303);
  return Object.freeze({
    csrf: await sessionCsrf(origin, requiredCookie(response)),
    origin,
    sessionCookie: requiredCookie(response)
  });
};

const sessionCsrf = async (origin: string, sessionCookie: string): Promise<string> => {
  const response = await fetch(origin + '/operator', {
    headers: { cookie: sessionCookie },
    redirect: 'manual'
  });
  return requiredMatch(await response.text(), /name="csrf" value="([A-Za-z0-9_-]{43})"/);
};

const get = async (login: Login, path: string): Promise<Response> =>
  await fetch(login.origin + path, {
    headers: { cookie: login.sessionCookie },
    redirect: 'manual'
  });

const postForm = async (
  login: Login,
  path: string,
  values: Readonly<Record<string, string>>
): Promise<Response> =>
  await fetch(login.origin + path, {
    body: new URLSearchParams(values).toString(),
    headers: {
      cookie: login.sessionCookie,
      'content-type': 'application/x-www-form-urlencoded',
      origin: login.origin
    },
    method: 'POST',
    redirect: 'manual'
  });

const requiredCookie = (response: Response): string => {
  const header = response.headers.get('set-cookie');
  if (header === null) {
    throw new Error('Expected a cookie.');
  }
  return header.split(';', 1)[0] ?? '';
};

const requiredMatch = (value: string, pattern: RegExp): string => {
  const match = pattern.exec(value);
  if (match?.[1] === undefined) {
    throw new Error('Expected a matching value.');
  }
  return match[1];
};

const multipart = (
  boundary: string,
  values: Readonly<{
    caption: string;
    csrf: string;
    image: Readonly<{ contentType: string; data: Buffer; filename: string }>;
  }>
): Buffer =>
  Buffer.concat([
    Buffer.from(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="csrf"\r\n\r\n' +
        values.csrf +
        '\r\n'
    ),
    Buffer.from(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="caption"\r\n\r\n' +
        values.caption +
        '\r\n'
    ),
    Buffer.from(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="image"; filename="' +
        values.image.filename +
        '"\r\nContent-Type: ' +
        values.image.contentType +
        '\r\n\r\n'
    ),
    values.image.data,
    Buffer.from('\r\n--' + boundary + '--\r\n')
  ]);
