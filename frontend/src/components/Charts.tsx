import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEther } from "ethers";
import { formatDateTime, formatEth, splitDemoTitle } from "../utils/format";
import type { Activity, Campaign } from "../types";

// Chart libraries need plain numbers. These conversions affect drawing only: every figure shown as
// text, including tooltips, is formatted from the original bigint.
const toChartNumber = (wei: bigint) => Number(formatEther(wei));

const AXIS = { fontSize: 12, fill: "var(--color-text-3)" };

function TooltipCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card bg-raised px-3 py-2 text-[13px]">
      <div className="text-text-3 text-xs">{title}</div>
      <div className="num font-medium mt-0.5">{value}</div>
    </div>
  );
}

/** Cumulative funds raised over time, drawn from ContributionReceived events. */
export function FundingChart({ campaign, activity }: { campaign: Campaign; activity: Activity[] }) {
  const data = useMemo(() => {
    let running = 0n;
    const points: { time: number; raised: number; label: bigint }[] = [{ time: campaign.createdAt, raised: 0, label: 0n }];
    for (const item of [...activity].reverse()) {
      if (item.type === "ContributionReceived" && item.amount !== null && item.timestamp) {
        running += item.amount;
        points.push({ time: item.timestamp, raised: toChartNumber(running), label: running });
      }
    }
    return points;
  }, [campaign.createdAt, activity]);

  const target = toChartNumber(campaign.fundingTarget);
  const top = Math.max(target, data[data.length - 1].raised) * 1.1;
  const spansDays = data[data.length - 1].time - data[0].time > 86_400;

  return (
    <div className="h-56" role="img" aria-label={`Funds raised over time, reaching ${formatEth(campaign.totalRaised)} ETH against a ${formatEth(campaign.fundingTarget)} ETH target`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="raised-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--color-line-strong)" }}
            tickCount={4}
            tickFormatter={(value: number) => {
              const date = new Date(value * 1000);
              return spansDays ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            }}
          />
          <YAxis domain={[0, top]} tick={AXIS} tickLine={false} axisLine={false} width={38} tickFormatter={(value: number) => (value >= 10 ? value.toFixed(0) : value.toFixed(1))} />
          <ReferenceLine y={target} stroke="var(--color-text-3)" strokeDasharray="4 4" label={{ value: "Target", position: "insideTopRight", ...AXIS }} />
          <Tooltip
            cursor={{ stroke: "var(--color-line-strong)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
              return active && point ? <TooltipCard title={formatDateTime(point.time)} value={`${formatEth(point.label)} ETH raised`} /> : null;
            }}
          />
          <Area type="stepAfter" dataKey="raised" stroke="var(--color-accent)" strokeWidth={2} fill="url(#raised-fill)" activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** ETH raised per campaign for the creator dashboard. */
export function RaisedByCampaignChart({ campaigns }: { campaigns: Campaign[] }) {
  const data = useMemo(
    () =>
      campaigns.map((campaign) => ({
        name: splitDemoTitle(campaign.title).title,
        raised: toChartNumber(campaign.totalRaised),
        wei: campaign.totalRaised,
        target: campaign.fundingTarget,
      })),
    [campaigns],
  );

  return (
    <div style={{ height: Math.max(120, data.length * 44 + 28) }} role="img" aria-label="ETH raised per campaign. The same figures are listed in the campaigns list.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke="var(--color-line)" />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--color-line-strong)" }}
            width={150}
            tickFormatter={(value: string) => (value.length > 20 ? `${value.slice(0, 19)}…` : value)}
          />
          <Tooltip
            cursor={{ fill: "var(--color-hover)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
              return active && point ? <TooltipCard title={point.name} value={`${formatEth(point.wei)} of ${formatEth(point.target)} ETH`} /> : null;
            }}
          />
          <Bar dataKey="raised" fill="var(--color-accent)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
