import { formatINR } from "@/lib/money";
import { categoryLabel } from "@/lib/transactions";
import { Meter } from "./ui";

// Ranked category bars. One hue: the category is named by its label, so colour carries
// no identity. Every bar shows its amount and share as text.
export function CategoryBars({ items, total }: { items: { category: string; paise: number }[]; total: number }) {
  if (total <= 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ category, paise }) => {
        const share = Math.round((paise / total) * 100);
        return (
          <li key={category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{categoryLabel(category)}</span>
              <span className="tabular-nums">
                {formatINR(paise)} <span className="text-muted">· {share}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-chart" style={{ width: `${Math.max(share, 2)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Spending against the cycle budget, with the status always spelled out in text.
export function BudgetProgress({ spent, budget }: { spent: number; budget: number }) {
  if (budget <= 0) {
    return <p className="text-sm text-muted">Spent {formatINR(spent)} this cycle. Set a budget in Settings to track progress.</p>;
  }
  const used = (spent / budget) * 100;
  const left = budget - spent;
  const tone = used > 100 ? "danger" : used >= 80 ? "warning" : "accent";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">{formatINR(spent)}</span>
          <span className="text-muted"> of {formatINR(budget)}</span>
        </p>
        <p className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-accent"}`}>
          {Math.round(used)}% used
        </p>
      </div>
      <Meter value={used} tone={tone} label="Budget used" />
      <p className={`text-xs ${left < 0 ? "text-danger" : "text-muted"}`}>
        {left < 0 ? `Over budget by ${formatINR(-left)}` : `${formatINR(left)} left to spend this cycle`}
      </p>
    </div>
  );
}
