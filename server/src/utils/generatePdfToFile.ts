import { PDFDocument, StandardFonts, rgb, cmyk, PageSizes } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

const FILES_BASE_DIR = process.env.FILES_BASE_DIR || path.join(process.cwd(), 'storage', 'files');

export type ImagenAsociada = {
  titulo: string
  ruta: string
}

export type DrawImagesOpts = {
  doc: PDFDocument
  page: any
  y: number
  margin: number 
  maxWidth?: number 
  newPage: () => any
}

export type Decision = 'APROBADA' | 'RECHAZADA';

export type Archivo = {
  kind: string;
  file_name: string;
};

export type Solicitante = {
  nombre?: string;
  identificacion?: string;
  direccion?: string;
};

export type ResolutionPayload = {
  application_id: number | string;
  tipo: "RESOLUCION";
  decision: Decision;
  comentario?: string;
  motivo?: string;
  fecha?: string;
  identificacion?: string;
  direccion?: string;
  files?: Archivo[];
  solicitante?: Solicitante;
  estado?: string;
  data?: any;
};

// API principal
export async function generatePdfToFile(
  model: ResolutionPayload,
  outAbsPath: string,
): Promise<{ outAbsPath: string; size: number }> {
  const pdf = await PDFDocument.create();
  const pageSize = PageSizes.A4;
  let page = pdf.addPage(pageSize);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const brand = {
    primary: rgb(0.0, 0.36, 0.74), 
    primarySoft: rgb(0.85, 0.92, 0.98),
    success: rgb(0.0, 0.55, 0.18),
    danger: rgb(0.70, 0.0, 0.0),
    text: rgb(0, 0, 0),
    muted: rgb(0.42, 0.42, 0.42),
    line: rgb(0.85, 0.85, 0.85),
  } as const;

  const margin = 50;
  const contentWidth = page.getWidth() - margin * 2;

  let y = page.getHeight() - margin;
  const newPage = () => {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  };
  const root = model.data && typeof model.data === 'object' ? model.data : {};

  const nombreCompuesto =
    [root?.nombres, root?.apellidos].filter(Boolean).join(' ') || undefined;
  
  const identificacionCompuesta =
    [root?.tipo_documento, root?.numero_documento].filter(Boolean).join(' ') || undefined;

  const solicitante: Solicitante = {
    nombre: pickFirst<string>([
      model?.solicitante?.nombre,
      root?.nombre,
      root?.solicitante?.nombre,
      nombreCompuesto,
    ]),
    identificacion: pickFirst<string>([
      model?.solicitante?.identificacion,
      (model as any)?.identificacion,
      root?.identificacion,
      root?.solicitante?.identificacion,
      identificacionCompuesta, 
    ]),
    direccion: pickFirst<string>([
      model?.solicitante?.direccion,
      (model as any)?.direccion,
      root?.direccion, 
      root?.solicitante?.direccion,
    ]),
  };

  const extraSolicitante = {
    barrio: root?.barrio,
    correo: root?.correo,
    numero_contacto: root?.numero_contacto,
    upz: root?.UPZ || root?.upz,
    estrato_id: root?.estrato_id,
    declaracion_juramentada: root?.declaracion_juramentada,
  };

  const archivos: Archivo[] = (
    pickFirst<Archivo[]>([
      model?.files,
      root?.files,
      (root as any)?.documentos as Archivo[] | undefined,
    ]) || []
  ).map((f: any) => {
    const fname = String(f?.file_name ?? '—');

    const hasPath = fname.includes('/') || fname.includes('\\');

    const appIdStr = String(model?.application_id ?? root?.id ?? '').trim();

    const resolved = hasPath
      ? fname
      : path.join(FILES_BASE_DIR, appIdStr, fname);

    return { kind: String(f?.kind ?? '—'), file_name: resolved };
  });



  const decision: Decision = (model.decision || model.estado || 'APROBADA') as Decision;

  const fechaStr = formatFecha(
    pickFirst<string>([model?.fecha, root?.fecha]) || new Date().toISOString(),
  );

  drawHeader(page, {
    regular,
    bold,
    brand,
    margin,
    title: `Resolución N° ${model.application_id}`,
    subtitle: `Fecha: ${fechaStr}`,
  });
  y = page.getHeight() - margin - 80;

  y = drawBadgeEstado(page, {
    y,
    decision,
    fonts: { regular, bold },
    brand,
    margin,
  }) - 10;

  y = drawSectionBox(page, {
  y,
  title: 'Datos del solicitante',
  margin,
  brand,
  fonts: { regular, bold },
  lines: [
    `-`,
    `ID: ${root?.id ?? '—'}`,
    `ID Instalación: ${root?.id_client ?? '—'}`,
    `Nombre: ${solicitante.nombre || '—'}`,
    `Identificación: ${solicitante.identificacion || '—'}`,
    `Dirección: ${solicitante.direccion || '—'}`,
    extraSolicitante.barrio ? `Barrio: ${extraSolicitante.barrio}` : undefined,
    extraSolicitante.correo ? `Correo: ${extraSolicitante.correo}` : undefined,
    extraSolicitante.numero_contacto ? `Contacto: ${extraSolicitante.numero_contacto}` : undefined,
    extraSolicitante.upz ? `UPZ: ${extraSolicitante.upz}` : undefined,
    (extraSolicitante.estrato_id ?? undefined) !== undefined ? `Estrato: ${extraSolicitante.estrato_id}` : undefined,
    typeof extraSolicitante.declaracion_juramentada === 'boolean'
      ? `Declaración juramentada: ${extraSolicitante.declaracion_juramentada ? 'Sí' : 'No'}`
      : undefined,
  ].filter(Boolean) as string[],
});

  // --- Comentario y motivo (si existen)
  const comentario = pickFirst<string>([model?.comentario, root?.comentario]);
  const motivo = pickFirst<string>([model?.motivo, root?.motivo]);

  if (comentario || motivo) {
    const textBlocks: { label: string; value: string }[] = [];
    if (motivo) textBlocks.push({ label: 'Motivo', value: motivo });
    if (comentario) textBlocks.push({ label: 'Comentario', value: comentario });

    for (const blk of textBlocks) {
      ({ y } = ensureSpace(page, { y, margin, needed: 120, newPage }));
      const boxTop = y;
      const padding = 10;
      const titleSize = 12;
      const bodySize = 11;

      const title = `${blk.label}:`;
      const titleHeight = titleSize + 6;

      // fondo suave
      page.drawRectangle({
        x: margin,
        y: y - 90,
        width: contentWidth,
        height: 90,
        color: brand.primarySoft,
        opacity: 0.6,
      });

      // título
      page.drawText(title, {
        x: margin + padding,
        y: y - padding - titleSize,
        size: titleSize,
        font: bold,
        color: brand.primary,
      });

      const maxTextWidth = contentWidth - padding * 2;
      const wrapped = wrapText(blk.value, regular, bodySize, maxTextWidth);
      let innerY = y - padding - titleHeight - 4;
      for (const line of wrapped) {
        page.drawText(line, {
          x: margin + padding,
          y: innerY,
          size: bodySize,
          font: regular,
          color: brand.text,
        });
        innerY -= bodySize + 3;
      }

      y = y - 90 - 12;
    }
  }

  if (archivos.length) {
    {
      const MIN_SPACE_FOR_GALLERY = 420;
      const remaining = y - margin;
      if (remaining < MIN_SPACE_FOR_GALLERY) {
        newPage();
      }
    }

    {
      const sz = 14;
      const need = sz + 12;
      ({ y } = ensureSpace(page, { y, margin, needed: need, newPage }));
      page.drawText('Imágenes asociadas', {
        x: margin,
        y: y - sz,
        size: sz,
        font: bold,
        color: brand.primary,
      });
      y -= sz + 12;
    }

    y = await drawImagesGallery(page, {
      y,
      margin,
      brand,
      fonts: { regular, bold },
      pdf,
      contentWidth,
      archivos,
      wrapText,
      ensureSpace,
      newPage,
      outAbsPath,
    });

    const restantes = archivos.filter((f) => !isImage(f.file_name));
    if (restantes.length) {
      ({ y } = ensureSpace(page, { y, margin, needed: 140, newPage }));
      y = drawDocsTable(page, {
        y,
        margin,
        brand,
        fonts: { regular, bold },
        rows: restantes.map((f) => [f.kind || '—', f.file_name || '—']) as string[][],
      });
    }
  }

  if (decision === 'RECHAZADA') {
    drawWatermark(page, 'RECHAZADA', bold);
  }
  const pages = pdf.getPages();
  const total = pages.length;

  pages.forEach((p, i) => {
    drawFooter(p, i + 1, total, regular);
  });

  const bytes = await pdf.save();
  await fs.mkdir(path.dirname(outAbsPath), { recursive: true });
  await fs.writeFile(outAbsPath, bytes);

  return { outAbsPath, size: bytes.length };
}

