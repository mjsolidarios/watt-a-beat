// Analyze every video frame once; preview and offline rendering use identical envelopes.
export function analyzeSamples(samples, sampleRate, fps = 30) {
  const frames = Math.ceil((samples.length / sampleRate) * fps);
  const result = [];
  let low = 0,
    mid = 0;
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate);
  const midAlpha = 1 - Math.exp((-2 * Math.PI * 2200) / sampleRate);
  for (let frame = 0; frame < frames; frame++) {
    const start = Math.floor((frame * sampleRate) / fps);
    const end = Math.min(
      samples.length,
      Math.floor(((frame + 1) * sampleRate) / fps),
    );
    let bass = 0,
      body = 0,
      treble = 0;
    for (let i = start; i < end; i++) {
      const sample = samples[i];
      low += lowAlpha * (sample - low);
      mid += midAlpha * (sample - mid);
      bass += low * low;
      body += (mid - low) ** 2;
      treble += (sample - mid) ** 2;
    }
    const n = Math.max(1, end - start);
    result.push([
      Math.sqrt(bass / n),
      Math.sqrt(body / n),
      Math.sqrt(treble / n),
    ]);
  }
  const maxima = [0, 1, 2].map((b) =>
    Math.max(
      0.02,
      ...result
        .map((r) => r[b])
        .sort((a, b) => b - a)
        .slice(0, Math.max(1, Math.floor(frames * 0.02))),
    ),
  );
  return result.map((r) =>
    r.map((v, b) => Math.round(Math.min(1, v / maxima[b]) * 1000) / 1000),
  );
}
