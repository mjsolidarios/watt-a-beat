import { loadMap } from "../../server/map-service.mjs";

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    // Some runtimes may pre-parse
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { status: 400 });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  try {
    const data = await loadMap(body.token, body.view);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (e) {
    const status = e.name === "AbortError" ? 499 : 400;
    return res.status(status).json({
      error:
        e.name === "TimeoutError"
          ? "Map loading timed out. Please retry."
          : e.message || "Unable to load map area.",
    });
  }
}
