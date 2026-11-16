// Decorative line-art globe for the landing page (stands in for the wireframe's blue-outlined globe circle).
const C = 200; // center
const R = 168; // radius
const TILT = (22 * Math.PI) / 180; // how far the north pole leans toward the viewer

// Parallels: under the tilt each one is an ellipse; draw only its front (lower) half.
const parallels = [-60, -30, 0, 30, 60].map((lat) => {
  const phi = (lat * Math.PI) / 180;
  const rx = R * Math.cos(phi);
  const ry = rx * Math.sin(TILT);
  const cy = C - R * Math.sin(phi) * Math.cos(TILT);
  return `M ${C - rx} ${cy} A ${rx} ${ry} 0 0 0 ${C + rx} ${cy}`;
});

// Meridians: ellipses through the poles, narrower toward the center line.
const poleY = R * Math.cos(TILT);
const meridians = [30, 60].map((lng) => R * Math.sin((lng * Math.PI) / 180));

export default function GlobeIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="vt-globe-shade" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#262b36" />
          <stop offset="100%" stopColor="#171717" />
        </radialGradient>
        <clipPath id="vt-globe-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>

      <circle cx={C} cy={C} r={R} fill="url(#vt-globe-shade)" />
      <g clipPath="url(#vt-globe-clip)" fill="none" stroke="#4f86f7" strokeOpacity="0.35" strokeWidth="1">
        {parallels.map((d) => (
          <path key={d} d={d} />
        ))}
        <line x1={C} y1={C - poleY} x2={C} y2={C + poleY} />
        {meridians.map((rx) => (
          <ellipse key={rx} cx={C} cy={C} rx={rx} ry={poleY} />
        ))}
      </g>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#4f86f7" strokeWidth="2" />

    </svg>
  );
}
