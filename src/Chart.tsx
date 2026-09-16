import { useId, useState } from "react";
import type { Point } from "./types";
export const clock = (seconds: number) =>
  `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
export function Chart({
  points,
  comparison,
  firstCrack,
  mini = false,
}: {
  points: Point[];
  comparison?: Point[];
  firstCrack?: number | null;
  mini?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<Point | null>(null);
  const w = 800,
    h = mini ? 130 : 290,
    left = mini ? 0 : 45,
    right = mini ? 0 : 25,
    top = mini ? 8 : 22,
    bottom = mini ? 5 : 35;
  const maxTime = Math.max(
    600,
    ...points.map((p) => p.time),
    ...(comparison || []).map((p) => p.time),
  );
  const maxTemp = Math.max(
    250,
    ...points.map((p) => p.temperature),
    ...(comparison || []).map((p) => p.temperature),
  );
  const x = (t: number) => left + (t / maxTime) * (w - left - right);
  const y = (t: number) => h - bottom - (t / maxTemp) * (h - top - bottom);
  const path = (p: Point[]) =>
    p
      .map((p, i) => `${i ? "L" : "M"}${x(p.time)},${y(p.temperature)}`)
      .join(" ");
  return (
    <div className={`chart ${mini ? "mini" : ""}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Temperature in degrees Celsius over roast time"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b15e3a" stopOpacity=".12" />
            <stop offset="100%" stopColor="#b15e3a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!mini && (
          <>
            {Array.from({ length: 5 }, (_, i) => ((i + 1) * maxTemp) / 5).map(
              (t) => (
                <g key={t}>
                  <line
                    x1={left}
                    x2={w - right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="#e4e1d8"
                    strokeDasharray="3 5"
                  />
                  <text x={left - 12} y={y(t) + 4} textAnchor="end">
                    {Math.round(t)}°
                  </text>
                </g>
              ),
            )}
            {Array.from({ length: 6 }, (_, i) => (i * maxTime) / 5).map((t) => (
              <text key={t} x={x(t)} y={h - 7} textAnchor="middle">
                {clock(t)}
              </text>
            ))}
          </>
        )}
        {points.length > 0 && (
          <path
            d={`${path(points)} L${x(points.at(-1)!.time)},${h - bottom} L${x(points[0].time)},${h - bottom} Z`}
            fill={`url(#${id})`}
          />
        )}
        {comparison && (
          <path
            d={path(comparison)}
            fill="none"
            stroke="#778c79"
            strokeWidth={mini ? 3 : 2}
            strokeDasharray="6 5"
          />
        )}
        <path
          d={path(points)}
          fill="none"
          stroke="#ad5938"
          strokeWidth={mini ? 3.5 : 2.7}
          strokeLinejoin="round"
        />
        {!mini && firstCrack && (
          <g>
            <line
              x1={x(firstCrack)}
              x2={x(firstCrack)}
              y1={top}
              y2={h - bottom}
              stroke="#a89b82"
              strokeDasharray="4 4"
            />
            <text x={x(firstCrack) - 6} y={top - 7} textAnchor="end">
              First crack · {clock(firstCrack)}
            </text>
          </g>
        )}
        {!mini && hover && (
          <g>
            <line
              x1={x(hover.time)}
              x2={x(hover.time)}
              y1={top}
              y2={h - bottom}
              stroke="#222"
              opacity=".25"
            />
            <circle
              cx={x(hover.time)}
              cy={y(hover.temperature)}
              r="4"
              fill="#ad5938"
            />
            <rect
              x={Math.min(w - 142, Math.max(left, x(hover.time) - 60))}
              y={h - 66}
              width="132"
              height="23"
              rx="4"
              fill="#292d26"
            />
            <text
              x={Math.min(w - 76, Math.max(left + 66, x(hover.time) + 6))}
              y={h - 50}
              textAnchor="middle"
              fill="white"
            >
              {clock(hover.time)} · {hover.temperature.toFixed(1)}°C
            </text>
          </g>
        )}
        {!mini && (
          <rect
            x={left}
            y={top}
            width={w - left - right}
            height={h - top - bottom}
            fill="transparent"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - rect.left) / rect.width) * maxTime;
              setHover(
                points.reduce<Point | null>(
                  (a, p) =>
                    !a || Math.abs(p.time - t) < Math.abs(a.time - t) ? p : a,
                  null,
                ),
              );
            }}
          />
        )}
      </svg>
    </div>
  );
}
