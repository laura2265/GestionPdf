import e, {NextFunction, Request, Response} from "express";
import { toBool } from "../utils/SmartOlt/normalize.js";
import *as service from "../services/SmartOlt/smarOlt.service.js"
import *as client from "../services/SmartOlt/smartOlt.client.js"
import *as report from "../services/SmartOlt/smartOlt.reports.js"

export async function onuGet(req:Request, res: Response) {
  const refresh = toBool(req.query.refresh);
  const onlyMintic = toBool(req.query.mintic);
  const group = (req.query.group ?? "none") as any;

  const data =  await service.listOnus({refresh, onlyMintic,group});
  return res.status(200).json({
    message: "Consulta exitosa",
    ...data
  })
}

export async function getZones(req:Request, res:Response) {
    const refresh = toBool(req.query.refresh);
    const r = await client.getZones({refresh});
    
    return res.json({
        status: true, 
        zones: r.zones, 
        meta: {
            fromCache: r.fromCache,
            cachedAt: r.cachedAt
        }
    })
}

export async function onuDetails(req: Request, res: Response) {
  const refresh = toBool(req.query.refresh);
  const { id } = req.params;
  const r = await client.getOnuDetails(id, { refresh });
  return res.json({ status: true, data: r.data, meta: { fromCache: r.fromCache, cachedAt: r.cachedAt } });
}

export async function onuSpeed(req: Request, res: Response){
    const refresh = toBool(req.query.refresh);
    const {id} = req.params;
    const r = await client.getOnuSpeedProfiles(id, {refresh});

    return res.json({
        status: true,
        data: r.data, 
        meta: {
            fromCache: r.fromCache,
            cachedAt: r.cachedAt
        }
    })
}

export async function signalGraph(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, tipo } = req.params;

    const r = await service.getSignalGraphImage(id, tipo);

    if (!r.ok) {
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT (signal graph)",
        body: r.text ?? null,
      });
    }

    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(r.buffer);
  } catch (e) {
    next(e);
  }
}

export async function trafficGraph(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, tipo } = req.params;

    const r = await service.getSignalGraphImage(id, tipo);

    if (!r.ok) {
      return res.status(r.status ?? 500).json({
        message: "Error con SmartOLT (traffic graph)",
        body: r.text ?? null,
      });
    }

    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(r.buffer);
  } catch (e) {
    next(e);
  }
}

export async function reportGeneralPdf(req:Request, res: Response, next: NextFunction) {
    try{
        const refresh = toBool(req.query.refresh);
        const q = String(req.query.q ?? "");
        const status = String(req.query.status ?? "");

        const out = await report.generateGeneralMinticPdf({refresh, q, status});

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`)
        return res.status(200).send(out.pdf)
    }catch(e){
        next(e);
    }
}