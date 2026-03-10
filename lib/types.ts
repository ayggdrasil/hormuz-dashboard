export type MarketTag = "iran" | "middle-east" | "oil" | "shipping" | "military";
export type MaturityBucket =
  | "expired"
  | "within-24h"
  | "within-7d"
  | "within-30d"
  | "later"
  | "no-expiry";

export interface OutcomePrice {
  name: string;
  price: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface MarketSummary {
  id: string;
  question: string;
  slug: string;
  marketUrl: string;
  description: string;
  image?: string;
  yesPrice: number | null;
  noPrice: number | null;
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  endDate: string | null;
  maturityBucket: MaturityBucket;
  tags: MarketTag[];
  agendaKeywords: string[];
  briefSummary: string;
  outcomes: OutcomePrice[];
  updatedAt: string;
}

export interface OrderLevel {
  price: number;
  size: number;
}

export interface OutcomeOrderBook {
  outcomeName: string;
  tokenId: string;
  timestamp: string | null;
  lastTradePrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  bids: OrderLevel[];
  asks: OrderLevel[];
}

export interface MarketDetail extends MarketSummary {
  conditionId?: string;
  history: PricePoint[];
  groupTitle?: string;
  closed: boolean;
  active: boolean;
  orderbooks: OutcomeOrderBook[];
}

export type IntelCategory =
  | "attack"
  | "statement"
  | "casualties"
  | "aviation"
  | "port"
  | "war"
  | "oil";
export type NewsLanguage = "en" | "zh" | "ru" | "ar" | "fa" | "ko";
export type SourceRegion = "us" | "uk" | "china" | "russia" | "middle-east";
export type SourceTier = "tier-1" | "tier-2" | "tier-3";

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface IntelEvent {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  categories: IntelCategory[];
  location: GeoPoint | null;
  queryBucket: string;
  severity: number;
  language: NewsLanguage;
  sourceRegion: SourceRegion;
  sourceTier: SourceTier;
}

export interface OilSnapshot {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  updatedAt: string;
}
