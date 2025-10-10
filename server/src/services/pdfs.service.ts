// imports (ajusta rutas a tu proyecto)
import path from "path";
import fs from "fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library.js"
import { generatePdfToFile, ResolutionPayload } from "../utils/generatePdfToFile.js";


export type Decision = 'APROBADA' | 'RECHAZADA';


export type CreatePdfInput = {
application_id: number | string | bigint;
decision: Decision;
comentario?: string;
motivo?: string;
data?: any;
};



export class PdfsService{
    static async list(applicationId: number) {
      const pdfs = await prisma.application_pdfs.findMany({
        where: { application_id: applicationId },
        orderBy: { id: 'desc' }
      });

      return pdfs;
    }

    static async create(inputRaw: CreatePdfInput, userId?: bigint) {
      const applicationId = BigInt(inputRaw.application_id);
      const generatedBy = userId ?? null;


    const MAX_RETRIES = 2;
    let attempt = 0;


    while (true) {
      try {
        return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const agg = await tx.application_pdfs.aggregate({
        where: { application_id: applicationId },
        _max: { version: true },
        });
        const nextVersion = (agg._max.version ?? 0) + 1;


        const fileName = `RESOLUCION_${applicationId}_v${nextVersion}.pdf`;
        const storagePathPosix = path.posix.join('/storage/files', String(applicationId), fileName);
        const storageDirAbs = path.join(process.cwd(), 'storage', 'files', String(applicationId));
        const storageFileAbs = path.join(storageDirAbs, fileName);


        await fs.mkdir(storageDirAbs, { recursive: true });

        const app = await tx.applications.findUnique({
          where: { id: applicationId },
          select: {
            id: true,
            id_client:true,
            nombres: true,
            apellidos: true,
            tipo_documento: true,
            numero_documento: true,
            direccion: true,
            barrio: true,
            correo: true,
            numero_contacto: true,
            estrato_id: true,
            estado: true,
            enviada_at: true,
            revisada_at: true,
            aprobada_at: true,
            rechazada_at: true,
            created_at: true,
            updated_at: true,
            UPZ: true,
          },
        });

        let filesFromDb: { kind: string; file_name: string }[] = [];
        try {
          filesFromDb = await tx.application_files.findMany({
            where: { application_id: applicationId },
            select: { kind: true, file_name: true },
          });
        } catch { 
          return; 
        }

        const norm = (d: Date | null | undefined) => (d ? d.toISOString() : null);

        const data = {
          ...(app ?? {}),
          enviada_at: norm(app?.enviada_at),
          revisada_at: norm(app?.revisada_at),
          aprobada_at: norm(app?.aprobada_at),
          rechazada_at: norm(app?.rechazada_at),
          created_at: norm(app?.created_at as any),
          updated_at: norm(app?.updated_at as any),
          files: filesFromDb.length ? filesFromDb : undefined,
          ...(inputRaw.data ?? {}),
        };

        const payload: ResolutionPayload = {
          application_id: Number(applicationId),
          tipo: 'RESOLUCION',
          decision: inputRaw.decision ?? (app?.estado as any) ?? 'APROBADA',
          comentario: inputRaw.comentario,
          motivo: inputRaw.motivo,
          data,
        };

        await generatePdfToFile(payload, storageFileAbs);

        const created = await tx.application_pdfs.create({
          data: {
            application_id: applicationId,
            version: nextVersion,
            file_name: fileName,
            storage_path: storagePathPosix,
            generated_by: generatedBy,
          },
        });


        return { ...created, url: storagePathPosix };
        });
      } catch (e: any) {
        const isUnique =
        e?.code === 'P2002' ||
        (e instanceof PrismaClientKnownRequestError && e.code === 'P2002');
        if (isUnique && attempt < MAX_RETRIES) { attempt++; continue; }
        throw e;
      }
    }
  }

    static async remove(id: number) {
      return prisma.application_pdfs.delete({ where: { id: BigInt(id) } });
    }
}