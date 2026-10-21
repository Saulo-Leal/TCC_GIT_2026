export const CATEGORY_WEIGHTS = {
  transporte: 28.10,
  saude: 20.60,
  comercio: 18.50,
  educacao: 15.30,
  administrativo: 7.50,
  lazer: 5.60,
  religioso: 4.40,
} as const;

// Pontuação da quantidade de subcategorias encontradas.
// Máximo: 50 pontos.
export function calculateQuantityScore(
  foundTypes: number,
  totalTypes: number
): number {
  if (totalTypes <= 0) {
    return 0;
  }

  return Math.min(
    (foundTypes / totalTypes) * 50,
    50
  );
}

// Pontuação da distância.
// Máximo: 50 pontos.
// Quanto menor a distância, maior a pontuação.
export function calculateDistanceScore(
  distance: number,
  maxDistance: number
): number {
  // Converte a distância de referência de quilômetros para metros, se necessário.
  const distanciaMinima = 0.10; // 100 metros, considerando distâncias em quilômetros.
  // Evita cálculos inválidos quando a distância máxima não é adequada.
  if (maxDistance <= distanciaMinima) return distance <= distanciaMinima ? 50 : 0;
  // Mantém a nota máxima para estabelecimentos a até 100 metros.
  if (distance <= distanciaMinima) return 50;
  // Zera a nota quando a distância atinge ou ultrapassa o limite.
  if (distance >= maxDistance) return 0;
  // Reduz a nota proporcionalmente à distância após os primeiros 50 metros.
  return 50 * (1 - (distance - distanciaMinima) / (maxDistance - distanciaMinima));
}

// Média das pontuações de distância
// das subcategorias encontradas.
export function calculateDistanceAverage(
  scoresByType: number[]
): number {
  if (scoresByType.length === 0) {
    return 0;
  }

  const sum = scoresByType.reduce(
    (total, score) => total + score,
    0
  );

  return sum / scoresByType.length;
}

// Nota final de uma categoria.
// Quantidade: 0–50
// Distância: 0–50
// Total: 0–100
export function calculateCategoryScore(
  quantityScore: number,
  distanceScore: number
): number {
  return quantityScore + distanceScore;
}

// Aplica os pesos das categorias
// e calcula a nota final da localização.
export function calculateOverallScore(
  categoryScores: Record<string, number>
): number {
  let total = 0;

  for (const [category, score] of Object.entries(
    categoryScores
  )) {
    const weight =
      CATEGORY_WEIGHTS[
        category as keyof typeof CATEGORY_WEIGHTS
      ];

    if (weight !== undefined) {
      total += score * (weight / 100);
    }
  }

  return total;
}