import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode } from 'lucide-react';

interface MechanicQRCardProps {
  mechanicName: string;
  qrLabel: string;
  qrUri: string;
  amountUsd?: number;
}

export function MechanicQRCard({
  mechanicName,
  qrLabel,
  qrUri,
  amountUsd,
}: MechanicQRCardProps) {
  const encodedValue = amountUsd
    ? `${qrUri}${qrUri.includes('?') ? '&' : '?'}amount=${amountUsd.toFixed(2)}`
    : qrUri;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
      <div className="p-3 bg-white border border-slate-200 rounded-xl shrink-0">
        <QRCodeSVG
          value={encodedValue || 'https://wrenchbid.app/pay'}
          size={132}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#0F172A"
        />
      </div>
      <div className="min-w-0 space-y-1.5 text-center sm:text-left">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700">
          <QrCode className="w-3.5 h-3.5" />
          <span>Direct Mechanic QR Payout</span>
        </div>
        <div className="font-display text-lg font-bold text-slate-900 truncate">
          {mechanicName}
        </div>
        <div className="text-xs text-slate-600">
          Payment handle: <span className="font-medium text-slate-900">{qrLabel}</span>
        </div>
        {typeof amountUsd === 'number' && (
          <div className="text-sm font-semibold text-emerald-700 tabular-nums">
            Amount due: ${amountUsd.toFixed(2)} USD · Paid directly to {mechanicName} (0% fee)
          </div>
        )}
        <div className="text-[11px] font-mono text-slate-500 break-all pt-1">
          {encodedValue}
        </div>
      </div>
    </div>
  );
}
