import { Router } from "express";
import { ApplicationsController } from "../controller/applications.controller.js";
import multer from "multer";

export const ApplicationsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

ApplicationsRouter.get('/', ApplicationsController.list);
ApplicationsRouter.get('/:id', ApplicationsController.get);
ApplicationsRouter.post('/', ApplicationsController.create);
ApplicationsRouter.put('/:id', ApplicationsController.update);

ApplicationsRouter.post('/:id/submit', ApplicationsController.submit);
ApplicationsRouter.post('/:id/approve', ApplicationsController.approve);
ApplicationsRouter.post('/:id/reject', ApplicationsController.reject);

ApplicationsRouter.post('/:id/files', upload.single('file'), ApplicationsController.addFile) 

ApplicationsRouter.post('/:id/pdfs', ApplicationsController.addPdf);


ApplicationsRouter.patch('/:id/state', ApplicationsController.addPdf);