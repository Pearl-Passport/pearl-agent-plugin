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

// Inline SVG icon set (see TOKENS.md). Decorative only: every icon is
// aria-hidden, stroked with currentColor, and built through safe DOM APIs.
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
  info: "M8 7.4v4.2M8 4.2v.2",
  alert: "M8 4.6v4.4M8 11.4v.2",
  check: "M3.6 8.5l2.9 2.9 6-6.8",
  compass: "M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8Zm2.7 3.5-1.9 3.5-3.5 1.9 1.9-3.5Z",
  calendar: "M3.2 3.4h9.6v9.2H3.2zM5.2 1.9v3M10.8 1.9v3M3.2 6.1h9.6",
  plane: "M2.2 9.1 7 7.8l2.3-4.9c.3-.6 1-.9 1.6-.6.6.2.9.9.7 1.5L10.2 7l3.6-1c.7-.2 1.4.2 1.6.9.2.6-.2 1.3-.8 1.5l-4.1 1.4-1 3.3-1.3.4-.2-3-3.1 1z",
  pin: "M8 14s4-4.5 4-8A4 4 0 1 0 4 6c0 3.5 4 8 4 8Zm0-6.1A1.9 1.9 0 1 0 8 4a1.9 1.9 0 0 0 0 3.9Z",
  reservation: "M3 2.5h10v11H3zM5.2 5h5.6M5.2 7.7h5.6M5.2 10.4h3.3",
  suitcase: "M2.5 5h11v8h-11zM5.5 5V3.4h5V5M2.5 8.2h11M5.2 7v2.3M10.8 7v2.3",
};

