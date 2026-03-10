import {
  MarketDetail,
  MarketSummary,
  MarketTag,
  MaturityBucket,
  OrderLevel,
  OutcomeOrderBook,
  OutcomePrice,
  PricePoint,
} from "@/lib/types";
import { normalizeText, parseJsonArray, toNumber } from "@/lib/utils";

const POLYMARKET_API = "https://gamma-api.polymarket.com";
const POLYMARKET_CLOB_API = "https://clob.polymarket.com";
const CORE_PATTERN =
  /\biran(?:ian)?\b|\bhormuz\b|persian gulf|middle\s*east|\boil\b|\bcrude\b|\bbrent\b|\bopec\b|\btanker\b|\bmaritime\b|\bred sea\b|\bisrael\b|\bgaza\b/i;

const TAG_RULES: Array<{ tag: MarketTag; pattern: RegExp }> = [
  { tag: "iran", pattern: /\biran(?:ian)?\b/i },
  { tag: "middle-east", pattern: /middle\s*east|gaza|israel|lebanon|syria|iraq|red sea|houthi/i },
  { tag: "oil", pattern: /\boil\b|\bbrent\b|\bcrude\b|\bwti\b|\bopec\b/i },
  { tag: "shipping", pattern: /\bhormuz\b|\btanker\b|\bshipping\b|\bmaritime\b|\bvessel\b|\bstrait\b/i },
  { tag: "military", pattern: /attack|strike|missile|war|ceasefire|regime|forces|military/i },
];

const AGENDA_KEYWORD_RULES: Array<{ keyword: string; pattern: RegExp }> = [
  { keyword: "Hormuz", pattern: /hormuz|strait of hormuz|persian gulf/i },
  { keyword: "Iran", pattern: /\biran(?:ian)?\b/i },
  { keyword: "Israel", pattern: /\bisrael\b/i },
  { keyword: "Gaza", pattern: /\bgaza\b|hamas/i },
  { keyword: "Red Sea", pattern: /red sea|houthi/i },
  { keyword: "Oil", pattern: /\boil\b|crude|brent|wti|opec/i },
  { keyword: "Shipping", pattern: /shipping|tanker|vessel|maritime|freight/i },
  { keyword: "Military", pattern: /attack|strike|missile|airstrike|retaliat|war|ceasefire|forces/i },
  { keyword: "Sanctions", pattern: /sanction/i },
  { keyword: "US", pattern: /\bu\.?s\.?\b|united states|washington|white house|trump|biden/i },
  { keyword: "Rate", pattern: /fed|interest rate|fomc|basis point|bps/i },
  { keyword: "Nuclear", pattern: /nuclear|uranium|iaea/i },
];

const STOPWORDS = new Set([
  "will",
  "what",
  "when",
  "where",
  "which",
  "could",
  "would",
  "after",
  "before",
  "about",
  "between",
  "under",
  "over",
  "into",
  "from",
  "with",
  "without",
  "during",
  "have",
  "has",
  "this",
  "that",
  "these",
  "those",
  "market",
  "price",
  "prices",
  "outcome",
  "outcomes",
  "yes",
  "no",
  "will",
  "the",
  "and",
  "for",
  "not",
  "than",
]);

function detectTags(question: string, description: string): MarketTag[] {
  const input = `${question} ${description}`;
  return TAG_RULES.filter((rule) => rule.pattern.test(input)).map((rule) => rule.tag);
}

function classifyMaturity(endDate: string | null): MaturityBucket {
  if (!endDate) {
    return "no-expiry";
  }

  const endMs = Date.parse(endDate);
  if (Number.isNaN(endMs)) {
    return "no-expiry";
  }

  const delta = endMs - Date.now();
  if (delta < 0) {
    return "expired";
  }
  if (delta <= 24 * 60 * 60 * 1000) {
    return "within-24h";
  }
  if (delta <= 7 * 24 * 60 * 60 * 1000) {
    return "within-7d";
  }
  if (delta <= 30 * 24 * 60 * 60 * 1000) {
    return "within-30d";
  }
  return "later";
}

function extractAgendaKeywords(question: string, description: string, tags: MarketTag[]): string[] {
  const input = `${question} ${description}`;

  const ruleKeywords = AGENDA_KEYWORD_RULES.filter((rule) => rule.pattern.test(input)).map(
    (rule) => rule.keyword,
  );

  const tagKeywords = tags.map((tag) => {
    if (tag === "middle-east") {
      return "Middle East";
    }
    return tag[0].toUpperCase() + tag.slice(1);
  });

  const tokenKeywords = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    .map((token) => token[0].toUpperCase() + token.slice(1));

  return [...new Set([...ruleKeywords, ...tagKeywords, ...tokenKeywords])].slice(0, 5);
}

function summarizeDescription(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }

  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0] ?? compact;
  if (firstSentence.length <= 180) {
    return firstSentence;
  }
  return `${firstSentence.slice(0, 177)}...`;
}

