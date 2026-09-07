/** Mix decoded, equally sampled tracks from time zero. Short tracks end in silence. */
export function mixChannels(tracks) {
  if (!tracks.length) throw new Error("Add an audio file to create a mix.");
  const length = Math.max(...tracks.map((track) => track[0].length));
  const channels = Math.min(
    2,
    Math.max(...tracks.map((track) => track.length)),
  );
  const output = Array.from(
    { length: channels },
    () => new Float32Array(length),
  );
  // Equal headroom for every source prevents clipping, including correlated tracks.
  for (const track of tracks) {
    for (let c = 0; c < channels; c++) {
      const input = track[Math.min(c, track.length - 1)];
      for (let i = 0; i < input.length; i++)
        output[c][i] += input[i] / tracks.length;
    }
  }
  return output;
}

export function encodeWav(channels, sampleRate) {
  const length = channels[0].length;
  const data = new ArrayBuffer(44 + length * channels.length * 2);
  const view = new DataView(data);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, data.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.byteLength - 44, true);
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels.length; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(
        44 + (i * channels.length + c) * 2,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
    }
  }
  return new Blob([data], { type: "audio/wav" });
}
