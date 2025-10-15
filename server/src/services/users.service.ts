import { prisma } from "../db.js";
import { z } from "zod";
import { PrismaClient, $Enums } from "@prisma/client";

export const userCreateSchema = z.object({
    full_name: z.string().min(3),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string(),
    role_id: z.number().int().positive().optional(),
    role_code:  z.nativeEnum($Enums.roles_code).optional()
});

export const userUpdateSchema = z.object({
  fullName: z.string().min(3).optional(),
  phone: z.string().optional(),
  password: z.string().optional(),
  roleId: z.union([z.string(), z.number()]).optional(), // Int en tu schema
});

export class UsersService{

    static async list({
        page = 1, size=300, onlyActive = true
    }){
        const skip = (page - 1) * size;
        const where = onlyActive ? { is_active: true }: undefined;
        const [items, total] = await Promise.all([
            prisma.users.findMany({
                where,
                skip,
                take: size,
                orderBy: {id: 'desc'}
            }),
            prisma.users.count({where})
        ])
        return{
            items,
            total,
            page,
            size
        };
    }

    static async get(id: number){
        const user= await prisma.users.findUnique({
            where: {id}
        });
        if(!user) throw {status: 404, message: 'Usuario no encontrado'};
        return user;
    }

    static async create(data: z.infer<typeof userCreateSchema>) {
    return prisma.$transaction(async (tx: PrismaClient) => {
      const email = data.email.trim().toLowerCase();

      const user = await tx.users.create({
        data: {
          full_name: data.full_name,
          email,
          ...(data.phone ? { phone: data.phone } : {}),
          password: data.password,
        },
        select: {
          id: true, full_name: true, email: true, phone: true,
          is_active: true, created_at: true, updated_at: true,
        },
      });

      let roleIdToAssign: number | null = null;

      if (data.role_id) {
        roleIdToAssign = data.role_id;
      } else if (data.role_code) {
        const role = await tx.roles.findUnique({ where: { code: data.role_code } });
        if (!role) throw new Error(`Rol no encontrado: ${data.role_code}`);
        roleIdToAssign = role.id;
      } else {
        const def = await tx.roles.findUnique({ where: { code: "TECNICO" } });
        roleIdToAssign = def?.id ?? null;
      }

      if (roleIdToAssign) {
        await tx.user_roles.create({
          data: { user_id: user.id, role_id: roleIdToAssign }
        });
      }

      return user;
    });
  }

    static async update(id: number, payload: unknown) {
    const data = userUpdateSchema.parse(payload);

    const updateData: any = {
      ...(data.fullName ? { full_name: data.fullName } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.password ? { password: data.password } : {}),
    };

    // sin cambio de rol → solo update del usuario
    if (data.roleId === undefined) {
      return prisma.users.update({
        where: { id },
        data: updateData,
        include: { user_roles: { include: { roles: true } } },
      });
    }

    const roleId = Number(data.roleId);
    if (!Number.isInteger(roleId)) {
      throw new Error("Invalid roleId");
    }

    // con cambio de rol → reemplaza asociaciones en user_roles
    const updated = await prisma.users.update({
      where: { id },
      data: {
        ...updateData,
        user_roles: {
          deleteMany: {},                      // limpia roles previos
          create: {
            roles: { connect: { id: roleId } } // asigna nuevo rol (Int)
            // Si prefieres por FK directa y tu modelo lo permite:
            // role_id: roleId
          },
        },
      },
      include: { user_roles: { include: { roles: true } } },
    });

    return updated;
  }

    static async deactivate(id: number){
        return prisma.users.update({
            where: {id},
            data: {
                is_active: false
            }
        })
    }

}