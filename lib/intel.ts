import { createHash } from "node:crypto";
import Parser from "rss-parser";

import {
  IntelCategory,
  IntelEvent,
  NewsLanguage,
  OilSnapshot,
  SourceRegion,
  SourceTier,
} from "@/lib/types";
import { normalizeText, uniqueBy } from "@/lib/utils";

const parser = new Parser();
const MAX_NEWS_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const TRANSLATION_CACHE_LIMIT = 12000;
const TRANSLATION_CONCURRENCY = 8;
const EN_TRANSLATION_CACHE = new Map<string, string>();
const NEWS_FEED_VARIANTS: ReadonlyArray<{ hl: string; gl: string; ceid: string }> = [
  { hl: "en-US", gl: "US", ceid: "US:en" },
  { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  { hl: "ar", gl: "AE", ceid: "AE:ar" },
  { hl: "fa", gl: "IR", ceid: "IR:fa" },
  { hl: "ru", gl: "RU", ceid: "RU:ru" },
  { hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans" },
];

const NEWS_QUERIES: Array<{
  bucket: string;
  query: string;
  defaultCategory: IntelCategory;
}> = [
  {
    bucket: "war",
    query:
      "(middle east OR gulf OR levant OR red sea OR iran OR israel OR palestine OR lebanon OR syria OR iraq OR yemen) (war OR missile OR strike OR conflict OR military)",
    defaultCategory: "war",
  },
  {
    bucket: "aviation",
    query:
      "(middle east OR gulf OR levant OR red sea OR iran OR israel OR saudi OR uae OR qatar OR oman) (aviation OR airline OR airport OR airspace OR flight)",
    defaultCategory: "aviation",
  },
  {
    bucket: "port",
    query:
      "(strait of hormuz OR persian gulf OR red sea OR suez OR bab el-mandeb OR middle east OR israel) (shipping OR tanker OR maritime OR port OR vessel)",
    defaultCategory: "port",
  },
  {
    bucket: "oil",
    query:
      "(middle east OR gulf OR opec OR iran OR israel OR saudi OR iraq OR uae OR qatar OR kuwait) (oil OR crude OR brent OR energy)",
    defaultCategory: "oil",
  },
  {
    bucket: "statement",
    query:
      "(middle east OR gulf OR iran OR israel OR palestine OR lebanon OR syria OR iraq OR yemen) (statement OR says OR announces OR warns OR ministry OR spokesman)",
    defaultCategory: "statement",
  },
  {
    bucket: "hormuz",
    query:
      "(\"strait of hormuz\" OR \"persian gulf\" OR israel OR middle east) (closure OR blockade OR disruption OR tension)",
    defaultCategory: "port",
  },
  {
    bucket: "naval",
    query:
      "(middle east OR gulf OR red sea OR arabian sea OR iran OR israel OR saudi OR uae OR oman OR yemen) (navy OR naval OR destroyer OR warship OR escort)",
    defaultCategory: "war",
  },
  {
    bucket: "energy-security",
    query:
      "(middle east OR gulf OR red sea OR levant OR israel) (oil supply OR tanker route OR refinery OR export terminal OR pipeline)",
    defaultCategory: "oil",
  },
  {
    bucket: "regional-politics",
    query:
      "(middle east OR gulf OR levant OR israel) (ceasefire OR diplomacy OR sanctions OR ministry OR summit OR envoy)",
    defaultCategory: "statement",
  },
  {
    bucket: "regional-security",
    query:
      "(middle east OR gulf OR red sea OR levant OR israel) (security alert OR retaliation OR mobilization OR cross-border)",
    defaultCategory: "war",
  },
];

const CATEGORY_RULES: Array<{ category: IntelCategory; pattern: RegExp }> = [
  { category: "attack", pattern: /attack|strike|bomb|missile|drone|shell|raid|hit/i },
  { category: "statement", pattern: /said|statement|announced|warned|declared|urged|spokesperson/i },
  { category: "casualties", pattern: /killed|dead|injured|casualt|fatalit|wounded/i },
  { category: "aviation", pattern: /flight|airspace|airline|airport|aviation|jet/i },
  { category: "port", pattern: /port|shipping|ship|vessel|tanker|maritime|strait|hormuz/i },
  { category: "war", pattern: /war|military|conflict|ceasefire|forces|troops|regime/i },
  { category: "oil", pattern: /oil|crude|brent|opec|energy|barrel/i },
];

const LOCATION_RULES: Array<{
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}> = [
  { name: "Bandar Abbas", lat: 27.1832, lng: 56.2666, aliases: ["bandar abbas"] },
  { name: "Strait of Hormuz", lat: 26.5667, lng: 56.25, aliases: ["strait of hormuz", "hormuz"] },
  { name: "Persian Gulf", lat: 27.0, lng: 52.0, aliases: ["persian gulf", "gulf shipping"] },
  { name: "Tehran", lat: 35.6892, lng: 51.389, aliases: ["tehran"] },
  { name: "Isfahan", lat: 32.6539, lng: 51.666, aliases: ["isfahan", "natanz"] },
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818, aliases: ["tel aviv"] },
  { name: "Jerusalem", lat: 31.7683, lng: 35.2137, aliases: ["jerusalem"] },
  { name: "Gaza", lat: 31.3547, lng: 34.3088, aliases: ["gaza", "rafah", "khan younis"] },
  { name: "Damascus", lat: 33.5138, lng: 36.2765, aliases: ["damascus"] },
  { name: "Aleppo", lat: 36.2021, lng: 37.1343, aliases: ["aleppo"] },
  { name: "Baghdad", lat: 33.3152, lng: 44.3661, aliases: ["baghdad"] },
  { name: "Basra", lat: 30.5085, lng: 47.7804, aliases: ["basra"] },
  { name: "Sanaa", lat: 15.3694, lng: 44.191, aliases: ["sanaa"] },
  { name: "Aden", lat: 12.7855, lng: 45.0187, aliases: ["aden"] },
  { name: "Red Sea", lat: 20.0, lng: 38.0, aliases: ["red sea"] },
  { name: "Muscat", lat: 23.588, lng: 58.3829, aliases: ["muscat", "oman"] },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, aliases: ["dubai", "fujairah", "jebel ali"] },
  { name: "Abu Dhabi", lat: 24.4539, lng: 54.3773, aliases: ["abu dhabi"] },
  { name: "Doha", lat: 25.2854, lng: 51.531, aliases: ["doha", "qatar"] },
  { name: "Riyadh", lat: 24.7136, lng: 46.6753, aliases: ["riyadh", "saudi arabia"] },
  { name: "Nicosia", lat: 35.1856, lng: 33.3823, aliases: ["cyprus", "nicosia"] },
  { name: "Beirut", lat: 33.8938, lng: 35.5018, aliases: ["lebanon", "beirut"] },
  { name: "Tehran", lat: 35.6892, lng: 51.389, aliases: ["iran", "iranian"] },
  { name: "Jerusalem", lat: 31.7683, lng: 35.2137, aliases: ["israel", "israeli"] },
  { name: "Damascus", lat: 33.5138, lng: 36.2765, aliases: ["syria", "syrian"] },
  { name: "Baghdad", lat: 33.3152, lng: 44.3661, aliases: ["iraq", "iraqi"] },
  { name: "Sanaa", lat: 15.3694, lng: 44.191, aliases: ["yemen", "yemeni", "houthi", "houthis"] },
];

