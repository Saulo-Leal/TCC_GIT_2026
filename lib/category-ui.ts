// Metadados visuais das categorias (somente frontend).
// As chaves seguem as categorias definidas em lib/categories.ts.
export const CATEGORY_UI: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  transporte: { label: "Transporte", icon: "Bus", color: "#0891b2" },
  saude: { label: "Saúde", icon: "Heart", color: "#dc2626" },
  comercio: { label: "Comércio", icon: "ShoppingCart", color: "#16a34a" },
  educacao: { label: "Educação", icon: "GraduationCap", color: "#9333ea" },
  administrativo: { label: "Administrativo", icon: "Landmark", color: "#475569" },
  lazer: { label: "Lazer", icon: "Trees", color: "#65a30d" },
  religioso: { label: "Religioso", icon: "Church", color: "#ea580c" },
};

export function getCategoryUI(key: string) {
  return (
    CATEGORY_UI[key] ?? { label: key.replace(/_/g, " "), icon: "MapPin", color: "#666666" }
  );
}

// Nome amigável para cada tipo de estabelecimento (ex.: ponto_onibus -> Ponto de ônibus).
export const TYPE_LABELS: Record<string, string> = {
  rodoviaria: "Rodoviária",
  ponto_onibus: "Ponto de ônibus",
  estacionamento: "Estacionamento",
  posto_combustivel: "Posto de combustível",
  creche: "Creche",
  escola: "Escola",
  universidade: "Universidade",
  supermercado: "Supermercado",
  conveniencia: "Conveniência",
  padaria: "Padaria",
  restaurante: "Restaurante",
  loja_de_roupas: "Loja de roupas",
  farmacia: "Farmácia",
  hospital: "Hospital",
  posto_saude: "Posto de saúde",
  veterinario: "Veterinário",
  dentista: "Dentista",
  consultorio_medico: "Consultório médico",
  delegacia: "Delegacia",
  prefeitura: "Prefeitura",
  servico_emergencia: "Serviço de emergência",
  correios: "Correios",
  praca: "Praça",
  academia: "Academia",
  biblioteca: "Biblioteca",
  local_culto: "Local de culto",
};

export function getTypeLabel(type: string) {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}
