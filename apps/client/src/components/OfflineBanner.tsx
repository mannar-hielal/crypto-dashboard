import { useState, useEffect } from 'react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!isOffline) return null;

  return (
    // A bottom-centre toast (visual gate 2026-09-29): a bar across the top covered the top bar and its
    // Sign out (row 19.15)
    <div
      role="alert"
      className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-600 px-4 py-1.5 text-center text-sm font-medium text-white shadow-lg"
    >
      ⚠ Offline — data paused until you're back online
    </div>
  );
}
