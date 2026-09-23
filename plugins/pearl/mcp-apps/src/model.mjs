const MAX_ITEMS = 18;
const MAX_TEXT = 240;
// Venue imagery is accepted only from Pearl's reviewed origin.
// Everything else — other origins, lookalike hosts, query strings, fragments,
// credentials, unexpected characters — fails closed to the deterministic
// brand-safe fallback artwork. Keep in sync with PEARL_MCP_APP_IMAGE_ORIGIN
// (integration.mjs) and the document CSP img-src (scripts/build.mjs).
const IMAGE_ORIGIN_PREFIX = "https://agent.joinpearl.co/";
const IMAGE_PATH_PATTERN = /^[A-Za-z0-9/_\-.]{1,400}$/;
const IMAGE_KEYS = ["hero_image_url", "image_url", "image", "hero_image", "photo", "thumbnail", "primary_photo"];
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
const WRITE_ACCESS_LABELS = Object.freeze({
  "visits:write": "Add and edit visits",
  "saves:write": "Manage saved places",
  "trips:write": "Create trips and manage trip stops",
});
// Plain member-facing phrases for the finite public read scopes.
const READ_ACCESS_LABELS = Object.freeze({
  "venues:read": "Search Pearl places",
  "profile:read": "View your taste profile",
  "visits:read": "View your visits",
  "saves:read": "View your saved places",
  "friends:read": "View your friends",
  "trips:read": "View your trips and collections",
  "reservations:read": "View your reservations",
});
const TASTE_LENS_LABELS = Object.freeze({
  overview: "Overview", cuisines: "Cuisines", vibes: "Vibes", occasions: "Occasions", price: "Price",
  footprint: "Travel footprint", palate: "Palate", setting: "Setting", rhythm: "Rhythm",
  recognition: "Recognition", exploration: "Exploration", benchmarks: "Benchmarks", twins: "Taste twins",
  recommendation: "Recommendations",
});
const CABIN_LABELS = Object.freeze({
  economy: "Economy", premium_economy: "Premium economy", business: "Business", first: "First",
});
// Booking providers members recognise; unknown ids fall back to sentence case.
const PROVIDER_LABELS = Object.freeze({
  resy: "Resy", opentable: "OpenTable", tock: "Tock", sevenrooms: "SevenRooms", thefork: "TheFork",
  tablecheck: "TableCheck", omakase: "OMAKASE", doordash: "DoorDash", yelp: "Yelp", pearl: "Pearl",
});
// Deep links open only exact Pearl app routes through the host's link bridge.
const PEARL_APP_HOST = "app.joinpearl.co";
const PEARL_APP_PATH_PATTERN = /^\/(?:(?:venue|trip|lists)\/[A-Za-z0-9._~%-]{1,200}|reservations|watches|saved)$/;
const RANKING_BOILERPLATE = /^Ranked by Pearl\b[^.]*\.\s*/;
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

function sentenceCase(value) {
  const clean = cleanText(value, 80).replaceAll("_", " ");
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

export function providerLabel(value) {
  const key = cleanText(value, 40).toLowerCase().replace(/[\s_-]/g, "");
  return Object.hasOwn(PROVIDER_LABELS, key) ? PROVIDER_LABELS[key] : sentenceCase(value);
}

function pearlAppUrl(value) {
  if (typeof value !== "string" || value.length > 300) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.hostname !== PEARL_APP_HOST || url.port || url.username || url.password
    || url.search || url.hash || !PEARL_APP_PATH_PATTERN.test(url.pathname)) return "";
  return url.href;
}

