import multer from "multer";
import path from "path";
import fs from "fs";

const BASE_DIR = path.join(process.cwd(), "storage", "files");

function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDirSync(BASE_DIR);

function sanitize(name: string) {
  return (name || "archivo")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const applicationId = String(req.body?.application_id || "");
    if (!applicationId) {
      return cb(new Error("Falta 'application_id' en el form-data (debe ir antes del archivo)"), "");
    }
    const dir = path.join(BASE_DIR, applicationId);
    try {
      ensureDirSync(dir);
      cb(null, dir);
    } catch (e) {
      cb(e as Error, "");
    }
  },
  filename: (_req, file, cb) => {
    const safe = sanitize(file.originalname);
    cb(null, `${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});
