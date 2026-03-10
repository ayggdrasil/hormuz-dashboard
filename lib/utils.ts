export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const num = Number.parseFloat(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }

  return fallback;
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }

  return out;
}