function pickFirst<T>(arr: Array<T | undefined | null>): T | undefined {
  for (const v of arr) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric', month: 'long', day: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

function drawHeader(
  page: any,
  {
    regular,
    bold,
    brand,
    margin,
    title,
    subtitle,
  }: {
    regular: any; bold: any; brand: any; margin: number; title: string; subtitle: string;
  },
) {
  const width = page.getWidth();
  // Franja superior
  page.drawRectangle({ x: 0, y: page.getHeight() - 60, width, height: 60, color: brand.primary });

  page.drawText('SUPERTV', {
    x: margin,
    y: page.getHeight() - 40,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText(title, {
    x: margin,
    y: page.getHeight() - 80,
    size: 18,
    font: bold,
    color: brand.text,
  });

  page.drawText(subtitle, {
    x: margin,
    y: page.getHeight() - 98,
    size: 11,
    font: regular,
    color: brand.muted,
  });
}

function drawBadgeEstado(
  page: any,
  {
    y,
    decision,
    fonts,
    brand,
    margin,
  }: { y: number; decision: Decision; fonts: { regular: any; bold: any }; brand: any; margin: number },
) {
  const label = `Estado: ${decision}`;
  const size = 12;
  const paddingX = 10;
  const paddingY = 6;
  const textWidth = fonts.bold.widthOfTextAtSize(label, size);
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = size + paddingY * 2 - 2;

  const color = decision === 'APROBADA' ? brand.success : brand.danger;

  page.drawRectangle({
    x: margin,
    y: y - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color,
    opacity: 0.15,
    borderColor: color,
    borderWidth: 1,
  });
  page.drawText(label, {
    x: margin + paddingX,
    y: y - paddingY - size + 3,
    size,
    font: fonts.bold,
    color,
  });

  return y - boxHeight - 8;
}

function drawSectionBox(
  page: any,
  {
    y,
    title,
    lines,
    margin,
    brand,
    fonts,
  }: {
    y: number;
    title: string;
    lines: string[];
    margin: number;
    brand: any;
    fonts: { regular: any; bold: any };
  },
) {
  const padding = 12;
  const titleSize = 12;
  const bodySize = 11;
  const lineHeight = bodySize + 4;
  const boxHeight = padding * 2 + titleSize + 6 + lines.length * lineHeight;

  page.drawRectangle({ x: margin, y: y - boxHeight, width: page.getWidth() - margin * 2, height: boxHeight, color: rgb(1, 1, 1) });

  page.drawRectangle({
    x: margin,
    y: y - boxHeight,
    width: page.getWidth() - margin * 2,
    height: boxHeight,
    borderColor: brand.line,
    borderWidth: 1,
    opacity: 1,
  });

  page.drawText(title, { x: margin + padding, y: y - padding - titleSize, size: titleSize, font: fonts.bold, color: brand.primary });

  let innerY = y - padding - titleSize - 8;
  for (const l of lines) {
    page.drawText(l, { x: margin + padding, y: innerY, size: bodySize, font: fonts.regular, color: brand.text });
    innerY -= lineHeight;
  }

  return y - boxHeight - 12;
}

function drawDocsTable(
  page: any,
  {
    y,
    margin,
    brand,
    fonts,
    rows,
  }: { y: number; margin: number; brand: any; fonts: { regular: any; bold: any }; rows: string[][] },
) {
  const tableTitle = 'Documentos';
  const titleSize = 12;
  const rowSize = 11;
  const rowHeight = rowSize + 8;
  const col1 = 0.35;
  const col2 = 0.65;
  const width = page.getWidth() - margin * 2;

  page.drawText(tableTitle, { x: margin, y: y - titleSize, size: titleSize, font: fonts.bold, color: brand.primary });
  y -= titleSize + 6;

  drawRow(page, {
    y,
    margin,
    width,
    height: rowHeight,
    fills: [brand.primarySoft, brand.primarySoft],
    fonts,
    values: ['Tipo', 'Archivo'],
    size: rowSize,
    bold: true,
    col1,
    brand,
  });
  y -= rowHeight;

  let zebra = false;
  for (const [tipo, nombre] of rows) {
    drawRow(page, {
      y,
      margin,
      width,
      height: rowHeight,
      fills: [zebra ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98), zebra ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98)],
      fonts,
      values: [tipo, nombre],
      size: rowSize,
      bold: false,
      col1,
      brand,
    });
    y -= rowHeight;
    zebra = !zebra;

    if (y < 80) {
      page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 0.5, color: brand.line });
      const pdfRef = page.doc as PDFDocument | undefined; 
    }
  }

  return y - 10;
}