function formatMaturityHint(bucket: MaturityBucket): string {
  if (bucket === "expired") {
    return "expired";
  }
  if (bucket === "within-24h") {
    return "expires within 24h";
  }
  if (bucket === "within-7d") {
    return "expires within 7d";
  }
  if (bucket === "within-30d") {
    return "expires within 30d";
  }
  if (bucket === "later") {
    return "expires after 30d";
  }
  return "expiry not set";
}

function buildBriefSummary(question: string, description: string, yesPrice: number | null, maturityBucket: MaturityBucket): string {
  const yesText = yesPrice === null || !Number.isFinite(yesPrice) ? "N/A" : `${(yesPrice * 100).toFixed(1)}%`;
  const descriptionSummary = summarizeDescription(description);
  const primary = `Key question: ${question} (YES ${yesText}, ${formatMaturityHint(maturityBucket)}).`;

  if (!descriptionSummary) {
    return primary;
  }

  return `${primary} ${descriptionSummary}`;
}

function parseOutcomes(rawOutcomes: unknown, rawPrices: unknown): OutcomePrice[] {
  const outcomes = parseJsonArray(rawOutcomes);
  const prices = parseJsonArray(rawPrices).map((value) => toNumber(value));

  return outcomes.map((name, index) => ({
    name,
    price: prices[index] ?? 0,
  }));
}

function buildMarketUrl(raw: Record<string, unknown>, slug: string): string {
  const asAbsolutePolymarketUrl = (value: unknown): string | null => {
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }

    if (value.startsWith("https://polymarket.com/")) {
      return value;
    }

    if (value.startsWith("/")) {
      return `https://polymarket.com${value}`;
    }

    return null;
  };

  const direct = asAbsolutePolymarketUrl(raw.url);
  if (direct) {
    return direct;
  }

  const events = Array.isArray(raw.events) ? raw.events : [];
  const eventSlug = events
    .map((event) => (event && typeof event === "object" ? event as { slug?: unknown } : null))
    .find((event) => event && typeof event.slug === "string" && event.slug.length > 0)?.slug as
    | string
    | undefined;

  if (eventSlug) {
    return `https://polymarket.com/event/${encodeURIComponent(eventSlug)}/${encodeURIComponent(slug)}`;
  }

  return `https://polymarket.com/market/${encodeURIComponent(slug)}`;
}

function extractYesNo(outcomes: OutcomePrice[]): { yesPrice: number | null; noPrice: number | null } {
  const yes = outcomes.find((outcome) => normalizeText(outcome.name) === "yes");
  const no = outcomes.find((outcome) => normalizeText(outcome.name) === "no");

  if (yes || no) {
    return {
      yesPrice: yes ? yes.price : null,
      noPrice: no ? no.price : null,
    };
  }

  return {
    yesPrice: outcomes[0]?.price ?? null,
    noPrice: outcomes[1]?.price ?? null,
  };
}

