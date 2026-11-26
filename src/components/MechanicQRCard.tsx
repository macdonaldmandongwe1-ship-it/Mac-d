import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, QrCode } from 'lucide-react';

interface MechanicQRCardProps {
  mechanicName: string;
  qrLabel: string;
  qrUri: string;
  amountUsd?: number;
  localAmountText?: string;
  paymentMethodLabel?: string;
  motoristPaymentNote?: string;
  invoiceRef?: string;
}

export function MechanicQRCard({
  mechanicName,
  qrLabel,
  qrUri,
  amountUsd,
  localAmountText,
  paymentMethodLabel,
  motoristPaymentNote,
  invoiceRef,
}: MechanicQRCardProps) {
  const [copied, setCopied] = useState(false);

  const hasAmountParam = /[?&]amount=/.test(qrUri);
  const encodedValue =
    amountUsd && !hasAmountParam
      ? `${qrUri}${qrUri.includes('?') ? '&' : '?'}amount=${amountUsd.toFixed(2)}`
      : qrUri;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(encodedValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  };

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
      <div className="min-w-0 flex-1 space-y-1.5 text-center sm:text-left">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700">
          <QrCode className="w-3.5 h-3.5" />
          <span>{invoiceRef ? `Unique Job QR · ${invoiceRef}` : 'Direct Mechanic QR Payout'}</span>
        </div>
        <div className="font-display text-lg font-bold text-slate-900 truncate">
          {mechanicName}
        </div>
        <div className="text-xs text-slate-600 break-words">
          Payment handle: <span className="font-medium text-slate-900">{qrLabel}</span>
          {paymentMethodLabel ? ` · ${paymentMethodLabel}` : ''}
        </div>
        {motoristPaymentNote && (
          <div className="text-xs text-slate-600">
            Motorist details: <span className="font-medium text-slate-900">{motoristPaymentNote}</span>
          </div>
        )}
        {typeof amountUsd === 'number' && (
          <div className="text-sm font-semibold text-emerald-700 tabular-nums">
            Amount due: ${amountUsd.toFixed(2)} USD
            {localAmountText ? ` (${localAmountText})` : ''} · Paid directly to {mechanicName}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 pt-1">
          <div className="text-[11px] font-mono text-slate-500 break-all min-w-0">
            {encodedValue}
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy URI</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
