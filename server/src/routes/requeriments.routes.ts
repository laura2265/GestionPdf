import { Router } from 'express';
import { RequirementsController } from '../controller/requeriments.controller.js';

export const requirementsRouter = Router();
requirementsRouter.get('/', RequirementsController.list);
requirementsRouter.get('/:id', RequirementsController.get);
requirementsRouter.post('/', RequirementsController.create);
requirementsRouter.put('/:id', RequirementsController.update);
requirementsRouter.delete('/:id', RequirementsController.remove);