function isImage(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const ext = (path.extname(filePath).toLowerCase() || '').replace('.', '');
  return ['png', 'jpg', 'jpeg'].includes(ext);
}

// Intenta leer la imagen desde varias ubicaciones o por URL
async function embedImageFromPath(pdf: PDFDocument, filePath: string, outAbsPathHint?: string) {
  if (/^https?:\/\//i.test(filePath)) {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    try { return await pdf.embedPng(bytes); } catch {}
    return await pdf.embedJpg(bytes);
  }

  // 2) Rutas candidatas locales
  const candidates = [
    filePath,
    path.resolve(filePath),
    path.join(process.cwd(), 'uploads', filePath),
    outAbsPathHint ? path.join(path.dirname(outAbsPathHint), filePath) : undefined,
  ].filter(Boolean) as string[];

  let bytes: Buffer | null = null;
  let lastErr: any = null;

  for (const pth of candidates) {
    try {
      bytes = await fs.readFile(pth);
      filePath = pth;
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!bytes) {
    throw new Error(`No se encontró el archivo en: ${candidates.join(' | ')} — ${lastErr?.message || ''}`);
  }

  const ext = (path.extname(filePath).toLowerCase() || '').replace('.', '');
  if (ext === 'png') return pdf.embedPng(bytes);
  if (ext === 'jpg' || ext === 'jpeg') return pdf.embedJpg(bytes);

  // fallback por si la extensión no es fiable
  try { return await pdf.embedPng(bytes); } catch {}
  return await pdf.embedJpg(bytes);
}


async function drawImagesGallery(
   page: any,
  {
    y,
    margin,
    brand,
    fonts,
    pdf,
    contentWidth,
    archivos,
    wrapText,
    ensureSpace,
    newPage,
    outAbsPath,
  }: {
    y: number;
    margin: number;
    brand: any;
    fonts: { regular: any; bold: any };
    pdf: PDFDocument;
    contentWidth: number;
    archivos: Archivo[];
    wrapText: (t: string, font: any, size: number, maxWidth: number) => string[];
    ensureSpace: (page: any, args: { y: number; margin: number; needed: number; newPage: () => any }) => { y: number };
    newPage: () => any;
    outAbsPath: string;
  },
): Promise<number> {
  const title = 'Documentos (imágenes)';
  const titleSize = 12;
  page.drawText(title, { x: margin, y: y - titleSize, size: titleSize, font: fonts.bold, color: brand.primary });
  y -= titleSize + 6;

  const gapX = 14;
  const gapY = 20;
  const cols = 2;
  const colWidth = (contentWidth - gapX * (cols - 1)) / cols; 
  const maxImgHeight = 180;
  const captionSize = 10;

  let colIndex = 0;
  let rowMaxHeight = 0;
  let x = margin;

  const soloImagenes = archivos.filter((a) => isImage(a.file_name));
  for (const f of soloImagenes) {
    try {
      const img = await embedImageFromPath(pdf, f.file_name, outAbsPath);
      const scaleW = colWidth / img.width;
      const scaleH = maxImgHeight / img.height;
      const scale = Math.min(scaleW, scaleH, 1);
      const w = img.width * scale;
      const h = img.height * scale;

      const needed = h + captionSize + 16; 
      ({ y } = ensureSpace(page, { y, margin, needed: needed + 20, newPage }));
      if (x !== margin && y === page.getHeight() - margin) {
        x = margin;
        colIndex = 0;
        rowMaxHeight = 0;
      }

      page.drawImage(img, {
        x,
        y: y - h,
        width: w,
        height: h,
      });

      const caption = (f.kind && f.kind.trim()) || path.basename(f.file_name || '—');
      const wrapped = wrapText(caption, fonts.regular, captionSize, colWidth);
      let captionY = y - h - 10;
      for (const line of wrapped.slice(0, 2)) {
        page.drawText(line, { x, y: captionY, size: captionSize, font: fonts.regular, color: brand.muted });
        captionY -= captionSize + 5;
      }

      rowMaxHeight = Math.max(rowMaxHeight, h + (y - captionY));

      colIndex += 1;
      if (colIndex >= cols) {
        y = y - rowMaxHeight - gapY;
        x = margin;
        colIndex = 0;
        rowMaxHeight = 0;
      } else {
        x = x + colWidth + gapX;
      }
    } catch {
      continue;
    }
  }

  if (colIndex > 0) {
    y = y - rowMaxHeight - gapY;
  }

  return y;
}

function drawRow(
  page: any,
  {
    y,
    margin,
    width,
    height,
    fills,
    fonts,
    values,
    size,
    bold,
    col1,
    brand,
  }: {
    y: number;
    margin: number;
    width: number;
    height: number;
    fills: any[];
    fonts: { regular: any; bold: any };
    values: string[];
    size: number;
    bold: boolean;
    col1: number;
    brand: any;
  },
) {
  const [v1, v2] = values;
  const x = margin;
  const w1 = width * col1;
  const w2 = width * (1 - col1);

  // Fondo
  page.drawRectangle({ x, y: y - height, width: w1, height, color: fills[0] });
  page.drawRectangle({ x: x + w1, y: y - height, width: w2, height, color: fills[1] });

  // Textos
  page.drawText(v1, { x: x + 8, y: y - height + 6, size, font: bold ? fonts.bold : fonts.regular, color: brand.text });
  const max2 = w2 - 16;
  const wrapped2 = wrapText(v2, fonts.regular, size, max2);
  let innerY = y - height + 6;
  for (const line of wrapped2.slice(0, 2)) { // máximo 2 líneas en la tabla
    page.drawText(line, { x: x + w1 + 8, y: innerY, size, font: fonts.regular, color: brand.text });
    innerY -= size + 2;
  }

  // Bordes
  page.drawLine({ start: { x, y: y - height }, end: { x: x + width, y: y - height }, thickness: 0.5, color: brand.line });
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.5, color: brand.line });
  page.drawLine({ start: { x: x + w1, y }, end: { x: x + w1, y: y - height }, thickness: 0.5, color: brand.line });
}

function drawWatermark(page: any, text: string, font: any) {
  const size = 80;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (page.getWidth() - width) / 2,
    y: page.getHeight() / 2 - size / 2,
    size,
    font,
    color: rgb(0.85, 0.1, 0.1),
    rotate: { type: 'degrees', angle: 30 },
    opacity: 0.08,
  });
}

function drawFooter(page: any, pageNo: number, pageCount: number, font: any) {
  const margin = 50;
  const text = `Página ${pageNo} de ${pageCount}`;
  const fontSize = 9;
  page.drawText(text, {
    x: page.getWidth() - margin - 100,
    y: 30,
    size: fontSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
}


function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(t, size);
    if (width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = t;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ensureSpace(
  page: any,
  { y, margin, needed, newPage }: { y: number; margin: number; needed: number; newPage: () => void },
) {
  if (y - needed < 60) {
    newPage();
    y = page.getHeight() - margin;
  }
  return { y };
}



