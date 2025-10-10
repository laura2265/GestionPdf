import { Router } from "express";
import { HistoryController } from "../controller/history.controller.js";

export const historyRouter = Router();

historyRouter.get('/', HistoryController.list);
historyRouter.post('/', HistoryController.create);
historyRouter.put('/:id', HistoryController.update);
