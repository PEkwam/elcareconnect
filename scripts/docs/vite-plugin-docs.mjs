// Vite plugin: regenerates the developer PDF whenever the docs content source
// or any tracked component changes during `vite` / `vite build`.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocs } from "./build-docs.mjs";
import { watchedSourceFiles } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CONTENT_FILE = path.join(__dirname, "content.mjs");
const watched = [CONTENT_FILE, ...watchedSourceFiles.map((p) => path.join(ROOT, p))];

let queued = false;
async function runBuild(reason) {
  if (queued) return;
  queued = true;
  try {
    const { pages } = await buildDocs();
    console.log(`[docs-plugin] ${reason} → regenerated developer guide (${pages} pages)`);
  } catch (e) {
    console.error("[docs-plugin] regeneration failed:", e?.message ?? e);
  } finally {
    queued = false;
  }
}

export function docsAutoBuildPlugin() {
  return {
    name: "el-docs-auto-build",
    apply: () => true,
    async buildStart() {
      await runBuild("buildStart");
    },
    configureServer(server) {
      watched.forEach((f) => server.watcher.add(f));
      server.watcher.on("change", (file) => {
        if (watched.some((w) => path.resolve(file) === path.resolve(w))) {
          runBuild(`change ${path.relative(ROOT, file)}`);
        }
      });
    },
  };
}
