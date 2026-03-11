import { Router } from "express";
import * as controller from "../controller/smartOlt.controller.js"

export const smartOltRouter = Router();

smartOltRouter.get("/onu-get", controller.onuGet)
smartOltRouter.get("/get-zonas", controller.getZones)
smartOltRouter.get("/details-onu-id/:id", controller.onuDetails)
smartOltRouter.get("/velocidad-onu-id/:id", controller.onuSpeed)
smartOltRouter.get("/graffic-signal-onu-id/:id/:tipo", controller.trafficGraph)
smartOltRouter.get("/graffic-trafico-onu-id/:id/:tipo", controller.signalGraph)
smartOltRouter.get("/report/pdf", controller.reportGeneralPdf)
smartOltRouter.get("/report/onu-id/:id", controller.reportOnuPdf);
smartOltRouter.get("/report/pdf-upz/:upz/run", controller.createUpzCardsRun);
smartOltRouter.get("/report/pdf-upz/:upz", controller.exportUpzCardsRun);
smartOltRouter.post("/report/pdf-upz/:upz/reset", controller.resetUpzCardsRun);
smartOltRouter.get("/report/pdf-upz-meta/:upz/run", controller.createUpzMetaRun);
smartOltRouter.get("/report/pdf-upz-meta/:upz", controller.exportUpzMetaRun);
smartOltRouter.post("/report/pdf-upz-meta/:upz/reset", controller.resetUpzMetaRun);
smartOltRouter.get("/report/pdf-zona/run", controller.createZonaRun);
smartOltRouter.get("/report/pdf-zona", controller.exportZonaRun);
smartOltRouter.post("/report/pdf-zona/reset", controller.resetZonaRun);

smartOltRouter.get("/report/pdf-health/run", controller.createHealthRun);
smartOltRouter.get("/report/pdf-health", controller.exportHealthRun);
smartOltRouter.post("/report/pdf-health/reset", controller.resetHealthRun);

smartOltRouter.get("/report/stats", controller.reportStats)
smartOltRouter.get("/report/stats-pdf", controller.reportStatsPdf)