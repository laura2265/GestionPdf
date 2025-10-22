import { Request, Response, NextFunction } from "express";
import { FilesService } from "../services/files.service.js";

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

export class FilesController{

    static async listByApplication(req: Request, res: Response, next: NextFunction) {
      try {
        const applicationId = Number(req.params.applicationId);
        if (isNaN(applicationId)) {
          return res.status(400).json({ message: "applicationId inválido" });
        }

        const files = await FilesService.listByApplicationId(applicationId);
        res.json(files);
      } catch (error) {
        next(error);
      }
    }

    static async create(req:Request, res:Response, next: NextFunction){
        try{
            res.status(201).json(await FilesService.create(req.body))
        }catch(err){
            next(err) 

        }
    }

    static async update(req:Request, res:Response, next: NextFunction){
        try{
            res.json(await FilesService.update(Number(req.params.id), req.body))
        }catch(err){
            next(err)

        }
    }
    static async remove(req: Request, res: Response, next: NextFunction){
        try{
            res.json(await FilesService.remove(Number(req.params.id)))
        }catch(err){
            next();
        }
    }
}