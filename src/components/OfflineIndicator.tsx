import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-6 right-4 z-50 bg-amber-950 text-amber-50 border border-amber-800 rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2 text-xs font-medium"
    >
      <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
      <span>Offline mode — changes sync when connection returns</span>
    </div>
  );
}
