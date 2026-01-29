import { BaseMessage, isMessage, makeMessage } from "./schema";

export type BridgeRole = "app" | "userscript";

export interface BridgeOptions {
  channelName: string;
  role: BridgeRole;
  debug: boolean;
  targetWindow?: Window;
  targetOrigin?: string;
  onMessage: (message: BaseMessage) => void;
}

export interface Bridge {
  send: (message: BaseMessage) => void;
  sendType: <T extends BaseMessage["type"]>(type: T, payload: BaseMessage["payload"]) => void;
  destroy: () => void;
}

export function createBridge(options: BridgeOptions): Bridge {
  const { channelName, debug, onMessage } = options;
  const bc = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
  const storageKey = `${channelName}:message`;

  const log = (...args: unknown[]) => {
    if (debug) {
      console.info(`[bridge:${options.role}]`, ...args);
    }
  };

  const handleIncoming = (payload: unknown) => {
    if (!isMessage(payload)) {
      return;
    }
    onMessage(payload);
  };

  const broadcast = (message: BaseMessage) => {
    if (bc) {
      bc.postMessage(message);
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(message));
      localStorage.removeItem(storageKey);
    } catch (error) {
      log("localStorage broadcast failed", error);
    }
    if (options.targetWindow && options.targetOrigin) {
      options.targetWindow.postMessage(message, options.targetOrigin);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) {
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue);
      handleIncoming(parsed);
    } catch (error) {
      log("storage parse failed", error);
    }
  };

  const onPostMessage = (event: MessageEvent) => {
    if (options.targetOrigin && options.targetOrigin !== "*" && event.origin !== options.targetOrigin) {
      return;
    }
    handleIncoming(event.data);
  };

  if (bc) {
    bc.addEventListener("message", (event) => handleIncoming(event.data));
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("message", onPostMessage);

  return {
    send: broadcast,
    sendType: (type, payload) => {
      broadcast(makeMessage(type, payload));
    },
    destroy: () => {
      if (bc) {
        bc.close();
      }
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onPostMessage);
    }
  };
}
