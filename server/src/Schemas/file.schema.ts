import {z} from "zod";

export  const fileKindEnum = z.enum(['FOTO_FACHADA', 'FOTO_NOMENCLATURA', 'FOTO_TEST_VELOCIDAD', 'ORDEN_TRABAJO'])

export const fileCreateSchemaMultipart = z.object({
  application_id: z.coerce.number().int(),
  kind: fileKindEnum,
  uploaded_by: z.coerce.number().int().optional(),
});

export const fileCreateSchema = z.object({
  application_id: z.coerce.number().int(),
  kind: fileKindEnum,
  storage_path: z.string().optional(),
  mime_type: z.string().optional(),
  byte_size: z.coerce.number().int().optional(),
  sha256: z.string().length(64).optional(),
  uploaded_by: z.coerce.number().int().optional(),
});


export const fileUpdateSchema = fileCreateSchema.partial();