import { useEffect, useState } from "react";
import { appApi as api } from "@/api/appApi";
import { Link } from "react-router-dom";
import { Package, Plane, Weight, ArrowRight, Calendar } from "lucide-react";
import StatCard from "@/components/StatCard";

export default function Statistics() {
  /** @type {[any[], Function]} */
  const [ulds, setUlds] = useState([]);
  /** @type {[any[], Function]} */
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [u, f] = await Promise.all([
        api.entities.ULDFishbox.list("-created_date", 50),
        api.entities.Flight.list("-departure_date", 50),
      ]);
      setUlds(u);
      setFlights(f);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalGross = ulds.reduce((sum, u) => sum + (u.gross_weight || 0), 0);
  const totalNet = ulds.reduce((sum, u) => sum + (u.net_weight || 0), 0);
  const currentYear = new Date().getFullYear();
  const uldsThisYear = ulds.filter(u => {
    const createdDate = new Date(u.created_date);
    return createdDate.getFullYear() === currentYear;
  }).length;
  const recentUlds = ulds.slice(0, 5);

  return (
    <div className="space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistics</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of your fishbox ULD registrations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Package} label="Total ULDs" value={ulds.length} subtitle="Registered fishboxes" />
        <StatCard icon={Plane} label="Flights" value={flights.length} subtitle="Total flights" />
        <StatCard icon={Weight} label="Gross Weight" value={`${totalGross.toLocaleString()} kg`} subtitle="All ULDs combined" />
        <StatCard icon={Weight} label="Net Weight" value={`${totalNet.toLocaleString()} kg`} subtitle="Excluding tara" />
        <StatCard icon={Calendar} label={`ULDs ${currentYear}`} value={uldsThisYear} subtitle={`Built in ${currentYear}`} />
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Recent ULDs</h2>
          <Link to="/uld-overview" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recentUlds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No ULDs registered yet</p>
        ) : (
          <div className="space-y-2">
            {recentUlds.map((uld) => (
              <div key={uld.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-sm">{uld.uld_number || "No ULD #"}</p>
                  <p className="text-xs text-muted-foreground">{uld.flight_number || "No flight"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{uld.net_weight ? `${uld.net_weight} kg` : "—"}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground capitalize">
                    {uld.status || "registered"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}