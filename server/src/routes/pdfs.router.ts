import { Router } from "express";
import { PdfsController } from "../controller/pdfs.controller.js";

export const  pdfsRoutes = Router();

pdfsRoutes.get('/:applicationId', PdfsController.list)
pdfsRoutes.post('/', PdfsController.create)
pdfsRoutes.put('/:id', PdfsController.remove)
    