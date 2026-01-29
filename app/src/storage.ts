import { Account, AnalyticsItem, QueueItem, Template } from "../../shared/schema";

const STORAGE_KEY = "fb-auto-poster/state";

export interface AppState {
  accounts: Account[];
  queue: QueueItem[];
  analytics: AnalyticsItem[];
  templates: Template[];
  settings: {
    appUrl: string;
    debug: boolean;
    theme: "light" | "dark";
  };
}

export const defaultState: AppState = {
  accounts: [],
  queue: [],
  analytics: [],
  templates: [],
  settings: {
    appUrl: "",
    debug: true,
    theme: "light"
  }
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...defaultState,
      ...parsed
    };
  } catch (error) {
    console.error("Failed to load state", error);
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
