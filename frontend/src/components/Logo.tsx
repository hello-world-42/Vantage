import { Link } from '../router';

/** VANTAGE wordmark (Figma: bold blue, top-left of the top bar). Links home. */
export default function Logo() {
  return (
    <Link to="/" aria-label="Vantage home" className="select-none rounded text-xl font-extrabold tracking-wide text-vt-blue no-underline">
      VANTAGE
    </Link>
  );
}
