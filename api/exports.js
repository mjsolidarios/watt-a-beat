export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Video export (Remotion + headless Chrome) is not supported in serverless environments like Vercel.
  return res.status(501).json({
    error:
      "Video export is not available on this deployment. " +
      "Please run locally with `npm run dev` (or self-host the Node server) to enable high-quality MP4 exports using Remotion.",
  });
}