function svgCircle(cx, cy, r, opacity) {
  const node = document.createElementNS(SVG_NS, "circle");
  node.setAttribute("cx", String(cx));
  node.setAttribute("cy", String(cy));
  node.setAttribute("r", String(r));
  node.setAttribute("fill", "currentColor");
  if (opacity) node.setAttribute("opacity", opacity);
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon");
  if (name === "pearl") {
    const glint = document.createElementNS(SVG_NS, "circle");
    glint.setAttribute("cx", "6.7");
    glint.setAttribute("cy", "6.5");
    glint.setAttribute("r", "1.1");
    glint.setAttribute("fill", "#fff");
    glint.setAttribute("opacity", "0.75");
    svg.append(svgCircle(8, 8, 6.4, "0.22"), svgCircle(8, 8, 3.7), glint);
    return svg;
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.info);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function stateIcon(name) {
  const badge = element("span", "state-icon");
  badge.setAttribute("aria-hidden", "true");
  badge.append(icon(name));
  return badge;
}

// Deterministic brand-safe fallback artwork: a category-tinted
// gradient tile with the venue initial. Categories map to the canonical Pearl
// category palette; unknown categories hash the name to a stable palette slot.
const CATEGORY_PALETTES = [
  ["restaurant", "dining", "bistro", "brasserie", "steak", "sushi", "omakase"],
  ["bar", "cocktail", "pub", "lounge", "speakeasy"],
  ["hotel", "stay", "resort", "inn"],
  ["winery", "wine", "vineyard"],
  ["cafe", "coffee", "bakery", "patisserie"],
  ["spa", "wellness", "club"],
];

function paletteIndex(item) {
  const category = String(item.category || "").toLowerCase();
  for (const [index, keywords] of CATEGORY_PALETTES.entries()) {
    if (keywords.some((keyword) => category.includes(keyword))) return index;
  }
  const name = String(item.name || "");
  let hash = 0;
  for (let index = 0; index < Math.min(name.length, 24); index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 6;
  }
  return hash;
}

function mediaFigure(item, compact = false) {
  const figure = element("figure", compact ? "media compact" : "media");
  const fallback = element("div", "media-fallback");
  fallback.setAttribute("aria-hidden", "true");
  fallback.dataset.palette = String(paletteIndex(item));
  const initial = String(item.name || "").trim().charAt(0);
  fallback.append(element("span", "media-initial", initial ? initial.toUpperCase() : "·"));
  figure.append(fallback);
  if (item.image && item.image.src) {
    const image = document.createElement("img");
    image.className = "media-image";
    // The card title carries the venue name; the photo itself is decorative.
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    const credit = item.image.attribution
      ? element("figcaption", "media-credit", `Photo: ${item.image.attribution}`)
      : undefined;
    // A missing/broken/oversized/redirected image never delays the card: the
    // fallback tile is already painted and the failed image (plus its
    // attribution) simply drops out.
    image.addEventListener("error", () => {
      image.remove();
      if (credit) credit.remove();
    }, { once: true });
    image.src = item.image.src;
    figure.append(image);
    if (credit) figure.append(credit);
  }
  return figure;
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
  const eyebrow = element("p", "eyebrow");
  eyebrow.append(icon("pearl"), element("span", "", "Pearl concierge"));
  copy.append(eyebrow);
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
  const mark = element("span", "status-mark");
  mark.setAttribute("aria-hidden", "true");
  mark.append(icon(tone === "danger" ? "alert" : tone === "success" ? "check" : "info"));
  node.append(mark);
  node.append(element("p", "status-copy", message));
  return node;
}

function chip(label, accent = false) {
  return element("span", `chip${accent ? " accent" : ""}`, label);
}

function itemCard(item, index, selectable, showMedia = false) {
  const node = element(selectable ? "button" : "article", "result-card");
  const titleId = `result-title-${index}`;
  if (showMedia) node.append(mediaFigure(item));
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

function readableStatus(value) {
  const clean = String(value || "").trim().replaceAll("_", " ").replaceAll("-", " ");
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Status unknown";
}

function journeyKindIcon(kind) {
  if (kind === "flight") return "plane";
  if (kind === "reservation") return "reservation";
  return "suitcase";
}

function journeyStatus(value) {
  const raw = String(value || "unknown").toLowerCase();
  const label = element("span", "status-pill", readableStatus(raw));
  label.dataset.status = raw;
  label.setAttribute("aria-label", `Status: ${readableStatus(raw)}`);
  return label;
}

function journeyFacts(facts) {
  if (!Array.isArray(facts) || !facts.length) return undefined;
  const list = element("dl", "journey-facts");
  for (const fact of facts.slice(0, 6)) {
    if (!fact?.label || !fact?.value) continue;
    const row = element("div", "journey-fact");
    row.append(element("dt", "", fact.label));
    row.append(element("dd", "", fact.value));
    list.append(row);
  }
  return list.childElementCount ? list : undefined;
}

function routeStrip(item) {
  const origin = item.route?.origin;
  const destination = item.route?.destination;
  if (!origin && !destination) return undefined;
  const route = element("div", "route-strip");
  route.setAttribute("aria-label", `Flight route from ${origin || "unknown origin"} to ${destination || "unknown destination"}`);
  const endpoint = (code, label, timezone) => {
    const node = element("div", "route-endpoint");
    node.append(element("strong", "route-code", code || "—"));
    node.append(element("span", "route-time", label || "Time not provided"));
    if (timezone) node.append(element("span", "route-zone", timezone));
    return node;
  };
  route.append(endpoint(origin, item.start, item.departureZone));
  const line = element("div", "route-line");
  line.setAttribute("aria-hidden", "true");
  line.append(icon("plane"));
  route.append(line);
  route.append(endpoint(destination, item.end, item.arrivalZone));
  return route;
}

function stopList(stops) {
  if (!Array.isArray(stops) || !stops.length) return undefined;
  const groups = new Map();
  for (const stop of stops) {
    const key = stop.day || "Date not scheduled";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(stop);
  }
  const container = element("div", "journey-days");
  for (const [day, dayStops] of groups) {
    const section = element("section", "journey-day");
    const heading = element("h3", "journey-day-title", day);
    const dayId = `journey-day-${container.childElementCount}`;
    heading.id = dayId;
    section.setAttribute("aria-labelledby", dayId);
    section.append(heading);
    const list = element("ol", "journey-stops");
    for (const stop of dayStops) {
      const entry = element("li", "journey-stop");
      const marker = element("span", "stop-marker");
      marker.setAttribute("aria-hidden", "true");
      marker.append(icon(stop.category?.toLowerCase().includes("flight") ? "plane" : "pin"));
      const copy = element("div", "stop-copy");
      const headingRow = element("div", "stop-heading");
      headingRow.append(element("strong", "stop-name", stop.name));
      if (stop.isBackup) headingRow.append(chip("Backup"));
      copy.append(headingRow);
      const meta = [stop.time, stop.city].filter(Boolean).join(" · ");
      if (meta) copy.append(element("p", "stop-meta", meta));
      if (stop.detail) copy.append(element("p", "stop-detail", stop.detail));
      const labels = [stop.category, stop.status ? readableStatus(stop.status) : ""].filter(Boolean);
      if (labels.length) {
        const row = element("div", "chip-row");
        labels.forEach((label, index) => row.append(chip(label, index === 0)));
        copy.append(row);
      }
      entry.append(marker, copy);
      list.append(entry);
    }
    section.append(list);
    container.append(section);
  }
  return container;
}

function journeyCard(item, index) {
  const card = element("article", "journey-card");
  card.dataset.kind = item.journeyType || "trip";
  const titleId = `journey-title-${index}`;
  card.setAttribute("aria-labelledby", titleId);
  const heading = element("div", "journey-heading");
  const identity = element("div", "journey-identity");
  const mark = element("span", "journey-mark");
  mark.setAttribute("aria-hidden", "true");
  mark.append(icon(journeyKindIcon(item.journeyType)));
  const copy = element("div", "journey-title-copy");
  copy.append(element("span", "journey-kicker", readableStatus(item.category || "Journey")));
  const title = element("h2", "journey-title", item.name);
  title.id = titleId;
  copy.append(title);
  identity.append(mark, copy);
  heading.append(identity, journeyStatus(item.status));
  card.append(heading);

  if (item.journeyType === "flight") {
    const route = routeStrip(item);
    if (route) card.append(route);
  } else {
    const schedule = [item.start && item.end ? `${item.start} → ${item.end}` : item.start, item.time, item.location]
      .filter(Boolean).join(" · ");
    if (schedule) {
      const row = element("p", "journey-schedule");
      row.append(icon("calendar"), element("span", "", schedule));
      card.append(row);
    }
  }

  if (item.detail) card.append(element("p", "journey-detail", item.detail));
  const facts = journeyFacts(item.facts);
  if (facts) card.append(facts);
  if (item.score) card.append(element("p", "journey-price", item.score));
  const stops = stopList(item.stops);
  if (stops) card.append(stops);

  if (item.journeyType === "flight") {
    const provenance = element("footer", "journey-provenance");
    provenance.append(element("span", "", `Source: ${item.source || "Pearl"}`));
    if (item.freshness) provenance.append(element("span", "", `${item.freshnessLabel || "Updated"}: ${item.freshness}`));
    provenance.append(element("span", "", "Read only · confirm fare and availability before booking"));
    card.append(provenance);
  }
  return card;
}

function journeyContent(model) {
  const container = element("div", "journey-layout");
  let cardIndex = 0;
  const reservationsOnly = model.items.length > 1
    && model.items.every((item) => item.journeyType === "reservation");
  if (!reservationsOnly) {
    const list = element("div", "journey-list");
    list.setAttribute("role", "list");
    model.items.forEach((item) => {
      const card = journeyCard(item, cardIndex++);
      card.setAttribute("role", "listitem");
      list.append(card);
    });
    container.append(list);
    return container;
  }

  const groups = new Map();
  for (const item of model.items) {
    const key = item.start || "Date not provided";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const [day, items] of groups) {
    const section = element("section", "journey-group");
    const heading = element("h2", "journey-group-title", day);
    const groupId = `journey-group-${container.childElementCount}`;
    heading.id = groupId;
    section.setAttribute("aria-labelledby", groupId);
    section.append(heading);
    const list = element("div", "journey-list");
    list.setAttribute("role", "list");
    items.forEach((item) => {
      const card = journeyCard(item, cardIndex++);
      card.setAttribute("role", "listitem");
      list.append(card);
    });
    section.append(list);
    container.append(section);
  }
  return container;
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
    if (item.image && item.image.src) card.append(mediaFigure(item, true));
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

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percentage(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(value)
    : "";
}

function evidenceRow(evidence, label = "Evidence") {
  if (!evidence) return undefined;
  const values = [
    evidence.confidence ? `${titleCase(evidence.confidence)} confidence` : "",
    evidence.coverage ? `${titleCase(evidence.coverage)} coverage` : "",
    evidence.freshness ? `${titleCase(evidence.freshness)} freshness` : "",
    evidence.asOf ? `As of ${evidence.asOf}` : "",
    evidence.sampleSize !== undefined ? `${evidence.sampleSize} signals` : "",
  ].filter(Boolean);
  if (!values.length) return undefined;
  const row = element("p", "evidence-row");
  row.setAttribute("aria-label", label);
  values.forEach((value, index) => {
    if (index) row.append(element("span", "evidence-separator", "·"));
    row.append(element("span", "", value));
  });
  return row;
}

function insightCard(title, insight, headline, facts = []) {
  const card = element("article", "taste-insight-card");
  card.append(element("h3", "insight-title", title));
  if (headline) card.append(element("strong", "insight-value", headline));
  if (insight?.detail) card.append(element("p", "insight-detail", insight.detail));
  const returnedFacts = facts.filter(([, value]) => value !== "" && value !== undefined);
  if (returnedFacts.length) {
    const list = element("dl", "insight-facts");
    for (const [label, value] of returnedFacts) {
      const row = element("div", "insight-fact");
      row.append(element("dt", "", label), element("dd", "", value));
      list.append(row);
    }
    card.append(list);
  }
  const evidence = evidenceRow(insight?.evidence, `${title} evidence`);
  if (evidence) card.append(evidence);
  return card;
}

function analyticsContent(analytics) {
  const fragment = document.createDocumentFragment();
  const evidence = element("section", "profile-section taste-evidence");
  evidence.append(element("h2", "section-title", "Taste evidence"));
  const summary = element("div", "evidence-summary");
  const summaryValues = [
    analytics.confidence.label ? ["Confidence", titleCase(analytics.confidence.label)] : undefined,
    analytics.coverage.state ? ["Coverage", titleCase(analytics.coverage.state)] : undefined,
    analytics.overallEvidence?.freshness ? ["Freshness", titleCase(analytics.overallEvidence.freshness)] : undefined,
  ].filter(Boolean);
  for (const [label, value] of summaryValues) {
    const item = element("div", "evidence-summary-item");
    item.append(element("span", "evidence-label", label), element("strong", "evidence-value", value));
    summary.append(item);
  }
  if (summaryValues.length) evidence.append(summary);
  if (analytics.confidence.explanation) evidence.append(element("p", "insight-detail", analytics.confidence.explanation));
  const overall = evidenceRow(analytics.overallEvidence, "Overall taste evidence freshness");
  if (overall) evidence.append(overall);
  else if (analytics.generatedAt) evidence.append(element("p", "evidence-row", `Generated ${analytics.generatedAt}`));
  fragment.append(evidence);

  if (analytics.strongestPatterns.length) {
    const patterns = element("section", "profile-section");
    patterns.append(element("h2", "section-title", "Strongest patterns"));
    const grid = element("div", "taste-pattern-grid");
    grid.setAttribute("role", "list");
    for (const pattern of analytics.strongestPatterns) {
      const card = element("article", "taste-pattern-card");
      card.setAttribute("role", "listitem");
      if (pattern.kind) card.append(element("span", "pattern-kind", pattern.kind));
      card.append(element("h3", "insight-title", pattern.label));
      if (pattern.detail) card.append(element("p", "insight-detail", pattern.detail));
      const patternEvidence = evidenceRow(pattern.evidence, `${pattern.label} evidence`);
      if (patternEvidence) card.append(patternEvidence);
      grid.append(card);
    }
    patterns.append(grid);
    fragment.append(patterns);
  }

  const insightGrid = element("section", "taste-insight-grid");
  insightGrid.setAttribute("aria-label", "Pearl taste analytics");
  if (analytics.travel) {
    const headline = analytics.travel.citiesVisited === undefined
      ? ""
      : `${analytics.travel.citiesVisited} ${analytics.travel.citiesVisited === 1 ? "city" : "cities"}`;
    const topCities = analytics.travel.topCities.map((city) => `${city.city} (${city.count})`).join(", ");
    insightGrid.append(insightCard("Travel footprint", analytics.travel, headline, [["Top cities", topCities]]));
  }
  if (analytics.revisit) {
    const headline = analytics.revisit.repeatVisits === undefined
      ? ""
      : `${analytics.revisit.repeatVisits} repeat ${analytics.revisit.repeatVisits === 1 ? "visit" : "visits"}`;
    insightGrid.append(insightCard("Revisit behavior", analytics.revisit, headline, [
      ["Unique venues", analytics.revisit.uniqueVenues],
      ["Repeat share", percentage(analytics.revisit.repeatShare)],
    ]));
  }
  if (analytics.exploration) {
    insightGrid.append(insightCard("Exploration style", analytics.exploration, analytics.exploration.classification, [
      ["Unique venue share", percentage(analytics.exploration.uniqueVenueShare)],
      ["Cities", analytics.exploration.citiesVisited],
    ]));
  }
  if (analytics.savesToVisits) {
    const headline = analytics.savesToVisits.ratio === undefined
      ? ""
      : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(analytics.savesToVisits.ratio)} saves per visit`;
    insightGrid.append(insightCard("Saves to visits", analytics.savesToVisits, headline, [
      ["Saved places", analytics.savesToVisits.savedCount],
      ["Visits", analytics.savesToVisits.totalVisits],
    ]));
  }
  if (insightGrid.childElementCount) fragment.append(insightGrid);

  if (analytics.constraints.length) {
    const constraints = element("section", "profile-section taste-constraints");
    constraints.append(element("h2", "section-title", "Returned constraints"));
    constraints.append(element("p", "toolbar-copy", "Use these member-provided constraints when evaluating a relevant venue; accommodation is not guaranteed."));
    const list = element("div", "constraint-list");
    for (const constraint of analytics.constraints) {
      const item = element("article", "constraint-item");
      item.append(element("strong", "", constraint.label));
      if (constraint.detail) item.append(element("p", "insight-detail", constraint.detail));
      const constraintEvidence = evidenceRow(constraint.evidence, `${constraint.label} constraint evidence`);
      if (constraintEvidence) item.append(constraintEvidence);
      list.append(item);
    }
    constraints.append(list);
    fragment.append(constraints);
  }
  return fragment;
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

  if (model.analytics) container.append(analyticsContent(model.analytics));

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

  if (!model.analytics && model.allergies.length) {
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
  node.append(stateIcon("alert"));
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
  node.append(stateIcon("compass"));
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
  } else if (model.kind === "journeys" || model.kind === "flights") {
    content.append(journeyContent(model));
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
    model.items.forEach((item, index) => grid.append(itemCard(item, index, model.kind === "venues", model.kind === "venues")));
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
  const displayMode = hostState.context.displayMode;
  if (["inline", "fullscreen", "pip"].includes(displayMode)) document.documentElement.dataset.displayMode = displayMode;
  const platform = hostState.context.platform;
  if (["web", "desktop", "mobile"].includes(platform)) document.documentElement.dataset.platform = platform;
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
      appInfo: { name: "Pearl Concierge", version: "1.4.0" },
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
