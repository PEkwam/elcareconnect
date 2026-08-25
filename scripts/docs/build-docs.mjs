// Regenerates public/docs/CareConnect_Developer_Guide.pdf by merging the static
// base PDF with dynamically rendered "Living Sections" defined in content.mjs.
// Run via `bun run docs:build` or automatically by the Vite docs plugin.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { PDFDocument as PdfLib } from "pdf-lib";
import { livingSections } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE_PDF = path.join(ROOT, "docs-src/CareConnect_Developer_Guide_base.pdf");
const OUT_PDF = path.join(ROOT, "public/docs/CareConnect_Developer_Guide.pdf");

function renderAddendum() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(9).fillColor("#666")
      .text(`Auto-generated ${new Date().toISOString().slice(0, 10)} — do not edit by hand. Source: scripts/docs/content.mjs`,
        { align: "right" });
    doc.moveDown(0.5);

    for (const section of livingSections) {
      doc.fillColor("#000").fontSize(18).font("Helvetica-Bold")
        .text(`${section.number}. ${section.title}`);
      doc.moveDown(0.3);

      if (section.intro) {
        doc.fontSize(10).font("Helvetica").fillColor("#222")
          .text(section.intro, { align: "left" });
        doc.moveDown(0.5);
      }

      for (const sub of section.subsections ?? []) {
        doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text(sub.title);
        doc.moveDown(0.2);
        if (sub.body) {
          doc.fontSize(10).font("Helvetica").fillColor("#222").text(sub.body);
          doc.moveDown(0.3);
        }
        if (sub.bullets?.length) {
          doc.fontSize(10).font("Helvetica").fillColor("#222")
            .list(sub.bullets, { bulletRadius: 1.6, textIndent: 12, lineGap: 2 });
          doc.moveDown(0.3);
        }
        if (sub.outro) {
          doc.fontSize(10).font("Helvetica").fillColor("#222").text(sub.outro);
          doc.moveDown(0.4);
        }
      }
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

export async function buildDocs() {
  if (!fs.existsSync(BASE_PDF)) throw new Error(`Missing base PDF: ${BASE_PDF}`);

  const basePdfBytes = fs.readFileSync(BASE_PDF);
  const addendumBytes = await renderAddendum();

  const out = await PdfLib.create();
  const base = await PdfLib.load(basePdfBytes);
  const addendum = await PdfLib.load(addendumBytes);

  const basePages = await out.copyPages(base, base.getPageIndices());
  basePages.forEach((p) => out.addPage(p));
  const addPages = await out.copyPages(addendum, addendum.getPageIndices());
  addPages.forEach((p) => out.addPage(p));

  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
  fs.writeFileSync(OUT_PDF, await out.save());
  return { outPath: OUT_PDF, pages: out.getPageCount() };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  buildDocs()
    .then(({ outPath, pages }) =>
      console.log(`[docs] regenerated ${path.relative(ROOT, outPath)} (${pages} pages)`),
    )
    .catch((e) => {
      console.error("[docs] build failed:", e);
      process.exit(1);
    });
}
