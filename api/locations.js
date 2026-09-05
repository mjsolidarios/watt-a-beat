import { searchLocations } from "../server/map-service.mjs";

export default async function handler(req, res) {
  // CORS not strictly needed if same origin, but harmless for API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const q = req.query.q;
    const results = await searchLocations(q);
    // Short cache for repeated searches within same instance
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
    return res.status(200).json({ results });
  } catch (e) {
    const status = e.status || (e.name === "TimeoutError" ? 504 : 502);
    return res.status(status).json({
      error:
        e.name === "TimeoutError"
          ? "Location search timed out. Please try again."
          : e.message || "Location search failed.",
    });
  }
}
