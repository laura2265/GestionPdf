import type { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export type AuthedRequest = Request & { auth?: { user?: { id: number } } };
const SECRET = process.env.JWT_SECRET || "dev";

function getBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ message: "No autenticado" });
  try {
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload | string;
    const payload = typeof decoded === "string" ? {} : decoded;
    const userId = Number((payload as any).id ?? (payload as any).sub);
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    req.auth = { user: { id: userId } };
    next();
  } catch {
    return res.status(401).json({ message: "No autenticado" });
  }
}

export function maybeAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    if (process.env.DEV_NOAUTH === 'true') {
      const headerId = Number(req.header('x-user-id') ?? 1);
      req.auth = { user: { id: headerId } };
    }
    return next();
  } catch (e) {
    return next(e);
  }
}
