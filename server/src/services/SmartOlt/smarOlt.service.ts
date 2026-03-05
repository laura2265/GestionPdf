import * as client  from "./smartOlt.client.js";
import {
  isMinticGrp1,
  isMinticGrp2,
  isMintic,
  upzOf,
  metaOf,
  zonaOf,
  upzLabel,
  uniqueExternalIds,
} from "../../utils/SmartOlt/filters.js";

type ListOnusOpts = {
  refresh?: boolean;
  onlyMintic?: boolean;
  group?: "none" | "upz" | "meta" | "zona";
};

export async function listOnus(opts: ListOnusOpts = {}) {
  const { refresh = false, onlyMintic = false, group = "none" } = opts;

  // 1) Traer data cruda desde SmartOLT (client)
  const r = await client.getAllOnusDetails({ refresh });
    let result = r.onus;
    result = result.filter(isMintic); 

  // 3) Opcional: agrupación
  if (group === "none") {
    return {
      total: result.length,
      items: result,
    };
  }

  if (group === "upz") {
    const p1 = result.filter(isMinticGrp1);
    const p2 = result.filter(isMinticGrp2);
    const otras = result.filter(o => upzOf(o) === "otro");

    return {
      total: result.length,
      groups: {
        lucero: { total: p1.length, ids: uniqueExternalIds(p1), items: p1 },
        tesoro: { total: p2.length, ids: uniqueExternalIds(p2), items: p2 },
        otras: { total: otras.length, ids: uniqueExternalIds(otras), items: otras },
      },
    };
  }

  if (group === "meta") {
    const buckets: Record<string, any[]> = { m1: [], m2: [], m3: [], none: [] };
    for (const o of result) buckets[metaOf(o)].push(o);

    return {
      total: result.length,
      groups: Object.fromEntries(
        Object.entries(buckets).map(([k, arr]) => [
          k,
          { total: arr.length, ids: uniqueExternalIds(arr), items: arr },
        ])
      ),
    };
  }

  if (group === "zona") {
    const map = new Map<string, any[]>();
    for (const o of result) {
      const z = zonaOf(o) || "SIN_ZONA";
      if (!map.has(z)) map.set(z, []);
      map.get(z)!.push(o);
    }

    return {
      total: result.length,
      groups: Object.fromEntries(
        Array.from(map.entries()).map(([z, arr]) => [
          z,
          { total: arr.length, ids: uniqueExternalIds(arr), items: arr },
        ])
      ),
    };
  }

  return { total: result.length, items: result };
}

export async function listZonas(opts: { refresh?: boolean } = {}) {
  return client.getZones({ refresh: opts.refresh ?? false });
}

export async function getOnuDetails(id: string, opts: { refresh?: boolean } = {}) {
  return client.getOnuDetails(id, { refresh: opts.refresh ?? false });
}

export async function getOnuSpeedProfiles(id: string, opts: { refresh?: boolean } = {}) {
  return client.getOnuSpeedProfiles(id, { refresh: opts.refresh ?? false });
}

export async function getSignalGraphImage(id: string, tipo: string) {
  return client.getOnuSignalGraphImage(id, tipo); // ✅ imagen
}

export async function getTrafficGraphImage(id: string, tipo: string) {
  return client.getOnuTrafficGraphImage(id, tipo); // ✅ imagen
}