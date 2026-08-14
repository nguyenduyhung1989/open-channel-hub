/**
 * zca-js 2.1.2 publishes a root `index.d.ts` whose extensionless re-export is
 * not consumable under this repository's strict NodeNext resolution. Keep this
 * intentionally narrow declaration next to the isolated experimental bridge;
 * it mirrors only the runtime exports this bridge uses.
 */
declare module 'zca-js' {
  export enum LoginQRCallbackEventType {
    QRCodeGenerated = 0,
    QRCodeExpired = 1,
    QRCodeScanned = 2,
    QRCodeDeclined = 3,
    GotLoginInfo = 4
  }

  export enum ThreadType {
    User = 0,
    Group = 1
  }

  export interface LoginQRCallbackEvent {
    readonly actions: Readonly<{
      abort(): unknown;
      retry(): unknown;
      saveToFile?(qrPath?: string): Promise<unknown>;
    }> | null;
    readonly data: unknown;
    readonly type: LoginQRCallbackEventType;
  }

  export interface MessageContent {
    readonly attachments?: unknown;
    readonly msg: string;
  }

  export interface API {
    readonly listener: unknown;
    getAllGroups(): Promise<unknown>;
    getOwnId(): string;
    sendMessage(
      message: string | MessageContent | Readonly<Record<string, unknown>>,
      threadId: string,
      type?: ThreadType
    ): Promise<unknown>;
  }

  export class Zalo {
    public constructor(options?: Readonly<{ checkUpdate?: boolean; logging?: boolean }>);
    public loginQR(
      options?: Readonly<{ language?: string; qrPath?: string; userAgent?: string }>,
      callback?: (event: LoginQRCallbackEvent) => unknown
    ): Promise<API>;
  }
}
