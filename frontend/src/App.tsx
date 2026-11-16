import { useEffect } from 'react';
import AuthCallbackPage from './pages/AuthCallbackPage';
import GlobePage from './pages/GlobePage';
import LandingPage from './pages/LandingPage';
import { navigate, usePathname } from './router';

const ROUTES: Record<string, () => React.JSX.Element> = {
  '/': LandingPage,
  '/globe': GlobePage,
  '/auth/callback': AuthCallbackPage,
};

export default function App() {
  const path = usePathname();
  const Page = ROUTES[path];

  // Unknown paths go to the landing page.
  useEffect(() => {
    if (!Page) navigate('/', { replace: true });
  }, [Page]);

  return Page ? <Page /> : null;
}
