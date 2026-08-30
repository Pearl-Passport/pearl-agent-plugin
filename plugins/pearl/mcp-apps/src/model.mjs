const MAX_ITEMS = 18;
const MAX_TEXT = 240;
// Venue imagery is accepted only from Pearl's reviewed origin.
// Everything else — other origins, lookalike hosts, query strings, fragments,
// credentials, unexpected characters — fails closed to the deterministic
// brand-safe fallback artwork. Keep in sync with PEARL_MCP_APP_IMAGE_ORIGIN
// (integration.mjs) and the document CSP img-src (scripts/build.mjs).
const IMAGE_ORIGIN_PREFIX = "https://agent.joinpearl.co/";
const IMAGE_PATH_PATTERN = /^[A-Za-z0-9/_\-.]{1,400}$/;
const IMAGE_KEYS = ["image", "hero_image", "photo", "thumbnail", "primary_photo"];
const IMAGE_LIST_KEYS = ["photos", "images", "gallery"];
const PUBLIC_READ_SCOPES = new Set([
  "venues:read",
  "profile:read",
  "visits:read",
  "saves:read",
  "friends:read",
  "trips:read",
  "reservations:read",
]);
const SAFE_USER_ACTIONS = new Set(["reconnect", "grant_scope", "revise_request", "retry"]);
const RECOVERY_PROMPTS = Object.freeze({
  reconnect: "Reconnect Pearl, then retry my previous request.",
  grant_scope: "Reconnect Pearl, approve the required read access, then retry my previous request.",
  revise_request: "Help me revise the previous Pearl request.",
  retry: "Retry my previous Pearl request.",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, limit = MAX_TEXT) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  const bounded = (typeof value === "string" ? value : String(value)).slice(0, limit);
  return bounded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, limit);
}

function firstText(source, keys, limit = MAX_TEXT) {
  const sources = Array.isArray(source) ? source.slice(0, 3) : [source];
  for (const key of keys) {
    for (const candidate of sources) {
      const value = cleanText(candidate?.[key], limit);
      if (value) return value;
    }
  }
  return "";
}

function firstScalar(source, keys, previewLimit) {
  const sources = Array.isArray(source) ? source.slice(0, 3) : [source];
  for (const key of keys) {
    for (const candidate of sources) {
      const value = candidate?.[key];
      if ((typeof value === "string" || typeof value === "number") && cleanText(value, previewLimit)) return value;
    }
  }
  return undefined;
}

