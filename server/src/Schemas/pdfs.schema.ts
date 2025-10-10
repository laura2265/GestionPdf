import {z} from "zod";

export const pdfCreateSchema = z.object({
  application_id: z.union([z.bigint(), z.number(), z.string()]).transform(v => BigInt(v)),
  decision: z.enum(["APROBADA", "RECHAZADA"]),
  comentario: z.string().optional(),
  motivo: z.string().optional(),
  data: z.any().optional().default({}),
  attachments: z.array(z.any()).optional().default([]),

  // ⚠️ Estos NO deben exigirse en el body:
  version: z.number().optional(),
  file_name: z.string().optional(),
  storage_path: z.string().optional(),
});

export type pdfUpdateSchema = z.infer<typeof pdfCreateSchema>;

