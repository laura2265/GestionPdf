import { norm } from "./normalize.js";

// Si no tienes MetaKey definido en types, usa esto:
// export type MetaKey = "m1" | "m2" | "m3";
export type MetaKey = "m1" | "m2" | "m3";

/**
 * Fuente única del comentario/observación.
 * (unifica commentText + getComment)
 */
export function commentText(o: any): string {
  return String(
    o?.comment ??
    o?.comentario ??
    o?.address ??
    o?.onu_details?.comment ??
    ""
  ).trim();
}

/**
 * Texto “total” para búsquedas por patrones (meta, etc).
 */
export function textAll(o: any): string {
  return [
    commentText(o),
    o?.name,
    o?.olt_name,
    o?.zone_name,
    o?.zone,
    o?.zona,
    o?.unique_external_id,
    o?.sn,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Mintic general
 */
export function isMintic(o: any): boolean {
  return norm(commentText(o)).includes("mintic");
}

/**
 * Grupo mintic (fuente única)
 */
export function minticGroup(o: any): "grp1" | "grp2" | null {
  const c = norm(commentText(o));
  const hasMintic = c.includes("mintic");
  if (!hasMintic) return null;
  if (c.includes("lf3grp1")) return "grp1";
  if (c.includes("lf3grp2")) return "grp2";
  return null;
}

export function isMinticGrp1(o: any): boolean {
  return minticGroup(o) === "grp1";
}

export function isMinticGrp2(o: any): boolean {
  return minticGroup(o) === "grp2";
}

export function upzOf(o: any): "lucero" | "tesoro" | "otro" {
  const g = minticGroup(o);
  if (g === "grp1") return "lucero";
  if (g === "grp2") return "tesoro";
  return "otro";
}

export function upzLabel(o: any): "Lucero" | "Tesoro" | "Otras" {
  const g = minticGroup(o);
  if (g === "grp1") return "Lucero";
  if (g === "grp2") return "Tesoro";
  return "Otras";
}

export function metaOf(o: any): MetaKey | "none" {
  const t = norm(textAll(o));
  if (/\bm\s*[-_]?\s*1\b/.test(t)) return "m1";
  if (/\bm\s*[-_]?\s*2\b/.test(t)) return "m2";
  if (/\bm\s*[-_]?\s*3\b/.test(t)) return "m3";
  return "none";
}

export function zonaOf(o: any): string {
  return String(o?.zone ?? o?.zone_name ?? o?.zona ?? "").trim();
}

/**
 * ID canónico para dedupe/export.
 */
export function getExternalId(o: any): string | null {
  const v =
    o?.unique_external_id ??
    o?.onu_details?.unique_external_id ??
    o?.external_id ??
    o?.externalId ??
    o?.sn ??
    o?.id ??
    null;

  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function uniqueExternalIds(onus: any[]): string[] {
  const ids = onus.map(getExternalId).filter((x): x is string => Boolean(x));
  return Array.from(new Set(ids));
}

/**
 * Fecha de autorización: una sola función (unifica dateOf/dateOfUpz)
 */
export function dateOf(o: any): Date | null {
  const s = String(o?.authorization_date ?? "").trim();
  if (!s) return null;

  const isoish = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(isoish);
  if (!Number.isFinite(t)) return null;

  return new Date(t);
}
//por estado
export type HealthFilter = {
  status?: string;
  signal?: string;
};

export function matchesHealthFilter(o: any, filter: HealthFilter): boolean {
  const status = String(o?.status ?? "").trim().toLowerCase();
  const signal = String(o?.signal ?? "").trim().toLowerCase();

  const expectedStatus = String(filter.status ?? "").trim().toLowerCase();
  const expectedSignal = String(filter.signal ?? "").trim().toLowerCase();

  if (!expectedStatus) return false;

  // Caso ONLINE: sí valida signal
  if (expectedStatus === "online") {
    if (status !== "online") return false;
    if (!expectedSignal) return true;
    return signal === expectedSignal;
  }

  return status === expectedStatus;
}

export function healthFilterLabel(filter: HealthFilter): string {
  const status = String(filter.status ?? "").trim();
  const signal = String(filter.signal ?? "").trim();

  if (!status) return "Sin filtro";

  if (status.toLowerCase() === "online" && signal) {
    return `${status} + ${signal}`;
  }

  return status;
}