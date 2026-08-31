import { useEffect } from 'react';
import { applyViewportLock } from './viewport-lock';

export function useViewportLock() {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      applyViewportLock(root, window.visualViewport, window.innerHeight);
    };

    sync();
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);
}
