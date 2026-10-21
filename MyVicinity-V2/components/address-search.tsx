"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/types";

interface AddressSearchProps {
  onSelect: (lat: number, lon: number, name: string) => void;
  isLoading?: boolean;
}

export default function AddressSearch({ onSelect, isLoading }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [message, setMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha a lista de endereços ao clicar fora do componente.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // A busca é feita ao enviar o formulário (Enter ou botão), e não a cada tecla,
  // respeitando o limite de uso do Nominatim consultado pela rota /api/geocode.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setMessage("");
    setResults([]);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);

      if (!response.ok) {
        // Mostra a mensagem do servidor quando o limite de requisições é atingido.
        if (response.status === 429) {
          const body = await response.json().catch(() => null);

          throw new Error(
            body?.error ?? "Muitas buscas em pouco tempo. Tente novamente em instantes."
          );
        }

        throw new Error("Erro ao buscar endereço.");
      }

      const data: GeocodeResult[] = await response.json();

      setResults(data);
      setShowResults(true);

      if (data.length === 0) {
        setMessage("Nenhum endereço encontrado.");
      }
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error && error.message !== "Erro ao buscar endereço."
          ? error.message
          : "Não foi possível buscar o endereço. Tente novamente."
      );
      setShowResults(true);
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelect(result: GeocodeResult) {
    onSelect(Number(result.lat), Number(result.lon), result.display_name);
    setQuery(result.display_name.split(",")[0]);
    setShowResults(false);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setMessage("");
    setShowResults(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => (results.length > 0 || message) && setShowResults(true)}
          placeholder="Buscar endereço, cidade ou bairro..."
          className={cn(
            "w-full h-12 pl-11 pr-20 rounded-xl border border-input bg-card text-foreground",
            "text-sm placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
            "transition-all"
          )}
          aria-label="Buscar endereço"
        />

        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {(isSearching || isLoading) && (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          )}
          {query && !isSearching && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={isSearching || isLoading || !query.trim()}
            className="text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Buscar"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>

      {showResults && (results.length > 0 || message) && (
        <ul
          role="listbox"
          className="absolute z-50 top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden"
        >
          {results.map((result, i) => (
            <li key={`${result.lat}-${result.lon}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(result)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span className="text-sm text-foreground leading-relaxed line-clamp-2">
                  {result.display_name}
                </span>
              </button>
            </li>
          ))}

          {results.length === 0 && message && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{message}</li>
          )}
        </ul>
      )}
    </div>
  );
}