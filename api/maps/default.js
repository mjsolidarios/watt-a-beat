import { getDefaultMap } from "../../server/map-service.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const map = await getDefaultMap();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(map);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to load default map." });
  }
}
