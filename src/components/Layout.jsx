import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Plane, Menu, X, Fish, List, ClipboardList, Hammer, Scale, BarChart3, Layers, Package2, QrCode, Printer, LogOut, Database } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const primaryNavItems = [
  { path: "/", label: "ULD OVERVIEW", icon: BarChart3 },
  { path: "/uld-weighing", label: "ULD WEIGHING", icon: Scale },
  { path: "/uld-registration", label: "ULD REGISTRATION", icon: ClipboardList },
  { path: "/build", label: "BUILD", icon: Hammer },
  { path: "/loose-overview", label: "LOOSE", icon: Layers },
];

const secondaryNavItems = [
  { path: "/shipments", label: "SHIPMENTS", icon: List },
  { path: "/qr-net-replacement", label: "QR NET REPLACEMENT", icon: QrCode },
  { path: "/labels-to-terminal", label: "LABELS TO PRINT", icon: Printer },
  { path: "/data-migration", label: "SQL MIGRATION", icon: Database },
];

const navItems = [...primaryNavItems, { divider: true }, ...secondaryNavItems];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, appPublicSettings } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Nav Bar */}
      <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border sticky top-0 z-40">
        <div className="relative flex flex-col items-center px-4 pt-3 pb-0">

          <div className="hidden lg:flex absolute left-3 top-3 items-center gap-2 text-[11px]">
            <span className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-sidebar-foreground/80">
              {appPublicSettings?.auth_provider === 'local'
                ? 'Local mode'
                : (user?.email || user?.name || (appPublicSettings?.auth_provider === 'microsoft' ? 'Microsoft user' : 'Local user'))}
            </span>
            {user && (
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-md border border-sidebar-border px-2 py-1 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
                Sign out
              </button>
            )}
          </div>

          {/* Desktop Nav - two rows */}
          <div className="hidden lg:flex flex-col items-center gap-1 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-sidebar-foreground">MOWI AIR TOOL</span>
              <span className="text-lg font-bold text-sidebar-primary">Ω</span>
            </div>
            <nav className="flex items-center justify-center gap-1">
              {primaryNavItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== "/" && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <nav className="flex items-center justify-center gap-1">
              {secondaryNavItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== "/" && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/50 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/80"
                    )}
                  >
                    <item.icon className="w-3 h-3" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Mobile menu button */}
          <button className="lg:hidden absolute right-2 top-2 p-2 text-sidebar-foreground/70 hover:text-white" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 right-0 bg-sidebar text-sidebar-foreground p-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fish className="w-5 h-5 text-sidebar-primary" />
                <span className="font-semibold text-white">MOWI AIR TOOL</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-sidebar-foreground/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/80">
              <span className="truncate">{appPublicSettings?.auth_provider === 'local' ? 'Local mode' : (user?.email || user?.name || (appPublicSettings?.auth_provider === 'microsoft' ? 'Microsoft user' : 'Local user'))}</span>
              {user && (
                <button onClick={logout} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-sidebar-accent/50">
                  <LogOut className="w-3 h-3" /> Sign out
                </button>
              )}
            </div>
            <nav className="space-y-1">
              {navItems.map((item, i) => {
                if (item.divider) return <div key={i} className="my-2 border-t border-sidebar-border" />;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}