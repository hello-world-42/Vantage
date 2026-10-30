// Placeholder wordmark: swap the SVG/text for the real brand asset when it exists.
export default function Logo() {
  return (
    <div className="flex select-none items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="8" stroke="#7dd3fc" strokeWidth="1.75" />
        <ellipse cx="16" cy="16" rx="14" ry="5" transform="rotate(-25 16 16)" stroke="#e2e8f0" strokeOpacity="0.7" strokeWidth="1.25" />
        <circle cx="27.6" cy="10.4" r="1.9" fill="#e2e8f0" />
      </svg>
      <h1 className="m-0 text-xl font-semibold tracking-wide text-white">Vantage</h1>
    </div>
  );
}
