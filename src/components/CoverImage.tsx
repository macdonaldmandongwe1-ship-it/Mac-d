import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { CoverTone } from '../types';

interface CoverImageProps {
  src: string;
  alt: string;
  title: string;
  authorPenName: string;
  tone?: CoverTone;
  className?: string;
}

const TONE_BACKGROUNDS: Record<CoverTone, string> = {
  cobalt: 'bg-[#172554] text-blue-50',
  sage: 'bg-[#1C322A] text-emerald-50',
  charcoal: 'bg-[#18181B] text-zinc-100',
  alabaster: 'bg-[#EDEAE2] text-zinc-900',
};

export const CoverImage: React.FC<CoverImageProps> = ({
  src,
  alt,
  title,
  authorPenName,
  tone = 'cobalt',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col justify-between p-6 select-none ${TONE_BACKGROUNDS[tone]} ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="flex items-center justify-between opacity-75">
          <span className="text-[11px] uppercase tracking-[0.16em] font-medium">FirstFolio Press</span>
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="my-auto py-4">
          <p className="font-display text-xl font-semibold leading-snug text-balance">{title}</p>
        </div>
        <p className="text-xs tracking-wide opacity-80 border-t border-current/20 pt-3">
          {authorPenName}
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
