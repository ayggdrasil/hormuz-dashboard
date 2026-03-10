import Link from "next/link";

import { SOURCE_CATALOG } from "@/lib/intel";
import { SourceRegion, SourceTier } from "@/lib/types";

const REGION_LABEL: Record<SourceRegion, string> = {
  us: "United States",
  uk: "United Kingdom",
  china: "China",
  russia: "Russia",
  "middle-east": "Middle East",
};

const TIER_ORDER: SourceTier[] = ["tier-1", "tier-2", "tier-3"];

function tierLabel(tier: SourceTier): string {
  if (tier === "tier-1") {
    return "Tier 1";
  }
  if (tier === "tier-2") {
    return "Tier 2";
  }
  return "Tier 3";
}

export default function SourcesPage() {
  const grouped = Object.entries(
    SOURCE_CATALOG.reduce<Record<SourceRegion, Record<SourceTier, typeof SOURCE_CATALOG>>>(
      (acc, entry) => {
        acc[entry.region] ??= {
          "tier-1": [],
          "tier-2": [],
          "tier-3": [],
        };
        acc[entry.region][entry.tier].push(entry);
        return acc;
      },
      {
        us: { "tier-1": [], "tier-2": [], "tier-3": [] },
        uk: { "tier-1": [], "tier-2": [], "tier-3": [] },
        china: { "tier-1": [], "tier-2": [], "tier-3": [] },
        russia: { "tier-1": [], "tier-2": [], "tier-3": [] },
        "middle-east": { "tier-1": [], "tier-2": [], "tier-3": [] },
      },
    ),
  ) as Array<[SourceRegion, Record<SourceTier, typeof SOURCE_CATALOG>]>;

  return (
    <main style={{ padding: "20px", color: "#e8f5ff", background: "#061425", minHeight: "100vh" }}>
      <div style={{ marginBottom: "14px" }}>
        <Link href="/" style={{ color: "#63d2ff" }}>
          Back to Dashboard
        </Link>
        <h1 style={{ margin: "10px 0 0" }}>Source Tier Directory</h1>
        <p style={{ color: "#93acc0" }}>Coverage regions: US, UK, China, Russia, Middle East.</p>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        {grouped.map(([region, tierMap]) => (
          <section key={region} style={{ border: "1px solid rgba(152,193,229,0.22)", borderRadius: "12px", padding: "14px" }}>
            <h2 style={{ margin: "0 0 12px" }}>{REGION_LABEL[region]}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              {TIER_ORDER.map((tier) => (
                <div
                  key={`${region}-${tier}`}
                  style={{
                    border: "1px solid rgba(152,193,229,0.22)",
                    borderRadius: "10px",
                    padding: "10px",
                    background:
                      tier === "tier-1"
                        ? "rgba(15,74,44,0.5)"
                        : tier === "tier-2"
                          ? "rgba(95,68,19,0.45)"
                          : "rgba(86,22,22,0.45)",
                  }}
                >
                  <h3 style={{ margin: "0 0 8px" }}>{tierLabel(tier)}</h3>
                  {tierMap[tier].length === 0 ? <p style={{ margin: 0, color: "#93acc0" }}>No outlets listed.</p> : null}
                  <ul style={{ margin: 0, paddingLeft: "16px", display: "grid", gap: "4px" }}>
                    {tierMap[tier].map((entry) => (
                      <li key={`${entry.region}-${entry.tier}-${entry.outlet}`}>
                        <strong>{entry.outlet}</strong>
                        <div style={{ color: "#93acc0", fontSize: "12px" }}>{entry.domains.join(", ")}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
