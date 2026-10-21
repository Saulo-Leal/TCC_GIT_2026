"use client";

import {
  ShoppingCart,
  Heart,
  GraduationCap,
  Trees,
  Bus,
  Landmark,
  Church,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/components/score-display";
import { getTypeLabel } from "@/lib/category-ui";
import type { Place } from "@/lib/types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart,
  Heart,
  GraduationCap,
  Trees,
  Bus,
  Landmark,
  Church,
};

interface CategoryCardProps {
  label: string;
  icon: string;
  score: number;
  places: Place[];
  onPlaceClick?: (place: Place) => void;
}

function getProgressColor(score: number): string {
  if (score >= 80) return "[&>[data-slot=progress-indicator]]:bg-primary";
  if (score >= 60) return "[&>[data-slot=progress-indicator]]:bg-chart-3";
  if (score >= 40) return "[&>[data-slot=progress-indicator]]:bg-accent";
  return "[&>[data-slot=progress-indicator]]:bg-destructive";
}

// Converte a distância da API (km) para metros inteiros.
function toMeters(distanceKm: number): number {
  return Math.round(distanceKm * 1000);
}

export default function CategoryCard({
  label,
  icon,
  score,
  places,
  onPlaceClick,
}: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const IconComp = ICONS[icon] || MapPin;
  const rounded = Math.round(score);

  // Estabelecimentos ordenados do mais próximo para o mais distante.
  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => a.distance - b.distance),
    [places]
  );

  const count = sortedPlaces.length;
  const nearest = sortedPlaces[0];

  return (
    <Card className="py-4 gap-3 transition-shadow hover:shadow-md">
      <CardContent className="px-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full cursor-pointer"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
                score >= 60
                  ? "bg-primary/10 text-primary"
                  : score >= 40
                    ? "bg-accent/10 text-accent-foreground"
                    : "bg-destructive/10 text-destructive"
              )}
            >
              <IconComp className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-foreground">
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      getScoreColor(score)
                    )}
                  >
                    {rounded}
                  </span>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <Progress
                  value={score}
                  className={cn("h-1.5 flex-1", getProgressColor(score))}
                />
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>
                  {count} {count === 1 ? "local" : "locais"}
                </span>
                {nearest && (
                  <>
                    <span className="text-border">|</span>
                    <span>Mais próximo: {toMeters(nearest.distance)}m</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </button>

        {expanded && count > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            {/* A V1.2 retorna todos os estabelecimentos do raio, então a lista tem rolagem própria. */}
            <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {sortedPlaces.map((place) => (
                <li key={`${place.type}-${place.id}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlaceClick?.(place);
                    }}
                    className="w-full flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                      <div className="min-w-0 text-left">
                        <span className="block truncate text-foreground group-hover:text-primary transition-colors">
                          {place.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {getTypeLabel(place.establishmentType)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
                      {toMeters(place.distance)}m
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {expanded && count === 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum local encontrado nesta categoria
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
