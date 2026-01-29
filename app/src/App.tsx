import { useEffect, useState } from "react";
import {
  Account,
  AnalyticsItem,
  QueueItem,
  TargetType,
  Template,
  makeMessage
} from "../../shared/schema";
import { createBridge } from "../../shared/bridge";
import { parseCsv, toCsv } from "../../shared/csv";
import { chooseVariant, isTooSimilar } from "../../shared/similarity";
import { isValidCron, nextCronRun } from "../../shared/cron";
import { defaultState, loadState, saveState } from "./storage";

const tabs = [
  "Account Manager",
  "Post Composer",
  "Batch Upload",
  "Queue Monitor",
  "Analytics",
  "Settings"
] as const;

type Tab = (typeof tabs)[number];

const CHANNEL_NAME = "fb-auto-poster";

export default function App() {
  const [state, setState] = useState(loadState());
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const targetWindow = window.parent !== window ? window.parent : undefined;
    const bridge = createBridge({
      channelName: CHANNEL_NAME,
      role: "app",
      debug: state.settings.debug,
      targetWindow,
      targetOrigin: "*",
      onMessage: (message) => {
        if (message.type === "state" || message.type === "handshake") {
          const payload = message.payload as { connected: boolean };
          setConnected(payload.connected);
        }
        if (message.type === "status-update") {
          const payload = message.payload as {
            queueId: string;
            status: QueueItem["status"];
            postId?: string;
            screenshot?: string;
            reason?: string;
            timestamp: string;
          };
          setState((prev) => {
            const queue = prev.queue.map((item) =>
              item.id === payload.queueId
                ? {
                    ...item,
                    status: payload.status,
                    lastError: payload.reason,
                    updatedAt: payload.timestamp
                  }
                : item
            );
            const queueItem = prev.queue.find((item) => item.id === payload.queueId);
            const analytics: AnalyticsItem[] = payload.status === "running" ? prev.analytics : [
              {
                id: crypto.randomUUID(),
                queueId: payload.queueId,
                postId: payload.postId,
                status: payload.status === "success" ? "success" : "failed",
                timestamp: payload.timestamp,
                screenshot: payload.screenshot,
                contentText: queueItem?.content.text,
                reason: payload.reason,
                engagement: {
                  reactions: 0,
                  comments: 0,
                  shares: 0
                }
              },
              ...prev.analytics
            ];
            return { ...prev, queue, analytics };
          });
        }
        if (message.type === "log") {
          const payload = message.payload as { message: string; timestamp: string };
          setLogs((prev) => [`${payload.timestamp} - ${payload.message}`, ...prev].slice(0, 200));
        }
      }
    });

    bridge.send(makeMessage("handshake", { connected: true }));

    return () => bridge.destroy();
  }, [state.settings.debug]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((prev) => {
        const now = new Date();
        let updated = false;
        const nextQueue = prev.queue.map((item) => {
          if (item.status !== "queued") {
            return item;
          }
          if (item.schedule.type === "time" && item.schedule.runAt) {
            if (new Date(item.schedule.runAt) <= now) {
              updated = true;
              return { ...item, status: "running", updatedAt: now.toISOString() };
            }
          }
          if (item.schedule.type === "cron" && item.schedule.cron) {
            const runAt = item.schedule.runAt ? new Date(item.schedule.runAt) : null;
            if (runAt && runAt <= now) {
              const nextRun = nextCronRun(now, item.schedule.cron);
              updated = true;
              return {
                ...item,
                status: "running",
                updatedAt: now.toISOString(),
                schedule: {
                  ...item.schedule,
                  runAt: nextRun?.toISOString()
                }
              };
            }
          }
          if (item.schedule.type === "none") {
            updated = true;
            return { ...item, status: "running", updatedAt: now.toISOString() };
          }
          return item;
        });

        if (!updated) {
          return prev;
        }

        return { ...prev, queue: nextQueue };
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const runningItems = state.queue.filter((item) => item.status === "running");
    if (runningItems.length === 0) {
      return;
    }
    const targetWindow = window.parent !== window ? window.parent : undefined;
    const bridge = createBridge({
      channelName: CHANNEL_NAME,
      role: "app",
      debug: state.settings.debug,
      targetWindow,
      targetOrigin: "*",
      onMessage: () => undefined
    });
    runningItems.forEach((item) => {
      const account = state.accounts.find((entry) => entry.id === item.accountId);
      if (!account) {
        return;
      }
      bridge.send(makeMessage("run-now", { item, account }));
    });
    return () => bridge.destroy();
  }, [state.accounts, state.queue, state.settings.debug]);

  const addAccount = (account: Account) => {
    setState((prev) => ({ ...prev, accounts: [account, ...prev.accounts] }));
  };

  const updateAccount = (account: Account) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((item) => (item.id === account.id ? account : item))
    }));
  };

  const removeAccount = (id: string) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((item) => item.id !== id)
    }));
  };

  const enqueueItem = (item: QueueItem) => {
    setState((prev) => ({ ...prev, queue: [item, ...prev.queue] }));
  };

  const updateQueueItem = (item: QueueItem) => {
    setState((prev) => ({
      ...prev,
      queue: prev.queue.map((entry) => (entry.id === item.id ? item : entry))
    }));
  };

  const retryQueueItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      queue: prev.queue.map((item) => {
        if (item.id !== id) {
          return item;
        }
        if (item.retries >= item.maxRetries) {
          return item;
        }
        return {
          ...item,
          retries: item.retries + 1,
          status: "queued",
          updatedAt: new Date().toISOString(),
          lastError: undefined
        };
      })
    }));
  };

  const saveTemplate = (template: Template) => {
    setState((prev) => ({ ...prev, templates: [template, ...prev.templates] }));
  };

  const recentTexts = state.analytics.map((entry) => entry.contentText ?? "");

  return (
    <div className={`app ${state.settings.theme}`}>
      <header className="app-header">
        <div>
          <h1>FB Auto Poster</h1>
          <p className="muted">Connected: {connected ? "Yes" : "No"}</p>
        </div>
        <div className="header-actions">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={tab === activeTab ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <main>
        {activeTab === "Account Manager" && (
          <AccountManager
            accounts={state.accounts}
            onAdd={addAccount}
            onUpdate={updateAccount}
            onRemove={removeAccount}
          />
        )}
        {activeTab === "Post Composer" && (
          <PostComposer
            accounts={state.accounts}
            templates={state.templates}
            onSaveTemplate={saveTemplate}
            onEnqueue={enqueueItem}
            recentTexts={recentTexts}
          />
        )}
        {activeTab === "Batch Upload" && (
          <BatchUpload accounts={state.accounts} onEnqueue={enqueueItem} />
        )}
        {activeTab === "Queue Monitor" && (
          <QueueMonitor queue={state.queue} onRetry={retryQueueItem} onUpdate={updateQueueItem} />
        )}
        {activeTab === "Analytics" && <AnalyticsView analytics={state.analytics} />}
        {activeTab === "Settings" && (
          <SettingsView
            settings={state.settings}
            onChange={(settings) => setState((prev) => ({ ...prev, settings }))}
          />
        )}
      </main>

      <aside className="logs">
        <h2>Logs</h2>
        <div className="log-list">
          {logs.map((entry) => (
            <div key={entry}>{entry}</div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function AccountManager({
  accounts,
  onAdd,
  onUpdate,
  onRemove
}: {
  accounts: Account[];
  onAdd: (account: Account) => void;
  onUpdate: (account: Account) => void;
  onRemove: (id: string) => void;
}) {
  const [form, setForm] = useState({
    label: "",
    email: "",
    password: "",
    cookie: "",
    proxy: "",
    userAgent: ""
  });

  const submit = () => {
    const account: Account = {
      id: crypto.randomUUID(),
      label: form.label || form.email || "Untitled",
      email: form.email || undefined,
      password: form.password || undefined,
      cookie: form.cookie || undefined,
      proxy: form.proxy || undefined,
      userAgent: form.userAgent || undefined,
      createdAt: new Date().toISOString()
    };
    onAdd(account);
    setForm({ label: "", email: "", password: "", cookie: "", proxy: "", userAgent: "" });
  };

  return (
    <section className="panel">
      <h2>Account Manager</h2>
      <div className="grid">
        <label>
          Label
          <input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
        </label>
        <label>
          Email
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <label>
          Cookie
          <textarea
            value={form.cookie}
            onChange={(event) => setForm({ ...form, cookie: event.target.value })}
          />
        </label>
        <label>
          Proxy
          <input
            value={form.proxy}
            onChange={(event) => setForm({ ...form, proxy: event.target.value })}
          />
        </label>
        <label>
          User Agent
          <input
            value={form.userAgent}
            onChange={(event) => setForm({ ...form, userAgent: event.target.value })}
          />
        </label>
      </div>
      <button className="primary" onClick={submit}>
        Add Account
      </button>
      <div className="list">
        {accounts.map((account) => (
          <div key={account.id} className="card">
            <div>
              <strong>{account.label}</strong>
              <div className="muted">{account.email || "Cookie auth"}</div>
            </div>
            <div className="card-actions">
              <button onClick={() => onUpdate({ ...account, label: `${account.label} (edit)` })}>
                Quick Edit
              </button>
              <button className="danger" onClick={() => onRemove(account.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PostComposer({
  accounts,
  templates,
  onSaveTemplate,
  onEnqueue,
  recentTexts
}: {
  accounts: Account[];
  templates: Template[];
  onSaveTemplate: (template: Template) => void;
  onEnqueue: (item: QueueItem) => void;
  recentTexts: string[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [targetType, setTargetType] = useState<TargetType>("profile");
  const [targetValue, setTargetValue] = useState("me");
  const [text, setText] = useState("");
  const [scheduleType, setScheduleType] = useState<"none" | "time" | "cron">("none");
  const [scheduleValue, setScheduleValue] = useState("");
  const [media, setMedia] = useState<{ name: string; dataUrl: string; size: number; type: string }[]>(
    []
  );
  const [templateName, setTemplateName] = useState("");
  const [templateVariants, setTemplateVariants] = useState<string[]>([""]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) {
      return;
    }
    const uploads = await Promise.all(
      Array.from(files).map(async (file) => ({
        name: file.name,
        size: file.size,
        type: file.type.startsWith("video") ? "video" : "image",
        dataUrl: await fileToDataUrl(file)
      }))
    );
    setMedia(uploads);
  };

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accountId, accounts]);

  const submit = () => {
    const account = accounts.find((entry) => entry.id === accountId);
    if (!account) {
      alert("Add an account first");
      return;
    }
    if (isTooSimilar(text, recentTexts)) {
      alert("Post is too similar to recent content.");
      return;
    }
    if (scheduleType === "cron" && scheduleValue && !isValidCron(scheduleValue)) {
      alert("Cron expression is invalid. Use 5-part UTC format.");
      return;
    }
    const now = new Date().toISOString();
    const cronNext = scheduleType === "cron" && scheduleValue ? nextCronRun(new Date(), scheduleValue) : null;
    const schedule =
      scheduleType === "time"
        ? { type: "time", runAt: scheduleValue }
        : scheduleType === "cron"
          ? { type: "cron", cron: scheduleValue, runAt: cronNext?.toISOString() }
          : { type: "none" };
    const item: QueueItem = {
      id: crypto.randomUUID(),
      accountId: account.id,
      target: { type: targetType, value: targetValue },
      content: {
        text,
        media: media.map((file) => ({
          id: crypto.randomUUID(),
          type: file.type === "video" ? "video" : "image",
          name: file.name,
          dataUrl: file.dataUrl,
          size: file.size
        }))
      },
      schedule,
      status: "queued",
      retries: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now
    };
    onEnqueue(item);
  };

  const saveTemplate = () => {
    const template: Template = {
      id: crypto.randomUUID(),
      name: templateName || "Untitled",
      variants: templateVariants.filter(Boolean).map((variant) => ({
        id: crypto.randomUUID(),
        text: variant
      }))
    };
    onSaveTemplate(template);
    setTemplateName("");
    setTemplateVariants([""]);
  };

  const useTemplate = (template: Template) => {
    const { text: chosen } = chooseVariant(
      template.variants.map((variant) => variant.text),
      recentTexts
    );
    setText(chosen);
  };

  return (
    <section className="panel">
      <h2>Post Composer</h2>
      <div className="grid">
        <label>
          Account
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target Type
          <select value={targetType} onChange={(event) => setTargetType(event.target.value as TargetType)}>
            <option value="profile">Profile</option>
            <option value="group">Group</option>
            <option value="page">Page</option>
            <option value="story">Story</option>
          </select>
        </label>
        <label>
          Target Value (URL/ID)
          <input value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
        </label>
        <label>
          Text
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <label>
          Media Upload
          <input type="file" multiple onChange={(event) => handleFiles(event.target.files)} />
        </label>
        <label>
          Schedule Type
          <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as "none" | "time" | "cron")}>
            <option value="none">Immediate</option>
            <option value="time">Exact Time</option>
            <option value="cron">Cron (UTC)</option>
          </select>
        </label>
        <label>
          Schedule Value
          <input value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} />
        </label>
      </div>
      <button className="primary" onClick={submit}>
        Enqueue Post
      </button>

      <section className="panel nested">
        <h3>Templates</h3>
        <div className="grid">
          <label>
            Template Name
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
          </label>
          <label>
            Variants (one per line)
            <textarea
              value={templateVariants.join("\n")}
              onChange={(event) => setTemplateVariants(event.target.value.split("\n"))}
            />
          </label>
        </div>
        <button onClick={saveTemplate}>Save Template</button>
        <div className="list">
          {templates.map((template) => (
            <div key={template.id} className="card">
              <div>
                <strong>{template.name}</strong>
                <div className="muted">{template.variants.length} variants</div>
              </div>
              <button onClick={() => useTemplate(template)}>Use Template</button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function BatchUpload({ accounts, onEnqueue }: { accounts: Account[]; onEnqueue: (item: QueueItem) => void }) {
  const [csvText, setCsvText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accountId, accounts]);

  const handleImport = () => {
    const rows = parseCsv(csvText);
    const now = new Date();
    rows.forEach((row) => {
      const schedule = row.schedule_time
        ? { type: "time" as const, runAt: row.schedule_time }
        : { type: "none" as const };
      const item: QueueItem = {
        id: crypto.randomUUID(),
        accountId,
        target: { type: "group", value: row.target },
        content: {
          text: row.text,
          media: row.file_url
            ? [
                {
                  id: crypto.randomUUID(),
                  type: row.file_url.endsWith(".mp4") ? "video" : "image",
                  name: row.file_url.split("/").pop() ?? "media",
                  dataUrl: row.file_url,
                  size: 0
                }
              ]
            : []
        },
        schedule,
        status: "queued",
        retries: 0,
        maxRetries: 3,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      onEnqueue(item);
    });
    setStatus(`${rows.length} items added to queue.`);
  };

  const handleExport = () => {
    const blob = new Blob([toCsv(parseCsv(csvText))], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "batch-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <h2>Batch Upload</h2>
      <label>
        Account
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        CSV Content
        <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} />
      </label>
      <div className="row">
        <button className="primary" onClick={handleImport}>
          Import CSV
        </button>
        <button onClick={handleExport}>Export CSV</button>
      </div>
      <p className="muted">{status}</p>
    </section>
  );
}

function QueueMonitor({
  queue,
  onRetry,
  onUpdate
}: {
  queue: QueueItem[];
  onRetry: (id: string) => void;
  onUpdate: (item: QueueItem) => void;
}) {
  const counts = queue.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { queued: 0, running: 0, success: 0, failed: 0, paused: 0 }
  );
  return (
    <section className="panel">
      <h2>Queue Monitor</h2>
      <p className="muted">
        Queued {counts.queued} · Running {counts.running} · Success {counts.success} · Failed {counts.failed} · Paused {counts.paused}
      </p>
      <div className="list">
        {queue.map((item) => (
          <div key={item.id} className="card">
            <div>
              <strong>{item.target.type}</strong>
              <div className="muted">{item.content.text.slice(0, 80)}</div>
              <div className="muted">Status: {item.status}</div>
            </div>
            <div className="card-actions">
              <button onClick={() => onUpdate({ ...item, status: "paused" })}>Pause</button>
              <button onClick={() => onRetry(item.id)} disabled={item.retries >= item.maxRetries}>
                Retry ({item.retries}/{item.maxRetries})
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalyticsView({ analytics }: { analytics: AnalyticsItem[] }) {
  return (
    <section className="panel">
      <h2>Analytics</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Post ID</th>
            <th>Timestamp</th>
            <th>Screenshot</th>
            <th>Reactions</th>
            <th>Comments</th>
            <th>Shares</th>
          </tr>
        </thead>
        <tbody>
          {analytics.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.status}</td>
              <td>{entry.postId ?? "n/a"}</td>
              <td>{entry.timestamp}</td>
              <td>{entry.screenshot ? <a href={entry.screenshot}>View</a> : "n/a"}</td>
              <td>{entry.engagement?.reactions ?? 0}</td>
              <td>{entry.engagement?.comments ?? 0}</td>
              <td>{entry.engagement?.shares ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SettingsView({
  settings,
  onChange
}: {
  settings: typeof defaultState.settings;
  onChange: (settings: typeof defaultState.settings) => void;
}) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <label>
        App URL (for userscript iframe)
        <input value={settings.appUrl} onChange={(event) => onChange({ ...settings, appUrl: event.target.value })} />
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.debug}
          onChange={(event) => onChange({ ...settings, debug: event.target.checked })}
        />
        Debug Logging
      </label>
      <label>
        Theme
        <select value={settings.theme} onChange={(event) => onChange({ ...settings, theme: event.target.value as "light" | "dark" })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </section>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
