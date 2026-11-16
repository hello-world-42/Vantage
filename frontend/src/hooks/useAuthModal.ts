import { useContext } from 'react';
import { AuthModalContext } from '../context/AuthModalContext';

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used inside <AuthModalProvider>');
  return ctx;
}
