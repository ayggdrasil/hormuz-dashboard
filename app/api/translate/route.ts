import { NextResponse } from "next/server";

import { NewsLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 20;

type TranslateRequestBody = {
  target?: string;
  texts?: string[];
};

const SUPPORTED_TARGETS = new Set<NewsLanguage>(["en", "zh", "ru", "ar", "fa", "ko"]);
const MAX_TEXTS_PER_REQUEST = 180;
const MAX_TEXT_LENGTH = 1200;
const CACHE_LIMIT = 5000;

const translationCache = new Map<string, string>();

function cacheKey(target: NewsLanguage, text: string): string {
  return `${target}::${text}`;
}

function setCachedTranslation(key: string, value: string): void {
  if (translationCache.size >= CACHE_LIMIT) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) {
      translationCache.delete(firstKey);
    }
  }
  translationCache.set(key, value);
}

function parseTranslatedText(payload: unknown): string | null {
  if (!Array.isArray(payload) || payload.length === 0 || !Array.isArray(payload[0])) {
    return null;
  }

  const chunks = payload[0];
  if (!Array.isArray(chunks)) {
    return null;
  }

  const translated = chunks
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : ""))
    .join("");

  return translated.length > 0 ? translated : null;
}

async function translateWithGoogle(text: string, target: NewsLanguage): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google translate request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  return parseTranslatedText(payload) ?? text;
}

export async function POST(request: Request) {
  let body: TranslateRequestBody;
  try {
    body = (await request.json()) as TranslateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = body.target;
  if (typeof target !== "string" || !SUPPORTED_TARGETS.has(target as NewsLanguage)) {
    return NextResponse.json({ error: "Unsupported target language" }, { status: 400 });
  }

  const targetLang = target as NewsLanguage;
  const incomingTexts = Array.isArray(body.texts) ? body.texts : [];
  const texts = incomingTexts
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_TEXTS_PER_REQUEST)
    .map((item) => item.slice(0, MAX_TEXT_LENGTH));

  if (targetLang === "en" || texts.length === 0) {
    return NextResponse.json({ translations: texts });
  }

  const uniqueTexts = Array.from(new Set(texts));
  const translatedMap = new Map<string, string>();

  const translatedResults = await Promise.allSettled(
    uniqueTexts.map(async (sourceText) => {
      const key = cacheKey(targetLang, sourceText);
      const cached = translationCache.get(key);
      if (cached) {
        translatedMap.set(sourceText, cached);
        return;
      }

      const translated = await translateWithGoogle(sourceText, targetLang);
      translatedMap.set(sourceText, translated);
      setCachedTranslation(key, translated);
    }),
  );

  translatedResults.forEach((result, index) => {
    if (result.status === "rejected") {
      const original = uniqueTexts[index];
      translatedMap.set(original, original);
    }
  });

  return NextResponse.json({
    translations: texts.map((text) => translatedMap.get(text) ?? text),
  });
}
