import { prisma } from "../db.js";
import { fileCreateSchema, fileUpdateSchema } from "../Schemas/file.schema.js";

type SaveBufferInput = {
  applicationId: number | bigint;
  kind: "FOTO_FACHADA" | "FOTO_NOMENCLATURA" | "FOTO_TEST_VELOCIDAD" | "ORDEN_TRABAJO";
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer | Uint8Array;
  uploadedBy?: number;
  sha256?: string;
};

export class FilesService{

    static async listByApplicationId(applicationId: number) {
      const files = await prisma.application_files.findMany({
        where: { application_id: applicationId },
        orderBy: { id: 'desc' },
      });
    
      const baseUrl = 'https://api.supertv.com.co';
    
      const result = files.map((file) => ({
        id: file.id,
        kind: file.kind,
        file_name: file.file_name,
        mime_type: file.mime_type,
        byte_size: file.byte_size,
        uploaded_at: file.uploaded_at,
        url: `${baseUrl}/storage/files/${file.application_id}/${file.file_name}`,
      }));
    
      return result;
    }

    static async create(input: SaveBufferInput){
        await prisma.application_files.create({
           data: {
              application_id: BigInt(input.applicationId),
              kind: input.kind as any,
              file_name: input.filename,
              mime_type: input.mimeType,
              byte_size: input.size,
              data: Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer), 
              storage_path: null,
              sha256: input.sha256,
              uploaded_by: input.uploadedBy != null ? BigInt(input.uploadedBy) : null,
            },
            select: {
              id: true,
              file_name: true,
              mime_type: true,
              byte_size: true,
              kind: true,
              uploaded_by: true,
              uploaded_at: true,
            },
        });

    }
    static async update(id: number, payload: unknown){
        const data = fileUpdateSchema.parse(payload);
        return prisma.application_files.update({
            where: {id},
            data,
        });
    }

    static async remove(id: number){
        return prisma.application_files.delete({
            where: {id}
        })
    }
}