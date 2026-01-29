// ==UserScript==
// @name         FB Auto Poster Dashboard Bridge
// @namespace    https://example.com/fb-auto-poster
// @version      1.0.0
// @description  Automate Facebook posting with a local dashboard
// @match        https://www.facebook.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

declare function GM_getValue(key: string, defaultValue?: string): string;
declare function GM_setValue(key: string, value: string): void;

import {
  Account,
  BaseMessage,
  QueueItem,
  makeMessage,
  StatusUpdatePayload
} from "../../shared/schema";
import { createBridge } from "../../shared/bridge";

const CHANNEL_NAME = "fb-auto-poster";
const DEFAULT_APP_URL = "";
const STORAGE_KEY = "fb-auto-poster:appUrl";

const bridge = createBridge({
  channelName: CHANNEL_NAME,
  role: "userscript",
  debug: true,
  onMessage: handleMessage
});

let active = false;

bridge.send(makeMessage("state", { connected: true }));

function handleMessage(message: BaseMessage) {
  if (message.type === "run-now") {
    const payload = message.payload as { item: QueueItem; account: Account };
    if (active) {
      sendStatus(payload.item.id, "failed", "Another job is running");
      return;
    }
    active = true;
    runJob(payload.item, payload.account)
      .catch((error) => {
        sendStatus(payload.item.id, "failed", error instanceof Error ? error.message : "Unknown error");
      })
      .finally(() => {
        active = false;
      });
  }
}

async function runJob(item: QueueItem, account: Account) {
  sendStatus(item.id, "running", "Starting job");
  await ensureAppOverlay();
  await ensureLoggedIn(account);
  await humanDelay();
  await retry(() => openComposer(item.target.type, item.target.value), 3, "Open composer");
  await retry(() => fillPostText(item.content.text), 3, "Fill text");
  if (item.content.media.length > 0) {
    await retry(
      () => uploadMedia(item.content.media.map((media) => media.dataUrl)),
      3,
      "Upload media"
    );
  }
  await humanDelay();
  await retry(() => clickPostButton(), 3, "Click post button");
  const postId = await waitForPostId();
  const screenshot = await captureScreenshot();
  sendStatus(item.id, "success", "Posted", postId, screenshot);
}

async function ensureAppOverlay() {
  const existing = document.getElementById("fb-auto-poster-frame") as HTMLIFrameElement | null;
  if (existing) {
    return;
  }
  const appUrl = GM_getValue(STORAGE_KEY, DEFAULT_APP_URL);
  const resolvedUrl = appUrl || prompt("Enter app URL for FB Auto Poster") || "";
  if (!resolvedUrl) {
    throw new Error("App URL required to load dashboard overlay");
  }
  GM_setValue(STORAGE_KEY, resolvedUrl);
  const frame = document.createElement("iframe");
  frame.id = "fb-auto-poster-frame";
  frame.src = resolvedUrl;
  frame.style.position = "fixed";
  frame.style.top = "20px";
  frame.style.right = "20px";
  frame.style.width = "360px";
  frame.style.height = "640px";
  frame.style.border = "1px solid #2563eb";
  frame.style.borderRadius = "16px";
  frame.style.zIndex = "999999";
  frame.style.background = "white";
  document.body.appendChild(frame);
  log("info", "Dashboard overlay loaded");
}

async function ensureLoggedIn(account: Account) {
  const loggedIn = Boolean(document.querySelector("[aria-label='Facebook']")) || Boolean(document.querySelector("[role='feed']"));
  if (loggedIn) {
    log("info", "Already logged in");
    return;
  }
  if (account.cookie) {
    log("info", "Injecting cookie");
    account.cookie.split(";").forEach((part) => {
      const [name, ...rest] = part.trim().split("=");
      if (!name || rest.length === 0) {
        return;
      }
      document.cookie = `${name}=${rest.join("=")}; path=/; domain=.facebook.com`;
    });
    await delay(1500);
    location.reload();
    throw new Error("Reloaded after cookie injection, retry the job.");
  }
  const emailInput = await findElement(["#email", "input[name='email']"]);
  const passInput = await findElement(["#pass", "input[name='pass']"]);
  const loginButton = await findElement(["button[name='login']", "button[type='submit']"]);
  if (!emailInput || !passInput || !loginButton) {
    throw new Error("Login form not found");
  }
  if (!account.email || !account.password) {
    throw new Error("Missing email or password for login");
  }
  typeValue(emailInput, account.email);
  typeValue(passInput, account.password);
  await humanDelay();
  loginButton.click();
  await delay(2000);
  const twoFactorPrompt = document.querySelector("input[name='approvals_code']");
  if (twoFactorPrompt) {
    throw new Error("2FA required. Complete on Facebook and retry.");
  }
}

