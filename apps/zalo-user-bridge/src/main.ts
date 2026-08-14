import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LoginQRCallbackEventType,
  Zalo,
  type API,
  type LoginQRCallbackEvent,
  type MessageContent,
  type ThreadType
} from 'zca-js';

import { createZaloUserBridgeControlServer } from './zalo-user-bridge-control-server.js';
import {
  createZaloUserBridgeOperatorUiServer,
  type ZaloUserOperatorUiStatus
} from './zalo-user-bridge-operator-ui-server.js';
import {
  loadZaloUserBridgeRuntimeConfiguration,
  type ZaloUserBridgeRuntimeConfiguration,
  type ZaloUserBridgeRuntimeEnvironment
} from './zalo-user-bridge-runtime-configuration.js';
import {
  ZaloUserBridge,
  type ZaloUserGroupImageReply,
  type ZaloUserGroupTextReply,
  type ZaloUserBridgeApi,
  type ZaloUserBridgeImageAttachment,
  type ZaloUserBridgeListener
} from './zalo-user-bridge.js';
import { createZaloUserHubDelivery } from './zalo-user-hub-delivery.js';

export interface RunZaloUserBridgeOptions {
  readonly configuration?: ZaloUserBridgeRuntimeConfiguration;
  readonly environment?: ZaloUserBridgeRuntimeEnvironment;
  readonly waitForShutdown?: () => Promise<void>;
}

export interface ZaloUserBridgeQrReporter {
  onQrExpired(): void;
  onQrPreparationFailure(): void;
  onQrReady(qrPath: string): void;
}

/**
 * Starts the opt-in local bridge. It intentionally obtains a fresh QR session
 * at every process start, never persists QR/session material, and binds its
 * command endpoint to loopback only.
 */
export const runZaloUserBridge = async (options: RunZaloUserBridgeOptions = {}): Promise<void> => {
  const configuration =
    options.configuration ??
    (await loadZaloUserBridgeRuntimeConfiguration(options.environment ?? process.env));
  const qrDirectory = await mkdtemp(join(tmpdir(), 'open-channel-hub-zalo-user-qr-'));
  const qrPath = join(qrDirectory, 'login.png');
  let bridge: ZaloUserBridge | undefined;
  let controlServer: ReturnType<typeof createZaloUserBridgeControlServer> | undefined;
  let operatorUiServer: ReturnType<typeof createZaloUserBridgeOperatorUiServer> | undefined;
  let operatorUiStatus: ZaloUserOperatorUiStatus = 'awaiting_qr';
  let abortPendingQrLogin: (() => unknown) | undefined;
  let shutdownRequestedWhileWaitingForQr = false;
  const stopQrLogin = (): void => {
    shutdownRequestedWhileWaitingForQr = true;
    abortPendingQrLogin?.();
  };

  try {
    await chmod(qrDirectory, 0o700);
    await writeFile(qrPath, '', { mode: 0o600 });

    if (configuration.operatorUi !== undefined) {
      operatorUiServer = createZaloUserBridgeOperatorUiServer({
        passwordHash: configuration.operatorUi.passwordHash,
        port: configuration.operatorUi.port,
        sessionPepper: configuration.operatorUi.sessionPepper,
        source: Object.freeze({
          getQrPng: async (): Promise<Buffer | undefined> =>
            await readOperatorQrPng(qrPath, operatorUiStatus),
          getStatus: (): ZaloUserOperatorUiStatus => operatorUiStatus,
          listGroups: async () => await requireBridge(bridge).listGroups(),
          sendGroupImage: async (reply: ZaloUserGroupImageReply): Promise<void> =>
            await requireBridge(bridge).sendGroupImage(reply),
          sendGroupText: async (reply: ZaloUserGroupTextReply): Promise<void> =>
            await requireBridge(bridge).sendGroupText(reply)
        })
      });
      const operatorUiPort = await operatorUiServer.start();
      process.stdout.write(
        `Zalo User operator UI is running at http://127.0.0.1:${operatorUiPort}/operator/login\n`
      );
    }

    const zalo = new Zalo({ checkUpdate: false, logging: false });
    process.once('SIGINT', stopQrLogin);
    process.once('SIGTERM', stopQrLogin);
    let api: API;

    try {
      api = await zalo.loginQR(
        { language: 'vi', qrPath },
        createZaloUserBridgeQrCallback(
          qrPath,
          createOperatorUiQrReporter((status) => {
            operatorUiStatus = status;
          }),
          (actions) => {
            abortPendingQrLogin = actions.abort;

            if (shutdownRequestedWhileWaitingForQr) {
              actions.abort();
            }
          }
        )
      );
    } finally {
      process.off('SIGINT', stopQrLogin);
      process.off('SIGTERM', stopQrLogin);
      abortPendingQrLogin = undefined;
    }

    const deliverEvent = createZaloUserHubDelivery({
      bridgeToken: configuration.bridgeToken,
      connectionId: configuration.connectionId,
      hubBaseUrl: configuration.hubBaseUrl
    });
    bridge = new ZaloUserBridge({
      accountId: configuration.accountId,
      connectionId: configuration.connectionId,
      deliverEvent,
      onStateChange: (status) => {
        operatorUiStatus = status;
        reportBridgeState(status);
      },
      reportOperationalFailure: reportOperationalFailure
    });
    bridge.start(toBridgeApi(api));

    controlServer = createZaloUserBridgeControlServer({
      controlToken: configuration.controlToken,
      groupSender: bridge,
      port: configuration.controlPort
    });
    const controlPort = await controlServer.start();

    process.stdout.write(
      `Zalo User bridge is running. Local group control: http://127.0.0.1:${controlPort}\n`
    );
    await (options.waitForShutdown ?? waitForShutdown)();
  } finally {
    bridge?.stop();
    await controlServer?.stop();
    await operatorUiServer?.stop();
    await rm(qrDirectory, { force: true, recursive: true });
  }
};

