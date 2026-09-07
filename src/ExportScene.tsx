import { Audio } from "@remotion/media";
import { MapScene } from "./MapScene";
import type { SceneProps } from "./types";
import geistUrl from "@fontsource/geist/files/geist-latin-400-normal.woff2?url";

// Standalone SVG images do not inherit the page's @font-face declarations.
export async function loadExportFont() {
  const response = await fetch(geistUrl);
  if (!response.ok)
    throw new Error("Couldn’t load the video font. Please retry export.");
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Couldn’t prepare the video font."));
    reader.readAsDataURL(blob);
  });
  return `@font-face{font-family:Geist;src:url('${dataUrl}') format('woff2');font-style:normal;font-weight:400;}`;
}

export function ExportScene(props: SceneProps) {
  return (
    <>
      <MapScene
        {...props}
        audioSrc=""
        onSelect={undefined}
        ripple={undefined}
      />
      {props.audioSrc && <Audio src={props.audioSrc} />}
    </>
  );
}