export interface SourceCatalogEntry {
  outlet: string;
  domains: string[];
  region: SourceRegion;
  tier: SourceTier;
}

export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  { outlet: "Reuters", domains: ["reuters.com"], region: "uk", tier: "tier-1" },
  { outlet: "Associated Press", domains: ["apnews.com"], region: "us", tier: "tier-1" },
  { outlet: "AP", domains: ["apnews.com"], region: "us", tier: "tier-1" },
  { outlet: "AFP", domains: ["afp.com"], region: "uk", tier: "tier-1" },

  { outlet: "BBC", domains: ["bbc.com", "bbc.co.uk"], region: "uk", tier: "tier-1" },
  { outlet: "Financial Times", domains: ["ft.com"], region: "uk", tier: "tier-1" },
  { outlet: "The Guardian", domains: ["theguardian.com"], region: "uk", tier: "tier-1" },
  { outlet: "The Economist", domains: ["economist.com"], region: "uk", tier: "tier-1" },
  { outlet: "Sky News", domains: ["news.sky.com"], region: "uk", tier: "tier-2" },
  { outlet: "The Telegraph", domains: ["telegraph.co.uk"], region: "uk", tier: "tier-2" },

  { outlet: "The New York Times", domains: ["nytimes.com"], region: "us", tier: "tier-1" },
  { outlet: "Washington Post", domains: ["washingtonpost.com"], region: "us", tier: "tier-1" },
  { outlet: "Wall Street Journal", domains: ["wsj.com"], region: "us", tier: "tier-1" },
  { outlet: "Bloomberg", domains: ["bloomberg.com"], region: "us", tier: "tier-1" },
  { outlet: "CNN", domains: ["cnn.com"], region: "us", tier: "tier-1" },
  { outlet: "NBC News", domains: ["nbcnews.com"], region: "us", tier: "tier-2" },
  { outlet: "CBS News", domains: ["cbsnews.com"], region: "us", tier: "tier-2" },
  { outlet: "Fox News", domains: ["foxnews.com"], region: "us", tier: "tier-3" },

  { outlet: "Xinhua", domains: ["news.cn", "xinhuanet.com"], region: "china", tier: "tier-1" },
  { outlet: "CGTN", domains: ["cgtn.com"], region: "china", tier: "tier-1" },
  { outlet: "China Daily", domains: ["chinadaily.com.cn"], region: "china", tier: "tier-1" },
  { outlet: "Global Times", domains: ["globaltimes.cn"], region: "china", tier: "tier-1" },
  { outlet: "SCMP", domains: ["scmp.com"], region: "china", tier: "tier-1" },

  { outlet: "TASS", domains: ["tass.com"], region: "russia", tier: "tier-1" },
  { outlet: "Interfax", domains: ["interfax.ru"], region: "russia", tier: "tier-1" },
  { outlet: "RIA Novosti", domains: ["ria.ru"], region: "russia", tier: "tier-1" },
  { outlet: "RT", domains: ["rt.com"], region: "russia", tier: "tier-2" },
  { outlet: "Sputnik", domains: ["sputniknews.com"], region: "russia", tier: "tier-2" },
  { outlet: "RBC", domains: ["rbc.ru"], region: "russia", tier: "tier-3" },

  { outlet: "Al Jazeera", domains: ["aljazeera.com"], region: "middle-east", tier: "tier-1" },
  { outlet: "Al Arabiya", domains: ["alarabiya.net"], region: "middle-east", tier: "tier-1" },
  { outlet: "Asharq Al-Awsat", domains: ["aawsat.com"], region: "middle-east", tier: "tier-1" },
  { outlet: "The National", domains: ["thenationalnews.com"], region: "middle-east", tier: "tier-1" },
  { outlet: "Haaretz", domains: ["haaretz.com"], region: "middle-east", tier: "tier-1" },
  { outlet: "Jerusalem Post", domains: ["jpost.com"], region: "middle-east", tier: "tier-2" },
];

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getGoogleNewsUrl(
  query: string,
  variant: { hl: string; gl: string; ceid: string },
): string {
  const search = new URLSearchParams({
    q: `${query} when:3d`,
    hl: variant.hl,
    gl: variant.gl,
    ceid: variant.ceid,
  });

  return `https://news.google.com/rss/search?${search.toString()}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAliasIndex(text: string, alias: string): number {
  const pattern = new RegExp(`(^|\\W)${escapeRegExp(alias)}(\\W|$)`, "i");
  const match = text.match(pattern);
  if (!match || match.index === undefined) {
    return -1;
  }
  const leadingSepLength = match[1]?.length ?? 0;
  return match.index + leadingSepLength;
}

function inferLocation(text: string): { name: string; lat: number; lng: number } | null {
  const lowered = text.toLowerCase();
  let best:
    | {
        idx: number;
        aliasLength: number;
        rule: (typeof LOCATION_RULES)[number];
      }
    | null = null;

  for (const rule of LOCATION_RULES) {
    for (const alias of rule.aliases) {
      const idx = findAliasIndex(lowered, alias);
      if (idx < 0) continue;
      if (
        !best ||
        idx < best.idx ||
        (idx === best.idx && alias.length > best.aliasLength)
      ) {
        best = { idx, aliasLength: alias.length, rule };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    name: best.rule.name,
    lat: best.rule.lat,
    lng: best.rule.lng,
  };
}

function setTranslationCache(key: string, value: string): void {
  if (EN_TRANSLATION_CACHE.size >= TRANSLATION_CACHE_LIMIT) {
    const firstKey = EN_TRANSLATION_CACHE.keys().next().value;
    if (firstKey) {
      EN_TRANSLATION_CACHE.delete(firstKey);
    }
  }
  EN_TRANSLATION_CACHE.set(key, value);
}

function needsEnglishTranslation(text: string): boolean {
  return /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(
    text,
  );
}

async function translateTextToEnglish(text: string): Promise<string> {
  const key = normalizeText(text).slice(0, 1200);
  if (!key) return text;

  const cached = EN_TRANSLATION_CACHE.get(key);
  if (cached) return cached;

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) return text;
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return text;
    const translated = payload[0]
      .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : ""))
      .join("")
      .trim();
    const result = translated || text;
    setTranslationCache(key, result);
    return result;
  } catch {
    return text;
  }
}

async function translateTextToEnglishWithRetry(text: string): Promise<string> {
  const first = await translateTextToEnglish(text);
  if (first !== text || !needsEnglishTranslation(text)) {
    return first;
  }
  return translateTextToEnglish(text);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await task(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function translateEventsToEnglish(events: IntelEvent[]): Promise<IntelEvent[]> {
  const titleJobs = uniqueBy(
    events
      .filter((event) => event.language !== "en" || needsEnglishTranslation(event.title))
      .map((event) => event.title),
    (value) => normalizeText(value),
  );
  const summaryJobs = uniqueBy(
    events
      .filter((event) => event.language !== "en" || needsEnglishTranslation(event.summary))
      .map((event) => event.summary)
      .filter((summary) => summary.length > 0),
    (value) => normalizeText(value),
  );

  const translated = new Map<string, string>();
  const jobs = [...titleJobs, ...summaryJobs];

  await runWithConcurrency(jobs, TRANSLATION_CONCURRENCY, async (text) => {
      const key = normalizeText(text);
      if (!key) return;
      const next = await translateTextToEnglishWithRetry(text);
      translated.set(key, next);
    });

  return events.map((event) => {
    const translatedTitle = translated.get(normalizeText(event.title)) ?? event.title;
    const translatedSummary = translated.get(normalizeText(event.summary)) ?? event.summary;
    return {
      ...event,
      title: translatedTitle,
      summary: translatedSummary,
    };
  });
}

function classify(title: string, summary: string, fallback: IntelCategory): IntelCategory[] {
  const joined = `${title} ${summary}`;
  const categories = new Set<IntelCategory>([fallback]);

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(joined)) {
      categories.add(rule.category);
    }
  }

  return [...categories];
}

function severityOf(categories: IntelCategory[]): number {
  if (categories.includes("casualties")) {
    return 3;
  }

  if (categories.includes("attack") || categories.includes("war")) {
    return 2;
  }

  return 1;
}

function createEventId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function parseHeadlineAndSource(title: string): { title: string; source: string } {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const segments = cleaned.split(" - ");

  if (segments.length < 2) {
    return { title: cleaned, source: "Unknown" };
  }

  const source = segments.pop() ?? "Unknown";
  return {
    title: segments.join(" - "),
    source,
  };
}

function guessLanguage(title: string, domain: string): NewsLanguage {
  if (/[\u4e00-\u9fff]/.test(title) || /xinhua|cgtn|chinadaily|globaltimes|scmp/.test(domain)) {
    return "zh";
  }
  if (/[\u0400-\u04FF]/.test(title) || /tass|sputnik|rt\./.test(domain)) {
    return "ru";
  }
  if (/[\u0600-\u06FF]/.test(title) && !/[\u0750-\u077F]/.test(title)) {
    return "ar";
  }
  if (/[\u0750-\u077F\u08A0-\u08FF]/.test(title) || /\.ir$/.test(domain)) {
    return "fa";
  }
  if (/[\uAC00-\uD7AF]/.test(title)) {
    return "ko";
  }
  return "en";
}

function inferSourceTier(domain: string, sourceName?: string): { region: SourceRegion; tier: SourceTier } {
  const normalized = domain.toLowerCase();
  const normalizedSource = normalizeText(sourceName ?? "");
  const hit = SOURCE_CATALOG.find((entry) => {
    const domainMatch = entry.domains.some(
      (entryDomain) => normalized === entryDomain || normalized.endsWith(`.${entryDomain}`),
    );
    const normalizedOutlet = normalizeText(entry.outlet);
    const outletMatch =
      normalizedSource.length > 0 &&
      (normalizedOutlet === normalizedSource ||
        normalizedSource.includes(normalizedOutlet) ||
        normalizedOutlet.includes(normalizedSource));
    return domainMatch || outletMatch;
  });

  if (hit) {
    return {
      region: hit.region,
      tier: hit.tier,
    };
  }

  if (/\.cn$/.test(normalized)) {
    return { region: "china", tier: "tier-3" };
  }
  if (/\.ru$/.test(normalized)) {
    return { region: "russia", tier: "tier-3" };
  }
  if (/\.uk$|\.co\.uk$/.test(normalized)) {
    return { region: "uk", tier: "tier-3" };
  }
  if (/\.ae$|\.sa$|\.ir$|\.il$|\.qa$/.test(normalized)) {
    return { region: "middle-east", tier: "tier-3" };
  }

  return { region: "us", tier: "tier-3" };
}

async function fetchNewsBucket(
  bucket: string,
  query: string,
  defaultCategory: IntelCategory,
): Promise<IntelEvent[]> {
  const settled = await Promise.allSettled(
    NEWS_FEED_VARIANTS.map((variant) => parser.parseURL(getGoogleNewsUrl(query, variant))),
  );
  const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value.items ?? [] : []));
  const oldestAllowed = Date.now() - MAX_NEWS_AGE_MS;

  return items.reduce<IntelEvent[]>((acc, item) => {
      const titleRaw = item.title ?? "Untitled";
      const summary = stripTags(item.contentSnippet ?? item.content ?? "");
      const { title, source } = parseHeadlineAndSource(titleRaw);
      const published = item.isoDate ?? item.pubDate ?? new Date().toISOString();
      const parsedMs = Date.parse(published);
      if (!Number.isFinite(parsedMs) || parsedMs < oldestAllowed) {
        return acc;
      }
      const categories = classify(title, summary, defaultCategory);
      const location = inferLocation(`${title} ${summary}`);

      const parsedDomain = item.link ? new URL(item.link).hostname.replace(/^www\./, "") : "";
      const { region, tier } = inferSourceTier(parsedDomain, source);
      const language = guessLanguage(title, parsedDomain);

      acc.push({
        id: createEventId(bucket, normalizeText(title), source, published),
        title,
        summary,
        source,
        url: item.link ?? "",
        publishedAt: new Date(parsedMs).toISOString(),
        categories,
        location,
        queryBucket: bucket,
        severity: severityOf(categories),
        language,
        sourceRegion: region,
        sourceTier: tier,
      });
      return acc;
    }, []);
}

async function fetchGdeltFallback(): Promise<IntelEvent[]> {
  const query = "iran AND (hormuz OR middle east OR strike OR missile OR oil OR tanker OR port)";
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    query,
  )}&mode=ArtList&maxrecords=250&format=json&sort=DateDesc`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-dashboard/1.0",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    articles?: Array<{
      title?: string;
      url?: string;
      seendate?: string;
      domain?: string;
      sourcecountry?: string;
    }>;
  };

  const oldestAllowed = Date.now() - MAX_NEWS_AGE_MS;

  return (payload.articles ?? [])
    .filter((article) => article.title && article.url)
    .reduce<IntelEvent[]>((acc, article) => {
      const title = (article.title ?? "Untitled").trim();
      const summary = `GDELT fallback feed (${article.sourcecountry ?? "unknown region"})`;
      const publishedRaw = article.seendate ?? "";
      const publishedAt =
        /^\d{8}T\d{6}Z$/.test(publishedRaw)
          ? new Date(
              `${publishedRaw.slice(0, 4)}-${publishedRaw.slice(4, 6)}-${publishedRaw.slice(
                6,
                8,
              )}T${publishedRaw.slice(9, 11)}:${publishedRaw.slice(11, 13)}:${publishedRaw.slice(
                13,
                15,
              )}Z`,
            ).toISOString()
          : new Date().toISOString();
      if (Date.parse(publishedAt) < oldestAllowed) {
        return acc;
      }
      const categories = classify(title, summary, "war");
      const location = inferLocation(`${title} ${summary}`);
      const domain = (article.domain ?? "gdelt").replace(/^www\./, "");
      const { region, tier } = inferSourceTier(domain, domain);

      acc.push({
        id: createEventId("gdelt", normalizeText(title), article.url ?? "", publishedAt),
        title,
        summary,
        source: article.domain ?? "GDELT",
        url: article.url ?? "",
        publishedAt,
        categories,
        location,
        queryBucket: "gdelt",
        severity: severityOf(categories),
        language: guessLanguage(title, domain),
        sourceRegion: region,
        sourceTier: tier,
      });
      return acc;
    }, []);
}

