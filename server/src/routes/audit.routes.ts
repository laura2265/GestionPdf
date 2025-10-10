import { Router } from "express";
import { AuditController } from "../controller/audit.controller.js";

export const AuditRouter = Router();

AuditRouter.get('/', AuditController.list);
AuditRouter.get('/:id', AuditController.get);
AuditRouter.post('/', AuditController.create);
AuditRouter.put('/:id', AuditController.update);
