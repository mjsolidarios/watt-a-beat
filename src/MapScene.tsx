import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from "remotion";
import { useMemo } from "react";
import { visibleBounds, intersects, pointVisible } from "./map-geometry.mjs";
import type { SceneProps } from "./types";
import {
  baseLightColor,
  districtLightColor,
  districtPower,
  particleVisibility,
  snowflakeAt,
  snowflakePath,
  raindropAt,
} from "./scene-effects.mjs";

const snowflakes = Array.from({ length: 120 }, (_, index) =>
  snowflakePath(index),
);

export function MapScene(props: SceneProps) {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const {
    theme,
    colorMode = "theme",
    lightColor = "#e6c283",
    intensity,
    sensitivity,
    enabled,
    labels,
    particles,
    zoom,
    pan,
    selected,
    onSelect,
    branding = true,
  } = props;
  const map = useMemo(() => {
    const data = props.mapData;
    if (!data) return null;
    const view = visibleBounds(zoom, pan);
    return {
      ...data,
      districts: data.districts.map((d) => {
        const roads = d.roads.filter((r) => intersects(r.bounds, view));
        return {
          ...d,
          minor: roads
            .filter((r) => !r.major)
            .map((r) => r.d)
            .join(""),
          major: roads
            .filter((r) => r.major)
            .map((r) => r.d)
            .join(""),
          lights: d.lights.filter((p) => pointVisible(p, view)),
        };
      }),
      rivers: data.rivers.filter((r) => intersects(r.bounds, view)),
      water: data.water.filter((r) => intersects(r.bounds, view)),
    };
  }, [props.mapData, zoom, pan.x, pan.y]);
  const gold = baseLightColor(theme, colorMode, lightColor);
  if (!map) return <AbsoluteFill style={{ backgroundColor: "#101615" }} />;
  return (
    <AbsoluteFill
      style={{ backgroundColor: "#101615", fontFamily: "Geist, system-ui, sans-serif" }}
    >
      {props.audioSrc && <Audio src={props.audioSrc} />}
      <svg
        viewBox="0 0 1600 900"
        width="100%"
        height="100%"
        style={{ overflow: "hidden" }}
        aria-label={`Music-reactive brownout map of ${map.name}`}
        data-map-id={map.id}
        data-map-name={map.name}
        data-road-count={map.roadCount}
      >
        <defs>
          <filter id="soft">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="halo">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          <pattern
            id="water"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 11h2" stroke="#25312e" strokeWidth="1" />
          </pattern>
          <radialGradient id="vignette">
            <stop offset="50%" stopColor="#101615" stopOpacity="0" />
            <stop offset="100%" stopColor="#101615" stopOpacity="0.75" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="#0b1111" />
        <rect width="1600" height="900" fill="url(#water)" />
        <g
          transform={`translate(${800 + pan.x} ${450 + pan.y}) scale(${zoom}) translate(-800 -450)`}
        >
          <path d={map.land} fill="#17201c" />
          <path d={map.coast} fill="none" stroke="#344239" strokeWidth="2" />
          {map.water.map((w, i) => (
            <path key={i} d={w.d} fill="#0b1312" fillRule="evenodd" />
          ))}
          {map.rivers.map((r, i) => (
            <path
              key={i}
              d={r.d}
              fill="none"
              stroke="#0b1312"
              strokeWidth={r.wide ? 12 : 4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {map.districts.map((district, index) => {
            const active = enabled.includes(district.name),
              focus = !selected || selected === district.name;
            const energy = districtPower(
              props.envelopes,
              frame,
              index,
              sensitivity,
            );
            const brightness = (energy * intensity) / 100;
            const color = districtLightColor(
              index,
              theme,
              colorMode,
              lightColor,
            );
            return (
              <g
                key={district.name}
                opacity={focus ? 1 : 0.32}
                data-district={district.name}
                data-power={active ? brightness.toFixed(3) : "0.000"}
              >
                <path
                  d={district.minor}
                  fill="none"
                  stroke="#394236"
                  strokeWidth="0.9"
                  opacity="0.63"
                />
                <path
                  d={district.major}
                  fill="none"
                  stroke="#414b41"
                  strokeWidth="1.6"
                  opacity="0.48"
                />
                {active && (
                  <>
                    <path
                      d={district.major}
                      fill="none"
                      stroke={color}
                      strokeWidth={3 + energy * 3}
                      opacity={brightness * 0.44}
                      filter="url(#soft)"
                    />
                    <path
                      d={district.major}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.25"
                      opacity={brightness * 0.9}
                    />
                    <g
                      fill={color}
                      opacity={brightness * 0.55}
                      filter="url(#soft)"
                    >
                      {district.lights.map(([x, y, seed], i) => (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r={3 + energy * ((seed % 3) + 1)}
                        />
                      ))}
                    </g>
                    <g fill={color}>
                      {district.lights.map(([x, y, seed], i) => (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r={0.8 + energy * (0.3 + (seed % 3) * 0.3)}
                          opacity={brightness}
                        />
                      ))}
                    </g>
                    <circle
                      cx={district.point[0]}
                      cy={district.point[1]}
                      r={45 + energy * 65}
                      fill={color}
                      opacity={brightness * 0.035}
                      filter="url(#halo)"
                    />
                  </>
                )}
              </g>
            );
          })}
          {labels &&
            map.districts.map((d, i) => (
              <g
                key={d.name}
                transform={`translate(${d.point[0]} ${d.point[1]})`}
                onClick={() => onSelect?.(d.name)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`Focus ${d.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(d.name);
                  }
                }}
              >
                <rect
                  x="-76"
                  y="-25"
                  width="152"
                  height="51"
                  fill="transparent"
                />
                <circle
                  r="3"
                  fill={
                    enabled.includes(d.name) &&
                    intensity > 0 &&
                    districtPower(props.envelopes, frame, i, sensitivity) > 0.2
                      ? gold
                      : "#596159"
                  }
                />
                <circle
                  r={selected === d.name ? 13 : 8}
                  stroke={gold}
                  strokeOpacity="0.35"
                  fill="none"
                />
                <text
                  x="0"
                  y="-19"
                  textAnchor="middle"
                  fill={selected === d.name ? "#fff1d7" : "#c5c8bc"}
                  fontSize={14}
                  letterSpacing="2.5"
                  paintOrder="stroke"
                  stroke="#142019"
                  strokeWidth="4"
                >
                  {d.name.toUpperCase()}
                </text>
              </g>
            ))}
        </g>
        <rect
          width="1600"
          height="900"
          fill="url(#vignette)"
          pointerEvents="none"
        />
        {theme === "christmas" && particles && (
          <g
            fill="none"
            stroke="#f3f6f4"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
            data-testid="snowfall"
            aria-hidden="true"
          >
            {snowflakes.map((path, i) => {
              const fade = particleVisibility(i, snowflakes.length, frame, fps);
              if (fade <= 0) return null;
              const flake = snowflakeAt(i, frame, fps);
              return (
                <path
                  key={i}
                  d={path}
                  transform={`translate(${flake.x} ${flake.y}) rotate(${flake.rotation}) scale(${flake.radius})`}
                  strokeWidth={0.13}
                  opacity={flake.opacity * fade}
                />
              );
            })}
          </g>
        )}
        {theme === "rain" && particles && (
          <g
            fill="none"
            stroke="#b1c9d2"
            strokeLinecap="round"
            pointerEvents="none"
            aria-hidden="true"
            data-testid="rainfall"
          >
            {Array.from({ length: 160 }, (_, index) => {
              const fade = particleVisibility(index, 160, frame, fps);
              if (fade <= 0) return null;
              const drop = raindropAt(index, frame, fps);
              return (
                <line
                  key={index}
                  x1={drop.x}
                  y1={drop.y}
                  x2={drop.x + drop.length * 0.18}
                  y2={drop.y + drop.length}
                  strokeWidth={drop.width}
                  opacity={drop.opacity * fade}
                />
              );
            })}
          </g>
        )}
        <text x="46" y="828" fill="#aab1a5" fontSize="12" letterSpacing="4">
          {map.name.toUpperCase().slice(0, 48)}, PHILIPPINES
        </text>
        <text x="46" y="853" fill="#778278" fontSize="11" letterSpacing="1.4">
          {map.view.lat.toFixed(4)}° N {map.view.lon.toFixed(4)}° E
        </text>
        <text x="1350" y="854" textAnchor="end" fill="#8e998f" fontSize="10">
          © OpenStreetMap contributors
        </text>

        {branding && (
          <text
            x="800"
            y="883"
            textAnchor="middle"
            fill="#c5b78a"
            fontSize="12"
            letterSpacing="4.5"
            fontFamily="Geist, system-ui, sans-serif"
          >
            WATT A BEAT
          </text>
        )}
      </svg>
    </AbsoluteFill>
  );
}
