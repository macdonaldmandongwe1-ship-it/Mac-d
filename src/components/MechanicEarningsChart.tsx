import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { CountryPaymentProfile, formatLocalCurrencyApprox } from '../data/countryPayments';
import { BreakdownRequest } from '../types';

interface MechanicEarningsChartProps {
  assignedRequests: BreakdownRequest[];
  countryProfile: CountryPaymentProfile;
  onJumpToDispatch?: () => void;
}

type ChartSeriesMode = 'daily' | 'cumulative';

interface DailyPayoutPoint {
  dateKey: string;
  label: string;
  fullDateLabel: string;
  payoutUsd: number;
  cumulativeUsd: number;
  jobsCount: number;
}

function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveJobCompletedMs(req: BreakdownRequest): number {
  if (req.paymentConfirmedAt?.toMillis) return req.paymentConfirmedAt.toMillis();
  if (req.updatedAt?.toMillis) return req.updatedAt.toMillis();
  if (req.createdAt?.toMillis) return req.createdAt.toMillis();
  return Date.now();
}

export function MechanicEarningsChart({
  assignedRequests,
  countryProfile,
  onJumpToDispatch,
}: MechanicEarningsChartProps) {
  const [seriesMode, setSeriesMode] = useState<ChartSeriesMode>('daily');

  const { chartData, total30dUsd, completed30dCount, avgPayoutUsd, bestDayUsd, bestDayLabel } =
    useMemo(() => {
      const completedJobs = assignedRequests.filter((r) => r.status === 'completed');

      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const windowStartMs = todayMidnight - 29 * dayMs;

      const byDay: Record<string, { payoutUsd: number; jobsCount: number }> = {};

      completedJobs.forEach((job) => {
        const completedMs = resolveJobCompletedMs(job);
        if (completedMs < windowStartMs) return;
        const key = toLocalDateKey(completedMs);
        const amount = Number(job.agreedPriceUsd ?? job.offerPriceUsd ?? 0);
        if (!byDay[key]) {
          byDay[key] = { payoutUsd: 0, jobsCount: 0 };
        }
        byDay[key].payoutUsd += amount;
        byDay[key].jobsCount += 1;
      });

      const points: DailyPayoutPoint[] = [];
      let runningTotal = 0;
      let totalJobs = 0;
      let topUsd = 0;
      let topLabel = '';

      for (let i = 29; i >= 0; i--) {
        const dayTime = todayMidnight - i * dayMs;
        const d = new Date(dayTime);
        const dateKey = toLocalDateKey(dayTime);
        const bucket = byDay[dateKey] || { payoutUsd: 0, jobsCount: 0 };
        const dayTotal = Number(bucket.payoutUsd.toFixed(2));
        runningTotal = Number((runningTotal + dayTotal).toFixed(2));
        totalJobs += bucket.jobsCount;

        const shortLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const fullDateLabel = d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

        if (dayTotal > topUsd) {
          topUsd = dayTotal;
          topLabel = shortLabel;
        }

        points.push({
          dateKey,
          label: shortLabel,
          fullDateLabel,
          payoutUsd: dayTotal,
          cumulativeUsd: runningTotal,
          jobsCount: bucket.jobsCount,
        });
      }

      const avg = totalJobs > 0 ? runningTotal / totalJobs : 0;

      return {
        chartData: points,
        total30dUsd: runningTotal,
        completed30dCount: totalJobs,
        avgPayoutUsd: avg,
        bestDayUsd: topUsd,
        bestDayLabel: topLabel,
      };
    }, [assignedRequests]);

  const showLocalCurrency = countryProfile.currencyCode !== 'USD';

  return (
    <section
      aria-label="Completed job payouts over the last 30 days"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            <h3 className="font-display text-lg font-bold text-slate-900">
              Completed Job Payouts (Last 30 Days)
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Direct repair earnings confirmed by motorists · 0% platform commission
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSeriesMode('daily')}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              seriesMode === 'daily'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Payouts
          </button>
          <button
            type="button"
            onClick={() => setSeriesMode('cumulative')}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              seriesMode === 'cumulative'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cumulative
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-slate-100 py-3.5">
        <div className="space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500">30-Day Earnings</div>
          <div className="font-display text-xl font-bold text-emerald-700 tabular-nums">
            ${total30dUsd.toFixed(2)}
          </div>
          {showLocalCurrency && (
            <div className="text-[11px] text-slate-500 tabular-nums">
              {formatLocalCurrencyApprox(total30dUsd, countryProfile)}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500">Completed Jobs (30d)</div>
          <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
            {completed30dCount}
          </div>
          <div className="text-[11px] text-slate-500">Confirmed repairs</div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500">Average per Job</div>
          <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
            ${avgPayoutUsd.toFixed(2)}
          </div>
          {showLocalCurrency && (
            <div className="text-[11px] text-slate-500 tabular-nums">
              {formatLocalCurrencyApprox(avgPayoutUsd, countryProfile)}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500">Best Day</div>
          <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
            {bestDayUsd > 0 ? `$${bestDayUsd.toFixed(2)}` : '—'}
          </div>
          <div className="text-[11px] text-slate-500">
            {bestDayLabel || 'No payouts yet'}
          </div>
        </div>
      </div>

      {/* Recharts 30-Day Line Chart */}
      <div className="w-full h-[250px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#CBD5E1' }}
              interval={4}
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={54}
              tickFormatter={(value: number) => `$${value}`}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as DailyPayoutPoint;
                const displayedUsd =
                  seriesMode === 'cumulative' ? point.cumulativeUsd : point.payoutUsd;
                return (
                  <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm text-xs space-y-1">
                    <div className="font-semibold text-slate-900">{point.fullDateLabel}</div>
                    <div className="font-bold text-emerald-700 tabular-nums">
                      {seriesMode === 'cumulative' ? 'Cumulative: ' : 'Payout: '}$
                      {displayedUsd.toFixed(2)} USD
                    </div>
                    {showLocalCurrency && displayedUsd > 0 && (
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {formatLocalCurrencyApprox(displayedUsd, countryProfile)}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {point.jobsCount} {point.jobsCount === 1 ? 'completed job' : 'completed jobs'}
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={seriesMode === 'cumulative' ? 'cumulativeUsd' : 'payoutUsd'}
              name={seriesMode === 'cumulative' ? 'Cumulative Earnings' : 'Daily Payouts'}
              stroke="#059669"
              strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props as {
                  cx?: number;
                  cy?: number;
                  payload?: DailyPayoutPoint;
                };
                if (
                  typeof cx !== 'number' ||
                  typeof cy !== 'number' ||
                  !payload ||
                  payload.jobsCount === 0
                ) {
                  return <g key={payload?.dateKey || String(cx)} />;
                }
                return (
                  <circle
                    key={payload.dateKey}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="#059669"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 5, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Empty State Guidance (when no completed payouts exist in the last 30 days) */}
      {completed30dCount === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-slate-600">
            No completed job payouts recorded in the last 30 days yet. Earnings plot here automatically when motorists confirm payment after a repair.
          </span>
          {onJumpToDispatch && (
            <button
              type="button"
              onClick={onJumpToDispatch}
              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap shrink-0"
            >
              View Open Breakdowns
            </button>
          )}
        </div>
      )}
    </section>
  );
}
