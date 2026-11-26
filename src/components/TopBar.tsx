import React from 'react';

export type ActiveSection = 'catalog' | 'how-it-works' | 'submit' | 'studio';

interface TopBarProps {
  activeView: 'home' | 'studio' | 'detail' | 'signin' | 'author';
  isSignedIn: boolean;
  isAuthBusy: boolean;
  onNavigate: (target: ActiveSection) => void;
  onAuthAction: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isSignedIn,
  isAuthBusy,
  onNavigate,
  onAuthAction,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-[#E6E3DC]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="font-display text-2xl font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E3A8A]"
        >
          FirstFolio
        </button>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
        >
          <button
            type="button"
            onClick={() => onNavigate('catalog')}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer hover:text-zinc-950 ${
              activeView === 'home' ? 'text-zinc-950 border-b border-zinc-950' : ''
            }`}
          >
            Catalog
          </button>
          <button
            type="button"
            onClick={() => onNavigate('how-it-works')}
            className="whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer hover:text-zinc-950"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer hover:text-zinc-950"
          >
            Submit Book
          </button>
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer hover:text-zinc-950 ${
              activeView === 'studio' ? 'text-zinc-950 border-b border-zinc-950' : ''
            }`}
          >
            Author Studio
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          <button
            type="button"
            disabled={isAuthBusy}
            onClick={onAuthAction}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A]"
          >
            {isAuthBusy ? 'Connecting...' : isSignedIn ? 'Sign Out' : 'Sign In'}
          </button>
        </div>
      </div>
    </header>
  );
};