function firstNumber(source, keys) {
  const sources = Array.isArray(source) ? source.slice(0, 3) : [source];
  for (const key of keys) {
    for (const candidate of sources) {
      const value = candidate?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value !== "string" || value.length > 64) continue;
      const bounded = value.slice(0, 64).trim();
      if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(bounded)) continue;
      const parsed = Number(bounded);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function arrayAt(source, key) {
  return Array.isArray(source?.[key]) ? source[key].slice(0, MAX_ITEMS) : [];
}

function stringListAt(source, key, limit = 8) {
  if (!Array.isArray(source?.[key])) return [];
  const values = [];
  const seen = new Set();
  for (const raw of source[key].slice(0, Math.min(MAX_ITEMS, limit * 2))) {
    const value = cleanText(raw, 80);
    const identity = value.toLocaleLowerCase();
    if (!value || seen.has(identity)) continue;
    seen.add(identity);
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function formatNumber(value, maximumFractionDigits = 1) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function formatPrice(source) {
  const rawDirect = firstScalar(source, ["price", "total_price", "amount", "display_price"], 64);
  const direct = typeof rawDirect === "string" && rawDirect.length > 64 ? "" : cleanText(rawDirect, 64);
  if (direct && /[^0-9.,\s-]/.test(direct)) return direct;
  const amount = firstNumber(source, ["price", "total_price", "amount", "total_amount"]);
  if (amount === undefined) return direct;
  const currency = firstText(source, ["currency", "currency_code"], 8).toUpperCase();
  try {
    if (/^[A-Z]{3}$/.test(currency)) {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    }
  } catch {
    // Fall through to a bounded, locale-safe number.
  }
  return `${currency ? `${currency} ` : ""}${formatNumber(amount, 2)}`;
}

function formatMinorPrice(source) {
  const sources = Array.isArray(source) ? source.slice(0, 3) : [source];
  for (const candidate of sources) {
    if (!isRecord(candidate)) continue;
    const price = isRecord(candidate.price) ? candidate.price : {};
    const amountMinor = firstNumber([price, candidate], ["amount_minor", "total_amount_minor", "total_amount_cents"]);
    const currency = firstText([price, candidate], ["currency", "total_currency"], 8).toUpperCase();
    if (amountMinor === undefined || !Number.isSafeInteger(amountMinor) || amountMinor < 0) continue;
    try {
      if (/^[A-Z]{3}$/.test(currency)) {
        const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
        const fractionDigits = Math.min(3, Math.max(0, formatter.resolvedOptions().maximumFractionDigits));
        return formatter.format(amountMinor / (10 ** fractionDigits));
      }
    } catch {
      // Fall through to an unambiguous bounded amount.
    }
    return `${currency ? `${currency} ` : ""}${formatNumber(amountMinor / 100, 2)}`;
  }
  return "";
}

function validDateParts(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function validClockParts(hour, minute, second = 0) {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function parseTemporal(value) {
  if (typeof value === "string" && value.length > 80) return { display: "", hasTime: false };
  const source = cleanText(value, 80);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/.exec(source);
  if (!match) {
    return { display: /^\d{4}-\d{2}-\d{2}/.test(source) ? "" : source, hasTime: false };
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hasTime = hourText !== undefined;
  const hour = hasTime ? Number(hourText) : 0;
  const minute = hasTime ? Number(minuteText) : 0;
  const second = secondText === undefined ? 0 : Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  if (!validDateParts(year, month, day)
    || (hasTime && !validClockParts(hour, minute, second))
    || offsetHour > 23
    || offsetMinute > 59) {
    return { display: "", hasTime: false };
  }
  let date;
  try {
    const dateValue = new Date(0);
    dateValue.setUTCHours(0, 0, 0, 0);
    dateValue.setUTCFullYear(year, month - 1, day);
    date = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(dateValue);
  } catch {
    date = `${yearText}-${monthText}-${dayText}`;
  }
  return { display: hasTime ? `${date} · ${hourText}:${minuteText}` : date, hasTime };
}

function formatTemporal(value) {
  return parseTemporal(value).display;
}

function formatClock(value) {
  if (typeof value === "string" && value.length > 40) return "";
  const source = cleanText(value, 40);
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(source);
  if (!match) return /^\d{2}:\d{2}/.test(source) ? "" : source;
  const [, hourText, minuteText, secondText] = match;
  if (!validClockParts(Number(hourText), Number(minuteText), secondText === undefined ? 0 : Number(secondText))) return "";
  return `${hourText}:${minuteText}`;
}

function uniqueEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries.slice(0, MAX_ITEMS)) {
    const value = isRecord(entry?.value) ? entry.value : undefined;
    if (!isRecord(value)) continue;
    const firstSlice = Array.isArray(value.slices) && isRecord(value.slices[0]) ? value.slices[0] : {};
    const firstSegment = Array.isArray(firstSlice.segments) && isRecord(firstSlice.segments[0])
      ? firstSlice.segments[0]
      : Array.isArray(value.segments) && isRecord(value.segments[0]) ? value.segments[0] : {};
    const namedKey = `${firstText(value, ["name", "title", "venue_name"], 120)}|${firstText(value, ["city", "destination"], 80)}`;
    const flightKey = [
      firstText([value, firstSlice, firstSegment], ["origin", "origin_iata", "departure_iata"], 8),
      firstText([value, firstSlice, firstSegment], ["destination", "destination_iata", "arrival_iata"], 8),
      firstText([value, firstSlice, firstSegment], ["departure_at", "departure_time", "scheduled_departure_at"], 80),
      firstText(value, ["airline", "owner_iata"], 40),
      firstNumber([isRecord(value.price) ? value.price : {}, value], ["amount_minor", "total_amount_minor", "total_amount_cents", "amount"]),
    ].filter(Boolean).join("|");
    const key = firstText(value, ["id", "location_id", "venue_id", "reservation_id", "trip_id", "collection_id", "offer_id", "booking_id", "slot_id"], 120)
      || (namedKey !== "|" ? namedKey : "")
      || flightKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ value, hint: cleanText(entry.hint, 24), group: cleanText(entry.group, 80) });
    if (result.length >= MAX_ITEMS) break;
  }
  return result;
}

function flattenGroups(groups) {
  const values = [];
  for (const group of groups.slice(0, 12)) {
    if (!isRecord(group)) continue;
    for (const key of ["venues", "items", "recommendations", "results"]) {
      for (const item of arrayAt(group, key)) {
        if (isRecord(item)) values.push({ value: item, group: firstText(group, ["title", "name", "label"], 80) });
      }
    }
  }
  return values;
}

function normalizeImage(source) {
  const sources = Array.isArray(source) ? source.slice(0, 3) : [source];
  const candidates = [];
  for (const record of sources) {
    if (!isRecord(record)) continue;
    for (const key of IMAGE_KEYS) {
      if (record[key] !== undefined) candidates.push(record[key]);
    }
    for (const key of IMAGE_LIST_KEYS) {
      if (Array.isArray(record[key]) && record[key].length) candidates.push(record[key][0]);
    }
  }
  for (const candidate of candidates.slice(0, 6)) {
    const value = typeof candidate === "string" ? { url: candidate } : isRecord(candidate) ? candidate : undefined;
    if (!value) continue;
    const url = typeof value.url === "string" ? value.url : typeof value.src === "string" ? value.src : "";
    if (!url || url.length > 500 || !url.startsWith(IMAGE_ORIGIN_PREFIX)) continue;
    // The path allowlist excludes "?", "#", "@", ":", "\\", and whitespace, so
    // mutable signed query material and credential tricks fail closed.
    if (!IMAGE_PATH_PATTERN.test(url.slice(IMAGE_ORIGIN_PREFIX.length))) continue;
    return {
      src: url,
      attribution: cleanText(value.attribution ?? value.credit ?? value.source, 80),
    };
  }
  return undefined;
}

function normalizeVenue(value, index, groupHint = "") {
  const nested = isRecord(value.venue) ? value.venue : isRecord(value.location) ? value.location : {};
  const sources = [value, nested];
  const score = firstNumber(sources, ["score", "rating", "match_score", "confidence", "pearl_score"]);
  const city = firstText(sources, ["city", "locality", "destination"], 90);
  const neighborhood = firstText(sources, ["neighborhood", "district"], 90);
  const category = firstText(sources, ["type", "venue_type", "category", "cuisine"], 80);
  const reason = firstText(sources, ["reason", "why", "recommendation_reason", "description", "summary"], 220);
  const name = firstText(sources, ["name", "title", "venue_name", "display_name"], 120) || `Venue ${index + 1}`;
  return {
    id: firstText(sources, ["id", "location_id", "venue_id", "reference"], 120) || `venue-${index}`,
    name,
    meta: [neighborhood, city].filter(Boolean).join(" · ") || firstText(sources, ["address", "country"], 130),
    detail: reason,
    category,
    group: firstText(sources, ["group_label"], 80) || groupHint,
    score: score === undefined ? "" : `${formatNumber(score)}${score <= 1 ? " match" : ""}`,
    status: firstText(sources, ["status", "opening_status", "availability"], 40).toLowerCase(),
    image: normalizeImage(sources),
  };
}

function normalizeJourney(value, index, kindHint) {
  const nested = isRecord(value.venue) ? value.venue : isRecord(value.location) ? value.location : {};
  const sources = [value, nested];
  const reservation = kindHint === "reservation" || Boolean(firstText(sources, ["reservation_id"], 120));
  const place = firstText(sources, ["venue_name", "location_name", "name", "title", "destination"], 120);
  const rawDate = firstScalar(sources, ["date", "start_date", "trip_start_date", "reservation_date", "reservation_at", "starts_at", "check_in"], 80);
  const temporal = parseTemporal(rawDate);
  const date = temporal.display;
  const endDate = formatTemporal(firstScalar(sources, ["end_date", "trip_end_date", "ends_at", "check_out"], 80));
  const time = temporal.hasTime ? "" : formatClock(firstScalar(sources, ["time", "reservation_time", "start_time"], 40));
  const city = firstText(sources, ["city", "destination", "locality"], 80);
  const people = firstNumber(sources, ["party_size", "guests", "travellers", "travelers"]);
  const status = firstText(sources, ["status", "reservation_status", "state"], 40).toLowerCase();
  const collectionType = firstText(sources, ["collection_type"], 40).toLowerCase();
  const category = reservation ? "Reservation" : collectionType === "trip" || kindHint === "trip" ? "Trip" : "Collection";
  const title = place || (reservation ? `Reservation ${index + 1}` : `${category} ${index + 1}`);
  const detail = firstText(sources, ["description", "notes", "summary", "confirmation_name"], 180);
  const stopCount = firstNumber(sources, ["stop_count", "item_count", "venue_count", "count"]);
  const journeyType = reservation ? "reservation" : category === "Trip" ? "trip" : "collection";
  const facts = [
    category ? { label: "Type", value: category } : undefined,
    city ? { label: "Location", value: city } : undefined,
    people !== undefined ? { label: "Party", value: `${formatNumber(people, 0)} ${people === 1 ? "guest" : "guests"}` } : undefined,
    stopCount !== undefined ? { label: "Stops", value: formatNumber(stopCount, 0) } : undefined,
  ].filter(Boolean);
  return {
    id: firstText(sources, ["id", "reservation_id", "trip_id", "collection_id"], 120) || `journey-${index}`,
    name: title,
    meta: [[date, endDate && endDate !== date ? endDate : ""].filter(Boolean).join(" → "), time, city].filter(Boolean).join(" · "),
    detail,
    category,
    group: people !== undefined
      ? `${formatNumber(people, 0)} ${people === 1 ? "guest" : "guests"}`
      : stopCount === undefined ? "" : `${formatNumber(stopCount, 0)} ${stopCount === 1 ? "stop" : "stops"}`,
    score: "",
    status,
    journeyType,
    start: date,
    end: endDate && endDate !== date ? endDate : "",
    time,
    location: city,
    facts,
    stops: [],
  };
}

function normalizeTripStop(value, index) {
  const nested = isRecord(value.venue) ? value.venue : isRecord(value.location) ? value.location : {};
  const sources = [value, nested];
  const date = formatTemporal(firstScalar(sources, ["scheduled_date", "date", "starts_at"], 80));
  const time = formatClock(firstScalar(sources, ["scheduled_time", "time", "start_time"], 40));
  const city = firstText(sources, ["city", "locality", "destination"], 80);
  const isBackup = value.is_backup === true;
  const name = firstText(sources, ["name", "venue_name", "title", "display_name"], 120)
    || `Unavailable place · stop ${index + 1}`;
  return {
    id: firstText(sources, ["item_id", "id", "location_id", "venue_id"], 120) || `stop-${index}`,
    name,
    meta: [date, time, city].filter(Boolean).join(" · "),
    detail: firstText(sources, ["notes", "description", "summary"], 180),
    category: firstText(sources, ["type", "venue_type", "category"], 60) || "Place",
    status: firstText(sources, ["status", "state"], 40).toLowerCase(),
    isBackup,
    day: date,
    time,
    city,
    image: normalizeImage(sources),
  };
}

function normalizeTripDetail(data) {
  if (!isRecord(data.collection) || !Array.isArray(data.venues)) return undefined;
  const collection = data.collection;
  const base = normalizeJourney(collection, 0, "trip");
  const stops = data.venues.slice(0, MAX_ITEMS)
    .map((value, index) => isRecord(value) ? normalizeTripStop(value, index) : undefined)
    .filter(Boolean);
  const count = firstNumber(data, ["count"]);
  const expectedCount = count === undefined
    ? stops.length
    : Math.min(1_000_000, Math.max(0, Math.floor(count)));
  const partial = data.partial === true
    || data.is_partial === true
    || data.coverage_state === "partial"
    || arrayAt(data, "warnings").length > 0
    || expectedCount > stops.length;
  const item = {
    ...base,
    group: `${expectedCount} ${expectedCount === 1 ? "stop" : "stops"}`,
    facts: base.facts.filter((fact) => fact.label !== "Stops").concat({ label: "Stops", value: formatNumber(expectedCount, 0) }),
    stops,
  };
  return {
    state: "ready",
    kind: "journeys",
    title: item.name,
    subtitle: firstText(data, ["message", "summary"], 200)
      || "A read-only view of this Pearl trip and its returned stops.",
    items: [item],
    partial,
  };
}

const TASTE_CONFIDENCE = new Set(["low", "medium", "high"]);
const TASTE_COVERAGE = new Set(["complete", "partial"]);
const TASTE_FRESHNESS = new Set(["live", "current", "stale", "unknown"]);
const TASTE_PATTERN_KINDS = new Set(["cuisine", "venue_type", "vibe", "occasion", "beverage", "dish"]);
const EXPLORATION_LABELS = Object.freeze({
  not_evaluated: "Not evaluated",
  insufficient_history: "Not enough history",
  broad_explorer: "Broad explorer",
  variety_seeking: "Variety seeking",
  repeat_favorites: "Repeat favorites",
  balanced: "Balanced",
});

function boundedInteger(source, keys, maximum = 1_000_000) {
  const value = firstNumber(source, keys);
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : undefined;
}

function boundedNumber(source, keys, maximum = 1_000_000) {
  const value = firstNumber(source, keys);
  return Number.isFinite(value) && value >= 0 && value <= maximum ? value : undefined;
}

function normalizeTasteEvidence(source) {
  if (!isRecord(source)) return undefined;
  const confidence = TASTE_CONFIDENCE.has(source.confidence) ? source.confidence : "";
  const coverage = TASTE_COVERAGE.has(source.coverage_state) ? source.coverage_state : "";
  const freshnessRecord = isRecord(source.freshness) ? source.freshness : {};
  const freshness = TASTE_FRESHNESS.has(freshnessRecord.state) ? freshnessRecord.state : "";
  const asOf = formatTemporal(freshnessRecord.as_of);
  const sampleSize = boundedInteger(source, ["sample_size"]);
  const evidenceSources = stringListAt(source, "evidence_sources", 4);
  if (!confidence && !coverage && !freshness && !asOf && sampleSize === undefined && !evidenceSources.length) return undefined;
  return { confidence, coverage, freshness, asOf, sampleSize, evidenceSources };
}

function normalizeTasteInsight(source) {
  if (!isRecord(source)) return undefined;
  return {
    detail: firstText(source, ["detail"], 240),
    evidence: normalizeTasteEvidence(source),
  };
}

function normalizeTasteAnalytics(source) {
  if (!isRecord(source)) return undefined;
  const confidenceSource = isRecord(source.confidence) ? source.confidence : {};
  const confidenceLabel = TASTE_CONFIDENCE.has(confidenceSource.label) ? confidenceSource.label : "";
  const confidence = {
    label: confidenceLabel,
    explanation: firstText(confidenceSource, ["explanation"], 240),
    governedVisits: boundedInteger(confidenceSource, ["governed_visit_count"]),
    governedSaves: boundedInteger(confidenceSource, ["governed_save_count"]),
    explicitPreferences: boundedInteger(confidenceSource, ["explicit_preference_count"]),
  };
  const coverageSource = isRecord(source.coverage) ? source.coverage : {};
  const coverage = {
    state: TASTE_COVERAGE.has(coverageSource.coverage_state) ? coverageSource.coverage_state : "",
    historyState: TASTE_COVERAGE.has(coverageSource.history_coverage_state) ? coverageSource.history_coverage_state : "",
    explorationState: TASTE_COVERAGE.has(coverageSource.exploration_history_coverage_state)
      ? coverageSource.exploration_history_coverage_state
      : "",
    authoritativeTotals: typeof coverageSource.authoritative_history_totals === "boolean"
      ? coverageSource.authoritative_history_totals
      : undefined,
    profileState: ["current", "stale", "unavailable"].includes(coverageSource.taste_profile_state)
      ? coverageSource.taste_profile_state
      : "",
  };
  const strongestPatterns = arrayAt(source, "strongest_patterns").slice(0, 6).map((value) => {
    if (!isRecord(value)) return undefined;
    const label = firstText(value, ["label"], 80);
    if (!label) return undefined;
    return {
      label,
      kind: TASTE_PATTERN_KINDS.has(value.kind) ? value.kind.replaceAll("_", " ") : "",
      detail: firstText(value, ["detail"], 240),
      evidence: normalizeTasteEvidence(value),
    };
  }).filter(Boolean);

  const travelSource = isRecord(source.travel_footprint) ? source.travel_footprint : undefined;
  const travelBase = normalizeTasteInsight(travelSource);
  const travel = travelSource ? {
    ...travelBase,
    citiesVisited: boundedInteger(travelSource, ["cities_visited"]),
    topCities: arrayAt(travelSource, "top_cities").slice(0, 5).map((value) => {
      if (!isRecord(value)) return undefined;
      const city = firstText(value, ["city"], 100);
      const count = boundedInteger(value, ["count"]);
      return city && count !== undefined ? { city, count } : undefined;
    }).filter(Boolean),
  } : undefined;
  const revisitSource = isRecord(source.revisit_behavior) ? source.revisit_behavior : undefined;
  const revisitBase = normalizeTasteInsight(revisitSource);
  const revisit = revisitSource ? {
    ...revisitBase,
    totalVisits: boundedInteger(revisitSource, ["total_visits"]),
    uniqueVenues: boundedInteger(revisitSource, ["unique_venues"]),
    repeatVisits: boundedInteger(revisitSource, ["repeat_visits"]),
    repeatShare: boundedNumber(revisitSource, ["repeat_visit_share"], 1),
  } : undefined;
  const savesSource = isRecord(source.saves_to_visits) ? source.saves_to_visits : undefined;
  const savesBase = normalizeTasteInsight(savesSource);
  const savesToVisits = savesSource ? {
    ...savesBase,
    savedCount: boundedInteger(savesSource, ["saved_count"]),
    totalVisits: boundedInteger(savesSource, ["total_visits"]),
    ratio: boundedNumber(savesSource, ["ratio"]),
  } : undefined;
  const explorationSource = isRecord(source.exploration) ? source.exploration : undefined;
  const explorationBase = normalizeTasteInsight(explorationSource);
  const explorationKey = cleanText(explorationSource?.classification, 40);
  const exploration = explorationSource ? {
    ...explorationBase,
    classification: EXPLORATION_LABELS[explorationKey] || "",
    uniqueVenueShare: boundedNumber(explorationSource, ["unique_venue_share"], 1),
    citiesVisited: boundedInteger(explorationSource, ["cities_visited"]),
    stretchSignals: arrayAt(explorationSource, "stretch_signals").slice(0, 3).map((value) => {
      if (!isRecord(value)) return undefined;
      const label = firstText(value, ["label"], 80);
      if (!label) return undefined;
      return { label, explanation: firstText(value, ["explanation"], 200) };
    }).filter(Boolean),
  } : undefined;
  const constraints = arrayAt(source, "constraints").slice(0, 10).map((value) => {
    if (!isRecord(value) || value.kind !== "allergy") return undefined;
    const label = firstText(value, ["label"], 80);
    if (!label) return undefined;
    return {
      label,
      detail: firstText(value, ["detail"], 240),
      evidence: normalizeTasteEvidence(value),
    };
  }).filter(Boolean);
  const rationaleSource = isRecord(source.recommendation_rationale) ? source.recommendation_rationale : undefined;
  const rationaleBase = normalizeTasteInsight(rationaleSource);
  const rationale = rationaleSource ? {
    ...rationaleBase,
    positiveSignals: stringListAt(rationaleSource, "positive_signals", 4),
    stretchSignals: arrayAt(rationaleSource, "stretch_signals").slice(0, 3).map((value) => {
      if (!isRecord(value)) return undefined;
      const label = firstText(value, ["label"], 80);
      if (!label) return undefined;
      return { label, explanation: firstText(value, ["explanation"], 200) };
    }).filter(Boolean),
  } : undefined;
  const generatedAt = formatTemporal(source.generated_at);
  const overallEvidence = rationale?.evidence
    || strongestPatterns.find((pattern) => pattern.evidence)?.evidence
    || travel?.evidence
    || revisit?.evidence
    || savesToVisits?.evidence
    || exploration?.evidence;
  const hasContent = confidence.label || confidence.explanation || coverage.state || strongestPatterns.length
    || travel || revisit || savesToVisits || exploration || constraints.length || rationale;
  if (!hasContent) return undefined;
  return {
    generatedAt,
    confidence,
    coverage,
    overallEvidence,
    strongestPatterns,
    travel,
    revisit,
    savesToVisits,
    exploration,
    constraints,
    rationale,
  };
}

function normalizeProfile(data) {
  if (!isRecord(data.taste_profile)) return undefined;
  const taste = data.taste_profile;
  const account = isRecord(data.profile) ? data.profile : {};
  const name = firstText([taste, account], ["name", "full_name", "username"], 100);
  const metricDefinitions = [
    ["Visits", firstNumber(taste, ["total_visits"])],
    ["Cities", firstNumber(taste, ["cities_visited"])],
    ["Saved places", firstNumber(taste, ["saved_count"])],
  ];
  const metrics = metricDefinitions
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => ({ label, value: formatNumber(value, 0) }));
  const facets = [
    ["Favorite cuisines", stringListAt(taste, "cuisines")],
    ["Favorite dishes", stringListAt(taste, "dishes")],
    ["Favorite drinks", stringListAt(taste, "beverages")],
    ["Venue types", stringListAt(taste, "favorite_types", 6)],
    ["Rarely chosen", stringListAt(taste, "avoided_types", 6)],
  ].filter(([, values]) => values.length).map(([label, values]) => ({ label, values }));
  const topCities = arrayAt(taste, "top_cities").map((item) => {
    if (!isRecord(item)) return undefined;
    const city = firstText(item, ["city", "name"], 80);
    if (!city) return undefined;
    const count = firstNumber(item, ["count", "visits"]);
    return { city, count: count === undefined ? "" : formatNumber(count, 0) };
  }).filter(Boolean).slice(0, 5);
  const topRated = arrayAt(taste, "top_rated").map((item, index) => {
    if (!isRecord(item)) return undefined;
    const venue = normalizeVenue(item, index);
    return venue.name ? venue : undefined;
  }).filter(Boolean).slice(0, 6);
  const allergies = stringListAt(taste, "allergies", 10);
  const analytics = normalizeTasteAnalytics(data.analytics);
  const lens = firstText(data, ["taste_lens"], 40).replaceAll("_", " ");
  const hasContent = metrics.length || facets.length || topCities.length || topRated.length || allergies.length || analytics || name;
  return {
    state: hasContent ? "ready" : "empty",
    kind: "profile",
    title: name ? `${name}'s taste profile` : "Your taste profile",
    subtitle: firstText(data, ["message", "summary"], 200)
      || "Taste signals and account activity from your Pearl profile.",
    items: topRated,
    metrics,
    facets,
    topCities,
    allergies,
    analytics,
    lens,
    partial: data.partial === true || arrayAt(data, "warnings").length > 0 || analytics?.coverage.state === "partial",
  };
}

function routeText(source) {
  const origin = firstText(source, ["origin", "origin_code", "departure_airport", "from"], 64);
  const destination = firstText(source, ["destination", "destination_code", "arrival_airport", "to"], 64);
  return origin && destination ? `${origin} → ${destination}` : origin || destination;
}

function normalizeFlight(value, index, kindHint) {
  const firstSlice = Array.isArray(value.slices) && isRecord(value.slices[0]) ? value.slices[0] : {};
  const sliceSegments = Array.isArray(firstSlice.segments) ? firstSlice.segments.slice(0, 8) : [];
  const directSegments = Array.isArray(value.segments) ? value.segments.slice(0, 8) : [];
  const segments = (sliceSegments.length ? sliceSegments : directSegments).filter(isRecord);
  const firstSegment = segments[0] || {};
  const lastSegment = segments[segments.length - 1] || firstSegment;
  const sources = [value, firstSlice, firstSegment];
  const routeSources = [value, firstSlice, firstSegment];
  const origin = firstText(routeSources, ["origin", "origin_iata", "origin_code", "departure_airport", "departure_iata", "from"], 64);
  const destination = firstText([value, firstSlice, lastSegment], ["destination", "destination_iata", "destination_code", "arrival_airport", "arrival_iata", "to"], 64);
  const carrier = firstText(sources, ["airline", "carrier", "carrier_name", "provider", "marketing_carrier_name", "owner_iata", "airline_iata"], 90);
  const flightNumber = firstText(sources, ["flight_number", "number"], 40);
  const route = origin && destination ? `${origin} → ${destination}` : routeText(sources);
  const departure = formatTemporal(firstScalar(sources, ["departure_time", "departure_at", "scheduled_departure_at", "departs_at", "departure", "start_time"], 80));
  const arrival = formatTemporal(firstScalar([value, firstSlice, lastSegment], ["arrival_time", "arrival_at", "scheduled_arrival_at", "arrives_at", "arrival", "end_time"], 80));
  const explicitStops = firstNumber(sources, ["stops", "stop_count", "number_of_stops"]);
  const stops = explicitStops === undefined && segments.length ? Math.max(0, segments.length - 1) : explicitStops;
  const cabin = firstText(sources, ["cabin", "cabin_class", "fare_class"], 50);
  const status = firstText(sources, ["status", "availability", "state", "booking_state", "operational_state"], 40).toLowerCase();
  const isSlot = kindHint === "slot";
  const people = firstNumber(sources, ["passenger_count", "passengers", "travellers", "travelers"]);
  const score = formatMinorPrice(sources) || formatPrice(sources);
  const source = firstText(sources, ["source_label", "source", "booking_platform"], 60) || "Pearl";
  const expiresAt = formatTemporal(firstScalar(sources, ["expires_at"], 80));
  const updatedAt = formatTemporal(firstScalar(sources, ["source_updated_at", "operational_observed_at", "updated_at"], 80));
  const freshness = expiresAt || updatedAt;
  const freshnessLabel = expiresAt ? "Fare expires" : updatedAt ? "Updated" : "";
  const departureZone = firstText(sources, ["departure_timezone", "origin_timezone", "timezone"], 50);
  const arrivalZone = firstText([value, firstSlice, lastSegment], ["arrival_timezone", "destination_timezone", "timezone"], 50);
  return {
    id: firstText(sources, ["id", "offer_id", "slot_id"], 120) || `flight-${index}`,
    name: route || carrier || (isSlot ? `Availability ${index + 1}` : `Flight option ${index + 1}`),
    meta: [[carrier, flightNumber].filter(Boolean).join(" "), [departure, arrival].filter(Boolean).join(" → ")].filter(Boolean).join(" · "),
    detail: firstText(sources, ["description", "summary", "fare_name", "terms"], 180),
    category: cabin || (isSlot ? "Availability" : "Flight"),
    group: stops === undefined ? "" : stops === 0 ? "Nonstop" : `${formatNumber(stops, 0)} ${stops === 1 ? "stop" : "stops"}`,
    score,
    status,
    journeyType: "flight",
    start: departure,
    end: arrival,
    time: "",
    location: route,
    route: { origin, destination },
    source,
    freshness,
    freshnessLabel,
    departureZone,
    arrivalZone,
    facts: [
      carrier ? { label: "Carrier", value: [carrier, flightNumber].filter(Boolean).join(" ") } : undefined,
      cabin ? { label: "Cabin", value: cabin.replaceAll("_", " ") } : undefined,
      stops !== undefined ? { label: "Stops", value: stops === 0 ? "Nonstop" : formatNumber(stops, 0) } : undefined,
      people !== undefined ? { label: "Travellers", value: formatNumber(people, 0) } : undefined,
    ].filter(Boolean),
    stops: [],
  };
}

function extractError(data, envelope) {
  const candidate = isRecord(data?.error) ? data.error
    : isRecord(envelope?.error) ? envelope.error
    : envelope?.isError ? { code: "tool_error", message: "Pearl could not complete this request.", user_action: "retry" }
    : undefined;
  if (!candidate) return undefined;
  const details = isRecord(candidate.details) ? candidate.details : {};
  const scopeCandidate = firstText(details, ["required_scope"], 80);
  const requiredScope = /^[a-z]+:read$/.test(scopeCandidate) && PUBLIC_READ_SCOPES.has(scopeCandidate)
    ? scopeCandidate
    : "";
  const actionCandidate = firstText(candidate, ["user_action"], 40);
  return {
    code: firstText(candidate, ["code"], 80) || "tool_error",
    message: firstText(candidate, ["message"], 220) || "Pearl could not complete this request.",
    userAction: SAFE_USER_ACTIONS.has(actionCandidate) ? actionCandidate : "retry",
    requiredScope,
  };
}

function explicitView(data) {
  if (!isRecord(data?.view)) return undefined;
  const view = data.view;
  const kind = firstText(view, ["kind"], 40).toLowerCase();
  if (!Array.isArray(view.items) || !["venues", "journeys", "flights"].includes(kind)) return undefined;
  return { kind, values: view.items.slice(0, MAX_ITEMS).map((value) => ({ value })), view };
}

function inferCollection(data) {
  const view = explicitView(data);
  if (view) return view;

  const flightOffers = [
    ...arrayAt(data, "flights"),
    ...arrayAt(data, "offers"),
    ...arrayAt(data, "flight_offers"),
    ...arrayAt(data, "options"),
    ...(isRecord(data.flight) ? [data.flight] : []),
  ];
  const slots = [
    ...arrayAt(data, "availability"),
    ...arrayAt(data, "slots"),
    ...(isRecord(data.availability) ? arrayAt(data.availability, "slots") : []),
  ];
  const hasFlightEnvelope = ["flights", "offers", "flight_offers", "options"].some((key) => Array.isArray(data[key]))
    || isRecord(data.flight)
    || (isRecord(data.query) && Boolean(routeText(data.query)));
  if (flightOffers.length || slots.length || hasFlightEnvelope) {
    return { kind: "flights", values: [...flightOffers.map((item) => ({ value: item, hint: "flight" })), ...slots.map((item) => ({ value: item, hint: "slot" }))] };
  }

  const reservations = arrayAt(data, "reservations");
  const trips = [...arrayAt(data, "trips"), ...arrayAt(data, "collections")];
  const singleTrip = isRecord(data.trip) ? [data.trip] : [];
  const singleReservation = isRecord(data.reservation) ? [data.reservation] : [];
  const hasJourneyEnvelope = ["reservations", "trips", "collections"].some((key) => Array.isArray(data[key]))
    || isRecord(data.trip)
    || isRecord(data.reservation);
  if (reservations.length || trips.length || singleTrip.length || singleReservation.length || hasJourneyEnvelope) {
    return {
      kind: "journeys",
      values: [
        ...reservations.map((item) => ({ value: item, hint: "reservation" })),
        ...singleReservation.map((item) => ({ value: item, hint: "reservation" })),
        ...trips.map((item) => ({ value: item, hint: "trip" })),
        ...singleTrip.map((item) => ({ value: item, hint: "trip" })),
      ],
    };
  }

  const venues = [
    ...arrayAt(data, "venues").map((value) => ({ value })),
    ...arrayAt(data, "openings").map((value) => ({ value })),
    ...arrayAt(data, "top_venues").map((value) => ({ value })),
    ...arrayAt(data, "matches").map((value) => ({ value })),
    ...flattenGroups(arrayAt(data, "groups")),
  ];
  if (venues.length) return { kind: "venues", values: venues };
  return { kind: "generic", values: [] };
}

function titleFor(kind, count, data, view) {
  const explicit = firstText(view, ["title"], 100) || firstText(data, ["title", "heading"], 100);
  if (explicit) return explicit;
  if (kind === "venues") return count === 1 ? "A place worth considering" : "Places picked for you";
  if (kind === "journeys") {
    const hasReservations = arrayAt(data, "reservations").length > 0 || isRecord(data.reservation);
    const hasTrips = arrayAt(data, "trips").length > 0 || arrayAt(data, "collections").length > 0 || isRecord(data.trip);
    if (hasTrips && !hasReservations) return count === 1 ? "Your trip or collection" : "Your trips and collections";
    if (hasReservations && !hasTrips) return count === 1 ? "Your reservation" : "Your reservations";
    return count === 1 ? "Your plan" : "Trips and reservations";
  }
  if (kind === "flights") return count === 1 ? "One travel option" : "Flight and availability options";
  return "Pearl results";
}

export function normalizeToolResult(envelope) {
  const safeEnvelope = isRecord(envelope) ? envelope : {};
  const data = isRecord(safeEnvelope.structuredContent)
    ? safeEnvelope.structuredContent
    : isRecord(safeEnvelope) ? safeEnvelope : {};
  const error = extractError(data, safeEnvelope);
  if (error) {
    return {
      state: "error",
      kind: "error",
      title: error.userAction === "reconnect" ? "Reconnect Pearl"
        : error.userAction === "grant_scope" ? "More access is needed"
        : "Pearl needs another try",
      subtitle: error.message,
      error,
      items: [],
      partial: false,
    };
  }

  const profile = normalizeProfile(data);
  if (profile) return profile;

  const tripDetail = normalizeTripDetail(data);
  if (tripDetail) return tripDetail;

  const collection = inferCollection(data);
  const view = explicitView(data)?.view || {};
  let items = [];
  if (collection.kind === "venues") {
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeVenue(entry.value, index, entry.group));
  } else if (collection.kind === "journeys") {
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeJourney(entry.value, index, entry.hint || "trip"));
  } else if (collection.kind === "flights") {
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeFlight(entry.value, index, entry.hint || "flight"));
  }

  const partial = data.partial === true
    || data.is_partial === true
    || data.coverage_state === "partial"
    || arrayAt(data, "warnings").length > 0
    || arrayAt(data, "errors").length > 0;
  const subtitle = firstText(view, ["subtitle", "summary"], 200)
    || firstText(data, ["message", "summary"], 200)
    || (collection.kind === "venues" ? "Review Pearl context, then select two or three places to compare."
      : collection.kind === "journeys" ? "Dates, status, and the details returned by your Pearl account."
      : collection.kind === "flights" ? "Live-looking data can change; confirm availability before acting."
      : "The tool returned no supported visual collection.");
  return {
    state: items.length ? "ready" : "empty",
    kind: collection.kind,
    title: titleFor(collection.kind, items.length, data, view),
    subtitle,
    items,
    partial,
  };
}

export function recoveryPrompt(error) {
  const safe = isRecord(error) ? error : {};
  const action = SAFE_USER_ACTIONS.has(safe.userAction) ? safe.userAction : "retry";
  return RECOVERY_PROMPTS[action];
}

export const PEARL_MODEL_LIMITS = Object.freeze({
  maxItems: MAX_ITEMS,
  maxText: MAX_TEXT,
  publicReadScopes: Object.freeze([...PUBLIC_READ_SCOPES]),
  imageOriginPrefix: IMAGE_ORIGIN_PREFIX,
});
