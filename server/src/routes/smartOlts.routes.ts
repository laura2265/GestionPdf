import { Router } from "express";

export const smartOltRouter = Router();

let cache: { at: number; raw: any } | null = null;
const TTL_MS = 30 * 60 * 1000;

const dominiosmart = process.env.SMART_OLT_API_URL;
const tokenSmart = process.env.SMART_OLT_TOKEN;


//consulta todas las de mintic
smartOltRouter.get("/onu-get", async (req, res, next) => {
  try {

    if (!dominiosmart || !tokenSmart) {
      return res.status(500).json({
        message: "Faltan variables SMART_OLT_API_URL o SMART_OLT_TOKEN",
      });
    }

    const now = Date.now();
    const refresh = req.query.refresh === "true";

    if (!refresh && cache && now - cache.at < TTL_MS) {
      const onusCached = Array.isArray(cache.raw?.onus) ? cache.raw.onus : [];
      const mintic = onusCached.filter((onu: any) =>
        String(onu?.address ?? "").toLowerCase().includes("mintic")
      );

      return res.json({
        status: true,
        count: mintic.length,
        onus: mintic,
        _cached: true,
        _cachedAt: new Date(cache.at).toISOString(),
      });
    }

    const response = await fetch(dominiosmart, {
      method: "GET",
      headers: {
        "X-Token": tokenSmart,
        Accept: "application/json",
      },
    });

    const result = await response.json();
    if (!response.ok) {
      if (cache) {
        const onusCached = Array.isArray(cache.raw?.onus) ? cache.raw.onus : [];
        const mintic = onusCached.filter((onu: any) =>
          String(onu?.address ?? "").toLowerCase().includes("mintic")
        );

        return res.status(200).json({
          status: true,
          count: mintic.length,
          onus: mintic,
          _cached: true,
          _cachedAt: new Date(cache.at).toISOString(),
          _note: "SmartOLT limit/failure, serving cached data",
          _smartOltError: result,
        });
      }

      return res.status(response.status).json({
        message: "Error con SmartOLT",
        status: response.status,
        body: result,
      });
    }

    cache = { at: now, raw: result };

    const onus = Array.isArray(result?.onus) ? result.onus : [];
    const mintic = onus.filter((onu: any) =>
      String(onu?.address ?? "").toLowerCase().includes("mintic")
    );

    return res.json({
      status: true,
      count: mintic.length,
      onus: mintic,
      _cached: false,
      _cachedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Error al utilizar la API de SmartOLT:", error);
    next(error);
  }
});


//consulta los detalles de por id
smartOltRouter.get("/details-onu-id/:id",async(req, res, next)=>{
    try{
        let {id} = req.params
        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_details/${id}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})


//grafica de signal

////////⦁	hourly
smartOltRouter.get("/graffic-signal-onu-id/:id/:tipo",async(req, res, next)=>{
    try{
        let {id} = req.params;
        let {tipo} = req.params;

        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_signal_graph/${id}/${tipo}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})

/////grafico de el trafico
smartOltRouter.get("/graffic-trafico-onu-id/:id/:tipo",async(req, res, next)=>{
    try{
        let {id} = req.params
        let {tipo} = req.params
        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_traffic_graph/${id}/${tipo}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})


/// velocidad de descarga y subida
smartOltRouter.get("/velocidad-onu-id/:id",async(req, res, next)=>{
    try{
        let {id} = req.params
        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_speed_profiles/${id}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})


smartOltRouter.get("/details-onu-id/:id",async(req, res, next)=>{
    try{
        let {id} = req.params
        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_details/${id}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})

smartOltRouter.get("/details-onu-id/:id",async(req, res, next)=>{
    try{
        let {id} = req.params
        const response = await fetch(`https://supertv.smartolt.com/api/onu/get_onu_details/${id}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart
            }
        })
    }catch(error){

    }
})
