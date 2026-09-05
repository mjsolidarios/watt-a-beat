import express from "express";
import { createServer as createHttpServer } from "node:http";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import { validateSettings } from "./validate.mjs";
import { mapRouter, getMapSnapshot } from "./map-service.mjs";

const app = express(),
  port = Number(process.env.PORT || 3000),
  root = process.cwd();
const cache = path.join(root, ".cache"),
  uploadDir = path.join(cache, "audio"),
  exportDir = path.join(root, "exports");
await fs.mkdir(uploadDir, { recursive: true });
await fs.mkdir(exportDir, { recursive: true });
const jobs = new Map();
const cancellations = new Map();
let bundlePromise;
let busy = false;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024,
    fieldSize: 1024 * 1024,
    files: 1,
    fields: 1,
  },
});
app.use("/api", (req, res, next) => {
  if (req.method === "POST") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host)
      return res
        .status(403)
        .json({ error: "Requests must come from this studio." });
  }
  next();
});
app.use("/audio", express.static(uploadDir));
app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.use("/api", mapRouter);
app.post("/api/exports", upload.single("audio"), async (req, res) => {
  if (busy)
    return res.status(409).json({
      error:
        "A video is already rendering. Wait for it to finish before starting another.",
    });
  try {
    busy = true;
    if (!req.file) throw new Error("Choose a soundtrack before exporting.");
    const raw = JSON.parse(req.body.settings);
    const mapData = await getMapSnapshot(raw.mapId);
    const settings = validateSettings(raw, mapData);
    const id = randomUUID();
    busy = true;
    await fs.writeFile(path.join(uploadDir, `${id}.audio`), req.file.buffer);
    const job = { id, status: "queued", progress: 0 };
    const cancellation = makeCancelSignal();
    cancellations.set(id, cancellation);
    jobs.set(id, job);
    res.json(job);
    const props = {
      ...settings,
      mapData,
      audioSrc: `http://127.0.0.1:${port}/audio/${id}.audio`,
    };
    void render(job, props, cancellation).finally(() => {
      cancellations.delete(id);
      busy = false;
    });
  } catch (e) {
    busy = false;
    res.status(400).json({ error: e.message || "Invalid export request." });
  }
});
app.get("/api/exports/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Export not found." });
  res.json(job);
});
app.post("/api/exports/:id/cancel", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Export not found." });
  if (["queued", "rendering", "cancelling"].includes(job.status)) {
    job.status = "cancelling";
    cancellations.get(job.id)?.cancel();
    return res.status(202).json(job);
  }
  res.json(job);
});
app.get("/api/exports/:id/download", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "done")
    return res.status(404).json({ error: "This video is not ready." });
  res.download(
    path.join(exportDir, `${job.id}.mp4`),
    `watt-a-beat-${job.theme || "midnight"}.mp4`,
  );
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use((err, req, res, next) => {
  if (err)
    res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Audio must be smaller than 60 MB."
          : err.message,
    });
  else next();
});
async function render(job, props, cancellation) {
  try {
    if (process.env.NODE_ENV !== "production") bundlePromise = undefined;
    bundlePromise ??= bundle({
      entryPoint: path.join(root, "src/remotion/index.ts"),
      outDir: path.join(cache, "bundle"),
      publicDir: path.join(root, "public"),
    }).catch((e) => {
      bundlePromise = undefined;
      throw e;
    });
    const serveUrl = await bundlePromise;
    if (job.status === "cancelling") return;
    const browserExecutable =
      process.env.CHROME_PATH ||
      (existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined);
    const composition = await selectComposition({
      serveUrl,
      id: "WattABeat",
      inputProps: props,
      browserExecutable,
    });
    if (job.status === "cancelling") return;
    job.status = "rendering";
    job.theme = props.theme;
    await renderMedia({
      composition: {
        ...composition,
        width: props.resolution === 720 ? 1280 : 1920,
        height: props.resolution,
      },
      serveUrl,
      codec: "h264",
      cancelSignal: cancellation.cancelSignal,
      inputProps: props,
      outputLocation: path.join(exportDir, `${job.id}.mp4`),
      browserExecutable,
      concurrency: 2,
      crf: 19,
      onProgress: ({ progress }) => {
        if (job.status === "rendering") job.progress = progress;
      },
    });
    if (job.status !== "cancelling") {
      job.status = "done";
      job.progress = 1;
    }
  } catch (e) {
    if (job.status !== "cancelling") {
      console.error("Render failed:", e);
      job.status = "failed";
      job.error = "Rendering failed: " + e.message;
    }
  } finally {
    await fs.unlink(path.join(uploadDir, `${job.id}.audio`)).catch(() => {});
    if (job.status !== "done")
      await fs.unlink(path.join(exportDir, `${job.id}.mp4`)).catch(() => {});
    if (job.status === "cancelling") job.status = "cancelled";
  }
}
const httpServer = createHttpServer(app);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
httpServer.listen(port, "0.0.0.0", () =>
  console.log(`Watt a Beat studio: http://localhost:${port}`),
);
