"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { format, formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";

import { IntelMap } from "@/components/intel-map";
import { PriceChart } from "@/components/price-chart";
import { useGooglePageTranslate } from "@/lib/use-google-page-translate";
import {
  IntelCategory,
  IntelEvent,
  MarketDetail,
  MarketSummary,
  MaturityBucket,
  NewsLanguage,
  OutcomeOrderBook,
  SourceTier,
} from "@/lib/types";

type UiLang = NewsLanguage;

type CopyKey =
  | "title"
  | "markets"
  | "intel_events"
  | "new_alerts"
  | "betting_feed"
  | "betting_sub"
  | "search_markets"
  | "all_maturities"
  | "within_24h"
  | "within_7d"
  | "within_30d"
  | "later_30d"
  | "no_expiry"
  | "expired"
  | "reset_keywords"
  | "all_keywords"
  | "loading_markets"
  | "no_market_match"
  | "select_market"
  | "open_polymarket"
  | "no_description"
  | "volume_24h"
  | "total_volume"
  | "liquidity"
  | "end_date"
  | "order_book"
  | "order_book_unavailable"
  | "intel_feed"
  | "intel_sub"
  | "category"
  | "source_tier"
  | "open_source_directory"
  | "loading_map"
  | "no_intel_match"
  | "select_news"
  | "time"
  | "source"
  | "location"
  | "severity"
  | "language"
  | "time_filter"
  | "open_source_article"
  | "unknown_location"
  | "source_tier_short"
  | "updated"
  | "ui_language";

const I18N: Record<UiLang, Record<CopyKey, string>> = {
  en: {
    title: "Iran / Middle East / Oil Risk Dashboard",
    markets: "Markets",
    intel_events: "Intel Events",
    new_alerts: "New Alerts",
    betting_feed: "Betting Feed (Polymarket)",
    betting_sub: "Auto-collected Iran, Middle East, and oil related markets",
    search_markets: "Search markets / keywords...",
    all_maturities: "All maturities",
    within_24h: "Within 24h",
    within_7d: "Within 7d",
    within_30d: "Within 30d",
    later_30d: "Later than 30d",
    no_expiry: "No expiry",
    expired: "Expired",
    reset_keywords: "Reset keywords",
    all_keywords: "All keywords",
    loading_markets: "Loading markets...",
    no_market_match: "No market matched your filter.",
    select_market: "Select a market item.",
    open_polymarket: "Open on Polymarket",
    no_description: "No description provided.",
    volume_24h: "Volume 24h",
    total_volume: "Total Volume",
    liquidity: "Liquidity",
    end_date: "End Date",
    order_book: "Order Book",
    order_book_unavailable: "Order book data is unavailable.",
    intel_feed: "Intel Feed (Map + News)",
    intel_sub: "Live map centered on Hormuz with news feed below",
    category: "Category",
    source_tier: "Source Tier",
    open_source_directory: "Open Source Tier Directory",
    loading_map: "Loading map...",
    no_intel_match: "No intel event for current filters.",
    select_news: "Select a news item.",
    time: "Time",
    source: "Source",
    location: "Location",
    severity: "Severity",
    language: "Language",
    time_filter: "Time Filter",
    open_source_article: "Open source article",
    unknown_location: "Unknown location",
    source_tier_short: "Source Tier",
    updated: "Updated",
    ui_language: "UI Language",
  },
  zh: {
    ...{} as Record<CopyKey, string>,
  } as Record<CopyKey, string>,
  ru: {
    ...{} as Record<CopyKey, string>,
  } as Record<CopyKey, string>,
  ar: {
    ...{} as Record<CopyKey, string>,
  } as Record<CopyKey, string>,
  fa: {
    ...{} as Record<CopyKey, string>,
  } as Record<CopyKey, string>,
  ko: {
    ...{} as Record<CopyKey, string>,
  } as Record<CopyKey, string>,
};

for (const lang of ["zh", "ru", "ar", "fa", "ko"] as UiLang[]) {
  I18N[lang] = { ...I18N.en, ...I18N[lang] };
}

const UI_LANGUAGE_OPTIONS: Array<{ value: UiLang; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
  { value: "fa", label: "فارسی" },
  { value: "ko", label: "한국어" },
];

