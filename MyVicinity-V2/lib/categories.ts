export const CATEGORIES = {
  transporte: {
    rodoviaria: ["amenity=bus_station"],
    ponto_onibus: ["highway=bus_stop"],
    estacionamento: ["amenity=parking"],
    posto_combustivel: ["amenity=fuel"],
  },

  educacao: {
    creche: ["amenity=kindergarten"],
    escola: ["amenity=school"],
    universidade: ["amenity=university"],
  },

  comercio: {
    supermercado: ["shop=supermarket"],
    conveniencia: ["shop=convenience"],
    padaria: ["shop=bakery"],
    restaurante: ["amenity=restaurant"],
    loja_de_roupas: ["shop=clothes"],
  },

  saude: {
    farmacia: ["amenity=pharmacy"],
    hospital: ["amenity=hospital"],
    posto_saude: ["amenity=clinic"],
    veterinario: ["amenity=veterinary"],
    dentista: ["amenity=dentist"],
    consultorio_medico: ["amenity=doctors"],
  },

  administrativo: {
    delegacia: ["amenity=police"],
    prefeitura: ["amenity=townhall"],
    servico_emergencia: ["emergency=ambulance_station"],
    correios: ["amenity=post_office"],
  },

  lazer: {
    praca: ["place=square"],
    academia: ["leisure=fitness_centre"],
    biblioteca: ["amenity=library"],
  },

  religioso: {
    local_culto: ["amenity=place_of_worship"],
  },
} as const;

export type Category = keyof typeof CATEGORIES;

export type EstablishmentType = {
  category: Category;
  type: string;
};

export function getCategory(
  tags: Record<string, string>
): EstablishmentType | null {
  for (const [category, types] of Object.entries(
    CATEGORIES
  )) {
    for (const [type, tagsList] of Object.entries(types)) {
      for (const tag of tagsList) {
        const [key, value] = tag.split("=");

        if (tags[key] === value) {
          return {
            category: category as Category,
            type,
          };
        }
      }
    }
  }

  return null;
}