// src/services/smartolt.service.ts
import { baseUrl, fetchWithCache, fetchImage, tokenSmart  } from "./smartOlt.client.js";

export function assertSmartToken() {
  if (!tokenSmart) {
    const err: any = new Error("Falta SMART_OLT_TOKEN");    
    err.status = 500;
    throw err;
  }
}

export async function getAllOnusDetails(refresh: boolean) {
  assertSmartToken();

  const r = await fetchWithCache("onu-get", `${baseUrl}/onu/get_all_onus_details`, { refresh });
  if (!r.ok) {
    const err: any = new Error("Error con SmartOLT");
    err.status = r.status ?? 500;
    err.body = r.data;
    throw err;
  }

  const raw = Array.isArray(r.data?.onus) ? r.data.onus : [];
  const onus = raw.map((x: any) => x?.onu_details ?? x);

  return { r, onus };
}

export async function getOnuDetails(id: string, refresh: boolean) {
  assertSmartToken();

  const r = await fetchWithCache(
    `details:${id}`,
    `${baseUrl}/onu/get_onu_details/${encodeURIComponent(id)}`,
    { refresh }
  );

  if (!r.ok) {
    const err: any = new Error("Error con SmartOLT");
    err.status = r.status ?? 500;
    err.body = r.data;
    throw err;
  }

  return r;
}

export async function getSignalGraph(id: string, tipo: string) {
  assertSmartToken();

  const url = `${baseUrl}/onu/get_onu_signal_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return await fetchImage(url);
}

export async function getTrafficGraph(id: string, tipo: string) {
  assertSmartToken();

  const url = `${baseUrl}/onu/get_onu_traffic_graph/${encodeURIComponent(id)}/${encodeURIComponent(tipo)}`;
  return await fetchImage(url);
}
