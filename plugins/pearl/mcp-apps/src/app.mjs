import { normalizeToolResult, recoveryPrompt } from "./model.mjs";

const root = document.getElementById("app");
const liveRegion = document.getElementById("live-status");
const pending = new Map();
const selected = new Set();
const hostState = {
  connected: false,
  context: {},
  toolInput: undefined,
  toolResultReceived: false,
};
let nextRequestId = 1;
let sizeObserver;

function safeMessage(value) {
  return Boolean(value) && typeof value === "object" && value.jsonrpc === "2.0";
}

function post(message) {
  if (window.parent === window) throw new Error("MCP Apps host is unavailable");
  window.parent.postMessage(message, "*");
}

function request(method, params, timeoutMs = 8_000) {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      post({ jsonrpc: "2.0", id, method, params });
    } catch (error) {
      window.clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

function notify(method, params = {}) {
  post({ jsonrpc: "2.0", method, params });
}

function respond(id, result) {
  post({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  post({ jsonrpc: "2.0", id, error: { code, message } });
}

function announce(message) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  window.setTimeout(() => { liveRegion.textContent = message; }, 20);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== "") node.textContent = String(text);
  return node;
}

function button(label, onClick, variant = "primary") {
  const node = element("button", `button${variant === "secondary" ? " secondary" : ""}`, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

async function sendFixedHostMessage(text, actionButton) {
  actionButton.disabled = true;
  try {
    await request("ui/message", {
      role: "user",
      content: [{ type: "text", text }],
    });
    actionButton.textContent = "Question sent";
    announce("Sent your taste question to the host.");
  } catch {
    actionButton.disabled = false;
    announce("The host could not start that question. Continue in the conversation.");
  }
}

function header(model) {
  const node = element("header", "panel-header");
  const copy = element("div", "header-copy");
  copy.append(element("p", "eyebrow", "Pearl concierge"));
  copy.append(element("h1", "", model.title));
  copy.append(element("p", "subtitle", model.subtitle));
  node.append(copy);
  if (model.state === "ready" && model.kind === "profile" && model.lens) {
    node.append(element("span", "count-pill", model.lens));
  } else if (model.state === "ready") {
    node.append(element("span", "count-pill", `${model.items.length} result${model.items.length === 1 ? "" : "s"}`));
  }
  return node;
}

function banner(message, tone = "warning") {
  const node = element("div", "status-banner");
  node.dataset.tone = tone;
  node.setAttribute("role", tone === "danger" ? "alert" : "status");
  node.append(element("span", "status-mark", tone === "danger" ? "!" : tone === "success" ? "✓" : "i"));
  node.append(element("p", "status-copy", message));
  return node;
}

function chip(label, accent = false) {
  return element("span", `chip${accent ? " accent" : ""}`, label);
}

function itemCard(item, index, selectable) {
  const node = element(selectable ? "button" : "article", "result-card");
  const titleId = `result-title-${index}`;
  if (selectable) {
    node.type = "button";
    node.setAttribute("aria-pressed", selected.has(item.id) ? "true" : "false");
    node.setAttribute("aria-labelledby", titleId);
    node.addEventListener("click", () => {
      if (selected.has(item.id)) selected.delete(item.id);
      else if (selected.size < 3) selected.add(item.id);
      else announce("You can compare up to three places. Deselect one first.");
      renderCurrent();
      announce(`${selected.size} place${selected.size === 1 ? "" : "s"} selected for comparison.`);
    });
  }

  const top = element("div", "item-heading");
  const heading = element(selectable ? "span" : "h2", "item-title", item.name);
  heading.id = titleId;
  top.append(heading);
  if (item.status) {
    const status = element("span", "status-pill", item.status);
    status.dataset.status = item.status;
    top.append(status);
  } else if (item.score) {
    top.append(element("span", "status-pill", item.score));
  }
  node.append(top);
  if (item.meta) node.append(element("p", "item-meta", item.meta));
  if (item.detail) node.append(element("p", "item-detail", item.detail));
  const chips = [item.category, item.group, item.score && item.status ? item.score : ""].filter(Boolean);
  if (chips.length) {
    const row = element("div", "chip-row");
    chips.forEach((label, chipIndex) => row.append(chip(label, chipIndex === 0)));
    node.append(row);
  }
  return node;
}

function comparison(items) {
  const picked = items.filter((item) => selected.has(item.id));
  if (picked.length < 2) return undefined;
  const section = element("section", "comparison");
  section.setAttribute("aria-labelledby", "comparison-title");
  const title = element("h2", "", "Side-by-side comparison");
  title.id = "comparison-title";
  section.append(title);
  const grid = element("div", "comparison-grid");
  grid.setAttribute("role", "list");
  grid.dataset.count = String(picked.length);
  const fields = [
    ["Location", (item) => item.meta || "Not provided"],
    ["Category", (item) => item.category || "Not provided"],
    ["Pearl context", (item) => item.detail || "Not provided"],
    ["Signal", (item) => item.score || item.status || "Not provided"],
  ];
  for (const item of picked) {
    const card = element("article", "comparison-card");
    card.setAttribute("role", "listitem");
    card.append(element("h3", "", item.name));
    const details = element("dl", "comparison-details");
    for (const [label, valueFor] of fields) {
      const row = element("div", "comparison-row");
      row.append(element("dt", "", label));
      row.append(element("dd", "comparison-value", valueFor(item)));
      details.append(row);
    }
    card.append(details);
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function profileContent(model) {
  const container = element("div", "profile-layout");
  if (model.metrics.length) {
    const metrics = element("section", "metrics-grid");
    metrics.setAttribute("aria-label", "Pearl profile statistics");
    for (const metric of model.metrics) {
      const card = element("article", "metric-card");
      card.append(element("strong", "metric-value", metric.value));
      card.append(element("span", "metric-label", metric.label));
      metrics.append(card);
    }
    container.append(metrics);
  }

  if (model.facets.length) {
    const facets = element("section", "facet-grid");
    facets.setAttribute("aria-label", "Pearl taste signals");
    for (const facet of model.facets) {
      const group = element("article", "facet-card");
      group.append(element("h2", "section-title", facet.label));
      const row = element("div", "chip-row");
      facet.values.forEach((value, index) => row.append(chip(value, index === 0)));
      group.append(row);
      facets.append(group);
    }
    container.append(facets);
  }

  if (model.topCities.length) {
    const cities = element("section", "profile-section");
    cities.append(element("h2", "section-title", "Most visited cities"));
    const list = element("div", "rank-list");
    for (const city of model.topCities) {
      const row = element("div", "rank-row");
      row.append(element("span", "rank-name", city.city));
      if (city.count) row.append(element("span", "rank-value", `${city.count} visit${city.count === "1" ? "" : "s"}`));
      list.append(row);
    }
    cities.append(list);
    container.append(cities);
  }

  if (model.items.length) {
    const favorites = element("section", "profile-section");
    favorites.append(element("h2", "section-title", "Top-rated visits"));
    const grid = element("div", "results-grid");
    grid.dataset.density = model.items.length >= 3 ? "wide" : "regular";
    model.items.forEach((item, index) => grid.append(itemCard(item, index, false)));
    favorites.append(grid);
    container.append(favorites);
  }

  if (model.allergies.length) {
    const allergyCopy = `Allergies on file: ${model.allergies.join(", ")}.`;
    container.append(banner(allergyCopy));
  }

  const questions = element("section", "profile-questions");
  questions.append(element("h2", "section-title", "Ask Pearl about your taste"));
  questions.append(element("p", "toolbar-copy", "Each question stays scoped to your own Pearl profile."));
  const actions = element("div", "question-actions");
  const prompts = [
    ["Strongest patterns", "What are the strongest patterns in my Pearl taste profile?"],
    ["Cuisines and dishes", "What cuisines and dishes define my Pearl taste?"],
    ["Travel footprint", "What does my Pearl travel footprint say about my taste?"],
    ["Stretch my taste", "Use my Pearl taste profile to recommend something that would stretch my preferences."],
  ];
  for (const [label, prompt] of prompts) {
    const action = button(label, () => sendFixedHostMessage(prompt, action), "secondary");
    actions.append(action);
  }
  questions.append(actions);
  container.append(questions);
  return container;
}

function loadingPanel() {
  const panel = element("section", "panel");
  panel.setAttribute("aria-busy", "true");
  panel.append(header({ title: "Pearl is gathering the details", subtitle: "This result will update here when the tool finishes.", state: "loading" }));
  const content = element("div", "content");
  const grid = element("div", "skeleton-grid");
  for (let index = 0; index < 3; index += 1) grid.append(element("div", "skeleton"));
  content.append(grid);
  panel.append(content);
  return panel;
}

async function recover(model, actionButton) {
  actionButton.disabled = true;
  actionButton.textContent = "Working…";
  const tool = hostState.context?.toolInfo?.tool;
  const canRetryRead = model.error?.userAction === "retry"
    && tool?.annotations?.readOnlyHint === true
    && typeof tool.name === "string"
    && hostState.toolInput
    && typeof hostState.toolInput === "object";
  try {
    if (canRetryRead) {
      showLoading();
      const result = await request("tools/call", { name: tool.name, arguments: hostState.toolInput }, 20_000);
      receiveResult(result);
      return;
    }
    await request("ui/message", {
      role: "user",
      content: [{ type: "text", text: recoveryPrompt(model.error) }],
    });
    announce("Sent a recovery request to the host.");
    actionButton.textContent = "Request sent";
  } catch {
    actionButton.disabled = false;
    actionButton.textContent = "Try again";
    announce("The host could not start recovery. Continue in the conversation.");
  }
}

function errorContent(model) {
  const node = element("div", "error-state");
  node.append(element("p", "", model.subtitle));
  if (model.error.requiredScope) {
    node.append(element("p", "scope-note", `Required access: ${model.error.requiredScope}`));
  }
  const label = model.error.userAction === "reconnect" ? "Reconnect"
    : model.error.userAction === "grant_scope" ? "Request read access"
    : "Try again";
  const action = button(label, () => recover(model, action));
  node.append(action);
  return node;
}

function emptyContent(model) {
  const node = element("div", "empty-state");
  node.append(element("h2", "", "No matching results yet"));
  node.append(element("p", "", model.subtitle));
  const action = button("Refine in chat", async () => {
    try {
      await request("ui/message", {
        role: "user",
        content: [{ type: "text", text: "Help me refine this Pearl search with a useful next question." }],
      });
      announce("Asked the host to refine the search.");
    } catch {
      announce("Continue in the conversation to refine this search.");
    }
  }, "secondary");
  node.append(action);
  return node;
}

let currentModel;

function renderCurrent() {
  if (!currentModel) return;
  const model = currentModel;
  const panel = element("section", "panel");
  panel.append(header(model));
  if (model.partial) panel.append(banner("Some results could not be loaded. The available items are still shown below."));
  const content = element("div", "content");
  if (model.state === "error") {
    content.append(errorContent(model));
  } else if (model.state === "empty") {
    content.append(emptyContent(model));
  } else if (model.kind === "profile") {
    content.append(profileContent(model));
  } else {
    if (model.kind === "venues") {
      const toolbar = element("div", "toolbar");
      toolbar.append(element("p", "toolbar-copy", selected.size < 2
        ? "Select two or three places to compare."
        : `${selected.size} places selected.`));
      if (selected.size) {
        toolbar.append(button("Clear selection", () => {
          selected.clear();
          renderCurrent();
          announce("Comparison selection cleared.");
        }, "secondary"));
      }
      content.append(toolbar);
    }
    const grid = element("div", "results-grid");
    grid.dataset.density = model.items.length >= 3 ? "wide" : "regular";
    model.items.forEach((item, index) => grid.append(itemCard(item, index, model.kind === "venues")));
    content.append(grid);
    const compare = model.kind === "venues" ? comparison(model.items) : undefined;
    if (compare) content.append(compare);
  }
  panel.append(content);
  root.replaceChildren(panel);
}

function showLoading() {
  currentModel = undefined;
  root.replaceChildren(loadingPanel());
  announce("Pearl is loading results.");
}

function receiveResult(result) {
  hostState.toolResultReceived = true;
  selected.clear();
  currentModel = normalizeToolResult(result);
  renderCurrent();
  announce(currentModel.state === "error"
    ? currentModel.title
    : currentModel.kind === "profile"
      ? "Your Pearl taste profile is ready."
      : `${currentModel.items.length} Pearl result${currentModel.items.length === 1 ? "" : "s"} ready.`);
}

const allowedHostStyleKeys = new Set([
  "--color-background-primary", "--color-background-secondary", "--color-background-tertiary",
  "--color-text-primary", "--color-text-secondary", "--color-text-danger", "--color-text-success", "--color-text-warning",
  "--color-border-primary", "--color-border-secondary", "--color-ring-primary", "--font-sans",
  "--border-radius-sm", "--border-radius-md", "--border-radius-lg", "--shadow-sm",
]);

function applyHostContext(next = {}) {
  if (!next || typeof next !== "object") return;
  hostState.context = { ...hostState.context, ...next };
  const theme = hostState.context.theme;
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  const variables = hostState.context.styles?.variables;
  if (variables && typeof variables === "object") {
    for (const [key, value] of Object.entries(variables)) {
      if (allowedHostStyleKeys.has(key) && typeof value === "string" && value.length <= 300) {
        document.documentElement.style.setProperty(key, value);
      }
    }
  }
  const insets = hostState.context.safeAreaInsets;
  if (insets && typeof insets === "object") {
    for (const side of ["top", "right", "bottom", "left"]) {
      const value = Number(insets[side]);
      if (Number.isFinite(value) && value >= 0 && value <= 120) {
        document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
      }
    }
  }
}

function handleNotification(message) {
  if (message.method === "ui/notifications/tool-input") {
    hostState.toolInput = message.params?.arguments && typeof message.params.arguments === "object"
      ? message.params.arguments
      : message.params;
  } else if (message.method === "ui/notifications/tool-input-partial") {
    if (!hostState.toolResultReceived) showLoading();
  } else if (message.method === "ui/notifications/tool-result") {
    receiveResult(message.params);
  } else if (message.method === "ui/notifications/tool-cancelled") {
    receiveResult({ isError: true, structuredContent: { error: { code: "cancelled", message: "This Pearl request was cancelled.", user_action: "retry" } } });
  } else if (message.method === "ui/notifications/host-context-changed") {
    applyHostContext(message.params);
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !safeMessage(event.data)) return;
  const message = event.data;
  if (message.id !== undefined && pending.has(message.id) && message.method === undefined) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    window.clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error("Host request failed"));
    else entry.resolve(message.result);
    return;
  }
  if (typeof message.method === "string" && message.id === undefined) {
    handleNotification(message);
    return;
  }
  if (message.id !== undefined && message.method === "ping") {
    respond(message.id, {});
  } else if (message.id !== undefined && message.method === "ui/resource-teardown") {
    sizeObserver?.disconnect();
    respond(message.id, {});
  } else if (message.id !== undefined && typeof message.method === "string") {
    respondError(message.id, -32601, "Method not found");
  }
}, { passive: true });

function observeSize() {
  if (!("ResizeObserver" in window)) return;
  let scheduled = false;
  let last = "";
  sizeObserver = new ResizeObserver(() => {
    if (scheduled || !hostState.connected) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      const width = Math.ceil(document.documentElement.getBoundingClientRect().width);
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      const signature = `${width}x${height}`;
      if (signature === last || width < 1 || height < 1) return;
      last = signature;
      notify("ui/notifications/size-changed", { width, height });
    });
  });
  sizeObserver.observe(document.documentElement);
  sizeObserver.observe(document.body);
}

