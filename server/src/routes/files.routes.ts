import { Router } from "express";
import multer from "multer";
import { FilesController } from "../controller/files.controller.js";

export const filesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

filesRouter.get("/:applicationId", FilesController.listByApplication);

filesRouter.post(
  "/:applicationId",
  upload.single("file"),
  FilesController.create
);

filesRouter.put("/:id", FilesController.update);
filesRouter.delete("/:id", FilesController.remove);
