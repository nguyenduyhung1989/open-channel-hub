import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginQRCallbackEventType } from 'zca-js';

import { createZaloUserBridgeQrCallback } from './main.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe('createZaloUserBridgeQrCallback', () => {
  it('writes a generated QR only to the pre-created owner-only temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-channel-hub-zalo-user-qr-test-'));
    temporaryDirectories.push(directory);
    const qrPath = join(directory, 'login.png');
    await writeFile(qrPath, '', { mode: 0o600 });
    await chmod(qrPath, 0o600);
    let signalSaved!: () => void;
    const saved = new Promise<void>((resolve) => {
      signalSaved = resolve;
    });
    const saveToFile = vi.fn(async (path: string | undefined): Promise<void> => {
      await writeFile(path ?? '', 'synthetic-qr');
      signalSaved();
    });
    const abort = vi.fn();
    const onQrActions = vi.fn();
    const onQrReady = vi.fn();
    const callback = createZaloUserBridgeQrCallback(
      qrPath,
      {
        onQrExpired: vi.fn(),
        onQrPreparationFailure: vi.fn(),
        onQrReady
      },
      onQrActions
    );

    callback({
      actions: { abort, retry: vi.fn(), saveToFile },
      data: { code: 'synthetic-secret-that-must-not-be-printed' },
      type: LoginQRCallbackEventType.QRCodeGenerated
    });
    await saved;
    await vi.waitFor(() => {
      expect(onQrReady).toHaveBeenCalledWith(qrPath);
    });

    expect(saveToFile).toHaveBeenCalledWith(qrPath);
    expect(onQrActions).toHaveBeenCalledWith(expect.objectContaining({ abort }));
    expect(abort).not.toHaveBeenCalled();
    expect(JSON.stringify(onQrReady.mock.calls)).not.toContain('synthetic-secret');
  });

  it('aborts an expired QR instead of automatically requesting a new login', () => {
    const abort = vi.fn();
    const onQrExpired = vi.fn();
    const callback = createZaloUserBridgeQrCallback('/tmp/synthetic-login.png', {
      onQrExpired,
      onQrPreparationFailure: vi.fn(),
      onQrReady: vi.fn()
    });

    callback({
      actions: { abort, retry: vi.fn() },
      data: null,
      type: LoginQRCallbackEventType.QRCodeExpired
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(onQrExpired).toHaveBeenCalledOnce();
  });

  it('never logs the cookie/IMEI callback that signals successful provider login', () => {
    const onQrReady = vi.fn();
    const onQrExpired = vi.fn();
    const onQrPreparationFailure = vi.fn();
    const callback = createZaloUserBridgeQrCallback('/tmp/synthetic-login.png', {
      onQrExpired,
      onQrPreparationFailure,
      onQrReady
    });

    callback({
      actions: null,
      data: { cookie: 'must-not-log', imei: 'must-not-log', userAgent: 'must-not-log' },
      type: LoginQRCallbackEventType.GotLoginInfo
    });

    expect(onQrReady).not.toHaveBeenCalled();
    expect(onQrExpired).not.toHaveBeenCalled();
    expect(onQrPreparationFailure).not.toHaveBeenCalled();
  });
});
