import { NextFunction, Request, Response } from "express";
import { UserRoleService } from "../services/user-roles.service.js";


type AuthedRequest = Request & { auth?: { user?: { id?: number } } };

const getUserId = (req: AuthedRequest): number =>
  Number(req.auth?.user?.id ?? req.header('x-user-id') ?? NaN);

const getNumericParam = (value: unknown): number => {
  const n = Number(value);
  if (Number.isNaN(n)) throw { status: 400, message: "Parámetro numérico inválido" };
  return n;
};

// Convierte todos los BigInt a string de forma recursiva
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

export class UserRoleController{
    static async list(req: Request, res: Response, next: NextFunction){
        try{
            const userId = getUserId(req);
            if(Number.isNaN(userId)){
                return res.status(401).json({message: "No autorizado"});
            }

            const result = await UserRoleService.list(userId);
            res.json(sanitizeBigInt(result));
        }catch(err){
            next(err)
        }
    }
}