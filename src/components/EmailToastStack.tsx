import React, { useEffect } from 'react';
import { CheckCircle2, Mail, X } from 'lucide-react';
import { SimulatedEmailNotification } from '../utils/emailNotifications';

interface EmailToastStackProps {
  toasts: SimulatedEmailNotification[];
  onDismiss: (id: string) => void;
}

const EmailToastItem: React.FC<{
  toast: SimulatedEmailNotification;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSent = toast.deliveryStatus === 'sent';

  return (
    <div
      role="status"
      className="bg-white border border-[#D8D3C8] rounded-xl p-4 shadow-md flex items-start gap-3 transition-transform duration-150"
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isSent ? 'bg-emerald-50 text-emerald-700' : 'bg-[#EFF3FF] text-[#1E3A8A]'
        }`}
      >
        {isSent ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[11px] font-medium text-zinc-500 truncate">
          {isSent ? 'Email Sent to Author' : 'Notification Preview'} · To {toast.recipientLabel}
        </p>
        <p className="text-sm font-semibold text-zinc-900 leading-snug">
          {toast.subject}
        </p>
        <p className="text-xs text-zinc-600 leading-relaxed line-clamp-3">
          {toast.body}
        </p>
        {toast.deliveryNote && (
          <p className="text-[11px] text-zinc-500 pt-0.5">
            {toast.deliveryNote}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors shrink-0 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const EmailToastStack: React.FC<EmailToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      aria-label="Author email notifications"
      className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm space-y-2.5"
    >
      {toasts.map((toast) => (
        <EmailToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </aside>
  );
};
