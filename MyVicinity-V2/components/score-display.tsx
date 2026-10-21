"use client";

import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-chart-3";
  if (score >= 40) return "text-accent";
  return "text-destructive";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  if (score >= 20) return "Abaixo da média";
  return "Insuficiente";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-primary/10";
  if (score >= 60) return "bg-chart-3/10";
  if (score >= 40) return "bg-accent/10";
  return "bg-destructive/10";
}

export default function ScoreDisplay({
  score,
  size = "md",
  showLabel = true,
}: ScoreDisplayProps) {
  // A API devolve a nota com casas decimais; a interface exibe o valor arredondado.
  const value = Math.max(0, Math.min(100, score));
  const rounded = Math.round(value);

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-28 h-28",
    lg: "w-36 h-36",
  };

  const fontClasses = {
    sm: "text-xl",
    md: "text-4xl",
    lg: "text-5xl",
  };

  const radius = size === "sm" ? 26 : size === "md" ? 48 : 62;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  const strokeWidth = size === "sm" ? 4 : 5;
  const viewBox =
    size === "sm" ? "0 0 60 60" : size === "md" ? "0 0 112 112" : "0 0 144 144";
  const center = size === "sm" ? 30 : size === "md" ? 56 : 72;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative", sizeClasses[size])}>
        <svg viewBox={viewBox} className="w-full h-full -rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            className={cn(getScoreColor(value), "transition-all duration-1000 ease-out")}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold tabular-nums", fontClasses[size], getScoreColor(value))}>
            {rounded}
          </span>
        </div>
      </div>
      {showLabel && (
        <span
          className={cn(
            "text-sm font-medium px-3 py-1 rounded-full",
            getScoreBg(value),
            getScoreColor(value)
          )}
        >
          {getScoreLabel(value)}
        </span>
      )}
    </div>
  );
}

export { getScoreColor, getScoreLabel, getScoreBg };
