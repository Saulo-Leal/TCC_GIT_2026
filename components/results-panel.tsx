"use client";

import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ScoreDisplay from "@/components/score-display";
import CategoryCard from "@/components/category-card";
import { getCategoryUI } from "@/lib/category-ui";
import type { Place, ScoreResponse } from "@/lib/types";

interface ResultsPanelProps {
  data: ScoreResponse;
  latitude: number;
  longitude: number;
  radius: number; // em metros
  locationName?: string;
  onPlaceClick?: (place: Place) => void;
}

export default function ResultsPanel({
  data,
  latitude,
  longitude,
  radius,
  locationName,
  onPlaceClick,
}: ResultsPanelProps) {
  const totalPlaces = Object.values(data.categories).reduce(
    (acc, places) => acc + places.length,
    0
  );

  // Categorias ordenadas da maior para a menor nota.
  const categoryKeys = Object.keys(data.scores).sort(
    (a, b) => data.scores[b] - data.scores[a]
  );

  return (
    <div className="flex flex-col">
      <Card className="border-0 shadow-none bg-transparent gap-4">
        <CardHeader className="px-0 pb-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">
              {locationName || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
            </span>
          </div>
          <CardTitle className="text-lg text-foreground">
            Pontuação do local
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="flex items-center gap-6">
            <ScoreDisplay score={data.overallScore} size="md" />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  {totalPlaces} locais encontrados
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Raio de {(radius / 1000).toFixed(1)}km
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pontuação baseada na proximidade e na variedade de serviços essenciais ao redor.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-2 mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Detalhes por categoria
        </h3>
      </div>

      <div className="flex flex-col gap-3 pb-4">
        {categoryKeys.map((key) => {
          const ui = getCategoryUI(key);

          return (
            <CategoryCard
              key={key}
              label={ui.label}
              icon={ui.icon}
              score={data.scores[key]}
              places={data.categories[key] ?? []}
              onPlaceClick={onPlaceClick}
            />
          );
        })}
      </div>
    </div>
  );
}
