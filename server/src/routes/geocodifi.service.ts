import { Router } from "express";

export const mapsRouter = Router();

function normalizeBogotaQuery(raw: string) {
  let q = raw.trim();

  q = q.replace(/\s+/g, " ");
  q = q.replace(/\b(cra|cr)\b/gi, "Carrera");
  q = q.replace(/\b(cl)\b/gi, "Calle");
  q = q.replace(/\b(av)\b/gi, "Avenida");
  q = q.replace(/\b(diag)\b/gi, "Diagonal");
  q = q.replace(/\b(tv|trv|trans)\b/gi, "Transversal");

  q = q.replace(/#\s*/g, "# ");
  q = q.replace(/\s*-\s*/g, "-");

  if (!/bogot[aá]/i.test(q)) q += ", Bogotá";
  if (!/colombia/i.test(q)) q += ", Colombia";

  return q;
}

mapsRouter.get("/geocode", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({
        ok: false,
        message: "El parámetro q es obligatorio",
      });
    }

    if (q.length < 4) {
      return res.status(400).json({
        ok: false,
        message: "La dirección es demasiado corta",
      });
    }

    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        message: "No está configurada la variable OPENCAGE_API_KEY",
      });
    }

    const normalized = normalizeBogotaQuery(q);

    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.searchParams.set("q", normalized);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("countrycode", "co");
    url.searchParams.set("language", "es");
    url.searchParams.set("limit", "5");
    url.searchParams.set("no_annotations", "1");
    url.searchParams.set("pretty", "0");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message: data?.status?.message || "Error consultando OpenCage",
        detail: data,
      });
    }

    const results = Array.isArray(data?.results)
      ? data.results
          .filter((item: any) => item?.geometry?.lat != null && item?.geometry?.lng != null)
          .map((item: any) => ({
            lat: Number(item.geometry.lat),
            lng: Number(item.geometry.lng),
            label: item.formatted || "Dirección encontrada",
            confidence: item.confidence ?? null,
            components: item.components || {},
          }))
      : [];

    return res.json({
      ok: true,
      query: q,
      normalized,
      results,
    });
  } catch (error) {
    next(error);
  }
});