function receiveCompatibilityToolOutput() {
  if (hostState.toolResultReceived) return true;
  const output = typeof window.openai === "object" ? window.openai?.toolOutput : undefined;
  if (!output || typeof output !== "object") return false;
  receiveResult({ structuredContent: output });
  return true;
}

function pollCompatibilityToolOutput() {
  let remainingChecks = 20;
  const check = () => {
    if (receiveCompatibilityToolOutput() || remainingChecks <= 0) return;
    remainingChecks -= 1;
    window.setTimeout(check, 250);
  };
  window.setTimeout(check, 0);
}

async function connect() {
  showLoading();
  try {
    const initialized = await request("ui/initialize", {
      appInfo: { name: "Pearl Concierge", version: "1.2.3" },
      appCapabilities: { availableDisplayModes: ["inline"] },
      protocolVersion: "2026-01-26",
    }, 5_000);
    if (!initialized || typeof initialized.protocolVersion !== "string" || !initialized.hostInfo) {
      throw new Error("Invalid MCP Apps initialize response");
    }
    applyHostContext(initialized.hostContext);
    hostState.connected = true;
    notify("ui/notifications/initialized");
    observeSize();
    // ChatGPT can finish an early parallel tool call before the MCP Apps
    // notification listener is ready. Its compatibility bridge retains that
    // result, so consume it only when the standard notification has not won.
    pollCompatibilityToolOutput();
  } catch {
    window.setTimeout(() => {
      if (hostState.toolResultReceived) return;
      if (receiveCompatibilityToolOutput()) return;
      receiveResult({
        isError: true,
        structuredContent: {
          error: {
            code: "host_bridge_unavailable",
            message: "This host did not complete the MCP Apps connection. The text result remains available in the conversation.",
            user_action: "revise_request",
          },
        },
      });
    }, 200);
  }
}

connect();
