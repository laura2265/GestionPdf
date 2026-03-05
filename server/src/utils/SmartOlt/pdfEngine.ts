import puppeteer from "puppeteer";

 type PdfRenderOptions = {
  landscape?: boolean;
  format?: "A4" | "Letter";
  margin?: { top: string; right: string; bottom: string; left: string };
};

export async function renderPdf(html: string, opts: PdfRenderOptions = {}): Promise<Buffer> {
    const browser = await puppeteer.launch({
        args:["--no-sandbox", "--disable-setiud-sandbox"],
    });
    try{
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(0);
        page.setDefaultTimeout(0);

        await page.setContent(html,{waitUntil: "domcontentloaded"});
        await new Promise((r)=> setTimeout(r, 200));

        const pdfBytes = await page.pdf({
          format: opts.format ?? "A4",
          landscape: opts.landscape ?? true,
          printBackground: true,
          margin: opts.margin ?? { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" },
        });

        return Buffer.from(pdfBytes);
    }finally{
        await browser.close();
    }
 }