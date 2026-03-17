import e, {NextFunction, Request, response, Response} from "express";
import { norm, toBool } from "../utils/SmartOlt/normalize.js";
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

export async function reportOnuPdf(req, res, next) {
  try {
    const { id } = req.params;
    const refresh = toBool(req.query.refresh);

    const out = await report.generateOnuPdf(id, { refresh });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    return res.status(200).send(out.pdf);
  } catch (e) {
    next(e);
  }
}

//Controlador po rupz

export async function createUpzCardsRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const refresh = toBool(req.query.refresh);
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({
        message: "UPZ inválida. Use: lucero | tesoro",
      });
    }

    const out = await report.createUpzCardsRun({
      upz,
      refresh,
      onlyMintic,
    });

    return res.json({
      ...out,
      exampleDownload: `/api/smart-olt/report/pdf-upz/${upz}?runId=${out.runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
}

export async function exportUpzCardsRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const runId = String(req.query.runId ?? "").trim();
    const refresh = toBool(req.query.refresh);
    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({
        message: "UPZ inválida. Use: lucero | tesoro",
      });
    }

    if (!runId) {
      return res.status(400).json({ message: "Falta runId (cree el run primero)" });
    }

    const out = await report.exportUpzCardsRun({
      upz,
      runId,
      batch,
      size,
      refresh,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`
    );
    res.setHeader("X-Run-Total", String(out.total));
    res.setHeader("X-Run-Batch", String(out.batch));
    res.setHeader("X-Run-Exported-Now", String(out.exportedNow));
    res.setHeader("X-Run-Remaining", String(out.remaining));

    return res.status(200).send(out.pdf);
  } catch (e) {
    next(e);
  }
}

export async function resetUpzCardsRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({
        message: "UPZ inválida. Use: lucero | tesoro",
      });
    }

    const out = await report.resetUpzCardsRun({
      upz,
      onlyMintic,
    });

    return res.json(out);
  } catch (e) {
    next(e);
  }
}

//---------------------Reporte Upz y Meta-----------------------------------


