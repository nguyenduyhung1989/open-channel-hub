import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createZaloUserBridgeControlServer,
  ZaloUserBridgeControlServerError,
  type ZaloUserGroupSender
} from './zalo-user-bridge-control-server.js';
import {
  ZaloUserBridgeCommandRejectedError,
  ZaloUserBridgeProviderError
} from './zalo-user-bridge.js';

const CONTROL_TOKEN = 'synthetic_zalo_user_control_token_0123456789012345678';
const GROUP_ID = '146845883529197922';
const runningServers: Array<ReturnType<typeof createZaloUserBridgeControlServer>> = [];

describe('ZaloUserBridgeControlServer', () => {
  afterEach(async () => {
    await Promise.all(runningServers.splice(0).map(async (server) => server.stop()));
  });

  it('accepts one authenticated, strict text command for an already-known group', async () => {
    const sender = createSender();
    const server = createServer(sender);
    const port = await server.start();

    const response = await send(port, `/v1/groups/${GROUP_ID}/text`, {
      text: 'Đã nhận ảnh báo cáo.'
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(sender.sendGroupText).toHaveBeenCalledWith({
      groupId: GROUP_ID,
      text: 'Đã nhận ảnh báo cáo.'
    });
    expect(sender.sendGroupImage).not.toHaveBeenCalled();
  });

  it('authenticates before parsing a malformed large-looking body or invoking the sender', async () => {
    const sender = createSender();
    const server = createServer(sender);
    const port = await server.start();

    const response = await fetch(`http://127.0.0.1:${port}/v1/groups/${GROUP_ID}/text`, {
      body: '{"text":',
      headers: { 'content-type': 'application/json' },
      method: 'POST'
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The local bridge request is invalid.' }
    });
    expect(sender.sendGroupText).not.toHaveBeenCalled();
  });

  it('does not permit an authenticated caller to send to a group the bridge has not observed', async () => {
    const sender = createSender({
      sendGroupText: vi.fn(async (): Promise<void> => {
        throw new ZaloUserBridgeCommandRejectedError();
      })
    });
    const server = createServer(sender);
    const port = await server.start();

    const response = await send(port, '/v1/groups/untrusted-group/text', {
      text: 'Không được gửi.'
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
    expect(sender.sendGroupText).toHaveBeenCalledOnce();
  });

  it('accepts a canonical PNG buffer and never treats a local pathname as image input', async () => {
    const sender = createSender();
    const server = createServer(sender);
    const port = await server.start();
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await send(port, `/v1/groups/${GROUP_ID}/image`, {
      caption: 'Ảnh PNG',
      dataBase64: image.toString('base64'),
      filename: 'report.png',
      height: 1,
      width: 1
    });

    expect(response.status).toBe(204);
    expect(sender.sendGroupImage).toHaveBeenCalledWith({
      caption: 'Ảnh PNG',
      groupId: GROUP_ID,
      image: {
        data: image,
        filename: 'report.png',
        metadata: { height: 1, totalSize: image.length, width: 1 }
      }
    });
    expect(JSON.stringify(vi.mocked(sender.sendGroupImage).mock.calls)).not.toContain('/etc/');
  });

  it.each([
    { dataBase64: 'not base64!', filename: 'report.png' },
    { dataBase64: Buffer.from('not-png').toString('base64'), filename: 'report.png' },
    { dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), filename: 'report.png' },
    { dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), filename: 'report.svg' },
    { dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), filename: '../report.jpg' },
    {
      dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'),
      filename: 'report.jpg',
      ignored: true
    }
  ])('rejects malformed image input before provider delivery: %j', async (payload) => {
    const sender = createSender();
    const server = createServer(sender);
    const port = await server.start();

    const response = await send(port, `/v1/groups/${GROUP_ID}/image`, {
      ...payload,
      unexpected: payload.ignored ? 'strict object' : undefined
    });

    expect(response.status).toBe(400);
    expect(sender.sendGroupImage).not.toHaveBeenCalled();
  });

  it('does not retry a rejected provider send and keeps its body generic', async () => {
    const sender = createSender({
      sendGroupText: vi.fn(async (): Promise<void> => {
        throw new ZaloUserBridgeProviderError();
      })
    });
    const server = createServer(sender);
    const port = await server.start();

    const response = await send(port, `/v1/groups/${GROUP_ID}/text`, { text: 'Một lần duy nhất.' });

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('provider request did not complete');
    expect(sender.sendGroupText).toHaveBeenCalledOnce();
  });

  it('limits explicit group sends instead of becoming a local bulk endpoint', async () => {
    const sender = createSender();
    const server = createServer(sender, { maximumSendsPerMinute: 1 });
    const port = await server.start();

    const first = await send(port, `/v1/groups/${GROUP_ID}/text`, { text: 'Lần một.' });
    const second = await send(port, `/v1/groups/${GROUP_ID}/text`, { text: 'Lần hai.' });

    expect(first.status).toBe(204);
    expect(second.status).toBe(429);
    expect(sender.sendGroupText).toHaveBeenCalledOnce();
  });

  it('rejects a body above the bounded text envelope without calling the group sender', async () => {
    const sender = createSender();
    const server = createServer(sender);
    const port = await server.start();

    const response = await send(port, `/v1/groups/${GROUP_ID}/text`, {
      text: 'x'.repeat(32 * 1024)
    });

    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(sender.sendGroupText).not.toHaveBeenCalled();
  });

  it('fails closed when constructed with a public or malformed control boundary', () => {
    expect(() =>
      createZaloUserBridgeControlServer({
        controlToken: 'short',
        groupSender: createSender(),
        port: 9_472
      })
    ).toThrow(ZaloUserBridgeControlServerError);
  });
});

const createServer = (
  sender: ZaloUserGroupSender,
  overrides: Readonly<{ maximumSendsPerMinute?: number }> = {}
) => {
  const server = createZaloUserBridgeControlServer({
    controlToken: CONTROL_TOKEN,
    groupSender: sender,
    ...(overrides.maximumSendsPerMinute === undefined
      ? {}
      : { maximumSendsPerMinute: overrides.maximumSendsPerMinute }),
    port: 0
  });
  runningServers.push(server);

  return server;
};

const createSender = (
  overrides: Readonly<
    Partial<{
      sendGroupImage: ZaloUserGroupSender['sendGroupImage'];
      sendGroupText: ZaloUserGroupSender['sendGroupText'];
    }>
  > = {}
) => ({
  sendGroupImage: overrides.sendGroupImage ?? vi.fn(async (): Promise<void> => undefined),
  sendGroupText: overrides.sendGroupText ?? vi.fn(async (): Promise<void> => undefined)
});

const send = async (port: number, path: string, payload: unknown): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      authorization: `Bearer ${CONTROL_TOKEN}`,
      'content-type': 'application/json'
    },
    method: 'POST'
  });
