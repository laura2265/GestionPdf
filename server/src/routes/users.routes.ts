import { Router } from "express";
import { UsersController } from "../controller/users.controller.js";

export const usersRouter = Router();

usersRouter.get('/ping', (req, res) => res.json({ ok: true }));

usersRouter.get('/direct', async (req, res, next) => {
  try {
    const { prisma } = await import('../db.js');
    const users = await prisma.users.findMany({ take: 5 });
    return res.json(users);
  } catch (err) {
    console.error('users/direct error:', err);
    return next(err);
  }
});

usersRouter.get('/', UsersController.list);
usersRouter.get('/:id', UsersController.get);
usersRouter.post('/', UsersController.create);
usersRouter.put('/:id', UsersController.update);
usersRouter.put('/:id/deactivate', UsersController.deactivate);
