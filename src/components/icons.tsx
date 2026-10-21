import {
  CircleEllipsis,
  CreditCard,
  House,
  Landmark,
  PiggyBank,
  Repeat,
  Shield,
  TrendingUp,
  Vault,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Icons referenced by name from data (commitment types).
const ICONS: Record<string, LucideIcon> = {
  home: House,
  zap: Zap,
  landmark: Landmark,
  "credit-card": CreditCard,
  shield: Shield,
  repeat: Repeat,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  vault: Vault,
  wallet: Wallet,
  "circle-ellipsis": CircleEllipsis,
};

export function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? CircleEllipsis;
  return <Component className={className} aria-hidden strokeWidth={1.8} />;
}

// Icon for a commitment by kind/subtype, used in lists.
export function commitmentIconName(kind: string, subtype: string): string {
  if (kind === "bill") return subtype === "rent" || subtype === "maintenance" ? "home" : "zap";
  if (kind === "loan") return "landmark";
  if (kind === "credit_card") return "credit-card";
  if (kind === "insurance") return "shield";
  if (kind === "subscription") return "repeat";
  if (kind === "investment") return subtype === "sip" ? "trending-up" : subtype === "rd" ? "piggy-bank" : subtype === "fd" ? "vault" : "wallet";
  return "circle-ellipsis";
}

export function IconBubble({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent ${className}`}>
      <Icon name={name} />
    </span>
  );
}
