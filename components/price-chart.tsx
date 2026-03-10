"use client";

import { PricePoint } from "@/lib/types";

interface PriceChartProps {
  points: PricePoint[];
}

export function PriceChart({ points }: PriceChartProps) {
  if (points.length < 2) {
    return <div className="chart-empty">No price history available yet.</div>;
  }

  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const width = 520;
  const height = 180;
  const padding = 16;

  const prices = sorted.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = Math.max(maxPrice - minPrice, 0.00001);

  const getX = (index: number) => {
    return padding + (index / (sorted.length - 1)) * (width - padding * 2);
  };

  const getY = (price: number) => {
    return height - padding - ((price - minPrice) / range) * (height - padding * 2);
  };

  const path = sorted
    .map((point, index) => `${index === 0 ? "M" : "L"}${getX(index).toFixed(2)},${getY(point.price).toFixed(2)}`)
    .join(" ");

  const last = sorted[sorted.length - 1];

  return (
    <div className="price-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="price-chart" role="img" aria-label="Market price history">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(99, 210, 255, 0.42)" />
            <stop offset="100%" stopColor="rgba(99, 210, 255, 0.02)" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`} fill="url(#chartGradient)" />
        <path d={path} fill="none" stroke="#63d2ff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={getX(sorted.length - 1)} cy={getY(last.price)} r={4} fill="#ffbd40" />
      </svg>
      <div className="chart-footer">
        <span>{(minPrice * 100).toFixed(1)}c low</span>
        <span>{(maxPrice * 100).toFixed(1)}c high</span>
        <span>{(last.price * 100).toFixed(1)}c last</span>
      </div>
    </div>
  );
}
