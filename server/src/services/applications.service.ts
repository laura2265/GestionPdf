import { prisma } from "../db.js";
import z from "zod";
import { ensureRole, hasRole } from "./rbac.service.js";
import { PrismaClient, Prisma, applications_estado } from "@prisma/client";
import { FilesService } from "./files.service.js";
import { PdfsService } from "./pdfs.service.js";

type MulterLikeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer | Uint8Array;
};

export const applicationCreateSchema = z.object({
  id_client: z.string().min(1),
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  tipo_documento: z.enum(["CC", "CE", "PAS", "NIT", "OTRO"]),
  numero_documento: z.string().min(3).max(50),
  direccion: z.string().min(3).optional(),
  barrio: z.string().min(2),
  correo: z.string().email().optional(),
  numero_contacto: z.string().optional(),
  estrato_id: z.number().int().optional(),
  UPZ: z.string().min(2).optional(),
  tecnico_id: z.number().int().optional(),
  supervisor_id: z.number().int().optional(),
});


export const applicationUpdateSchema =  applicationCreateSchema.partial();

type Estado = "BORRADOR" | "ENVIADA" | "APROBADA" | "RECHAZADA"

type ApplicationsWhere = Prisma.Args<typeof prisma.applications, 'findMany'>['where'];
type DbClient = PrismaClient | Prisma.TransactionClient;

export class ApplicationsService {
    
    static async list(
      currentApplicationId: number,
      { page = 1, size = 300, estado }: { page?: number; size?: number; estado?: "BORRADOR"|"ENVIADA"|"APROBADA"|"RECHAZADA" } = {}
    ) {
      const skip = (page - 1) * size;
      const isSupervisor = await (currentApplicationId);
    
      const where: ApplicationsWhere = {};
    
      if (estado) where.estado = estado as any;
      if (!isSupervisor) where.tecnico_id = BigInt(currentApplicationId);
    
      const [items, total] = await Promise.all([
        prisma.applications.findMany({ where, skip, take: size, orderBy: { id: "desc" } }),
        prisma.applications.count({ where }),
      ]);
    
      return { items, total, page, size };
    }

     static async get(id:number){
        const item = await prisma.applications.findUnique({where: {id}});
        if(!item){
            throw{status: 404, message: 'Aplicación no encontrada'}
        }
        return item; 
    }

    static async update(id: number, payload: unknown, currentUserId: number) {
      await ensureRole(currentUserId, "TECNICO");
      const app = await prisma.applications.findUnique({ where: { id: BigInt(id) } });
      if (!app) throw { status: 404, message: "Solicitud no encontrada" };
      if (app.tecnico_id !== BigInt(currentUserId)) throw { status: 403, message: "No puedes editar esta solicitud" };
      if (app.estado !== "BORRADOR" && app.estado !== "RECHAZADA") throw { status: 400, message: "Solo se puede editar en BORRADOR" };
    
      const data = applicationUpdateSchema.parse(payload);
      return prisma.applications.update({ where: { id: app.id }, data });
    }

    static async listForUser(userId: number){
        const  isSupervisor = await prisma.user_roles.findFirst({
            where: {
                user_id: BigInt(userId), 
                roles: { is: { code: "SUPERVISOR" }}
            }
        });
        if(isSupervisor){
            return prisma.applications.findMany({orderBy: {id: 'desc'}})
        }

        return prisma.applications.findMany({
            where:{
                tecnico_id:BigInt(userId)
            },
            orderBy: {id: 'desc'}
        });
    }