export async function createUpzMetaRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const meta = norm(req.query.meta ?? "all");
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";
    const refresh = toBool(req.query.refresh);
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    if (!["all", "m1", "m2", "m3"].includes(meta)) {
      return res.status(400).json({ message: "Meta inválida. Use: all | m1 | m2 | m3" });
    }

    const out = await report.createUpzMetaRun({
      upz,
      meta: meta as any,
      onlyMintic,
      from,
      to,
      refresh,
    });

    return res.json({
      ...out,
      exampleDownload: `/api/smart-olt/report/pdf-upz-meta/${upz}?runId=${out.runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
}

export async function exportUpzMetaRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const runId = String(req.query.runId ?? "").trim();
    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));
    const refresh = toBool(req.query.refresh);

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    if (!runId) {
      return res.status(400).json({ message: "Falta runId (cree el run primero)" });
    }

    const out = await report.exportUpzMetaRun({
      upz,
      runId,
      batch,
      size,
      refresh,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    return res.status(200).send(out.pdf);
  } catch (e) {
    next(e);
  }
}

export async function resetUpzMetaRun(req, res, next) {
  try {
    const upz = norm(req.params.upz ?? "");
    const meta = norm(req.query.meta ?? "m1");
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    if (upz !== "lucero" && upz !== "tesoro") {
      return res.status(400).json({ message: "UPZ inválida. Use: lucero | tesoro" });
    }

    if (!["m1", "m2", "m3"].includes(meta)) {
      return res.status(400).json({ message: "Meta inválida. Use: m1 | m2 | m3" });
    }

    const out = await report.resetUpzMetaRun({
      upz,
      meta: meta as any,
      onlyMintic,
    });

    return res.json(out);
  } catch (e) {
    next(e);
  }
}

//----------------Controller de reporte de zona----------------------
export async function createZonaRun(req, res, next) {
  try {
    const refresh = toBool(req.query.refresh);
    const zona = String(req.query.zona ?? "").trim();
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    if (!zona) {
      return res.status(400).json({ message: "Falta query param: zona" });
    }

    const out = await report.createZonaRun({
      zona,
      onlyMintic,
      refresh,
    });

    return res.json({
      ...out,
      exampleDownload: `/api/smart-olt/report/pdf-zona?runId=${out.runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
}

export async function exportZonaRun(req, res, next) {
  try {
    const runId = String(req.query.runId ?? "").trim();
    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));
    const refresh = toBool(req.query.refresh);

    if (!runId) {
      return res.status(400).json({ message: "Falta runId" });
    }

    const out = await report.exportZonaRun({
      runId,
      batch,
      size,
      refresh,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.setHeader("X-Run-Total", String(out.total));
    res.setHeader("X-Run-Batch", String(out.batch));
    res.setHeader("X-Run-Exported-Now", String(out.exportedNow));
    res.setHeader("X-Run-Remaining", String(out.remaining));

    return res.status(200).send(out.pdf);
  } catch (e) {
    next(e);
  }
}

export async function resetZonaRun(req, res, next) {
  try {
    const zona = String(req.query.zona ?? "").trim();
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";

    if (!zona) {
      return res.status(400).json({ message: "Falta zona" });
    }

    const out = await report.resetZonaRun({
      zona,
      onlyMintic,
    });

    return res.json(out);
  } catch (e) {
    next(e);
  }
}

// reporte por estado

export async function createHealthRun(req, res, next) {
  try {
    const refresh = toBool(req.query.refresh);
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";
    const status = String(req.query.status ?? "").trim();
    const signal = String(req.query.signal ?? "").trim();

    if (!status) {
      return res.status(400).json({ message: "Falta query param: status" });
    }

    const out = await report.createHealthRun({
      filter: { status, signal },
      onlyMintic,
      refresh,
    });

    return res.json({
      ...out,
      exampleDownload: `/api/smart-olt/report/pdf-health?runId=${out.runId}&batch=0&size=100`,
    });
  } catch (e) {
    next(e);
  }
}

export async function exportHealthRun(req, res, next) {
  try {
    const runId = String(req.query.runId ?? "").trim();
    const batch = Math.max(0, Number(req.query.batch ?? 0) || 0);
    const size = Math.min(100, Math.max(3, Number(req.query.size ?? 100) || 100));
    const refresh = toBool(req.query.refresh);

    if (!runId) {
      return res.status(400).json({ message: "Falta runId" });
    }

    const out = await report.exportHealthRun({
      runId,
      batch,
      size,
      refresh,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.setHeader("X-Run-Total", String(out.total));
    res.setHeader("X-Run-Batch", String(out.batch));
    res.setHeader("X-Run-Exported-Now", String(out.exportedNow));
    res.setHeader("X-Run-Remaining", String(out.remaining));

    return res.status(200).send(out.pdf);
  } catch (e) {
    next(e);
  }
}

export async function resetHealthRun(req, res, next) {
  try {
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true";
    const status = String(req.query.status ?? "").trim();
    const signal = String(req.query.signal ?? "").trim();

    if (!status) {
      return res.status(400).json({ message: "Falta query param: status" });
    }

    const out = await report.resetHealthRun({
      filter: { status, signal },
      onlyMintic,
    });

    return res.json(out);
  } catch (e) {
    next(e);
  }
}

// reporte con graficas

export async function reportStats(req, res, next) {
  try{
    const refresh = toBool(req.query.refresh);
    const onlyMintic = String(req.query.mintic ?? "true").toLowerCase() === "true"
    const data = await service.getStatsReport({
      refresh, 
      onlyMintic,
    });

    return res.json({
      status: true,
      ...data,
    });
  }catch(e){
    next(e)
  }
}

export async function reportStatsPdf(req, res, next) {
  try {

    const refresh = req.query.refresh === "false";
    const onlyMintic = req.query.mintic !== "false";

    const out = await report.generateStatsPdf({
      refresh,
      onlyMintic
    });

    const pdfBuffer = Buffer.isBuffer(out.pdf)
      ? out.pdf
      : Buffer.from(out.pdf);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="reporte-estadistico-smartolt.pdf"');
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);

  } catch (e) {
    next(e);
  }
}

//----------------------reporte por uplink----------
export async function getUplinkDetails(req: any, res: any, next: any) {
  try {
    const id = req.params?.id;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "Falta id del equipo",
      });
    }

    const data = await client.getOltUplinkPortsDetails(id);

    return res.status(data?.status ?? 200).json(data);
  } catch (error) {
    next(error);
  }
}
export async function createUplinkVlanRun(req: any, res: any, next: any) {
  try {
    const oltId = req.body?.oltId ?? req.query?.oltId;
    const vlan = req.body?.vlan ?? req.query?.vlan;
    const refresh =
      String(req.body?.refresh ?? req.query?.refresh ?? "false").toLowerCase() === "true";

    const data = await report.createUplinkVlanRun({
      oltId,
      vlan,
      refresh,
    });

    return res.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportUplinkVlanRun(req: any, res: any, next: any) {
  try {
    const data = await report.exportUplinkVlanRun({
      runId: req.query?.runId ?? req.params?.runId,
      batch: req.query?.batch != null ? Number(req.query.batch) : 0,
      size: req.query?.size != null ? Number(req.query.size) : 100,
    });

    const pdfBuffer = Buffer.isBuffer(data.pdf)
      ? data.pdf
      : Buffer.from(data.pdf);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.filename}"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

export async function resetUplinkVlanRun(req:any, res:any, next:any) {
  try{
    const data = await report.resetUplinkVlanRun({
      oltId: req.body?.oltId ?? req.query?.oltId,
      vlan: req.body?.vlan ?? req.query?.vlan,
    })

    return res.json({
      ok: true,
      ...data,
    })
  }catch(error){
    next(error);
  }
}

// -----------------Reporte por GPON---------------------
export async function getGponDetails(req: any, res: any, next: any) {
  try{

    const r = await client.getGponDetails();
    if(!r){
      res.status(403).json({
        ok: false,
        message: "Error al momento de consultar los datos de la api"
      })
    }

    res.status(200).json({
      ok: true,
      message: "Consulta realizada con exito",
      data: r.data.response
    })

  }catch(error){
    return res.status(500).json({
      ok: false,
      message: error.message
    })
  }
}

export async function createOnuModelRun(req: any, res: any, next: any) {
  try {
    const data = await report.createOnuModelRun({
      modelName: req.body?.modelName ?? req.query?.modelName,
      refresh: String(req.body?.refresh ?? req.query?.refresh ?? "false").toLowerCase() === "true",
    });

    return res.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportOnuModelRun(req: any, res: any, next: any) {
  try {
    const data = await report.exportOnuModelRun({
      runId: req.query?.runId ?? req.params?.runId,
      batch: req.query?.batch != null ? Number(req.query.batch) : 0,
      size: req.query?.size != null ? Number(req.query.size) : 100,
      refresh: String(req.query?.refresh ?? "false").toLowerCase() === "true",
    });

    const pdfBuffer = Buffer.isBuffer(data.pdf)
      ? data.pdf
      : Buffer.from(data.pdf);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.filename}"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

export async function resetOnuModelRun(req: any, res: any, next: any) {
  try {
    const data = await report.resetOnuModelRun({
      modelName: req.body?.modelName ?? req.query?.modelName,
    });

    return res.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}
