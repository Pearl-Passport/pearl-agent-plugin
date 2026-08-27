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
    const key = firstText(value, ["id", "location_id", "venue_id", "reservation_id", "trip_id", "collection_id", "offer_id"], 120)
      || `${firstText(value, ["name", "title", "venue_name"], 120)}|${firstText(value, ["city", "destination"], 80)}`;
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
  const rawDate = firstScalar(sources, ["date", "start_date", "trip_start_date", "reservation_date", "starts_at", "check_in"], 80);
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
  const lens = firstText(data, ["taste_lens"], 40).replaceAll("_", " ");
  const hasContent = metrics.length || facets.length || topCities.length || topRated.length || allergies.length || name;
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
    lens,
    partial: data.partial === true || arrayAt(data, "warnings").length > 0,
  };
}

function routeText(source) {
  const origin = firstText(source, ["origin", "origin_code", "departure_airport", "from"], 64);
  const destination = firstText(source, ["destination", "destination_code", "arrival_airport", "to"], 64);
  return origin && destination ? `${origin} → ${destination}` : origin || destination;
}

function normalizeFlight(value, index, kindHint) {
  const firstSegment = Array.isArray(value.segments) && isRecord(value.segments[0]) ? value.segments[0] : {};
  const sources = [value, firstSegment];
  const carrier = firstText(sources, ["airline", "carrier", "carrier_name", "provider"], 90);
  const flightNumber = firstText(sources, ["flight_number", "number"], 40);
  const route = routeText(sources);
  const departure = formatTemporal(firstScalar(sources, ["departure_time", "departs_at", "departure", "start_time"], 80));
  const arrival = formatTemporal(firstScalar(sources, ["arrival_time", "arrives_at", "arrival", "end_time"], 80));
  const stops = firstNumber(sources, ["stops", "stop_count", "number_of_stops"]);
  const cabin = firstText(sources, ["cabin", "cabin_class", "fare_class"], 50);
  const status = firstText(sources, ["status", "availability", "state"], 40).toLowerCase();
  const isSlot = kindHint === "slot";
  return {
    id: firstText(sources, ["id", "offer_id", "slot_id"], 120) || `flight-${index}`,
    name: route || carrier || (isSlot ? `Availability ${index + 1}` : `Flight option ${index + 1}`),
    meta: [[carrier, flightNumber].filter(Boolean).join(" "), [departure, arrival].filter(Boolean).join(" → ")].filter(Boolean).join(" · "),
    detail: firstText(sources, ["description", "summary", "fare_name", "terms"], 180),
    category: cabin || (isSlot ? "Availability" : "Flight"),
    group: stops === undefined ? "" : stops === 0 ? "Nonstop" : `${formatNumber(stops, 0)} ${stops === 1 ? "stop" : "stops"}`,
    score: formatPrice(sources),
    status,
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
  ];
  const slots = [
    ...arrayAt(data, "availability"),
    ...arrayAt(data, "slots"),
    ...(isRecord(data.availability) ? arrayAt(data.availability, "slots") : []),
  ];
  if (flightOffers.length || slots.length) {
    return { kind: "flights", values: [...flightOffers.map((item) => ({ value: item, hint: "flight" })), ...slots.map((item) => ({ value: item, hint: "slot" }))] };
  }

  const reservations = arrayAt(data, "reservations");
  const trips = [...arrayAt(data, "trips"), ...arrayAt(data, "collections")];
  const singleTrip = isRecord(data.trip) ? [data.trip] : [];
  const singleReservation = isRecord(data.reservation) ? [data.reservation] : [];
  if (reservations.length || trips.length || singleTrip.length || singleReservation.length) {
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
