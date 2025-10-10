import { prisma } from '../db.js'
import { auditCreateSchema, auditUpdateScheme } from "../Schemas/audit.schema.js";

const toBigInt = (v: unknown) =>
  (v === null || v === undefined || v === '') ? null : BigInt(v as any);

export class AuditService {
  static async list({
    userId,
    page = 1,
    size = 20,
  }: { userId?: number; page?: number; size?: number }) {
    const pageNum = Number.isFinite(page) && page! > 0 ? Number(page) : 1;
    const sizeNum = Number.isFinite(size) && size! > 0 ? Number(size) : 20;
    const skip = (pageNum - 1) * sizeNum;

    const where: any = {};
    if (userId) where.user_id = toBigInt(userId);

    const [items, total] = await Promise.all([
      prisma.audit_log.findMany({
        where,
        skip,
        take: sizeNum,
        orderBy: { id: 'desc' },
      }),
      prisma.audit_log.count({ where }),
    ]);

    return {
      items,
      total,
      page: pageNum,
      size: sizeNum,
      pages: Math.ceil(total / sizeNum) || 1,
    };
  }


  static async get(id: number) {
    const bid = toBigInt(id);
    const item = await prisma.audit_log.findUnique({
      where: { id: bid as any },
    });
    if (!item) throw { status: 404, message: 'Registro de auditoría no encontrado' };
    return item;
  }

  static async create(payload: unknown) {
    const result = auditCreateSchema.parse(payload);

    return prisma.audit_log.create({
      data: {
        user_id: toBigInt((result as any).user_id) as any,  // BigInt o null
        action: (result as any).action,
        entity: (result as any).entity,
        entity_id: toBigInt((result as any).entity_id) as any, // BigInt o null
        details: (() => {
          const d = (result as any).details;
          if (d === undefined || d === null) return null;
          return typeof d === 'string' ? d : JSON.stringify(d);
        })(),
       
      },
    });
  }
  static async update(id: number, payload: unknown) {
    const bid = toBigInt(id);
    const dataParsed = auditUpdateScheme.parse(payload);

    const data: any = {};
    if ('user_id' in (dataParsed as any)) data.user_id = toBigInt((dataParsed as any).user_id);
    if ('action' in (dataParsed as any)) data.action = (dataParsed as any).action;
    if ('entity' in (dataParsed as any)) data.entity = (dataParsed as any).entity;
    if ('entity_id' in (dataParsed as any)) data.entity_id = toBigInt((dataParsed as any).entity_id);
    if ('details' in (dataParsed as any)) {
      const d = (dataParsed as any).details;
      data.details = d === undefined || d === null ? null : (typeof d === 'string' ? d : JSON.stringify(d));
    }

    return prisma.audit_log.update({
      where: { id: bid as any },
      data,
    });
  }
}
