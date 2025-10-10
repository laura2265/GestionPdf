import { Request } from "express";

export function getBaseUrl(req: Request) {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host  = req.get("x-forwarded-host")  || req.get("host");
  return `${proto}://${host}`;
}

// devuelve URL absoluta (o cambia a relativa si prefieres)
export function publicFileUrl(req: Request, id: string | number | bigint) {
  return `${getBaseUrl(req)}/files/raw/${String(id)}`;
}

export const toJSONSafe = (obj: any) =>
  JSON.parse(JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
