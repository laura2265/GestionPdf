import { Request, Response, NextFunction } from "express";
import { UsersService } from "../services/users.service.js";

function convertBigIntToString(obj: any): any {
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    if (Array.isArray(obj)) {
        return obj.map(convertBigIntToString);
    }
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, convertBigIntToString(value)])
        );
    }
    return obj;
}


export class UsersController{
   
    static async list(req: Request, res: Response, next: NextFunction) {
      try {
        const page = Number(req.query.page ?? 1);
        const size = Number(req.query.size ?? 100);
        const onlyActive = (req.query.onlyActive ?? 'true') === 'true';

        const result = await UsersService.list({ page, size, onlyActive });

        const resultWithStringIds = Array.isArray(result)
          ? result.map((user: any) => convertBigIntToString(user))
          : convertBigIntToString(result);

        return res.json(resultWithStringIds);
      } catch (err) {
        console.error('UsersController.list error:', err); // <— log
        return next(err);
      }
    }



    static async get(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);  
            const result = await UsersService.get(id);

            // Convierte BigInt a string para todos los valores de result
            const resultWithStringIds = convertBigIntToString(result);

            res.json(resultWithStringIds);
        } catch (err) {
            next(err);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
      try {
        const user = await UsersService.create(req.body);
        const userResponse = convertBigIntToString({
            user,
            id: user.id.toString(),
        });
        res.json(userResponse);
      } catch (error) {
        next(error);
      }
    }


    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);  
            const result = await UsersService.update(id, req.body); 

            const resultWithStringIds = convertBigIntToString(result);

            res.json(resultWithStringIds);  
        } catch (err) {
            next(err); 3
        }
    }


    static async deactivate(req:Request, res: Response, next: NextFunction){
        try{
            const id = Number(req.params.id);
            const result = await UsersService.deactivate(id);
            res.json(result);
        }catch(err){
            next(err);
        }
    }
}