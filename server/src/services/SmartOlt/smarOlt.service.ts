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
import { norm } from "../../utils/SmartOlt/normalize.js";
import { unknown } from "zod";

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

//----------------------Estadisticas-------------------------------
type StatsOpts = {
  refresh?: boolean;
  onlyMintic?: boolean;
};

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function normalizeStatus(v: any): string {
  const s = norm(v);
  if (s === "online") return "online";
  if (s === "offline") return "offline";
  if (s === "los") return "los";
  if (s === "power fail" || s === "power failed" || s === "power_failed") return "power_fail";
  return "unknown";
}

function normalizeSignal(v: any): string {
  const s = norm(v);
  if (s === "very good") return "very_good";
  if (s === "warning") return "warning";
  if (s === "critical") return "critical";
  return "unknown";
}

export async function getStatsReport(opts: StatsOpts = {}) {
  const { refresh = false, onlyMintic = true } = opts;

  const r = await client.getAllOnusDetails({ refresh });
  let onus = r.onus ?? [];

  const totalAll = onus.length;
  const totalMintic = onus.filter(isMintic).length;

  if (onlyMintic) {
    onus = onus.filter(isMintic);
  }

  const byUpz: Record<string, number> = {
    lucero: 0,
    tesoro: 0,
    otro: 0,
  };
  const byMetaUpz: Record<string, Record<string, number>> ={
    lucero: { m1: 0, m2: 0, m3: 0, none: 0 },
    tesoro: { m1: 0, m2: 0, m3: 0, none: 0 },
  }

  const byMeta: Record<string, number> = {
    m1: 0,
    m2: 0,
    m3: 0,
    none: 0,
  };

  const byZona: Record<string, number> = {};
  const byEstado: Record<string, number> = {
    online: 0,
    offline: 0,
    power_fail: 0,
    los: 0,
    unknown: 0,
  };

  const bySignal: Record<string, number> = {
    very_good: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
  };

  for (const o of onus) {
    const upz = upzOf(o);
    const meta = metaOf(o);
    inc(byUpz, upzOf(o));
    inc(byMeta, metaOf(o));
    inc(byZona, zonaOf(o) || "SIN_ZONA");
    inc(byEstado, normalizeStatus(o?.status));
    inc(bySignal, normalizeSignal(o?.signal));
    byMetaUpz[upz][meta] = (byMetaUpz[upz][meta] ?? 0) + 1;
  }

  const zonasOrdenadas = Object.entries(byZona)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return {
    totalAll,
    totalMintic,
    totalAnalizado: onus.length,
    byUpz,
    byMeta,
    byMetaUpz,
    byZona,
    zonasOrdenadas,
    byEstado,
    bySignal,
    meta: {
      fromCache: r.fromCache,
      cachedAt: r.cachedAt ?? null,
    },
  };
}