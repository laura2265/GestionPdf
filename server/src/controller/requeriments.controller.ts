import { Request, Response, NextFunction } from 'express';
import { RequerimentsService } from '../services/requeriments.service.js';

export class RequirementsController {
    static async list(_req: Request, res: Response, next: NextFunction) {
        try { res.json(await RequerimentsService.list()); }
        catch (e) { next(e); }
    }
    static async get(req: Request, res: Response, next: NextFunction) {
        try { res.json(await RequerimentsService.get(Number(req.params.id))); }
        catch (e) { next(e); }
    }
    static async create(req: Request, res: Response, next: NextFunction) {
        try { res.status(201).json(await RequerimentsService.create(req.body)); }
        catch (e) { next(e); }
    }
    static async update(req: Request, res: Response, next: NextFunction) {
        try { res.json(await RequerimentsService.update(Number(req.params.id), req.body)); }
        catch (e) { next(e); }
    }
    static async remove(req: Request, res: Response, next: NextFunction) {
        try { res.json(await RequerimentsService.remove(Number(req.params.id))); }
        catch (e) { next(e); }
    }
}

