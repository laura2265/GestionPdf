// rbac.service.ts
import { prisma } from "../db.js";

export type RoleCode = "ADMIN" | "SUPERVISOR" | "TECNICO";

export async function hasRole(userId: number | bigint, code: RoleCode) {
  return !!(await prisma.user_roles.findFirst({
    where: {
      user_id: BigInt(userId),
      roles: { is: { code } as any },
    },
    include: { roles: true },
  }));
}
export async function ensureRole(userId: number | bigint, code: RoleCode) {
  // BYPASS en desarrollo
  if (process.env.DEV_NOAUTH === 'true') return;

  const ok = await hasRole(userId, code);
  if (!ok) {
    const err: any = new Error('No autorizado');
    err.status = 403;
    throw err;
  }
}
