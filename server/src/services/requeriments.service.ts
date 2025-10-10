import { prisma } from "../db.js";
import { requerimentCreateSchema, requirementUpdateSchema } from "../Schemas/requeriments.schema.js";

export class RequerimentsService{
    static async list() {
      return prisma.application_requirements.findMany({ orderBy: { id: "asc" } });
    }

    static async get(id: number) {
      const item = await prisma.application_requirements.findUnique({ where: { id } });
      if (!item) throw { status: 404, message: "Requisito no encontrado" };
      return item;
    }
    static async create(payload: unknown) {
      const data = requerimentCreateSchema.parse(payload);
      return prisma.application_requirements.create({ data });
    }
    static async update(id: number, payload: unknown) {
      const data = requirementUpdateSchema.parse(payload);
      return prisma.application_requirements.update({ where: { id }, data });
    }
    static async remove(id: number) {
      return prisma.application_requirements.delete({ where: { id } });
    }
}