function mapMarketSummary(raw: Record<string, unknown>): MarketSummary | null {
  const id = raw.id ? String(raw.id) : "";
  const question = raw.question ? String(raw.question) : "";
  const slug = raw.slug ? String(raw.slug) : "";
  if (!id || !question || !slug) {
    return null;
  }

  const description = raw.description ? String(raw.description) : "";
  const outcomes = parseOutcomes(raw.outcomes, raw.outcomePrices);
  const { yesPrice, noPrice } = extractYesNo(outcomes);
  const tags = detectTags(question, description);
  const endDate = raw.endDate ? String(raw.endDate) : null;
  const maturityBucket = classifyMaturity(endDate);
  const agendaKeywords = extractAgendaKeywords(question, description, tags);

  return {
    id,
    question,
    slug,
    marketUrl: buildMarketUrl(raw, slug),
    description,
    image: raw.image ? String(raw.image) : undefined,
    yesPrice,
    noPrice,
    volume24h: toNumber(raw.volume24hr),
    volumeTotal: toNumber(raw.volume),
    liquidity: toNumber(raw.liquidity),
    endDate,
    maturityBucket,
    tags,
    agendaKeywords,
    briefSummary: buildBriefSummary(question, description, yesPrice, maturityBucket),
    outcomes,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-dashboard/1.0",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

function parseTokenIds(raw: Record<string, unknown>): string[] {
  return parseJsonArray(raw.clobTokenIds).filter((tokenId) => tokenId.length > 0);
}

function pickHistoryTokenId(raw: Record<string, unknown>, outcomes: OutcomePrice[]): string | null {
  const tokenIds = parseTokenIds(raw);
  if (tokenIds.length === 0) {
    return null;
  }

  const yesIndex = outcomes.findIndex((outcome) => normalizeText(outcome.name) === "yes");
  if (yesIndex >= 0 && tokenIds[yesIndex]) {
    return tokenIds[yesIndex];
  }

  return tokenIds[0] ?? null;
}

async function fetchHistory(tokenId: string): Promise<PricePoint[]> {
  const url = `${POLYMARKET_CLOB_API}/prices-history?market=${tokenId}&interval=max&fidelity=1440`;

  try {
    const raw = await fetchJson<{ history?: Array<{ t?: number; p?: number }> }>(url);
    const history = raw.history ?? [];

    return history
      .map((point) => ({
        timestamp: (point.t ?? 0) * 1000,
        price: toNumber(point.p),
      }))
      .filter((point) => point.timestamp > 0 && Number.isFinite(point.price));
  } catch {
    return [];
  }
}

function parseOrderLevelList(levels: unknown): OrderLevel[] {
  if (!Array.isArray(levels)) {
    return [];
  }

  return levels
    .map((level) => {
      if (!level || typeof level !== "object") {
        return null;
      }

      const item = level as { price?: unknown; size?: unknown };
      return {
        price: toNumber(item.price, Number.NaN),
        size: toNumber(item.size, Number.NaN),
      };
    })
    .filter((level): level is OrderLevel => {
      return level !== null && Number.isFinite(level.price) && Number.isFinite(level.size);
    })
    .slice(0, 5);
}

async function fetchOrderBook(tokenId: string, outcomeName: string): Promise<OutcomeOrderBook> {
  const fallback: OutcomeOrderBook = {
    outcomeName,
    tokenId,
    timestamp: null,
    lastTradePrice: null,
    bestBid: null,
    bestAsk: null,
    spread: null,
    bids: [],
    asks: [],
  };

  try {
    const url = `${POLYMARKET_CLOB_API}/book?token_id=${encodeURIComponent(tokenId)}`;
    const raw = await fetchJson<Record<string, unknown>>(url);

    const bids = parseOrderLevelList(raw.bids);
    const asks = parseOrderLevelList(raw.asks);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spread = bestBid !== null && bestAsk !== null ? Math.max(bestAsk - bestBid, 0) : null;

    return {
      outcomeName,
      tokenId,
      timestamp: raw.timestamp ? String(raw.timestamp) : null,
      lastTradePrice:
        raw.last_trade_price === undefined || raw.last_trade_price === null
          ? null
          : toNumber(raw.last_trade_price, Number.NaN),
      bestBid,
      bestAsk,
      spread,
      bids,
      asks,
    };
  } catch {
    return fallback;
  }
}

export function deriveRecommendedKeywords(markets: MarketSummary[], limit = 10): string[] {
  const counts = markets.reduce<Record<string, number>>((accumulator, market) => {
    return market.agendaKeywords.reduce<Record<string, number>>((inner, keyword) => {
      return {
        ...inner,
        [keyword]: (inner[keyword] ?? 0) + 1,
      };
    }, accumulator);
  }, {});

  return Object.entries(counts)
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0].localeCompare(b[0]);
      }
      return b[1] - a[1];
    })
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

export async function fetchRelevantMarkets(limit = 80): Promise<MarketSummary[]> {
  const url = `${POLYMARKET_API}/markets?limit=500&active=true&closed=false&order=volume24hr&ascending=false`;
  const rawMarkets = await fetchJson<Array<Record<string, unknown>>>(url);

  const markets = rawMarkets
    .map(mapMarketSummary)
    .filter((market): market is MarketSummary => market !== null)
    .filter((market) => {
      const context = `${market.question} ${market.description}`;
      return CORE_PATTERN.test(context) && market.tags.length > 0;
    })
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit)
    .map((market) => ({
      ...market,
      agendaKeywords: market.agendaKeywords.slice(0, 5),
    }));

  return markets;
}

export async function fetchMarketDetail(id: string): Promise<MarketDetail | null> {
  const url = `${POLYMARKET_API}/markets/${encodeURIComponent(id)}`;
  const raw = await fetchJson<Record<string, unknown>>(url);

  const summary = mapMarketSummary(raw);
  if (!summary) {
    return null;
  }

  const historyTokenId = pickHistoryTokenId(raw, summary.outcomes);
  const history = historyTokenId ? await fetchHistory(historyTokenId) : [];

  const tokenIds = parseTokenIds(raw);
  const orderbookTargets = summary.outcomes.slice(0, 2).map((outcome, index) => ({
    outcomeName: outcome.name,
    tokenId: tokenIds[index],
  }));

  const orderbooks = await Promise.all(
    orderbookTargets
      .filter((target) => Boolean(target.tokenId))
      .map((target) => fetchOrderBook(String(target.tokenId), target.outcomeName)),
  );

  return {
    ...summary,
    conditionId: raw.conditionId ? String(raw.conditionId) : undefined,
    groupTitle: raw.groupItemTitle ? String(raw.groupItemTitle) : undefined,
    history,
    closed: Boolean(raw.closed),
    active: Boolean(raw.active),
    orderbooks,
  };
}
