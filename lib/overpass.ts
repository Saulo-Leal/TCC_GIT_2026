import { CATEGORIES } from "@/lib/categories";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;

  lat?: number;
  lon?: number;

  center?: {
    lat: number;
    lon: number;
  };

  tags?: Record<string, string>;
};

function createBoundingBox(
  latitude: number,
  longitude: number,
  radius: number
) {
  const earthRadius = 6371000;

  const latitudeDelta =
    (radius / earthRadius) *
    (180 / Math.PI);

  const longitudeDelta =
    (radius /
      (earthRadius *
        Math.cos(
          (latitude * Math.PI) / 180
        ))) *
    (180 / Math.PI);

  return {
    south: latitude - latitudeDelta,
    west: longitude - longitudeDelta,
    north: latitude + latitudeDelta,
    east: longitude + longitudeDelta,
  };
}

export function buildOverpassQuery(
  latitude: number,
  longitude: number,
  radius: number
) {
  const tagsByKey = new Map<
    string,
    Set<string>
  >();

  for (const category of Object.values(CATEGORIES)) {
    for (const establishment of Object.values(
      category
    )) {
      for (const tag of establishment) {
        const [key, value] =
          tag.split("=");

        if (!key || !value) {
          continue;
        }

        if (!tagsByKey.has(key)) {
          tagsByKey.set(
            key,
            new Set<string>()
          );
        }

        tagsByKey
          .get(key)!
          .add(value);
      }
    }
  }

  const bbox = createBoundingBox(
    latitude,
    longitude,
    radius
  );

  const queries: string[] = [];

  for (const [key, values] of tagsByKey) {
    const regex = [...values]
      .map((value) =>
        value.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )
      )
      .join("|");

    queries.push(`
      nwr["${key}"~"^(${regex})$"]
      (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    `);
  }

  return `
    [out:json][timeout:60][maxsize:16777216];

    (
      ${queries.join("\n")}
    );

    out center qt;
  `;
}