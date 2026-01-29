export const MESSAGE_VERSION = "1" as const;

export type MediaType = "image" | "video";

export type TargetType = "profile" | "group" | "page" | "story";

export interface Account {
  id: string;
  label: string;
  email?: string;
  password?: string;
  cookie?: string;
  proxy?: string;
  userAgent?: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  name: string;
  dataUrl: string;
  size: number;
}

export interface PostContent {
  text: string;
  media: MediaItem[];
}

export interface Target {
  type: TargetType;
  value: string;
}

export interface Schedule {
  type: "none" | "time" | "cron";
  runAt?: string;
  cron?: string;
}

export type QueueStatus = "queued" | "running" | "success" | "failed" | "paused";

export interface QueueItem {
  id: string;
  accountId: string;
  target: Target;
  content: PostContent;
  schedule: Schedule;
  status: QueueStatus;
  retries: number;
  maxRetries: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsItem {
  id: string;
  queueId: string;
  postId?: string;
  status: "success" | "failed";
  timestamp: string;
  screenshot?: string;
  contentText?: string;
  engagement?: {
    reactions: number;
    comments: number;
    shares: number;
  };
  reason?: string;
}

export interface TemplateVariant {
  id: string;
  text: string;
}

export interface Template {
  id: string;
  name: string;
  variants: TemplateVariant[];
}

export type MessageType =
  | "handshake"
  | "enqueue"
  | "run-now"
  | "status-update"
  | "log"
  | "request-state"
  | "state";

export interface BaseMessage {
  version: typeof MESSAGE_VERSION;
  id: string;
  type: MessageType;
  payload: unknown;
}

export interface EnqueuePayload {
  item: QueueItem;
  account: Account;
}

export interface RunNowPayload {
  item: QueueItem;
  account: Account;
}

export interface StatusUpdatePayload {
  queueId: string;
  status: QueueStatus;
  postId?: string;
  screenshot?: string;
  reason?: string;
  timestamp: string;
}

export interface LogPayload {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, string>;
  timestamp: string;
}

export interface StatePayload {
  connected: boolean;
  activeAccountId?: string;
}

export type MessagePayloadMap = {
  handshake: StatePayload;
  enqueue: EnqueuePayload;
  "run-now": RunNowPayload;
  "status-update": StatusUpdatePayload;
  log: LogPayload;
  "request-state": null;
  state: StatePayload;
};

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isMessage(value: unknown): value is BaseMessage {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.version === MESSAGE_VERSION &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    "payload" in value
  );
}

export function isAccount(value: unknown): value is Account {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.createdAt === "string"
  );
}

export function isQueueItem(value: unknown): value is QueueItem {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.accountId === "string" &&
    isObject(value.target) &&
    isObject(value.content) &&
    isObject(value.schedule) &&
    typeof value.status === "string" &&
    typeof value.retries === "number" &&
    typeof value.maxRetries === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function makeMessage<T extends MessageType>(
  type: T,
  payload: MessagePayloadMap[T]
): BaseMessage {
  return {
    version: MESSAGE_VERSION,
    id: crypto.randomUUID(),
    type,
    payload
  };
}

export function validatePayload<T extends MessageType>(
  message: BaseMessage,
  expected: T
): message is BaseMessage & { payload: MessagePayloadMap[T] } {
  if (message.type !== expected) {
    return false;
  }
  return true;
}