const requireBridge = (bridge: ZaloUserBridge | undefined): ZaloUserBridge => {
  if (bridge === undefined) {
    throw new Error('The Zalo User bridge is not ready.');
  }
  return bridge;
};

const readOperatorQrPng = async (
  qrPath: string,
  status: ZaloUserOperatorUiStatus
): Promise<Buffer | undefined> => {
  if (status !== 'awaiting_qr') {
    return undefined;
  }

  try {
    const qr = await readFile(qrPath);
    return qr.length > 0 ? qr : undefined;
  } catch {
    return undefined;
  }
};

const createOperatorUiQrReporter = (
  setStatus: (status: ZaloUserOperatorUiStatus) => void
): ZaloUserBridgeQrReporter => ({
  onQrExpired: (): void => {
    setStatus('reauthentication_required');
    defaultQrReporter.onQrExpired();
  },
  onQrPreparationFailure: (): void => {
    setStatus('error');
    defaultQrReporter.onQrPreparationFailure();
  },
  onQrReady: (qrPath: string): void => {
    setStatus('awaiting_qr');
    defaultQrReporter.onQrReady(qrPath);
  }
});

export const createZaloUserBridgeQrCallback =
  (
    qrPath: string,
    reporter: ZaloUserBridgeQrReporter = defaultQrReporter,
    onQrActions: (actions: ZaloUserBridgeQrActions) => void = () => undefined
  ) =>
  (event: LoginQRCallbackEvent): void => {
    const actions = event.actions;

    if (
      event.type === LoginQRCallbackEventType.QRCodeGenerated &&
      actions !== null &&
      typeof actions.saveToFile === 'function'
    ) {
      onQrActions(actions);
      void actions
        .saveToFile(qrPath)
        .then(async () => chmod(qrPath, 0o600))
        .then(() => {
          reporter.onQrReady(qrPath);
        })
        .catch(() => {
          reporter.onQrPreparationFailure();
          actions.abort();
        });
      return;
    }

    if (event.type === LoginQRCallbackEventType.QRCodeExpired && actions !== null) {
      actions.abort();
      reporter.onQrExpired();
    }
  };

export interface ZaloUserBridgeQrActions {
  abort(): unknown;
}

const defaultQrReporter: ZaloUserBridgeQrReporter = Object.freeze({
  onQrExpired: (): void => {
    process.stderr.write('The Zalo User QR expired. Restart the bridge for a new QR.\n');
  },
  onQrPreparationFailure: (): void => {
    process.stderr.write(
      'The Zalo User QR could not be prepared. Restart the bridge to try again.\n'
    );
  },
  onQrReady: (qrPath: string): void => {
    process.stdout.write(`Zalo User QR is ready at ${qrPath}. Scan it once to connect.\n`);
  }
});

const toBridgeApi = (api: API): ZaloUserBridgeApi =>
  Object.freeze({
    getAllGroups: async (): Promise<unknown> => api.getAllGroups(),
    getOwnId: (): string => api.getOwnId(),
    listener: api.listener as unknown as ZaloUserBridgeListener,
    sendMessage: async (
      message: Parameters<ZaloUserBridgeApi['sendMessage']>[0],
      threadId: Parameters<ZaloUserBridgeApi['sendMessage']>[1],
      type: Parameters<ZaloUserBridgeApi['sendMessage']>[2]
    ): Promise<unknown> =>
      api.sendMessage(
        message as
          | string
          | MessageContent
          | Readonly<{ attachments: readonly [ZaloUserBridgeImageAttachment]; msg: string }>,
        threadId,
        type as ThreadType
      )
  });

const reportBridgeState = (
  status: 'connected' | 'disconnected' | 'error' | 'reauthentication_required'
): void => {
  if (status === 'reauthentication_required') {
    process.stderr.write(
      'Zalo User requires a new QR scan. Restart the bridge; it will not send while disconnected.\n'
    );
  } else if (status === 'error') {
    process.stderr.write(
      'Zalo User bridge stopped reconnecting after its bounded network attempts. Restart it manually.\n'
    );
  }
};

const reportOperationalFailure = (): void => {
  process.stderr.write(
    'A Zalo User bridge operation did not complete. No automatic resend was attempted.\n'
  );
};

const waitForShutdown = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  void runZaloUserBridge().catch(() => {
    process.stderr.write(
      'The Zalo User bridge could not start. Check its local configuration and restart it.\n'
    );
    process.exitCode = 1;
  });
}