// The shortlist ranking sentence is identical on every card; keep only the
// venue-specific differentiators, minus the ratings already shown as chips.
function venueReason(value) {
  const reason = cleanText(value, 300);
  if (!RANKING_BOILERPLATE.test(reason)) return reason;
  const differentiators = reason.replace(RANKING_BOILERPLATE, "").replace(/^Returned differentiators:\s*/i, "").replace(/\.$/, "");
  if (differentiators === reason) return "";
  return differentiators.split(";").map((part) => part.trim())
    .filter((part) => part && !/Michelin star|Google rating/i.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

// Every number is labelled by its source so a /5 rating, a /10 member score and
// a 0–1 match confidence are never read as the same scale.
function venueSignals(sources, scoreLabel) {
  const signals = [];
  const stars = firstNumber(sources, ["michelin_stars"]);
  if (stars !== undefined && Number.isInteger(stars) && stars >= 1 && stars <= 3) {
    signals.push({ source: "michelin", label: `${stars} Michelin star${stars === 1 ? "" : "s"}` });
  }
  const w50 = firstNumber(sources, ["w50_ranking", "worlds_50_best_rank"]);
  if (w50 !== undefined && Number.isInteger(w50) && w50 >= 1 && w50 <= 100) signals.push({ source: "w50", label: `World's 50 Best #${w50}` });
  const google = firstNumber(sources, ["google_rating"]);
  if (google !== undefined && google > 0 && google <= 5) signals.push({ source: "google", label: `Google ${formatNumber(google)}` });
  const pearl = firstNumber(sources, ["pearl_score"]);
  if (pearl !== undefined && pearl >= 0 && pearl <= 10) signals.push({ source: "pearl", label: `Pearl ${formatNumber(pearl)}` });
  const rating = firstNumber(sources, ["score", "rating"]);
  if (rating !== undefined && rating >= 0 && rating <= 10) {
    signals.push(scoreLabel === "member"
      ? { source: "member", label: `Your score ${formatNumber(rating)}/10` }
      : { source: "rating", label: `Rated ${formatNumber(rating)}` });
  }
  const match = firstNumber(sources, ["match_score", "confidence"]);
  if (match !== undefined && match >= 0 && match <= 1) signals.push({ source: "match", label: `${Math.round(match * 100)}% match` });
  return signals.slice(0, 4);
}

function priceLevel(sources) {
  const level = firstNumber(sources, ["price_level"]);
  if (level !== undefined && Number.isInteger(level) && level >= 1 && level <= 4) return "$".repeat(level);
  const text = firstText(sources, ["price_level", "price_range"], 8);
  return /^[$€£¥]{1,4}$/.test(text) ? text : "";
}

function normalizeVenue(value, index, groupHint = "", { scoreLabel = "rating", visit = false } = {}) {
  const nested = isRecord(value.venue) ? value.venue : isRecord(value.location) ? value.location : {};
  const sources = [value, nested];
  const city = firstText(sources, ["city", "locality", "destination"], 90);
  const neighborhood = firstText(sources, ["neighborhood", "district"], 90);
  const category = firstText(sources, ["type", "venue_type", "category", "cuisine"], 80);
  // A visit's text is the member's own note, shown as theirs.
  const note = visit ? cleanText(value.comment, 200) : "";
  const detail = visit ? note ? `“${note}${value.comment_truncated === true ? "…" : ""}”` : ""
    : firstText(sources, ["description", "summary", "reason", "why"], 220)
      || venueReason(firstText(sources, ["recommendation_reason"], 300)).slice(0, 220);
  const name = firstText(sources, ["name", "title", "venue_name", "display_name"], 120) || `Venue ${index + 1}`;
  const place = [neighborhood, city].filter(Boolean).join(" · ") || firstText(sources, ["address", "country"], 130);
  const visitedOn = visit ? firstText(value, ["visited_on_label"], 40) : "";
  const signals = venueSignals(sources, scoreLabel);
  if (visit && value.recommended === true && signals.length < 4) signals.push({ source: "member", label: "You recommend" });
  return {
    id: (visit && firstText(value, ["visit_id"], 120)) || firstText(sources, ["id", "location_id", "venue_id", "reference"], 120) || `venue-${index}`,
    name,
    meta: [visitedOn ? `Visited ${visitedOn}` : "", place].filter(Boolean).join(" · "),
    detail,
    category,
    group: firstText(sources, ["group_label"], 80) || groupHint,
    score: "",
    signals,
    status: firstText(sources, ["status", "opening_status", "availability"], 40).toLowerCase(),
    image: normalizeImage(sources),
    city,
    topPick: value.top_pick === true,
    priceLevel: priceLevel(sources),
    pearlUrl: pearlAppUrl(firstText(sources, ["pearl_url"], 300)),
    availabilitySupported: value.availability_supported === true,
    bookingPlatforms: stringListAt(value, "booking_platforms", 4).map(providerLabel).filter(Boolean),
  };
}

const MATCH_STATUS_LABELS = Object.freeze({
  exact: "Exact match", suggested: "Confirm match", ambiguous: "Choose a place", unmatched: "Not in Pearl",
});
const MATCH_SUMMARY_LABELS = Object.freeze({
  exact: "exact", suggested: "to confirm", ambiguous: "to choose", unmatched: "not in Pearl", review: "to review",
});

// places_match: the input name leads; the Pearl place (or the choices) follows.
function normalizePlaceMatch(value, index) {
  const input = isRecord(value.input) ? value.input : {};
  const candidates = arrayAt(value, "candidates").filter(isRecord);
  const locationId = firstText(value, ["location_id"], 120);
  const chosen = locationId ? candidates.find((entry) => entry.id === locationId || entry.location_id === locationId) : undefined;
  const status = firstText(value, ["status"], 20).toLowerCase();
  const describe = (entry) => [firstText(entry, ["name"], 100), firstText(entry, ["city"], 60)].filter(Boolean).join(", ");
  const choices = candidates.slice(0, 3).map(describe).filter(Boolean);
  const detail = chosen ? `Pearl: ${describe(chosen)}`
    : choices.length ? `Possible places: ${choices.join("; ")}${candidates.length > 3 ? ` and ${candidates.length - 3} more` : ""}`
    : "No Pearl place found for this name.";
  const confidence = firstNumber(value, ["confidence"]);
  return {
    id: firstText(value, ["reference"], 120) || `match-${index}`,
    name: firstText(input, ["name"], 120) || `Place ${index + 1}`,
    meta: [firstText(input, ["city"], 80), firstText(input, ["country"], 80)].filter(Boolean).join(" · "),
    detail,
    category: firstText(chosen, ["type"], 60) || firstText(input, ["type"], 60),
    group: "",
    score: "",
    signals: status === "suggested" && confidence !== undefined && confidence > 0 && confidence < 1
      ? [{ source: "match", label: `${Math.round(confidence * 100)}% match` }] : [],
    status: Object.hasOwn(MATCH_STATUS_LABELS, status) ? status : "review",
    statusLabel: enumLabel(MATCH_STATUS_LABELS, status, "Needs review"),
    image: undefined,
  };
}

function matchSummary(summary, items) {
  const counts = new Map();
  for (const item of items) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  const parts = Object.keys(MATCH_SUMMARY_LABELS).filter((status) => counts.get(status))
    .map((status) => `${counts.get(status)} ${MATCH_SUMMARY_LABELS[status]}`);
  return parts.length ? `${parts.join(" · ")}. Nothing is saved until you confirm in chat.` : firstText(summary, ["message"], 200);
}

// "America/New_York" → "New York".
function zoneCity(zone) {
  const city = /^[A-Za-z]+\/(?:[A-Za-z_]+\/)?([A-Za-z_]+)$/.exec(zone || "")?.[1];
  return city ? city.replaceAll("_", " ") : "";
}

// venue_get: one place with its hours, contact facts and the member's history.
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function normalizeVenueDetail(data) {
  if (!isRecord(data.venue) || !isRecord(data.opening) || !isRecord(data.pearl_context)) return undefined;
  const venue = data.venue;
  const opening = data.opening;
  const context = data.pearl_context;
  const awards = isRecord(context.awards) ? context.awards : {};
  const community = isRecord(context.community) ? context.community : {};
  const member = isRecord(data.member_context) ? data.member_context : {};
  const booking = isRecord(data.booking) ? data.booking : {};
  const item = normalizeVenue({
    ...venue,
    id: firstText(venue, ["location_id", "id"], 120),
    michelin_stars: awards.michelin_stars,
    worlds_50_best_rank: awards.worlds_50_best_rank,
    google_rating: community.google_rating,
    price_level: venue.price_tier,
    status: "",
  }, 0);
  const openingStatus = firstText(opening, ["status"], 40).toLowerCase();
  const hoursSource = isRecord(opening.hours_by_day) ? opening.hours_by_day : {};
  // Consecutive days with the same hours read as one row ("Mon–Wed").
  const hours = [];
  let previous;
  for (const day of DAY_ORDER) {
    const value = Array.isArray(hoursSource[day])
      ? hoursSource[day].slice(0, 4).map((range) => cleanText(range, 20)).filter(Boolean).join(", ")
      : "";
    if (value && previous && previous.value === value && previous.lastIndex === DAY_ORDER.indexOf(day) - 1) {
      previous.lastIndex += 1;
      previous.day = `${previous.firstDay}–${day}`;
    } else if (value) {
      previous = { day, firstDay: day, lastIndex: DAY_ORDER.indexOf(day), value };
      hours.push(previous);
    } else previous = undefined;
  }
  const visits = firstNumber(member, ["visit_count"]);
  const latestScore = firstNumber(member, ["latest_score"]);
  const memberLine = [
    member.saved === true ? "Saved" : "",
    visits ? `Visited ${formatNumber(visits, 0)} time${visits === 1 ? "" : "s"}` : "",
    latestScore !== undefined && latestScore >= 0 && latestScore <= 10 ? `your last score ${formatNumber(latestScore)}/10` : "",
  ].filter(Boolean).join(" · ");
  const facts = [
    { label: "Address", value: firstText(venue, ["address"], 200) },
    { label: "Cuisine", value: firstText(venue, ["cuisine"], 120) },
    { label: "Phone", value: firstText(venue, ["phone"], 60) },
    { label: "Best for", value: firstText(context, ["best_for"], 200) },
    { label: "Order", value: firstText(context, ["ordering_tips"], 200) },
    { label: "Dress code", value: firstText(context, ["dress_code"], 120) },
    { label: "Booking", value: booking.walk_in_only === true ? "Walk-in only" : providerLabel(firstText(booking, ["platform"], 40)) },
  ].filter((fact) => fact.value);
  return {
    state: "ready",
    kind: "venue_detail",
    title: item.name,
    subtitle: item.meta,
    items: [{ ...item, meta: "", detail: firstText(venue, ["description"], 400) || firstText(context, ["vibe"], 300) }],
    partial: false,
    openLabel: openingStatus === "open"
      ? opening.open_now === true ? "Open now" : "Closed now"
      : openingStatus ? sentenceCase(openingStatus.replaceAll("_", " ")) : "",
    hours: hours.map(({ day, value }) => ({ day, value })),
    hoursNote: zoneCity(firstText(opening, ["timezone"], 60)) ? `Times are local to ${zoneCity(firstText(opening, ["timezone"], 60))}.` : "",
    facts,
    memberLine,
  };
}

function normalizeJourney(value, index, kindHint) {
  const nested = isRecord(value.venue) ? value.venue : isRecord(value.location) ? value.location : {};
  const sources = [value, nested];
  const reservation = kindHint === "reservation" || Boolean(firstText(sources, ["reservation_id"], 120));
  const place = firstText(sources, ["venue_name", "location_name", "name", "title", "destination"], 120);
  const rawDate = firstScalar(sources, ["date", "start_date", "trip_start_date", "reservation_date", "reservation_at", "starts_at", "check_in"], 80);
  // Reservations carry a venue-local label; the UTC instant would read as the
  // wrong clock time for anyone outside the venue's zone.
  const localLabel = firstText(sources, ["local_time_label"], 80);
  const temporal = localLabel ? { display: localLabel, hasTime: true } : parseTemporal(rawDate);
  const date = temporal.display;
  const endDate = formatTemporal(firstScalar(sources, ["end_date", "trip_end_date", "ends_at", "check_out"], 80));
  const time = temporal.hasTime ? "" : formatClock(firstScalar(sources, ["time", "reservation_time", "start_time"], 40));
  const city = firstText(sources, ["city", "venue_city", "destination", "locality"], 80);
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
    image: reservation ? normalizeImage(sources) : undefined,
    pearlUrl: pearlAppUrl(firstText(sources, ["pearl_url"], 300)),
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
    pearlUrl: base.pearlUrl || pearlAppUrl(firstText(data, ["pearl_url"], 300)),
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
    const venue = normalizeVenue(item, index, "", { scoreLabel: "member" });
    return venue.name ? venue : undefined;
  }).filter(Boolean).slice(0, 6);
  const allergies = stringListAt(taste, "allergies", 10);
  const analytics = normalizeTasteAnalytics(data.analytics);
  const lens = firstText(data, ["taste_lens"], 40).replaceAll("_", " ");
  const lensLabel = enumLabel(TASTE_LENS_LABELS, firstText(data, ["taste_lens"], 40), sentenceCase(lens));
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
    lensLabel,
    partial: data.partial === true || arrayAt(data, "warnings").length > 0 || analytics?.coverage.state === "partial",
  };
}

