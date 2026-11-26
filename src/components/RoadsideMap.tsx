import React from 'react';
import { MapPin, Navigation, Wrench } from 'lucide-react';
import { BreakdownRequest, MechanicProfile } from '../types';

interface RoadsideMapProps {
  centerLat: number;
  centerLng: number;
  mechanics: MechanicProfile[];
  requests?: BreakdownRequest[];
  activeLabel?: string;
  onPinSelect?: (lat: number, lng: number) => void;
}

function projectCoord(lat: number, lng: number, centerLat: number, centerLng: number) {
  const dx = ((lng - centerLng) / 0.14) * 42;
  const dy = ((centerLat - lat) / 0.1) * 42;
  return {
    x: Math.max(10, Math.min(90, 50 + dx)),
    y: Math.max(12, Math.min(88, 50 + dy)),
  };
}

export function RoadsideMap({
  centerLat,
  centerLng,
  mechanics,
  requests = [],
  activeLabel,
  onPinSelect,
}: RoadsideMapProps) {
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPinSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    const newLat = Number((centerLat - yPct * 0.08).toFixed(5));
    const newLng = Number((centerLng + xPct * 0.11).toFixed(5));
    onPinSelect(newLat, newLng);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
          <Navigation className="w-4 h-4 text-orange-600" />
          <span>Live Dispatch Radar</span>
        </div>
        <div className="text-xs text-slate-500 tabular-nums truncate">
          {activeLabel || `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`}
        </div>
      </div>

      <div
        role={onPinSelect ? 'button' : undefined}
        tabIndex={onPinSelect ? 0 : undefined}
        onClick={handleMapClick}
        className={`relative h-56 bg-slate-900 overflow-hidden select-none ${
          onPinSelect ? 'cursor-crosshair' : ''
        }`}
      >
        {/* Subtle coordinate grid */}
        <svg className="absolute inset-0 w-full h-full opacity-20" aria-hidden="true">
          <defs>
            <pattern id="radar-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#94A3B8" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#radar-grid)" />
          <circle cx="50%" cy="50%" r="28%" fill="none" stroke="#F97316" strokeOpacity="0.4" strokeDasharray="4 4" />
          <circle cx="50%" cy="50%" r="44%" fill="none" stroke="#64748B" strokeOpacity="0.4" />
        </svg>

        {/* Center user / breakdown pin */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{ left: '50%', top: '50%' }}
        >
          <div className="w-8 h-8 rounded-full bg-orange-600 border-2 border-white shadow-md flex items-center justify-center text-white">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="mt-1 text-[10px] font-semibold text-white bg-slate-950/80 px-1.5 py-0.5 rounded whitespace-nowrap">
            Pin
          </span>
        </div>

        {/* Nearby Online Mechanics */}
        {mechanics.map((m) => {
          const pos = projectCoord(m.lat, m.lng, centerLat, centerLng);
          return (
            <div
              key={m.uid}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="w-7 h-7 rounded-full bg-emerald-600 border-2 border-white shadow flex items-center justify-center text-white">
                <Wrench className="w-3.5 h-3.5" />
              </div>
              <span className="mt-0.5 text-[10px] font-medium text-emerald-100 bg-slate-950/80 px-1.5 py-0.5 rounded whitespace-nowrap max-w-[96px] truncate">
                {m.displayName}
              </span>
            </div>
          );
        })}

        {/* Open Breakdown Requests */}
        {requests.map((req) => {
          const pos = projectCoord(req.lat, req.lng, centerLat, centerLng);
          return (
            <div
              key={req.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-bold shadow tabular-nums whitespace-nowrap">
                ${req.offerPriceUsd}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span>{mechanics.length} online mechanics</span>
          {requests.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{requests.length} open breakdown offers</span>
            </>
          )}
        </div>
        {onPinSelect && <span className="text-slate-500">Tap radar to reposition pin</span>}
      </div>
    </div>
  );
}