const CATEGORY_OPTIONS: Array<{ value: IntelCategory; label: string }> = [
  { value: "attack", label: "Attack" },
  { value: "statement", label: "Statement" },
  { value: "casualties", label: "Casualties" },
  { value: "aviation", label: "Aviation" },
  { value: "port", label: "Port" },
  { value: "war", label: "War" },
  { value: "oil", label: "Oil" },
];

const SOURCE_TIER_OPTIONS: Array<{ value: SourceTier; label: string }> = [
  { value: "tier-1", label: "Tier 1" },
  { value: "tier-2", label: "Tier 2" },
  { value: "tier-3", label: "Tier 3" },
];

type TimeFilterValue = "all" | "1h" | "6h" | "24h" | "3d" | "7d";

const TIME_FILTER_OPTIONS: Array<{ value: TimeFilterValue; label: string; ms: number | null }> = [
  { value: "all", label: "All time", ms: null },
  { value: "1h", label: "Last 1 hour", ms: 1 * 60 * 60 * 1000 },
  { value: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "Last 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];
const INTEL_FEED_LIMIT = 500;
const NEWS_LIST_RENDER_LIMIT = 500;

function formatPercent(price: number | null): string {
  if (price === null || !Number.isFinite(price)) {
    return "-";
  }
  return `${(price * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return format(parsed, "MMM d, HH:mm");
}

function formatBookTime(rawTs: string | null): string {
  if (!rawTs) {
    return "N/A";
  }

  const asNumber = Number.parseInt(rawTs, 10);
  if (!Number.isFinite(asNumber)) {
    return rawTs;
  }

  return format(asNumber, "MMM d, HH:mm:ss");
}

type NumberUnitClass = "raw" | "k" | "m" | "b";

function getNumberUnitClass(value: number): NumberUnitClass {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return "b";
  if (abs >= 1_000_000) return "m";
  if (abs >= 1_000) return "k";
  return "raw";
}

function formatNumberByUnit(value: number): { text: string; unitClass: NumberUnitClass } {
  const unitClass = getNumberUnitClass(value);
  if (unitClass === "b") return { text: `${(value / 1_000_000_000).toFixed(2)}B`, unitClass };
  if (unitClass === "m") return { text: `${(value / 1_000_000).toFixed(2)}M`, unitClass };
  if (unitClass === "k") return { text: `${(value / 1_000).toFixed(2)}K`, unitClass };
  return { text: value.toFixed(2), unitClass };
}

function tierLabel(tier: SourceTier): string {
  if (tier === "tier-1") return "Tier 1";
  if (tier === "tier-2") return "Tier 2";
  return "Tier 3";
}

function maturityLabel(bucket: MaturityBucket, t: (key: CopyKey) => string): string {
  if (bucket === "within-24h") return t("within_24h");
  if (bucket === "within-7d") return t("within_7d");
  if (bucket === "within-30d") return t("within_30d");
  if (bucket === "later") return t("later_30d");
  if (bucket === "no-expiry") return t("no_expiry");
  return t("expired");
}

function renderOrderBook(book: OutcomeOrderBook) {
  const bidTotalAmount = book.bids.reduce((sum, level) => sum + level.size * level.price, 0);
  const askTotalAmount = book.asks.reduce((sum, level) => sum + level.size * level.price, 0);
  const maxTotalAmount = Math.max(bidTotalAmount, askTotalAmount, 1);
  const bidAmountLabel = formatNumberByUnit(bidTotalAmount);
  const askAmountLabel = formatNumberByUnit(askTotalAmount);

  const bidTotalContracts = book.bids.reduce((sum, level) => sum + level.size, 0);
  const askTotalContracts = book.asks.reduce((sum, level) => sum + level.size, 0);
  const bidContractsLabel = formatNumberByUnit(bidTotalContracts);
  const askContractsLabel = formatNumberByUnit(askTotalContracts);

  const maxLevelContracts = Math.max(
    ...book.bids.map((level) => level.size),
    ...book.asks.map((level) => level.size),
    1,
  );

  return (
    <div key={book.tokenId} className="orderbook-card">
      <div className="orderbook-head">
        <h4>{book.outcomeName}</h4>
        <span>{formatBookTime(book.timestamp)}</span>
      </div>
      <div className="orderbook-total-chart">
        <div className="orderbook-total-row">
          <span className="orderbook-total-label">Bid Total Amount</span>
          <span className={clsx("unit-text", `unit-${bidAmountLabel.unitClass}`)}>{bidAmountLabel.text}</span>
          <div className="orderbook-total-track">
            <div
              className="orderbook-total-fill bid"
              style={{ width: `${Math.min((bidTotalAmount / maxTotalAmount) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="orderbook-total-row">
          <span className="orderbook-total-label">Ask Total Amount</span>
          <span className={clsx("unit-text", `unit-${askAmountLabel.unitClass}`)}>{askAmountLabel.text}</span>
          <div className="orderbook-total-track">
            <div
              className="orderbook-total-fill ask"
              style={{ width: `${Math.min((askTotalAmount / maxTotalAmount) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
      <div className="orderbook-meta">
        <span>
          Bid Contracts{" "}
          <strong className={clsx("unit-text", `unit-${bidContractsLabel.unitClass}`)}>
            {bidContractsLabel.text}
          </strong>
        </span>
        <span>
          Ask Contracts{" "}
          <strong className={clsx("unit-text", `unit-${askContractsLabel.unitClass}`)}>
            {askContractsLabel.text}
          </strong>
        </span>
      </div>
      <div className="orderbook-grid">
        <div>
          <strong>Bids</strong>
          {book.bids.length === 0 ? <p className="orderbook-empty">No bid levels</p> : null}
          {book.bids.map((level, index) => {
            const contractsLabel = formatNumberByUnit(level.size);
            return (
              <div key={`bid-${book.tokenId}-${index}`} className="orderbook-depth-row">
                <div className="orderbook-depth-track">
                  <div
                    className="orderbook-depth-fill bid"
                    style={{ width: `${Math.min((level.size / maxLevelContracts) * 100, 100)}%` }}
                  />
                </div>
                <div className="orderbook-row">
                  <span className="orderbook-row-label">L{index + 1}</span>
                  <span className={clsx("unit-text", `unit-${contractsLabel.unitClass}`)}>
                    {contractsLabel.text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <strong>Asks</strong>
          {book.asks.length === 0 ? <p className="orderbook-empty">No ask levels</p> : null}
          {book.asks.map((level, index) => {
            const contractsLabel = formatNumberByUnit(level.size);
            return (
              <div key={`ask-${book.tokenId}-${index}`} className="orderbook-depth-row">
                <div className="orderbook-depth-track">
                  <div
                    className="orderbook-depth-fill ask"
                    style={{ width: `${Math.min((level.size / maxLevelContracts) * 100, 100)}%` }}
                  />
                </div>
                <div className="orderbook-row">
                  <span className="orderbook-row-label">L{index + 1}</span>
                  <span className={clsx("unit-text", `unit-${contractsLabel.unitClass}`)}>
                    {contractsLabel.text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [uiLanguage, setUiLanguage] = useState<UiLang>("en");
  const dashboardRootRef = useRef<HTMLDivElement | null>(null);

  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [recommendedKeywords, setRecommendedKeywords] = useState<string[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [activeKeyword, setActiveKeyword] = useState<string>("all");
  const [activeMaturity, setActiveMaturity] = useState<"all" | MaturityBucket>("all");
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [selectedMarketDetail, setSelectedMarketDetail] = useState<MarketDetail | null>(null);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketDetailLoading, setMarketDetailLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);

  const [intelEvents, setIntelEvents] = useState<IntelEvent[]>([]);
  const [selectedIntelId, setSelectedIntelId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<IntelCategory[]>(
    CATEGORY_OPTIONS.map((option) => option.value),
  );
  const [activeSourceTiers, setActiveSourceTiers] = useState<SourceTier[]>(
    SOURCE_TIER_OPTIONS.map((option) => option.value),
  );
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilterValue>("all");
  const [intelLoading, setIntelLoading] = useState(true);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelUpdatedAt, setIntelUpdatedAt] = useState<string | null>(null);
  const [newIntelIds, setNewIntelIds] = useState<string[]>([]);

  const t = useCallback(
    (key: CopyKey) => I18N[uiLanguage][key] ?? I18N.en[key],
    [uiLanguage],
  );

  useGooglePageTranslate(uiLanguage, dashboardRootRef);

  useEffect(() => {
    const stored = window.localStorage.getItem("ui-language") as UiLang | null;
    if (stored && UI_LANGUAGE_OPTIONS.some((option) => option.value === stored)) {
      setUiLanguage(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ui-language", uiLanguage);
    document.documentElement.lang = uiLanguage;
    document.documentElement.dir = uiLanguage === "ar" || uiLanguage === "fa" ? "rtl" : "ltr";
  }, [uiLanguage]);

  const loadMarkets = useCallback(async () => {
    try {
      setMarketError(null);
      const response = await fetch("/api/markets?limit=120", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        updatedAt?: string;
        markets?: MarketSummary[];
        recommendedKeywords?: string[];
      };

      if (!response.ok || !payload.markets) {
        throw new Error(payload.error ?? "Failed to load markets");
      }

      const marketsData = payload.markets;
      setMarkets(marketsData);
      setRecommendedKeywords((payload.recommendedKeywords ?? []).slice(0, 12));
      setMarketUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      setSelectedMarketId((current) => current ?? marketsData[0]?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMarketError(message);
    } finally {
      setMarketsLoading(false);
    }
  }, []);

  const loadMarketDetail = useCallback(async (marketId: string) => {
    try {
      setMarketDetailLoading(true);
      const response = await fetch(`/api/markets/${marketId}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        market?: MarketDetail;
      };

      if (!response.ok || !payload.market) {
        throw new Error(payload.error ?? "Failed to load market detail");
      }

      setSelectedMarketDetail(payload.market);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMarketError(message);
      setSelectedMarketDetail(null);
    } finally {
      setMarketDetailLoading(false);
    }
  }, []);

  const loadIntel = useCallback(async (silent: boolean) => {
    if (!silent) {
      setIntelLoading(true);
    }

    try {
      setIntelError(null);
      const params = new URLSearchParams({ limit: INTEL_FEED_LIMIT.toString() });
      const response = await fetch(`/api/intel?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        events?: IntelEvent[];
        updatedAt?: string;
      };

      if (!response.ok || !payload.events) {
        throw new Error(payload.error ?? "Failed to load intel events");
      }

      const eventsData = payload.events;
      setIntelUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      setIntelEvents((current) => {
        if (!silent && current.length === 0) {
          setNewIntelIds([]);
        } else {
          const currentIds = new Set(current.map((event) => event.id));
          const trulyNewIds = eventsData
            .filter((event) => !currentIds.has(event.id))
            .map((event) => event.id);
          setNewIntelIds(trulyNewIds);
        }
        return eventsData;
      });

      setSelectedIntelId((current) =>
        current && eventsData.some((event) => event.id === current) ? current : (eventsData[0]?.id ?? null),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setIntelError(message);
    } finally {
      if (!silent) {
        setIntelLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
    void loadIntel(false);
  }, [loadMarkets, loadIntel]);

  useEffect(() => {
    if (!selectedMarketId) return;
    void loadMarketDetail(selectedMarketId);
  }, [selectedMarketId, loadMarketDetail]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadIntel(true);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [loadIntel]);

  const filteredMarkets = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();

    return markets.filter((market) => {
      const matchesQuery =
        !query ||
        market.question.toLowerCase().includes(query) ||
        market.tags.some((tag) => tag.includes(query)) ||
        market.agendaKeywords.some((keyword) => keyword.toLowerCase().includes(query));

      const matchesKeyword = activeKeyword === "all" || market.agendaKeywords.includes(activeKeyword);
      const matchesMaturity = activeMaturity === "all" || market.maturityBucket === activeMaturity;

      return matchesQuery && matchesKeyword && matchesMaturity;
    });
  }, [marketQuery, markets, activeKeyword, activeMaturity]);

  const visibleIntel = useMemo(() => {
    const timeWindowMs = TIME_FILTER_OPTIONS.find((item) => item.value === activeTimeFilter)?.ms ?? null;
    const threshold = timeWindowMs === null ? null : Date.now() - timeWindowMs;

    return intelEvents
      .filter((event) => {
        const categoryPass =
          activeCategories.length === CATEGORY_OPTIONS.length ||
          activeCategories.some((category) => event.categories.includes(category));
        const tierPass = activeSourceTiers.includes(event.sourceTier);
        const timePass = threshold === null || Date.parse(event.publishedAt) >= threshold;
        return categoryPass && tierPass && timePass;
      })
      .sort((a, b) => {
        const aIsOilSnapshot = a.source === "Stooq" || a.queryBucket === "oil";
        const bIsOilSnapshot = b.source === "Stooq" || b.queryBucket === "oil";
        if (aIsOilSnapshot !== bIsOilSnapshot) {
          return aIsOilSnapshot ? 1 : -1;
        }
        return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      });
  }, [intelEvents, activeCategories, activeSourceTiers, activeTimeFilter]);

  useEffect(() => {
    if (visibleIntel.length === 0) {
      setSelectedIntelId(null);
      return;
    }

    if (!visibleIntel.some((event) => event.id === selectedIntelId)) {
      setSelectedIntelId(visibleIntel[0].id);
    }
  }, [selectedIntelId, visibleIntel]);

  useEffect(() => {
    if (filteredMarkets.length === 0) {
      setSelectedMarketId(null);
      setSelectedMarketDetail(null);
      return;
    }

    if (!filteredMarkets.some((market) => market.id === selectedMarketId)) {
      setSelectedMarketId(filteredMarkets[0].id);
    }
  }, [filteredMarkets, selectedMarketId]);

  const selectedIntel = useMemo(
    () => visibleIntel.find((event) => event.id === selectedIntelId) ?? null,
    [selectedIntelId, visibleIntel],
  );

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? null,
    [markets, selectedMarketId],
  );

  const toggleCategory = (category: IntelCategory) => {
    setActiveCategories((current) => {
      if (current.includes(category)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== category);
      }
      return [...current, category];
    });
  };

  const toggleSourceTier = (tier: SourceTier) => {
    setActiveSourceTiers((current) => {
      if (current.includes(tier)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== tier);
      }
      return [...current, tier];
    });
  };

  const maturityOptions: Array<{ value: "all" | MaturityBucket; label: string }> = [
    { value: "all", label: t("all_maturities") },
    { value: "within-24h", label: t("within_24h") },
    { value: "within-7d", label: t("within_7d") },
    { value: "within-30d", label: t("within_30d") },
    { value: "later", label: t("later_30d") },
    { value: "no-expiry", label: t("no_expiry") },
    { value: "expired", label: t("expired") },
  ];

  return (
    <div ref={dashboardRootRef} className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="kicker">Hormuz Watchboard</p>
          <h1>{t("title")}</h1>
        </div>
        <div className="header-stats">
          <div>
            <strong>{markets.length}</strong>
            <span>{t("markets")}</span>
          </div>
          <div>
            <strong>{intelEvents.length}</strong>
            <span>{t("intel_events")}</span>
          </div>
          <div>
            <strong>{newIntelIds.length}</strong>
            <span>{t("new_alerts")}</span>
          </div>
          <div className="language-picker">
            <span>{t("ui_language")}</span>
            <select
              value={uiLanguage}
              onChange={(event) => setUiLanguage(event.target.value as UiLang)}
              aria-label="ui language"
            >
              {UI_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="split-layout">
        <section className="panel panel-markets">
          <div className="panel-head">
            <div>
              <h2>{t("betting_feed")}</h2>
              <p>{t("betting_sub")}</p>
            </div>
            <span className="updated-at">
              {t("updated")} {formatDateTime(marketUpdatedAt)}
            </span>
          </div>

          <div className="market-toolbar">
            <input
              type="text"
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
              placeholder={t("search_markets")}
              aria-label="Search markets"
            />
            <div className="market-filter-row">
              <select
                aria-label="maturity filter"
                value={activeMaturity}
                onChange={(event) => setActiveMaturity(event.target.value as "all" | MaturityBucket)}
              >
                {maturityOptions.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-btn" onClick={() => setActiveKeyword("all")}>
                {t("reset_keywords")}
              </button>
            </div>
            <div className="recommended-keywords">
              <button
                type="button"
                className={clsx("chip", { active: activeKeyword === "all" })}
                onClick={() => setActiveKeyword("all")}
              >
                {t("all_keywords")}
              </button>
              {recommendedKeywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  className={clsx("chip", { active: activeKeyword === keyword })}
                  onClick={() => setActiveKeyword(keyword)}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </div>

          {marketError ? <div className="error-box">{marketError}</div> : null}

          <div className="market-body">
            <div className="market-list">
              {marketsLoading ? <div className="empty">{t("loading_markets")}</div> : null}
              {!marketsLoading && filteredMarkets.length === 0 ? (
                <div className="empty">{t("no_market_match")}</div>
              ) : null}
              {filteredMarkets.map((market) => (
                <button
                  key={market.id}
                  type="button"
                  className={clsx("market-card", {
                    active: market.id === selectedMarketId,
                  })}
                  onClick={() => setSelectedMarketId(market.id)}
                >
                  <h3>{market.question}</h3>
                  <p className="market-brief">{market.briefSummary}</p>
                  <div className="market-prices">
                    <span>YES {formatPercent(market.yesPrice)}</span>
                    <span>NO {formatPercent(market.noPrice)}</span>
                  </div>
                  <div className="market-meta">
                    <span>24h Vol {formatUsd(market.volume24h)}</span>
                    <span>End {formatDateTime(market.endDate)}</span>
                    <span>{maturityLabel(market.maturityBucket, t)}</span>
                  </div>
                  <div className="tag-row">
                    {market.agendaKeywords.slice(0, 5).map((keyword) => (
                      <span key={`${market.id}-${keyword}`} className="tag tag-keyword">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="market-detail">
              {marketDetailLoading ? <div className="empty">Loading market detail...</div> : null}
              {!marketDetailLoading && !selectedMarketDetail ? <div className="empty">{t("select_market")}</div> : null}

              {selectedMarketDetail ? (
                <>
                  <div className="detail-top">
                    <h3>{selectedMarketDetail.question}</h3>
                    <a
                      href={selectedMarketDetail.marketUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("open_polymarket")}
                    </a>
                  </div>

                  <PriceChart points={selectedMarketDetail.history} />

                  <p className="detail-summary">{selectedMarketDetail.briefSummary}</p>
                  <p className="detail-description">
                    {selectedMarketDetail.description || t("no_description")}
                  </p>

                  <div className="detail-grid">
                    <div>
                      <span className="muted">{t("volume_24h")}</span>
                      <strong>{formatUsd(selectedMarketDetail.volume24h)}</strong>
                    </div>
                    <div>
                      <span className="muted">{t("total_volume")}</span>
                      <strong>{formatUsd(selectedMarketDetail.volumeTotal)}</strong>
                    </div>
                    <div>
                      <span className="muted">{t("liquidity")}</span>
                      <strong>{formatUsd(selectedMarketDetail.liquidity)}</strong>
                    </div>
                    <div>
                      <span className="muted">{t("end_date")}</span>
                      <strong>{formatDateTime(selectedMarketDetail.endDate)}</strong>
                    </div>
                  </div>

                  <div className="tag-row">
                    {selectedMarketDetail.agendaKeywords.slice(0, 5).map((keyword) => (
                      <span key={`detail-keyword-${keyword}`} className="tag tag-keyword">
                        {keyword}
                      </span>
                    ))}
                  </div>

                  <div className="outcome-table">
                    {selectedMarketDetail.outcomes.map((outcome) => (
                      <div key={outcome.name}>
                        <span>{outcome.name}</span>
                        <strong>{(outcome.price * 100).toFixed(2)}c</strong>
                      </div>
                    ))}
                  </div>

                  <div className="orderbook-wrap">
                    <h4>{t("order_book")}</h4>
                    {selectedMarketDetail.orderbooks.length === 0 ? (
                      <div className="empty">{t("order_book_unavailable")}</div>
                    ) : (
                      selectedMarketDetail.orderbooks.map((book) => renderOrderBook(book))
                    )}
                  </div>
                </>
              ) : selectedMarket ? (
                <p>{selectedMarket.description}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel panel-intel">
          <div className="panel-head">
            <div>
              <h2>{t("intel_feed")}</h2>
              <p>{t("intel_sub")}</p>
            </div>
            <div className="intel-status">
              <span className="updated-at">
                {t("updated")} {formatDateTime(intelUpdatedAt)}
              </span>
              {newIntelIds.length > 0 ? <span className="badge-new">+{newIntelIds.length} new</span> : null}
            </div>
          </div>

          <div className="category-filters">
            {CATEGORY_OPTIONS.map((option) => {
              const active = activeCategories.includes(option.value);
              return (
                <label key={option.value} className={clsx("filter-pill", { active })}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleCategory(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>

          <div className="filter-groups">
            <div className="filter-group">
              <h3>{t("source_tier")}</h3>
              <div className="category-filters">
                {SOURCE_TIER_OPTIONS.map((option) => {
                  const active = activeSourceTiers.includes(option.value);
                  return (
                    <label key={option.value} className={clsx("filter-pill", { active })}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleSourceTier(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="filter-group">
              <h3>{t("time_filter")}</h3>
              <div className="time-filter-wrap">
                <select
                  aria-label="news time filter"
                  value={activeTimeFilter}
                  onChange={(event) => setActiveTimeFilter(event.target.value as TimeFilterValue)}
                >
                  {TIME_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Link href={`/sources?lang=${uiLanguage}`} className="source-tier-link">
              {t("open_source_directory")}
            </Link>
          </div>

          {intelError ? <div className="error-box">{intelError}</div> : null}

          <div className="intel-body">
            <div className="intel-map-wrap">
              {intelLoading ? (
                <div className="map-fallback">{t("loading_map")}</div>
              ) : (
                <IntelMap
                  events={visibleIntel}
                  selectedId={selectedIntelId}
                  onSelect={(id) => {
                    setSelectedIntelId(id);
                  }}
                />
              )}
            </div>

            <div className="intel-bottom">
              <aside className="intel-list">
                {visibleIntel.length === 0 ? <div className="empty">{t("no_intel_match")}</div> : null}
                {visibleIntel.slice(0, NEWS_LIST_RENDER_LIMIT).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={clsx("intel-card", {
                      active: event.id === selectedIntelId,
                      fresh: newIntelIds.includes(event.id),
                    })}
                    onClick={() => {
                      setSelectedIntelId(event.id);
                    }}
                  >
                    <div className="intel-headline">
                      <h3>{event.title}</h3>
                      <time>{formatDistanceToNowStrict(new Date(event.publishedAt), { addSuffix: true })}</time>
                    </div>
                    <p>{event.summary || "No summary available."}</p>
                    <div className="intel-meta">
                      <span>{event.source}</span>
                      <span>{event.location?.name ?? t("unknown_location")}</span>
                      <span className={clsx("tier-badge", event.sourceTier)}>{tierLabel(event.sourceTier)}</span>
                    </div>
                    <div className="tag-row">
                      {event.categories.map((category) => (
                        <span key={category} className="tag tag-intel">
                          {category}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </aside>

              <div className="intel-detail">
                {!selectedIntel ? <div className="empty">{t("select_news")}</div> : null}
                {selectedIntel ? (
                  <>
                    <h3>{selectedIntel.title}</h3>
                    <p>{selectedIntel.summary || "No summary available."}</p>
                    <div className="detail-grid">
                      <div>
                        <span className="muted">{t("time")}</span>
                        <strong>{formatDateTime(selectedIntel.publishedAt)}</strong>
                      </div>
                      <div>
                        <span className="muted">{t("source")}</span>
                        <strong>{selectedIntel.source}</strong>
                      </div>
                      <div>
                        <span className="muted">{t("location")}</span>
                        <strong>{selectedIntel.location?.name ?? t("unknown_location")}</strong>
                      </div>
                      <div>
                        <span className="muted">{t("severity")}</span>
                        <strong>{selectedIntel.severity}</strong>
                      </div>
                      <div>
                        <span className="muted">{t("language")}</span>
                        <strong>{selectedIntel.language.toUpperCase()}</strong>
                      </div>
                      <div>
                        <span className="muted">{t("source_tier_short")}</span>
                        <strong>{tierLabel(selectedIntel.sourceTier)}</strong>
                      </div>
                    </div>
                    <div className="tag-row">
                      {selectedIntel.categories.map((category) => (
                        <span key={category} className="tag tag-intel">
                          {category}
                        </span>
                      ))}
                    </div>
                    <a href={selectedIntel.url} target="_blank" rel="noreferrer">
                      {t("open_source_article")}
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
