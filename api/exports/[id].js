export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query || {};
  const subPath = (req.url || "").split("?")[0].split("/").pop();

  if (req.method === "GET" && subPath === "download") {
    return res.status(501).json({
      error:
        "Download is only available after a successful server-side render. " +
        "Video export is not supported on Vercel deployments.",
    });
  }

  if (req.method === "GET") {
    // Status polling
    return res.status(404).json({
      error: "Export job not found. Video export is not supported on this deployment.",
    });
  }

  if (req.method === "POST") {
    // Cancel
    return res.status(202).json({
      id,
      status: "cancelled",
    });
  }

  return res.status(400).json({ error: "Unsupported export operation." });
}
