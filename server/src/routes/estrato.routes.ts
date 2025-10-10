import { Router } from "express";
import { EstratoController } from "../controller/estrato.controller.js";

export const estratoRouter = Router();

estratoRouter.get('/', EstratoController.list)