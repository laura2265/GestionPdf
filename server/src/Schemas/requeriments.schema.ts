import {z} from "zod";
import { fileKindEnum } from "./file.schema.js";

export const requerimentCreateSchema = z.object({
    kind: fileKindEnum,
    is_required: z.boolean().default(false),
    observacion: z.string().optional(),
})

export const requirementUpdateSchema = requerimentCreateSchema.partial();
