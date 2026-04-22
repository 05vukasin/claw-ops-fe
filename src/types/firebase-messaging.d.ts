// The firebase v12 package declares a `typings` path in its subpackage package.json
// that doesn't actually exist in the distributed tarball (`dist/messaging/index.d.ts`
// is missing). Until upstream fixes that, stub the module so `await import("firebase/messaging")`
// typechecks. Surface area is narrow — only `getMessaging` / `getToken` / `onMessage` are used.
declare module "firebase/messaging" {
  import type { FirebaseApp } from "firebase/app";

  export interface Messaging {
    readonly app: FirebaseApp;
  }
  export interface MessagePayload {
    notification?: { title?: string; body?: string; image?: string };
    data?: Record<string, string>;
    from?: string;
    collapseKey?: string;
    messageId?: string;
  }
  export interface GetTokenOptions {
    vapidKey?: string;
    serviceWorkerRegistration?: ServiceWorkerRegistration;
  }

  export function getMessaging(app?: FirebaseApp): Messaging;
  export function getToken(messaging: Messaging, options?: GetTokenOptions): Promise<string>;
  export function onMessage(
    messaging: Messaging,
    nextOrObserver: (payload: MessagePayload) => void,
  ): () => void;
  export function isSupported(): Promise<boolean>;
  export function deleteToken(messaging: Messaging): Promise<boolean>;
}
