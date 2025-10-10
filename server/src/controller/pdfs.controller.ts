import { Request, Response, NextFunction } from "express";
import { PdfsService } from "../services/pdfs.service.js";

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

export class PdfsController{
    static async list(req:Request, res:Response, next: NextFunction){
        try {
                const applicationId = Number(req.params.applicationId);
                if (isNaN(applicationId)) {
                  return res.status(400).json({ message: "applicationId inválido" });
                }
        
                const files = await PdfsService.list(applicationId);
                res.json(files);
              } catch (error) {
                next(error);
              }
    }

    static async  create(req: Request, res: Response, next: NextFunction) {
      try {
        // Lee userId del header (si lo envías desde el FE)
        const hdr = req.headers["x-user-id"];
        const userId = hdr ? BigInt(String(hdr)) : undefined;

        const out = await PdfsService.create(req.body, userId);
        res.status(201).json(out);
      } catch (err) {
        next(err);
      }
    }

    static async remove(req: Request, res:Response, next: NextFunction){
        try{
            res.json(await PdfsService.remove(Number(req.params.id)))
        }catch(err){
            next(err)
        }
    }
}