import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      let parsedMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string };
        if (parsed?.error) {
          parsedMsg = `${parsed.operationType ? `${parsed.operationType.toUpperCase()}: ` : ''}${parsed.error}`;
        }
      } catch {
        // Plain error message
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Dispatch Sync Interrupted
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-5 break-words">
              {parsedMsg}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload WrenchBid
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
