"use client";

import { useEffect, useRef } from "react";
import type {
  Map as LeafletMap,
  LayerGroup,
  Marker as LeafletMarker,
} from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryUI, getTypeLabel } from "@/lib/category-ui";
import type { Establishment } from "@/lib/types";

interface LocationMapProps {
  // Localização selecionada. Fica indefinida até o usuário escolher um ponto.
  latitude?: number;
  longitude?: number;
  // Posição inicial do mapa quando nada foi selecionado.
  defaultCenter: [number, number];
  onLocationSelect: (lat: number, lon: number) => void;
  establishments?: Establishment[];
  highlightedPlace?: Establishment | null;
}

// Evita que nomes vindos do OpenStreetMap sejam interpretados como HTML nos popups.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MAIN_ICON_HTML = `<div style="
  width: 32px; height: 32px;
  background: #1a9a6c;
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center;
"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`;

function createMainIcon() {
  return L.divIcon({
    className: "custom-marker",
    html: MAIN_ICON_HTML,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createAmenityIcon(color: string) {
  return L.divIcon({
    className: "amenity-marker",
    html: `<div style="
      width: 12px; height: 12px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function createHighlightIcon() {
  return L.divIcon({
    className: "highlight-marker",
    html: `<div class="highlight-pulse"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function popupHtml(place: Establishment) {
  const ui = getCategoryUI(place.category);

  return `<div style="font-family: system-ui; font-size: 13px;">
    <strong>${escapeHtml(place.name)}</strong><br/>
    <span style="color: ${ui.color}; font-weight: 500;">${escapeHtml(ui.label)} · ${escapeHtml(
      getTypeLabel(place.establishmentType)
    )}</span><br/>
    <span style="color: #666;">${Math.round(place.distance * 1000)}m de distância</span>
  </div>`;
}

export default function LocationMap({
  latitude,
  longitude,
  defaultCenter,
  onLocationSelect,
  establishments = [],
  highlightedPlace,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const mainMarkerRef = useRef<LeafletMarker | null>(null);
  const amenitiesLayerRef = useRef<LayerGroup | null>(null);
  const highlightMarkerRef = useRef<LeafletMarker | null>(null);

  // Mantém sempre a versão mais recente do callback sem recriar o mapa.
  const onSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Cria o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false }).setView(
      defaultCenter,
      14
    );

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    amenitiesLayerRef.current = L.layerGroup().addTo(map);

    map.on("click", (event) => {
      onSelectRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mainMarkerRef.current = null;
      amenitiesLayerRef.current = null;
      highlightMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Posiciona o marcador principal e centraliza o mapa na localização selecionada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude === undefined || longitude === undefined) return;

    if (mainMarkerRef.current) {
      mainMarkerRef.current.setLatLng([latitude, longitude]);
    } else {
      mainMarkerRef.current = L.marker([latitude, longitude], {
        icon: createMainIcon(),
        zIndexOffset: 500,
      }).addTo(map);
    }

    map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
  }, [latitude, longitude]);

  // Desenha os estabelecimentos encontrados (e limpa os anteriores).
  useEffect(() => {
    const layer = amenitiesLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    for (const place of establishments) {
      const color = getCategoryUI(place.category).color;

      const marker = L.marker([place.latitude, place.longitude], {
        icon: createAmenityIcon(color),
      });

      marker.bindPopup(popupHtml(place));
      layer.addLayer(marker);
    }
  }, [establishments]);

  // Destaca o estabelecimento clicado na lista.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.remove();
      highlightMarkerRef.current = null;
    }

    if (!highlightedPlace) return;

    map.setView([highlightedPlace.latitude, highlightedPlace.longitude], 17, {
      animate: true,
      duration: 0.5,
    });

    const marker = L.marker(
      [highlightedPlace.latitude, highlightedPlace.longitude],
      { icon: createHighlightIcon(), zIndexOffset: 1000 }
    );

    marker.bindPopup(popupHtml(highlightedPlace), { offset: [0, -10] });
    marker.addTo(map).openPopup();

    highlightMarkerRef.current = marker;
  }, [highlightedPlace]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-xl overflow-hidden"
      style={{ minHeight: "400px" }}
    />
  );
}
