// @ts-nocheck
import { useEffect, useState } from "react";
import { appApi as api } from "@/api/appApi";
import { Plus, Pencil, Trash2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import FlightFormDialog from "@/components/FlightFormDialog";

export default function Flights() {
  /** @type {[any[], Function]} */
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  /** @type {[any, Function]} */
  const [editFlight, setEditFlight] = useState(null);
  /** @type {[string|null, Function]} */
  const [deleteId, setDeleteId] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (urlParams.get("new") === "true") setFormOpen(true);
  }, []);

  async function loadData() {
    setLoading(true);
    const data = await api.entities.Flight.list("-departure_date", 200);
    setFlights(data);
    setLoading(false);
  }

  const handleDelete = async () => {
    if (!deleteId) return;
    const ulds = await api.entities.ULDFishbox.filter({ flight_id: deleteId });
    for (const uld of ulds) {
      await api.entities.ULDFishbox.delete(uld.id);
    }
    await api.entities.Flight.delete(String(deleteId));
    setDeleteId(null);
    loadData();
  };

  const statusColors = {
    scheduled: "bg-blue-100 text-blue-700",
    departed: "bg-amber-100 text-amber-700",
    arrived: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flights</h1>
          <p className="text-muted-foreground text-sm mt-1">{flights.length} flights</p>
        </div>
        <Button onClick={() => { setEditFlight(null); setFormOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Flight
        </Button>
      </div>

      {flights.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Plane className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="mt-3 font-medium text-muted-foreground">No flights added yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Add your first flight to start</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>Flight Number</TableHead>
                   <TableHead>Airline</TableHead>
                   <TableHead>Origin</TableHead>
                   <TableHead>Destination</TableHead>
                   <TableHead>ETD</TableHead>
                   <TableHead>Weight Deadline</TableHead>
                   <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flights.map(f => (
                  <TableRow key={f.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{f.flight_number}</TableCell>
                     <TableCell>{f.airline || "—"}</TableCell>
                     <TableCell>{f.origin || "—"}</TableCell>
                     <TableCell>{f.destination || "—"}</TableCell>
                     <TableCell className="font-mono text-sm">{f.departure_date ? new Date(f.departure_date).toLocaleDateString('en-GB') : "—"}</TableCell>
                     <TableCell>{f.weight_deadline ? new Date(f.weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColors[f.status] || "bg-muted"}`}>
                        {f.status || "scheduled"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditFlight(f); setFormOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(f.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <FlightFormDialog open={formOpen} onOpenChange={setFormOpen} flight={editFlight} onSaved={loadData} onSuccess={loadData} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Flight?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the flight and unlink it from all associated ULDs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}