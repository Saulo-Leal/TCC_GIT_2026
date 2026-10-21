"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { MapPin, Loader2, Navigation, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AddressSearch from "@/components/address-search";
import ResultsPanel from "@/components/results-panel";
import type { Place, ScoreResponse } from "@/lib/types";

// Carrega o mapa somente no navegador, evitando o erro "window is not defined".
const LocationMap = dynamic(() => import("@/components/location-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted rounded-xl">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  ),
});

// Posição inicial do mapa (mesma da V1.2).
const DEFAULT_CENTER: [number, number] = [-21.784, -48.178];

// Raio de pesquisa, em metros, enviado para /api/score (mesmo valor da V1.2).
const SEARCH_RADIUS = 1000;

type SelectedLocation = {
  latitude: number;
  longitude: number;
};

export default function HomePage() {
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [highlightedPlace, setHighlightedPlace] = useState<Place | null>(null);

  // Identifica a consulta mais recente para ignorar respostas antigas.
  const requestIdRef = useRef(0);

  // Consulta a API de pontuação para as coordenadas selecionadas.
  const fetchScore = useCallback(async (latitude: number, longitude: number) => {
    const requestId = ++requestIdRef.current;

    setLocation({ latitude, longitude });
    setScoreData(null);
    setIsLoading(true);
    setError("");
    setHasSearched(true);
    setHighlightedPlace(null);

    try {
      const response = await fetch(
        `/api/score?lat=${latitude}&lon=${longitude}&radius=${SEARCH_RADIUS}`
      );

      const data = await response.json();

      if (requestId !== requestIdRef.current) return;

      if (!response.ok || data.error) {
        setError(data.error ?? "Erro ao buscar os locais próximos.");
        return;
      }

      setScoreData(data as ScoreResponse);
    } catch (err) {
      console.error(err);

      if (requestId !== requestIdRef.current) return;

      setError("Não foi possível consultar os locais próximos. Tente novamente.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Clique no mapa.
  const handleLocationSelect = useCallback(
    (latitude: number, longitude: number) => {
      setLocationName("");
      fetchScore(latitude, longitude);
    },
    [fetchScore]
  );

  // Endereço escolhido na busca.
  const handleAddressSelect = useCallback(
    (latitude: number, longitude: number, name: string) => {
      setLocationName(name);
      fetchScore(latitude, longitude);
    },
    [fetchScore]
  );

  // Estabelecimento clicado na lista de resultados.
  const handlePlaceClick = useCallback((place: Place) => {
    // Cópia para permitir destacar novamente o mesmo local.
    setHighlightedPlace({ ...place });
  }, []);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada pelo navegador.");
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocationName("Minha localização");
        fetchScore(latitude, longitude);
      },
      () => {
        setError("Não foi possível obter sua localização.");
        setIsLoading(false);
      }
    );
  }, [fetchScore]);

  // Todos os estabelecimentos encontrados, para exibir no mapa.
  const establishments = useMemo(
    () => (scoreData ? Object.values(scoreData.categories).flat() : []),
    [scoreData]
  );

  return (
    <main className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 lg:px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground leading-tight text-balance">
                MyVicinity
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            
              
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Barra lateral */}
        <aside className="w-full lg:w-[420px] xl:w-[460px] shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card flex flex-col overflow-hidden max-h-[55vh] lg:max-h-none">
          {/* Busca */}
          <div className="shrink-0 p-4 pb-3">
            <AddressSearch
              onSelect={handleAddressSelect}
              isLoading={isLoading}
            />
          </div>

          {/* Resultados */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-muted" />
                  <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Analisando a região...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Consultando dados do OpenStreetMap
                  </p>
                </div>
              </div>
            )}

            {error && !isLoading && (
              <Card className="border-destructive/20 bg-destructive/5 gap-0">
                <CardContent className="p-4">
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {scoreData && location && !isLoading && (
              <ResultsPanel
                data={scoreData}
                latitude={location.latitude}
                longitude={location.longitude}
                radius={SEARCH_RADIUS}
                locationName={locationName}
                onPlaceClick={handlePlaceClick}
              />
            )}

            {!hasSearched && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground text-balance">
                    Descubra a pontuação do seu bairro
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[280px] text-pretty">
                    Busque um endereço ou clique no mapa para analisar a qualidade da região.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-[260px]">
                  {[
                    "Busque ou clique no mapa",
                    "Analisamos os serviços próximos",
                    "Receba uma pontuação detalhada",
                  ].map((step, index) => (
                    <div
                      key={step}
                      className="flex items-center gap-2.5 text-xs text-muted-foreground"
                    >
                      <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-foreground">
                          {index + 1}
                        </span>
                      </div>
                      {step}
                    </div>
                  ))}
                </div>

                <div className="mt-2 p-3 rounded-lg bg-muted/50 flex items-start gap-2 max-w-[300px]">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed text-left">
                    Dados fornecidos pelo OpenStreetMap. A pontuação considera transporte, saúde, comércio, educação, serviços administrativos, lazer e locais religiosos.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Mapa */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0">
          <LocationMap
            latitude={location?.latitude}
            longitude={location?.longitude}
            defaultCenter={DEFAULT_CENTER}
            onLocationSelect={handleLocationSelect}
            establishments={establishments}
            highlightedPlace={highlightedPlace}
          />

          {/* Dica sobre o mapa */}
          {!hasSearched && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
              <div className="bg-card/90 backdrop-blur-sm border border-border rounded-full px-4 py-2 shadow-lg">
                <p className="text-xs text-muted-foreground font-medium">
                  Clique no mapa para analisar uma localização
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
