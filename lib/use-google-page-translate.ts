"use client";

import { RefObject, useCallback, useEffect, useRef } from "react";

import { NewsLanguage } from "@/lib/types";

const BATCH_SIZE = 40;
const TAGS_TO_SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CODE", "PRE", "TEXTAREA", "SVG"]);

type TextParts = {
  leading: string;
  core: string;
  trailing: string;
};

function splitTextParts(value: string): TextParts {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) {
    return { leading: "", core: value, trailing: "" };
  }
  return { leading: match[1], core: match[2], trailing: match[3] };
}

function shouldTranslateText(value: string): boolean {
  if (!value.trim()) return false;
  if (value.length > 1000) return false;
  if (/^[\d\s.,:%+\-()[\]/]+$/.test(value)) return false;
  return true;
}

function collectTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const parent = textNode.parentElement;

    if (
      parent &&
      !TAGS_TO_SKIP.has(parent.tagName) &&
      !parent.closest("[data-no-translate='true']") &&
      !parent.closest(".leaflet-container")
    ) {
      nodes.push(textNode);
    }

    current = walker.nextNode();
  }

  return nodes;
}

async function translateBatch(target: NewsLanguage, texts: string[]): Promise<string[]> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, texts }),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed (${response.status})`);
  }

  const payload = (await response.json()) as { translations?: string[] };
  if (!Array.isArray(payload.translations)) {
    throw new Error("Invalid translation payload");
  }

  return payload.translations;
}

export function useGooglePageTranslate(
  targetLanguage: NewsLanguage,
  rootRef: RefObject<HTMLElement | null>,
): void {
  const originalTextByNodeRef = useRef(new WeakMap<Text, string>());
  const translatedTextCacheRef = useRef(new Map<string, string>());
  const isApplyingRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const frameRef = useRef<number | null>(null);

  const getCacheKey = useCallback((target: NewsLanguage, text: string) => `${target}::${text}`, []);

  const restoreOriginalTexts = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = collectTextNodes(root);
    isApplyingRef.current = true;
    for (const node of nodes) {
      const original = originalTextByNodeRef.current.get(node);
      if (original !== undefined && node.nodeValue !== original) {
        node.nodeValue = original;
      }
    }
    isApplyingRef.current = false;
  }, [rootRef]);

  const translateCurrentDom = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = collectTextNodes(root);

    if (targetLanguage === "en") {
      restoreOriginalTexts();
      return;
    }

    const nodeData = nodes.map((node) => {
      const raw = node.nodeValue ?? "";
      const original =
        originalTextByNodeRef.current.get(node) ??
        (() => {
          originalTextByNodeRef.current.set(node, raw);
          return raw;
        })();
      const parts = splitTextParts(original);
      return { node, parts };
    });

    const missingTexts = new Set<string>();
    for (const { parts } of nodeData) {
      if (!shouldTranslateText(parts.core)) continue;
      const key = getCacheKey(targetLanguage, parts.core);
      if (!translatedTextCacheRef.current.has(key)) {
        missingTexts.add(parts.core);
      }
    }

    const missingList = Array.from(missingTexts);
    for (let index = 0; index < missingList.length; index += BATCH_SIZE) {
      const batch = missingList.slice(index, index + BATCH_SIZE);
      try {
        const translated = await translateBatch(targetLanguage, batch);
        batch.forEach((sourceText, batchIndex) => {
          const mapped = translated[batchIndex] ?? sourceText;
          translatedTextCacheRef.current.set(getCacheKey(targetLanguage, sourceText), mapped);
        });
      } catch {
        batch.forEach((sourceText) => {
          translatedTextCacheRef.current.set(getCacheKey(targetLanguage, sourceText), sourceText);
        });
      }
    }

    isApplyingRef.current = true;
    for (const { node, parts } of nodeData) {
      if (!shouldTranslateText(parts.core)) {
        const original = `${parts.leading}${parts.core}${parts.trailing}`;
        if (node.nodeValue !== original) {
          node.nodeValue = original;
        }
        continue;
      }

      const translated =
        translatedTextCacheRef.current.get(getCacheKey(targetLanguage, parts.core)) ?? parts.core;
      const nextText = `${parts.leading}${translated}${parts.trailing}`;
      if (node.nodeValue !== nextText) {
        node.nodeValue = nextText;
      }
    }
    isApplyingRef.current = false;
  }, [getCacheKey, restoreOriginalTexts, rootRef, targetLanguage]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scheduleTranslate = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        void translateCurrentDom();
      });
    };

    observerRef.current?.disconnect();
    const observer = new MutationObserver(() => {
      if (isApplyingRef.current) return;
      scheduleTranslate();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observerRef.current = observer;

    scheduleTranslate();

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [rootRef, targetLanguage, translateCurrentDom]);
}
