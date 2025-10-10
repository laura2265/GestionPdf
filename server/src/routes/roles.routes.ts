import e, { Router } from "express";
import { RoleService } from "../services/roles.service.js";
import { UserRoleService } from "../services/user-roles.service.js";

export const rolesRouter = Router();

rolesRouter.get('/', async(_req, res, next)=>{
    try{
        res.json(await RoleService.list());
    }catch(err){
        next(e)
    }
})

rolesRouter.get('/user/:userId/roleId', async(req, res, next)=>{
    try{
        res.json(await UserRoleService.list(Number(req.params.userId)))
    }catch(err){
        next(e);
    }
});

rolesRouter.post('/user/:userId/:roleId', async(req, res, next) =>{
    try{
        res.status(201).json(await UserRoleService.assign(Number(req.params.userId), (Number(req.params.roleId))))
    }catch(err){
        next(e);
    }
})

rolesRouter.delete('/user/:userId/:roleId', async(req, res, next) => {
    try{
        res.json(await UserRoleService.unassign(Number(req.params.userId), Number(req.params.roleId)))
    }catch(err){
        next(e);
    }
})