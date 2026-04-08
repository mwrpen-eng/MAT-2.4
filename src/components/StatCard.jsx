// @ts-nocheck
import { cn } from "@/lib/utils";

export default function StatCard({ icon: Icon, label, value, subtitle, className = "" }) {
  return (
    <div className={cn("bg-card rounded-xl border border-border p-5 transition-all hover:shadow-md", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1.5">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Icon className="w-5 h-5 text-accent-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}