    static async create(payload: unknown, currentUserId: number) {
      
        await ensureRole(currentUserId, "TECNICO");
        
      const data = applicationCreateSchema.parse(payload);
        
      const tecnicoId = data.tecnico_id ?? currentUserId;
        
      return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        
        const newApp = await prisma.applications.create({
          data: {
            id_client: data.id_client,
            nombres: data.nombres,
            apellidos: data.apellidos,
            tipo_documento: data.tipo_documento,
            numero_documento: data.numero_documento,
            direccion: data.direccion,
            barrio: data.barrio,
            correo: data.correo,
            numero_contacto: data.numero_contacto,
            estrato_id: data.estrato_id,
            UPZ: data.UPZ ?? "",
            estado: "BORRADOR",
            tecnico_id: BigInt(tecnicoId)
          }
        });
    
        await tx.application_history.create({
          data: {
            application_id: newApp.id,
            from_status: null,
            to_status: "BORRADOR",
            changed_by: tecnicoId,
            comment: "Creación de la solicitud"
          }
        });

        return {
          ...newApp,
          id: newApp.id.toString(),
          tecnico_id: newApp.tecnico_id?.toString(),
        };

      });
    }

    //Cambia estado de borrador a enviado
    static async submit(appId: number, currentUserId: number) {
      await ensureRole(currentUserId, 'TECNICO');
    
      return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const app = await tx.applications.findUnique({
          where: { id: BigInt(appId) },
          select: { id: true, estado: true, tecnico_id: true },
        });
        if (!app) throw { status: 404, message: 'Aplicación no encontrada' };
      
        if (app.tecnico_id !== BigInt(currentUserId)) {
          throw { status: 403, message: 'No puedes enviar una aplicación de otro técnico' };
        }
      
        if (app.estado !== 'BORRADOR' && app.estado !== 'RECHAZADA') {
          throw { status: 400, message: `No puedes enviar desde estado ${app.estado}` };
        }
      
        const whereSupervisor: Prisma.user_rolesWhereInput = {
          roles: { is: { code: 'SUPERVISOR' } },
        };
      
        const candidates = await tx.user_roles.findMany({
          where: whereSupervisor,
          select: { user_id: true },
        });
        console.log('datos: ', candidates)
        const uniqueIds: bigint[] = Array.from(
          new Set(candidates.map(r => r.user_id.toString()))
        ).map(s => BigInt(s));
      
        if (uniqueIds.length === 0) {
          throw { status: 409, message: 'No hay supervisores disponibles' };
        }

        const supervisorId = uniqueIds[Math.floor(Math.random() * uniqueIds.length)];

        const updated = await tx.applications.update({
          where: { id: app.id },
          data: {
            estado: 'ENVIADA',
            enviada_at: new Date(),
            supervisor_id: supervisorId,
          },
        });
      
        return updated;
      });
    }

    static async approve(appId: number, supervisorUserId: number, comment?: string){
        await ensureRole(supervisorUserId, "SUPERVISOR");

        return prisma.$transaction(async (tx: Prisma.TransactionClient) =>{
            const app = await tx.applications.findUnique({where: {id: BigInt(appId)}});
            if(!app){
                throw {status: 404, message: "Aplicación no encontrada"};
            }

            const complete = await ApplicationsService.isComplete(app.id, tx);
            if(!complete){
                throw {status: 400, message: "La aplicación no cumple todos los requisitos obligatorios"}   
            }

            const updated = await tx.applications.update({
              where: { id: app.id },
              data: {
                estado: "APROBADA",
                supervisor_id: BigInt(supervisorUserId),
                revisada_at: new Date(),
                aprobada_at: new Date(),
                motivo_rechazo: null,
              },
            });
            

            await tx.application_history.create({
              data: {
                application_id: app.id,
                from_status: "ENVIADA",
                to_status: "APROBADA",
                changed_by: BigInt(supervisorUserId),
                comment: comment ?? "Aprobada",
              },
            });

            return updated;
        })
    }

    //Rechazar la solicitud
    static async reject(appId: number, supervisorUserId: number, comment: string){
        await ensureRole(supervisorUserId, "SUPERVISOR");

        return prisma.$transaction(async (tx: Prisma.TransactionClient) =>{
            const app = await tx.applications.findUnique({where: {id: BigInt(appId)}});
            if(!app){
                throw {status: 404, message: "Aplicación no encontrada"};
            }

            const complete = await ApplicationsService.isComplete(app.id, tx);
            if(!complete){
                throw {status: 400, message: "La aplicación no cumple todos los requisitos obligatorios"}   
            }

            const updated = await tx.applications.update({
              where: { id: app.id },
              data: {
                estado: "RECHAZADA",
                supervisor_id: BigInt(supervisorUserId),
                revisada_at: new Date(),
                aprobada_at: null,
                motivo_rechazo: comment || "Rechazada",
              },
            });
            

            await tx.application_history.create({
              data: {
                application_id: app.id,
                from_status: "ENVIADA",
                to_status: "RECHAZADA",
                changed_by: BigInt(supervisorUserId),
                comment: comment ?? "Rechazada",
              },
            });

            return updated;
        })
    }

    //Adjuntar PDF
    static async addFile(
      appId: number | bigint,
      currentUserId: number,
      file: {
        kind: "FOTO_FACHADA" | "FOTO_NOMENCLATURA" | "FOTO_TEST_VELOCIDAD" | "ORDEN_TRABAJO";
        file_name: string;
        storage_path?: string | null;
        mime_type?: string | null;
        buffer: Buffer | Uint8Array;
        size: number;
        sha256?: string;
      }
    ) {
      
      if (!file.buffer) {
        throw { status: 400, message: "Archivo no recibido correctamente" };
      }
      
       const isTecnico = await hasRole(currentUserId, "TECNICO");
       const isSupervisor =
         (await hasRole(currentUserId, "SUPERVISOR")) ||
         (await hasRole(currentUserId, "ADMIN"));

      const app = await prisma.applications.findUnique({
        where: { id: BigInt(appId) },
      });
      if (!app) throw { status: 400, message: "Aplicación no encontrada" };

      if (!file.buffer) {
        throw { status: 400, message: "Archivo no recibido correctamente" };
      }

      if (isSupervisor) {
        
      } else if (isTecnico) {
        if (app.tecnico_id !== BigInt(currentUserId)) {
          throw {
            status: 403,
            message: "No puedes adjuntar archivos a esta aplicación",
          };
        }
      } else {
        throw { status: 403, message: "No tienes permisos para adjuntar archivos" };
      }
    
      return prisma.application_files.create({
        data: {
          application_id: app.id,
          kind: file.kind as any,
          file_name: file.file_name,
          mime_type: file.mime_type ?? null,
          byte_size: file.size,
          data: Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer),
          storage_path: file.storage_path ?? null,
          sha256: file.sha256,
          uploaded_by: BigInt(currentUserId),
        },
      });
    }


    static async addPdf(appId: number, currentUserId: number, pdf:{    
        file_name: string,
        storage_path: string,
    }){
        const app = await prisma.applications.findUnique({where:{id: BigInt(appId)}});
        if(!app){
            throw {status: 400, message: 'Aplicación no encontrada'};
        }

        const isSupervisor = await hasRole(currentUserId, "SUPERVISOR" as any)
        if(!isSupervisor){
            throw {
                status: 400, message: 'No tienes permiso para adjuntar PDF a esta aplicación'
            }
        }
        return await prisma.$transaction(async (tx: Prisma.TransactionClient)=>{
            const agg = await tx.application_pdfs.aggregate({
                where: {application_id: BigInt(appId)},
                _max: {
                    version: true
                }
            })
            const nextVersion = (agg._max.version?? 0)+1;

            return tx.application_pdfs.create({
                data: {
                    application_id: app.id,
                    version: nextVersion,
                    file_name: pdf.file_name,
                    storage_path: pdf.storage_path,
                    generated_by: BigInt(currentUserId),
                }
            })
        })
    }

    //validacion de los requisitos
    static async isComplete(
      appId: number | bigint,
      db: DbClient = prisma
    ): Promise<boolean> {
        type KindRec = { kind: string | number | bigint };
        const required = await db.application_requirements.findMany({
          where: {},
          select: { kind: true } as const,
        });

        const files = await db.application_files.findMany({
          where: { application_id: BigInt(appId) },
          select: { kind: true } as const,
        });

        const have = new Set(files.map((f: KindRec) => String(f.kind)));
        return required.every((r: KindRec) => have.has(String(r.kind)));
    }

   
    static async updateState(id: number, estado: string, currentUserId: number) {
      await ensureRole(currentUserId, "SUPERVISOR");

      const upper = String(estado || "").toUpperCase();

      const EST: Record<string, applications_estado> = {
        BORRADOR:  applications_estado.BORRADOR,
        ENVIADA:   applications_estado.ENVIADA,
        APROBADA:  applications_estado.APROBADA,
        RECHAZADA: applications_estado.RECHAZADA,
      };
      if (!EST[upper]) throw { status: 400, message: "Estado inválido" };

      const updated = await prisma.applications.update({
        where: { id: BigInt(id) },
        data:  { estado: EST[upper] }, 
      });

      return { id: Number(updated.id), estado: updated.estado };
    }


}
