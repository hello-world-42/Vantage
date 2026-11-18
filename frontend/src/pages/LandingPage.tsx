import Attribution from '../components/Attribution';
import GlobeIllustration from '../components/GlobeIllustration';
import TopBar from '../components/TopBar';
import { Link } from '../router';

/** Landing page (Figma screen 01). Lives at /. */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-vt-page text-slate-100">
      <TopBar />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-14 text-center">
        <GlobeIllustration className="w-56 sm:w-64" />

        <h1 className="m-0 mt-10 text-5xl font-extrabold tracking-wide text-white sm:text-6xl">VANTAGE</h1>
        <p className="m-0 mt-5 text-xl text-vt-muted sm:text-2xl">Explore the World from Every Angle</p>
        <p className="m-0 mt-5 max-w-[34rem] text-base leading-relaxed text-vt-muted">
          Click any point on a 3D interactive globe to see real-time weather, air quality, astronomy, satellites, hazards, and more.
        </p>

        <Link
          to="/globe"
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-vt-action px-8 py-3.5 text-lg font-semibold text-white no-underline hover:bg-vt-action-hover"
        >
          Explore the Globe <span aria-hidden="true">→</span>
        </Link>
      </main>

      <footer className="border-t border-white/5 bg-vt-topbar-deep px-4 py-3.5 sm:px-10">
        <Attribution />
      </footer>
    </div>
  );
}