export async function fetchOilSnapshot(): Promise<OilSnapshot | null> {
  const response = await fetch("https://stooq.com/q/l/?s=cl.f&f=sd2t2ohlcv&h&e=csv", {
    headers: {
      "user-agent": "hormuz-dashboard/1.0",
      accept: "text/csv",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const csv = (await response.text()).trim();
  const rows = csv.split("\n");
  if (rows.length < 2) {
    return null;
  }

  const values = rows[1]?.split(",") ?? [];
  if (values.length < 8 || values[1] === "N/D") {
    return null;
  }

  const [symbol, date, time, openRaw, highRaw, lowRaw, closeRaw] = values;
  const open = Number.parseFloat(openRaw);
  const high = Number.parseFloat(highRaw);
  const low = Number.parseFloat(lowRaw);
  const close = Number.parseFloat(closeRaw);

  if (![open, high, low, close].every((num) => Number.isFinite(num))) {
    return null;
  }

  const timestamp = `${date}T${time}Z`;
  const changePct = open === 0 ? 0 : ((close - open) / open) * 100;

  return {
    symbol,
    open,
    high,
    low,
    close,
    changePct,
    updatedAt: new Date(timestamp).toISOString(),
  };
}

function makeOilEvent(snapshot: OilSnapshot): IntelEvent {
  const direction = snapshot.changePct >= 0 ? "up" : "down";
  const pct = `${snapshot.changePct >= 0 ? "+" : ""}${snapshot.changePct.toFixed(2)}%`;

  return {
    id: createEventId("oil", snapshot.updatedAt, snapshot.close.toString()),
    title: `WTI crude ${direction} ${pct} (${snapshot.close.toFixed(2)})`,
    summary: `Open ${snapshot.open.toFixed(2)}, high ${snapshot.high.toFixed(2)}, low ${snapshot.low.toFixed(2)}.`,
    source: "Stooq",
    url: "https://stooq.com/q/l/?s=cl.f&f=sd2t2ohlcv&h&e=csv",
    publishedAt: snapshot.updatedAt,
    categories: ["oil"],
    location: {
      name: "Strait of Hormuz",
      lat: 26.5667,
      lng: 56.25,
    },
    queryBucket: "oil",
    severity: 1,
    language: "en",
    sourceRegion: "us",
    sourceTier: "tier-2",
  };
}

export async function fetchIntelEvents(limit = 120): Promise<IntelEvent[]> {
  const settled = await Promise.allSettled(
    NEWS_QUERIES.map((config) =>
      fetchNewsBucket(config.bucket, config.query, config.defaultCategory),
    ),
  );

  let events = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((event) => event.url);

  const fallbackEvents = await fetchGdeltFallback().catch(() => []);
  events = [...events, ...fallbackEvents];

  const oilSnapshot = await fetchOilSnapshot().catch(() => null);
  if (oilSnapshot) {
    events.push(makeOilEvent(oilSnapshot));
  }

  const uniqueEvents = uniqueBy(
    events,
    (event) => `${normalizeText(event.title)}|${normalizeText(event.source)}|${event.url}`,
  )
    .sort((a, b) => {
      const aIsOilSnapshot = a.source === "Stooq" || a.queryBucket === "oil";
      const bIsOilSnapshot = b.source === "Stooq" || b.queryBucket === "oil";
      if (aIsOilSnapshot !== bIsOilSnapshot) {
        return aIsOilSnapshot ? 1 : -1;
      }
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    })
    .slice(0, limit);

  return translateEventsToEnglish(uniqueEvents);
}
