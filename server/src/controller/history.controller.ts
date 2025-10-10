import { Request, Response, NextFunction } from "express";
import { HistoryService } from "../services/history.service.js";

const sanitizeBigInt = (value: any): any => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeBigInt);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeBigInt(v);
    return out;
  }
  return value;
};
export class HistoryController{
    static async list(req: Request, res:Response, next: NextFunction){
        try {
          const history = await HistoryService.list();
          res.json(history);
        } catch (error) {
          next(error);
        }
    }

    static async create(req: Request, res:Response, next: NextFunction){
        try{
            res.json(await HistoryService.create(req.body))
        }catch(error){
            next(error);
        }
    }

    static async update(req: Request, res:Response, next: NextFunction){
        try{
            res.json(await HistoryService.update(Number(req.params.id), req.body))
        }catch(error){
            next(error);
        }
    }
}
