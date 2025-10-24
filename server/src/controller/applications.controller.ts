import { Request, Response, NextFunction } from "express";
import { ApplicationsService } from "../services/applications.service.js";
import { FileKind, normalizeKind } from "../domain/file_kind.js";
import path  from "path";
type MulterFile = Express.Multer.File;
import fs from "fs/promises";

function jsonSafe<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
type AuthedRequest = Request & { auth?: { user?: { id?: number } } }; 

const getUserId = (req: AuthedRequest): number =>
  Number(req.auth?.user?.id ?? req.header('x-user-id') ?? NaN);

const getNumericParam = (value: unknown): number => {
  const n = Number(value);
  if (Number.isNaN(n)) throw { status: 400, message: "Parámetro numérico inválido" };
  return n;
};

const sanitizeBigInt = (value: any): any => {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeBigInt);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeBigInt(v);
    return out;
  }
  return value;
};

export class ApplicationsController {
static async list(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const page = req.query.page ? getNumericParam(req.query.page) : 1;
      const size = req.query.size ? getNumericParam(req.query.size) : 300;
      const estado = (req.query.estado as "BORRADOR" | "ENVIADA" | "APROBADA" | "RECHAZADA" | undefined) ?? undefined;

      const result = await ApplicationsService.list(userId, { page, size, estado });
      res.json(sanitizeBigInt(result));
    } catch (err) {
      next(err);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const item = await ApplicationsService.get(id);
      res.json(item);
    } catch (err) {
      next(err);
    }
  } 

  static async create(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const raw = { ...req.body };
      if (raw.nombre && !raw.nombres) raw.nombres = raw.nombre;

      const app = await ApplicationsService.create(raw, userId);
      return res.status(201).json(sanitizeBigInt(app));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const result = await ApplicationsService.update(id, req.body, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async submit(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const result = await ApplicationsService.submit(id, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async approve(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const comment = (req.body?.comment as string | undefined) ?? undefined;
      const result = await ApplicationsService.approve(id, userId, comment);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async reject(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const motivo = String(req.body?.motivo ?? "");
      const result = await ApplicationsService.reject(id, userId, motivo);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async addFile(req: Request, res: Response, next: NextFunction) {
    try {
      const appId  = Number(req.params.id);
      const userId = Number(req.headers["x-user-id"]);
      if (!req.file) return res.status(400).json({ message: "Falta 'file'" });

      const originalBase = path.basename(req.file.originalname);
      const file_name = originalBase.replace(/[^\w.\-]+/g, "_");
      const mime_type = req.file.mimetype;

      const storagePathPosix = path.posix.join("/storage/files", String(appId), file_name);
      const storageDirAbs    = path.join(process.cwd(), "storage", "files", String(appId));
      const storageFileAbs   = path.join(storageDirAbs, file_name);

      await fs.mkdir(storageDirAbs, { recursive: true });
      await fs.writeFile(storageFileAbs, req.file.buffer);

      const bodyKind = (req.body?.kind ?? "").toString().replace(/"/g, "");
      const kind = normalizeKind(bodyKind);
      const saved = await ApplicationsService.addFile(appId, userId, {
        kind: kind as any,
        file_name: String(file_name),
        storage_path: String(storagePathPosix),
        mime_type,
        buffer: req.file.buffer,
        size: req.file.size,
      });

      const autoSubmit = (req.body?.auto_submit ?? "false").toString().toLowerCase() === "true";
      if (!autoSubmit) {
        const safeFile = {
          ...saved,
          file_name: String(saved.file_name),
          storage_path: String(saved.storage_path ?? ""),
        };

        return res.status(201).json({
          success: true,
          file: safeFile,
          submitted: false,
          url: storageFileAbs,
        });
      }

      try {
        const submittedApp = await ApplicationsService.submit(appId, userId);
        return res.status(200).json({
          file: jsonSafe(saved),
          submitted: true,
          application: jsonSafe(submittedApp),
          url: storageFileAbs,
        });

      } catch (e: any) {
        return res.status(201).json({
          file: jsonSafe(saved),
          submitted: false,
          submit_error: e?.message || "No se pudo enviar la solicitud",
        });
      }
    } catch (err) {
      next(err);
    }
  }

  static async addFilesBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as Record<string, MulterFile[]>;
      const appId  = Number(req.params.id);
      const userId = Number(req.headers["x-user-id"]);

      const storageDirAbs = path.join(process.cwd(), "storage", "files", String(appId));
      await fs.mkdir(storageDirAbs, { recursive: true });

      const saves = await Promise.all(
        Object.entries(files).map(async ([k, arr]) => {
          const f = arr[0];

          const file_name = path.basename(f.originalname).replace(/[^\w.\-]+/g, "_");
          const storage_path = path.posix.join("/storage/files", String(appId), file_name);
          const storageFileAbs = path.join(storageDirAbs, file_name);
        
          await fs.rename(f.path, storageFileAbs);

          const kind = normalizeKind(k);
          return ApplicationsService.addFile(appId, userId, {
            kind,
            file_name,
            storage_path,
            mime_type: f.mimetype,
            buffer: f.buffer,
            size: f.size,
          });
        })
      );

      res.status(201).json({ uploaded: saves.length, items: saves });
    } catch (e) { next(e); }
  }

  static async addPdf(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const id = getNumericParam(req.params.id);
      const userId = getUserId(req);
      if (Number.isNaN(userId)) return res.status(401).json({ message: "No autenticado" });

      const { file_name, storage_path } = req.body as {
        file_name: string;
        storage_path: string;
      };

      const result = await ApplicationsService.addPdf(id, userId, { file_name, storage_path });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateState(req: AuthedRequest, res: Response, next: NextFunction){
    try {
      const { id } = req.params;
      const { estado } = req.body;
      const currentUserId = Number(req.headers["x-user-id"]);
      const result = await ApplicationsService.updateState( Number(id), estado, currentUserId);

      res.status(201).json(result);
    } catch (e) {
      next(e)
    }
  }
}
