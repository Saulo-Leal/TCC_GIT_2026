// Tipos das respostas das APIs da V1.2, usados apenas pelo frontend.

// Item retornado por /api/geocode (resposta direta do Nominatim).
export type GeocodeResult = {
  lat: string;
  lon: string;
  display_name: string;
};

// Estabelecimento retornado por /api/score. A distância vem em quilômetros.
export type Establishment = {
  id: number;
  type: string; // node | way | relation
  name: string;
  category: string;
  establishmentType: string;
  latitude: number;
  longitude: number;
  distance: number;
};

// Resposta completa de /api/score.
export type ScoreResponse = {
  categories: Record<string, Establishment[]>;
  scores: Record<string, number>;
  overallScore: number;
};

export type Place = Establishment;
