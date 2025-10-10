import z from "zod";

export const auditCreateSchema = z.object({
    user_id: z.number().int(),
    action: z.string().min(2),
    entity: z.string().min(2),
    entity_id: z.number().int().optional(),
    details: z.any().optional(),
})

export const auditUpdateScheme = auditCreateSchema.partial();