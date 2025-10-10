import { Request, Response, NextFunction } from "express";
import { EstratoService } from "../services/estrato.service.js";

export class EstratoController{
    static async list(req: Request, res: Response, next: NextFunction){
        try{
            res.json(await EstratoService.list())
        }catch(err){
            next(err);
        }
    }
}
