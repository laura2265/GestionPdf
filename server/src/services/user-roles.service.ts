import { prisma } from "../db.js";

export class UserRoleService{
    static list(userId: number) {
    return prisma.user_roles.findMany({
      where: { user_id: userId },
      include: {
        roles: true,
        users: true
      } as any
    });
  }

  static assign(userId: number, roleId: number) {
    return prisma.user_roles.create({
      data: { user_id: userId, role_id: roleId }
    });
  }

  static unassign(userId: number, roleId: number) {
    return prisma.user_roles.delete({
      where: { user_id_role_id: { user_id: userId, role_id: roleId } }
    });
  }
}