const VISIT_FIELD_LABELS = { visited_at: "Visit date", recommended: "Recommended", score: "Score", comment: "Note", comment_visibility: "Note visibility" };
function enumLabel(labels, key, fallback) {
  return typeof key === "string" && Object.hasOwn(labels, key) ? labels[key] : fallback;
}

function visitValue(record, field) {
  if (field === "visited_at") {
    if (!record.visited_at) return "Date not recorded";
    if (record.visited_at_has_day === false) {
      const date = cleanText(record.visited_at, 80);
      return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date) && parseTemporal(date).display ? `${date.slice(0, 7)} (day not recorded)` : "Date not recorded";
    }
    return formatTemporal(record.visited_at)?.split(" · ")[0] || "Date not recorded";
  }
  if (field === "recommended") return record[field] === true ? "Yes" : record[field] === false ? "No" : "Not recorded";
  if (field === "score") return typeof record[field] === "number" && record[field] >= 0 && record[field] <= 10 ? `${record[field]}/10` : "Not recorded";
  if (field === "comment_visibility") return enumLabel({ inherit: "Visit sharing setting", public: "Public", friends: "Friends", only_me: "Only me" }, record[field], "Not recorded");
  return cleanText(record[field], 2000) || "No note";
}

function normalizeVisitAction(data) {
  const preview = isRecord(data.preview) ? data.preview : {};
  const base = { state: "ready", kind: "visit_action", partial: false };
  if (data.confirmation_required === true && isRecord(preview.before) && isRecord(preview.after) && preview.visit_id) {
    const fields = new Set(arrayAt(preview, "fields").filter((field) => typeof field === "string"));
    if (fields.has("visited_at_has_day")) fields.add("visited_at");
    const changes = Object.entries(VISIT_FIELD_LABELS).filter(([key]) => fields.has(key)).map(([key, label]) => ({
      label, before: visitValue(preview.before, key), after: visitValue(preview.after, key),
    }));
    return { ...base, title: "Review your visit update", subtitle: "Nothing has been changed. Confirm these exact changes in the conversation before saving.",
      actionStage: "preview", expiresAt: formatDiningTimestamp(data.action_handle_expires_at),
      expiresAtIso: formatDiningTimestamp(data.action_handle_expires_at) ? cleanText(data.action_handle_expires_at, 40) : "",
      partial: !changes.length || [...fields].some(field => !Object.hasOwn(VISIT_FIELD_LABELS, field) && field !== "visited_at_has_day"), items: [{ name: firstText(preview.venue, ["name"], 200) || "Your saved visit", changes,
        warnings: preview.duplicate_warning ? ["Another visit may have this date. Review the duplicate warning in chat before confirming."] : [] }] };
  }
  if (data.confirmation_required === true && data.job_id && Array.isArray(data.items)) {
    const items = data.items.slice(0, 20).filter(isRecord).map((item, index) => {
      const input = isRecord(item.input) ? item.input : {};
      const candidates = arrayAt(item, "candidates").filter(isRecord);
      const candidate = typeof item.location_id === "string" && item.location_id
        ? candidates.find((entry) => entry.location_id === item.location_id || entry.id === item.location_id) : undefined;
      const match = enumLabel({ exact: "Exact match", suggested: "Suggested match — confirm the place", ambiguous: "Ambiguous match — choose a place in chat", rejected: "Place not matched", unmatched: "Place not matched" }, item.match_status, "Match needs review");
      return { name: `Item ${index + 1}: ${firstText(input, ["name"], 200) || "Visit"}`, facts: [
        { label: "Matched place", value: firstText(candidate, ["name"], 200) || (item.match_status === "exact" ? "Exact match returned — check the place in chat" : "Choose the correct place in chat") },
        { label: "City", value: firstText(input, ["city"], 100) || "Not recorded" },
        ...Object.entries(VISIT_FIELD_LABELS).filter(([key]) => key !== "comment_visibility").map(([key, label]) => ({ label, value: visitValue(input, key) })),
      ], notes: [...(item.match_status === "exact" ? [match] : []), "Confirm that you attended this visit."],
      warnings: [...(item.match_status === "exact" ? [] : [match]),
        ...(item.existing_visit || arrayAt(item, "possible_duplicates").length || item.status === "duplicate_warning" ? ["Possible duplicate — separate confirmation required."] : [])] };
    });
    return { ...base, title: "Review your visit import", subtitle: "Nothing has been saved. Confirm attendance for each visit in chat. Suggested places and duplicates need separate review; ambiguous places must be resolved first.", actionStage: "preview", expiresAt: formatDiningTimestamp(data.action_handle_expires_at),
      expiresAtIso: formatDiningTimestamp(data.action_handle_expires_at) ? cleanText(data.action_handle_expires_at, 40) : "", items,
      partial: data.items.length > 20 || items.length !== data.items.length };
  }
  if (data.status === "updated" && data.visit_id && isRecord(data.visit)) {
    return { ...base, title: "Visit updated", subtitle: "Pearl returned a saved update receipt.", actionStage: "receipt",
      items: [{ name: "Saved visit", facts: Object.entries(VISIT_FIELD_LABELS).map(([key, label]) => ({ label, value: visitValue(data.visit, key) })), warnings: [] }] };
  }
  if (data.job_id && Array.isArray(data.receipts)) {
    const labels = { created: "Saved", replayed: "Previously saved — no duplicate added", skipped_unconfirmed_attendance: "Skipped — attendance not confirmed", skipped_duplicate: "Skipped — duplicate not confirmed", skipped_suggestion: "Skipped — suggested place not confirmed", duplicate_warning: "Not saved — duplicate needs review" };
    const items = data.receipts.slice(0, 20).filter(isRecord).map((receipt, index) => ({
      name: `Import item ${Number.isInteger(receipt.ordinal) && receipt.ordinal >= 0 && receipt.ordinal < 20 ? receipt.ordinal + 1 : index + 1}`,
      facts: [{ label: "Result", value: enumLabel(labels, receipt.status, "Save result not confirmed") }], warnings: [],
    }));
    return { ...base, title: "Visit import results", subtitle: data.status === "needs_review"
      ? "Some items still need review. Saved items will not be added again. Continue in chat for the remaining items."
      : "Review each receipt below. Skipped items were not saved.", actionStage: "receipt", items,
      partial: data.status === "needs_review" || data.receipts.length > 20 || items.length !== data.receipts.length };
  }
  return undefined;
}

