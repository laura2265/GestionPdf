import { Router } from "express";
import { UserRoleController } from "../controller/user-role.controller.js";

export const UserRoleRouter = Router();

UserRoleRouter.get('/', UserRoleController.list);