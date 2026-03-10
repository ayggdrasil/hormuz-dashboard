"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";

import { IntelEvent } from "@/lib/types";

interface IntelMapProps {
  events: IntelEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const HORMUZ_CENTER: [number, number] = [26.5667, 56.25];
const INITIAL_ZOOM = 5;

export function IntelMap({ events, selectedId, onSelect }: IntelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const L = await import("leaflet");
      if (!mounted || !containerRef.current) {
        return;
      }

      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: HORMUZ_CENTER,
        zoom: INITIAL_ZOOM,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 10,
        minZoom: 3,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    void initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      mapRef.current = null;
      markersRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layerGroup = markersRef.current;
    if (!L || !map || !layerGroup) {
      return;
    }

    layerGroup.clearLayers();

    const selected = events.find((event) => event.id === selectedId) ?? null;

    for (const event of events.slice(0, 120)) {
      const location = event.location;
      if (!location) {
        continue;
      }

      const isHot = event.categories.includes("attack") || event.categories.includes("casualties");
      const isSelected = selected ? selected.id === event.id : false;

      const marker = L.circleMarker([location.lat, location.lng], {
        radius: isSelected ? 7 : 5,
        color: "#04253d",
        weight: 1,
        fillColor: isHot ? "#ff6b6b" : "#63d2ff",
        fillOpacity: 1,
      });

      const timeText = format(new Date(event.publishedAt), "yyyy-MM-dd HH:mm");
      marker.bindPopup(
        `<div style="min-width:230px"><strong>${escapeHtml(event.title)}</strong><br/><span>${escapeHtml(
          event.source,
        )}</span><br/><span>Time: ${timeText}</span><br/><span>Location: ${escapeHtml(location.name)}</span></div>`,
      );

      marker.on("click", () => {
        onSelect(event.id);
      });

      marker.addTo(layerGroup);

      if (isSelected) {
        marker.openPopup();
      }
    }
  }, [events, selectedId, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) {
      return;
    }

    const selected = events.find((event) => event.id === selectedId);
    if (!selected?.location) {
      return;
    }

    map.flyTo([selected.location.lat, selected.location.lng], Math.max(map.getZoom(), 6), {
      duration: 0.55,
    });
  }, [events, selectedId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