async function openComposer(targetType: string, targetValue: string) {
  if (targetType === "group" && targetValue) {
    window.location.href = targetValue;
    await delay(4000);
  }
  if (targetType === "page" && targetValue) {
    window.location.href = `https://www.facebook.com/${targetValue}`;
    await delay(4000);
  }
  if (targetType === "story") {
    window.location.href = "https://www.facebook.com/stories/create";
    await delay(4000);
  }
  const composer =
    (await findElement([
      "div[aria-label='Create post']",
      "div[role='button'][aria-label*='Post']"
    ])) ??
    findButtonByText(["Create post", "What's on your mind", "Post"]);
  if (!composer) {
    throw new Error("Composer not found");
  }
  composer.click();
  await delay(1500);
}

async function fillPostText(text: string) {
  const editors = await findElements([
    "div[role='textbox']",
    "div[contenteditable='true']",
    "textarea"
  ]);
  const editor = editors[0];
  if (!editor) {
    throw new Error("Post editor not found");
  }
  editor.focus();
  typeValue(editor, text);
  await humanDelay();
}

async function uploadMedia(urls: string[]) {
  const input = await findElement([
    "input[type='file'][accept*='image']",
    "input[type='file'][accept*='video']",
    "input[type='file']"
  ]);
  if (!input) {
    throw new Error("File input not found");
  }
  const files = await Promise.all(urls.map((url) => urlToFile(url)));
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  (input as HTMLInputElement).files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await delay(2000);
}

async function clickPostButton() {
  const postButton = await findElement([
    "div[aria-label='Post']",
    "div[role='button'][aria-label='Post']",
    "button[type='submit']"
  ]);
  if (!postButton) {
    throw new Error("Post button not found");
  }
  postButton.click();
}

async function waitForPostId(): Promise<string | undefined> {
  await delay(5000);
  const permalink = document.querySelector("a[href*='/posts/']") as HTMLAnchorElement | null;
  if (permalink) {
    const match = permalink.href.match(/posts\/(\d+)/);
    return match?.[1];
  }
  return undefined;
}

async function captureScreenshot(): Promise<string | undefined> {
  const feed = document.querySelector("[role='feed']") as HTMLElement | null;
  if (!feed) {
    return undefined;
  }
  return elementToDataUrl(feed);
}

function sendStatus(queueId: string, status: StatusUpdatePayload["status"], reason?: string, postId?: string, screenshot?: string) {
  bridge.send(
    makeMessage("status-update", {
      queueId,
      status,
      postId,
      screenshot,
      reason,
      timestamp: new Date().toISOString()
    })
  );
}

function log(level: "debug" | "info" | "warn" | "error", message: string) {
  bridge.send(
    makeMessage("log", {
      level,
      message,
      timestamp: new Date().toISOString()
    })
  );
}

async function findElement(selectors: string[], timeout = 15000): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (element) {
        return element;
      }
    }
    await delay(500);
  }
  return null;
}

async function findElements(selectors: string[], timeout = 15000): Promise<HTMLElement[]> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const list = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
      if (list.length > 0) {
        return list;
      }
    }
    await delay(500);
  }
  return [];
}

function findButtonByText(labels: string[]): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll("div[role='button'], button")) as HTMLElement[];
  for (const candidate of candidates) {
    const text = candidate.textContent?.trim() ?? "";
    if (labels.some((label) => text.includes(label))) {
      return candidate;
    }
  }
  return null;
}

function typeValue(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  element.textContent = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function urlToFile(url: string): Promise<File> {
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], "media", { type: blob.type });
  }
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], url.split("/").pop() ?? "media", { type: blob.type });
}

async function elementToDataUrl(element: HTMLElement): Promise<string> {
  const rect = element.getBoundingClientRect();
  const clone = element.cloneNode(true) as HTMLElement;
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const serializer = new XMLSerializer();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        ${serializer.serializeToString(wrapper)}
      </foreignObject>
    </svg>
  `;
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = url;
  });
  return dataUrl;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanDelay() {
  const min = 500;
  const max = 3000;
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(duration);
  simulateMouseMove();
}

function simulateMouseMove() {
  const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  if (!target) {
    return;
  }
  const event = new MouseEvent("mousemove", {
    bubbles: true,
    clientX: window.innerWidth / 2 + Math.random() * 10,
    clientY: window.innerHeight / 2 + Math.random() * 10
  });
  target.dispatchEvent(event);
}

async function retry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let attempt = 0;
  let lastError: Error | null = null;
  while (attempt < retries) {
    try {
      log("info", `${label} attempt ${attempt + 1}/${retries}`);
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown error");
      log("warn", `${label} failed: ${lastError.message}`);
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await delay(backoff);
    }
    attempt += 1;
  }
  throw lastError ?? new Error(`${label} failed`);
}
