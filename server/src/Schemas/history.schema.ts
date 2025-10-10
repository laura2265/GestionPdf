import {z} from "zod";

export const estadoEnum = z.enum(['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA'])

export const historyCreateSchema = z.object({
    application_id: z.number().int(),
    from_status: estadoEnum.optional(),
    to_status: estadoEnum,
    changed_by: z.number().int().optional(),
    comment: z.string().optional()
})

export const historyUpdateSchema = historyCreateSchema.partial();