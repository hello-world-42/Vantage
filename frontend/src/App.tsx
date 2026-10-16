import { useEffect, useState } from "react";

type Health = { ok: boolean; time: string };

// Placeholder screen: proves the frontend can reach the backend through the /api proxy.
// The globe and dashboard replace this.
export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError("Backend not reachable. Is it running on port 3000?"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-white">
      <h1 className="text-5xl font-bold tracking-tight text-blue-500">VANTAGE</h1>
      <p className="text-neutral-400">Workspace scaffold is running.</p>
      <p className="text-sm">
        {error ? (
          <span className="text-red-400">{error}</span>
        ) : health ? (
          <span className="text-green-400">Backend OK · {health.time}</span>
        ) : (
          <span className="text-neutral-500">Checking backend…</span>
        )}
      </p>
    </main>
  );
}
