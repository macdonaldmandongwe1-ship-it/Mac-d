import React from 'react';
import { Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { canInstall, promptInstall } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
    >
      <Smartphone className="w-4 h-4 text-orange-600" />
      Install Android App
    </button>
  );
}
