export type Theme = "midnight" | "christmas" | "moonlight" | "rain";
export type ColorMode = "theme" | "custom" | "random";
export type LocationResult = {
  name: string;
  description: string;
  lat: number;
  lon: number;
  country: string;
  token: string;
};
export type MapView = { lat: number; lon: number; widthKm: number };
export type MapData = {
  id: string;
  name: string;
  description: string;
  location: LocationResult;
  view: MapView;
  bounds: number[];
  districts: {
    name: string;
    point: number[];
    roads: { d: string; major: boolean; bounds: number[] }[];
    lights: number[][];
  }[];
  land: string;
  coast: string;
  rivers: { d: string; wide: boolean; bounds: number[] }[];
  water: { d: string; bounds: number[] }[];
  roadCount: number;
  source: string;
  retrieved: string;
};
export type SceneProps = {
  mapData: MapData | null;
  audioSrc: string;
  envelopes: number[][];
  theme: Theme;
  colorMode: ColorMode;
  lightColor: string;
  intensity: number;
  sensitivity: number;
  enabled: string[];
  labels: boolean;
  particles: boolean;
  zoom: number;
  pan: { x: number; y: number };
  selected: string | null;
  onSelect?: (name: string) => void;
  duration: number;
  branding?: boolean;
};
export const districtNames = [
  "Jaro",
  "La Paz",
  "Mandurriao",
  "Molo",
  "Arevalo",
  "City Proper",
  "Lapuz",
];
export const defaultScene: SceneProps = {
  mapData: null,
  audioSrc: "",
  envelopes: [],
  theme: "midnight",
  colorMode: "theme",
  lightColor: "#e6c283",
  intensity: 70,
  sensitivity: 65,
  enabled: districtNames,
  labels: true,
  particles: true,
  zoom: 1,
  pan: { x: 0, y: 0 },
  selected: null,
  duration: 32,
  branding: true,
};