function formatDiningTimestamp(value) {
  const parsed = parseTemporal(value);
  if (!parsed.hasTime) return "";
  const zone = /(Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  return `${parsed.display}${zone ? zone === "Z" ? " UTC" : ` UTC${zone}` : ""}`;
}

// Presentation only: previews are not receipts and the widget never retains
// action handles. The server remains the sole owner of confirmation and writes.
function normalizePlanAction(data) {
  const preview = isRecord(data.preview) ? data.preview : {};
  const isPreview = data.confirmation_required === true;
  const value = isPreview ? preview : data;
  const save = typeof value.location_id === "string" && ["save", "remove"].includes(value.action)
    && !value.collection_id && !value.trip;
  const create = value.action === "create" && (isPreview ? isRecord(value.trip) : value.collection_type === "trip");
  const stop = ["add", "move", "swap", "remove"].includes(value.action)
    && (isPreview ? isRecord(value.trip) : typeof value.collection_id === "string" && typeof value.item_id === "string");
  if (!save && !create && !stop) return undefined;

  const base = { state: "ready", kind: "plan_action", partial: false, actionStage: isPreview ? "preview" : "receipt" };
  const fact = (label, value) => ({ label, value });
  const date = value => formatTemporal(value) || "Not set";
  const trip = isPreview ? value.trip : value;
  const tripFacts = trip => [
    fact("Starts", date(trip.trip_start_date)), fact("Ends", date(trip.trip_end_date)),
  ];
  const tripRange = trip => {
    if (!isRecord(trip)) return "";
    const [start, end] = [formatTemporal(trip.trip_start_date), formatTemporal(trip.trip_end_date)];
    return start && end ? ` (${start} → ${end})` : start ? ` (from ${start})` : "";
  };
  const place = venue => [firstText(venue, ["name"], 200), firstText(venue, ["city"], 100), firstText(venue, ["country"], 100)].filter(Boolean).join(" · ") || "Place details not returned — check in chat";
  const stopValue = (record, field) => {
    if (!isRecord(record)) return "Not on this trip";
    if (field === "scheduled_date") return date(record[field]);
    if (field === "scheduled_time") return typeof record[field] === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(record[field])
      ? `${record[field].slice(0, 5)} (local time)` : "Not set";
    return cleanText(record[field], 500) || "No note";
  };
  const expiresAt = isPreview ? formatDiningTimestamp(data.action_handle_expires_at) : "";
  const expiresAtIso = expiresAt ? cleanText(data.action_handle_expires_at, 40) : "";
  let partial = isPreview && !expiresAt;
  const invalidDate = value => value !== null && value !== undefined && !formatTemporal(value);
  if (create || stop && isPreview) partial ||= invalidDate(trip.trip_start_date) || invalidDate(trip.trip_end_date);
  if (stop) {
    for (const snapshot of [value.before, value.after].filter(isRecord)) {
      partial ||= invalidDate(snapshot.scheduled_date);
      partial ||= snapshot.scheduled_time != null && (typeof snapshot.scheduled_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(snapshot.scheduled_time));
      partial ||= snapshot.notes != null && (typeof snapshot.notes !== "string" || snapshot.notes.length > 500);
    }
  }
  let title;
  let item;
  if (save) {
    const labels = { saved: "Place saved", already_saved: "Already saved — no duplicate added", removed: "Place removed from saves", already_removed: "Already absent from saves" };
    const statuses = value.action === "save" ? ["saved", "already_saved"] : ["removed", "already_removed"];
    const confirmed = statuses.includes(value.status) && Boolean(cleanText(value.location_id));
    title = isPreview ? value.action === "save" ? "Review your saved place" : "Review removal from saves"
      : confirmed ? labels[value.status] : "Save result not confirmed";
    partial ||= !isPreview && !confirmed;
    partial ||= isPreview && (!firstText(value, ["name"]) || typeof value.currently_saved !== "boolean");
    item = { name: isPreview ? place(value) : "Saved-place receipt", facts: isPreview ? [
      fact("Change", value.action === "save" ? "Save this place" : "Remove from saved places"),
      fact("Current state", value.currently_saved === true ? "Saved" : value.currently_saved === false ? "Not saved" : "Not returned"),
    ] : [fact("Result", confirmed ? labels[value.status] : "Check the existing receipt in chat before retrying")], warnings: [] };
  } else if (create) {
    const confirmed = value.status === "created" && Boolean(cleanText(value.collection_id));
    title = isPreview ? "Review your new trip" : confirmed ? "Trip created" : "Trip result not confirmed";
    partial ||= !isPreview && !confirmed;
    partial ||= !firstText(trip, ["name"]) || trip.visibility !== "private";
    item = { name: firstText(trip, ["name"], 120) || "Your trip", facts: [
      ...tripFacts(trip), fact("Sharing", trip.visibility === "private" ? "Private" : "Not confirmed — check in chat"),
      ...(isPreview ? [fact("Description", cleanText(trip.description, 500) || "No description")] : []),
    ], warnings: value.duplicate_name_warning === true || value.same_name_trip_count > 0
      ? ["A trip with this name already exists. Review it in chat before creating another."] : [] };
  } else {
    const labels = { add: "Add a place", move: "Reschedule a stop", swap: "Replace a place", remove: "Remove a stop" };
    const statuses = { add: "added", move: "moved", swap: "swapped", remove: "removed" };
    const confirmed = value.status === statuses[value.action] && Boolean(cleanText(value.collection_id)) && Boolean(cleanText(value.item_id));
    title = isPreview ? "Review your trip change" : confirmed ? "Trip stop updated" : "Trip change not confirmed";
    partial ||= !isPreview && !confirmed;
    partial ||= value.action !== "remove" && !isRecord(value.after);
    partial ||= value.action !== "add" && !isRecord(value.before);
    partial ||= isPreview && (!firstText(trip, ["name"]) || !cleanText(trip.collection_id));
    const beforeVenue = isRecord(value.stop) ? value.stop.venue : value.venue;
    partial ||= isPreview && !firstText(beforeVenue, ["name"]);
    partial ||= isPreview && value.action === "swap" && !firstText(value.replacement, ["name"]);
    item = { name: isPreview ? firstText(trip, ["name"], 120) || "Your trip" : "Trip-stop receipt",
      facts: [fact("Change", labels[value.action]), ...(isPreview ? tripFacts(trip) : []),
        ...(!isPreview ? [fact("Result", confirmed ? "Saved to your trip" : "Check the existing receipt in chat before retrying")] : [])],
      changes: [
        ...(isPreview ? [{ label: "Place", before: value.action === "add" ? "Not on this trip" : place(beforeVenue),
          after: value.action === "remove" ? "Removed from this trip" : place(value.replacement || value.venue || beforeVenue) }] : []),
        ...Object.entries({ scheduled_date: "Date", scheduled_time: "Time", notes: "Note" }).map(([key, label]) => ({
          label, before: stopValue(value.before, key), after: stopValue(value.after, key),
        })),
      ], notes: ["This changes your itinerary only. It does not book, change, or cancel a reservation."],
      warnings: value.outside_trip_dates_warning === true
        ? [`This stop is outside your trip dates${tripRange(trip)}. Review the date in chat before confirming.`] : [] };
  }
  return { ...base, title, partial, expiresAt, expiresAtIso, items: [item], subtitle: isPreview
    ? partial ? "The preview is incomplete. Review the full request in chat before confirming. Nothing has been changed."
      : "Nothing has been changed. Confirm these exact details in the conversation before saving."
    : partial ? "Do not assume this succeeded. Check the result in chat before repeating the request."
      : "Pearl returned a saved receipt. Replaying this request does not create another change." };
}

function normalizeDiningAvailability(data) {
  if (!Array.isArray(data.slots) || !isRecord(data.venue) || !isRecord(data.query)) return undefined;
  const status = ["available", "pending", "no_availability", "unknown"].includes(data.status) ? data.status : "unknown";
  const venue = firstText(data.venue, ["name"], 120) || "Restaurant";
  const date = formatTemporal(data.query.local_date);
  const partySize = firstNumber(data.query, ["party_size"]);
  const party = Number.isInteger(partySize) && partySize >= 1 && partySize <= 20 ? `${partySize} guests` : "";
  const messages = {
    available: "Options found. Availability can change; no table is held or booked.",
    pending: "Pearl is still checking providers. Continue in chat to check again.",
    no_availability: "Providers returned no matching tables for this request. Try another time, date, or party size.",
    unknown: "Pearl could not confirm availability. This does not mean the restaurant is sold out.",
  };
  // Current servers state each policy once (policies[] + slot.policy_ref) and
  // hoist observation times to the result; older payloads carry them per slot.
  const policies = new Map(arrayAt(data, "policies").filter(isRecord)
    .map((policy) => [firstText(policy, ["ref"], 40), firstText(policy, ["text"], 500)])
    .filter(([ref, text]) => ref && text));
  const checkedLive = data.checked_live !== false;
  const items = status === "available" ? arrayAt(data, "slots").filter(isRecord).map((slot, index) => {
    const provider = firstText(slot, ["platform"], 40);
    const policy = firstText(slot, ["cancellation_policy"], 500) || policies.get(firstText(slot, ["policy_ref"], 40)) || "";
    const observedAt = slot.observed_at ?? data.oldest_observed_at ?? data.observed_at;
    const expiresAt = slot.expires_at ?? data.expires_at;
    const time = formatClock(slot.local_time);
    const deposit = formatMinorPrice({ price: slot.deposit });
    const cutoff = formatDiningTimestamp(slot.cancellation_cutoff_at);
    return {
      id: `dining-slot-${index}`, name: venue, journeyType: "availability", category: "Restaurant availability",
      status: "available", start: date, time: time ? `${time} venue local time` : "", location: firstText(data.venue, ["city"], 80),
      detail: firstText(slot, ["experience_name"], 160), score: formatMinorPrice(slot), stops: [], source: provider || "Pearl",
      freshness: formatDiningTimestamp(observedAt), freshnessLabel: checkedLive ? "Checked" : "Last checked",
      facts: [
        party ? { label: "Party", value: party } : undefined,
        provider ? { label: "Provider", value: provider } : undefined,
        slot.table_type ? { label: "Table", value: firstText(slot, ["table_type"], 80) } : undefined,
        deposit ? { label: "Deposit", value: deposit } : undefined,
        slot.prepayment_required === true ? { label: "Payment", value: "Prepayment required" }
          : slot.payment_required === true ? { label: "Payment", value: "Payment required" } : undefined,
        cutoff ? { label: "Cancellation cutoff", value: cutoff } : undefined,
        policy ? { label: "Cancellation policy", value: policy } : undefined,
        expiresAt ? { label: "Offer expires", value: formatDiningTimestamp(expiresAt) } : undefined,
      ].filter((fact) => fact?.value),
    };
  }) : [];
  return {
    state: items.length ? "ready" : "empty", kind: "availability", availabilityStatus: status,
    title: `${venue} availability`, subtitle: [[date, party].filter(Boolean).join(" · "), messages[status]].filter(Boolean).join(". "),
    emptyTitle: status === "pending" ? "Still checking" : status === "no_availability" ? "No matching tables" : "Availability not confirmed",
    items, partial: false, refreshInProgress: data.refresh_in_progress === true,
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
  // Airport-local labels ("Fri 11 Sep, 6:10 PM PDT") win over raw instants.
  const departure = firstText(firstSegment, ["departure_label"], 60)
    || formatTemporal(firstScalar(sources, ["departure_time", "departure_at", "scheduled_departure_at", "departs_at", "departure", "start_time"], 80));
  const arrival = firstText(lastSegment, ["arrival_label"], 60)
    || formatTemporal(firstScalar([value, firstSlice, lastSegment], ["arrival_time", "arrival_at", "scheduled_arrival_at", "arrives_at", "arrival", "end_time"], 80));
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
    priceLabel: isSlot ? "Price" : "Fare",
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
      cabin ? { label: "Cabin", value: enumLabel(CABIN_LABELS, cabin.toLowerCase(), sentenceCase(cabin)) } : undefined,
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
  const requiredScope = (Object.hasOwn(WRITE_ACCESS_LABELS, scopeCandidate) || (/^[a-z]+:read$/.test(scopeCandidate) && PUBLIC_READ_SCOPES.has(scopeCandidate)))
    ? scopeCandidate
    : "";
  const actionCandidate = firstText(candidate, ["user_action"], 40);
  return {
    code: firstText(candidate, ["code"], 80) || "tool_error",
    message: firstText(candidate, ["message"], 220) || "Pearl could not complete this request.",
    userAction: SAFE_USER_ACTIONS.has(actionCandidate) ? actionCandidate : "retry",
    requiredScope,
    accessLabel: WRITE_ACCESS_LABELS[requiredScope] || READ_ACCESS_LABELS[requiredScope] || "",
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

  // The member's own lists: saves_list and visits_list.
  if (Array.isArray(data.saved)) return { kind: "venues", source: "saved", values: arrayAt(data, "saved").map((value) => ({ value })) };
  if (Array.isArray(data.visits)) return { kind: "venues", source: "visits", values: arrayAt(data, "visits").map((value) => ({ value })) };
  if (Array.isArray(data.matches) && typeof data.matching_policy === "string") {
    return { kind: "matches", values: arrayAt(data, "matches").map((value) => ({ value })) };
  }

  const reservations = arrayAt(data, "reservations");
  const trips = [...arrayAt(data, "trips"), ...arrayAt(data, "collections")];
  const singleTrip = isRecord(data.trip) ? [data.trip] : [];
  // reservation_get answers with the reservation itself, not a wrapper.
  const flatReservation = !Array.isArray(data.reservations) && typeof data.id === "string"
    && ["user_reservations", "member_reservations"].includes(data.source) ? [data] : [];
  const singleReservation = isRecord(data.reservation) ? [data.reservation] : flatReservation;
  const hasJourneyEnvelope = ["reservations", "trips", "collections"].some((key) => Array.isArray(data[key]))
    || isRecord(data.trip)
    || isRecord(data.reservation)
    || flatReservation.length > 0;
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

function titleFor(kind, count, data, view, source = "") {
  const explicit = firstText(view, ["title"], 100) || firstText(data, ["title", "heading"], 100);
  if (explicit) return explicit;
  if (source === "saved") return count === 1 ? "Your saved place" : "Your saved places";
  if (source === "visits") return count === 1 ? "A place you've been" : "Places you've been";
  if (kind === "matches") return count === 1 ? "Place match" : "Place matches";
  if (kind === "venues") return count === 1 ? "A place worth considering" : "Places picked for you";
  if (kind === "journeys") {
    const hasReservations = arrayAt(data, "reservations").length > 0 || isRecord(data.reservation)
      || ["user_reservations", "member_reservations"].includes(data.source);
    const hasTrips = arrayAt(data, "trips").length > 0 || arrayAt(data, "collections").length > 0 || isRecord(data.trip);
    if (hasTrips && !hasReservations) return count === 1 ? "Your trip or collection" : "Your trips and collections";
    if (hasReservations && !hasTrips) return count === 1 ? "Your reservation" : "Your reservations";
    return count === 1 ? "Your plan" : "Trips and reservations";
  }
  if (kind === "flights") return count === 1 ? "One travel option" : "Flight and availability options";
  return "Pearl results";
}

function actionPresentation(model) {
  // A receipt can contain skipped items. Never turn its presence into a
  // blanket success badge, or an incomplete preview into approval to save.
  const items = model.items.map((item) => ({ ...item,
    changes: (item.changes || []).map((change) => ({ ...change, changed: change.before !== change.after })) }));
  return { ...model, items,
    statusLabel: model.partial ? "Check in chat" : model.actionStage === "preview" ? "Not saved yet" : "Receipt",
    incompleteMessage: model.actionStage === "preview"
      ? "This preview is incomplete. Review the full request in the conversation before confirming."
      : "This receipt needs review. Check what was saved in the conversation before retrying.",
  };
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

  const visitAction = normalizeVisitAction(data);
  if (visitAction) return actionPresentation(visitAction);

  const planAction = normalizePlanAction(data);
  if (planAction) return actionPresentation(planAction);

  const diningAvailability = normalizeDiningAvailability(data);
  if (diningAvailability) {
    const pearlUrl = pearlAppUrl(firstText(data.next_step, ["url"], 300)) || pearlAppUrl(firstText(data.venue, ["pearl_url"], 300));
    return pearlUrl ? { ...diningAvailability, pearlUrl } : diningAvailability;
  }

  const tripDetail = normalizeTripDetail(data);
  if (tripDetail) return tripDetail;

  const venueDetail = normalizeVenueDetail(data);
  if (venueDetail) return venueDetail;

  const collection = inferCollection(data);
  const view = explicitView(data)?.view || {};
  let items = [];
  if (collection.kind === "venues") {
    const visit = collection.source === "visits";
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeVenue(entry.value, index, entry.group, visit ? { scoreLabel: "member", visit } : {}));
    // An explicit top_pick wins; the legacy shortlist recommendation is only a
    // pick when there is more than one place to pick from.
    const pickId = firstText(data.top_pick, ["id", "location_id"], 120)
      || (items.some((item) => item.topPick) || items.length < 2 ? "" : firstText(data.shortlist, ["recommended_candidate_id"], 120));
    if (pickId) items = items.map((item) => ({ ...item, topPick: item.topPick || item.id === pickId }));
  } else if (collection.kind === "journeys") {
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeJourney(entry.value, index, entry.hint || "trip"));
  } else if (collection.kind === "flights") {
    items = uniqueEntries(collection.values)
      .map((entry, index) => normalizeFlight(entry.value, index, entry.hint || "flight"));
  } else if (collection.kind === "matches") {
    items = collection.values.slice(0, MAX_ITEMS).map((entry, index) => normalizePlaceMatch(entry.value, index));
  }

  const partial = data.partial === true
    || data.is_partial === true
    || data.coverage_state === "partial"
    || arrayAt(data, "warnings").length > 0
    || arrayAt(data, "errors").length > 0;
  const subtitle = firstText(view, ["subtitle", "summary"], 200)
    || firstText(data, ["message", "summary"], 200)
    || (collection.kind === "matches" ? matchSummary(data.summary, items)
      : collection.source === "saved" ? "Places you saved in Pearl."
      : collection.source === "visits" ? "Your visits, with your own scores and notes."
      : collection.kind === "venues" ? "Places from Pearl's catalog, with what makes each one stand out."
      : collection.kind === "journeys" ? "Dates, status, and the details returned by your Pearl account."
      : collection.kind === "flights" ? "Live-looking data can change; confirm availability before acting."
      : "The tool returned no supported visual collection.");
  const memberList = collection.source === "saved" || collection.source === "visits";
  return {
    state: items.length ? "ready" : "empty",
    kind: collection.kind,
    title: titleFor(collection.kind, items.length, data, view, collection.source),
    subtitle,
    items,
    partial,
    ...(collection.kind === "venues" ? { rankingBasis: firstText(data.shortlist, ["ranking_basis"], 240) } : {}),
    // Comparing is for choosing between catalog results, not a member's history.
    ...(memberList ? { comparable: false, countNote: pageNote(data.pagination, items.length) } : {}),
  };
}

// "Showing 20 of 57" when a member list continues past this page.
function pageNote(pagination, shown) {
  if (!isRecord(pagination) || !shown) return "";
  const total = firstNumber(pagination, ["total_count"]);
  const through = firstNumber(pagination, ["returned_through"]) ?? shown;
  if (!Number.isInteger(through) || through < shown) return "";
  const range = through > shown ? `${through - shown + 1}–${through}` : `${through}`;
  if (total !== undefined && Number.isInteger(total) && total > through) {
    return `Showing ${range} of ${formatNumber(total, 0)}. Ask for more in chat.`;
  }
  return pagination.partial_reason === "page_limit" ? `Showing ${range}. Ask for more in chat.` : "";
}

export function recoveryPrompt(error) {
  const safe = isRecord(error) ? error : {};
  const action = SAFE_USER_ACTIONS.has(safe.userAction) ? safe.userAction : "retry";
  if (action === "grant_scope" && safe.requiredScope === "visits:write") {
    return "Reconnect Pearl, approve access to add and edit visits, then review my pending request and any existing receipt before preparing it again.";
  }
  if (Object.hasOwn(WRITE_ACCESS_LABELS, safe.requiredScope)) {
    return `${action === "reconnect" || action === "grant_scope" ? "Reconnect Pearl and approve the required access, then " : "Please "}check my pending request and any existing receipt before preparing it again. Ask me to confirm any new preview in chat.`;
  }
  return RECOVERY_PROMPTS[action];
}

export const PEARL_MODEL_LIMITS = Object.freeze({
  maxItems: MAX_ITEMS,
  maxText: MAX_TEXT,
  publicReadScopes: Object.freeze([...PUBLIC_READ_SCOPES]),
  imageOriginPrefix: IMAGE_ORIGIN_PREFIX,
});
