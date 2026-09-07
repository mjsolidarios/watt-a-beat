/** Round caps on zero-length segments draw circles. Lights with the same seed
 * class share their animated radius, so three paths replace hundreds of nodes. */
export function lightBatches(lights) {
  const paths = ["", "", ""];
  for (const [x, y, seed] of lights) {
    paths[seed % 3] += `M${x},${y}h0`;
  }
  return paths;
}
