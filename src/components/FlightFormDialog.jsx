import { useState, useEffect } from "react";
import { appApi as api } from "@/api/appApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function FlightFormDialog({ open, onOpenChange, flight, onSaved, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    flight_number: "", airline: "", origin: "", destination: "",
    departure_date: "", weight_deadline: "", status: "scheduled"
  });

  useEffect(() => {
    if (flight) {
      setForm({
        flight_number: flight.flight_number || "",
        airline: flight.airline || "",
        origin: flight.origin || "",
        destination: flight.destination || "",
        departure_date: flight.departure_date || "",
        weight_deadline: flight.weight_deadline || "",
        status: flight.status || "scheduled"
      });
    } else {
      setForm({ flight_number: "", airline: "", origin: "OSL", destination: "", departure_date: "", weight_deadline: "", status: "scheduled" });
    }
  }, [flight, open]);

  const handleOriginChange = (value) => {
    const isOscc = value.toUpperCase() === "OSL";
    const today = new Date().toISOString().split('T')[0];
    setForm(p => ({
      ...p,
      origin: value.toUpperCase(),
      weight_deadline: isOscc ? `${today}T05:00:00` : p.weight_deadline
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (flight) {
      await api.entities.Flight.update(flight.id, form);
    } else {
      await api.entities.Flight.create(form);
    }
    setSaving(false);
    if (onSaved) onSaved();
    if (onSuccess) onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{flight ? "Edit Flight" : "Add Flight"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2">
            <Label>Flight Number *</Label>
            <Input value={form.flight_number} onChange={e => setForm(p => ({ ...p, flight_number: e.target.value }))} placeholder="e.g. KL1234" />
          </div>
          <div className="col-span-2">
            <Label>Airline</Label>
            <Input value={form.airline} onChange={e => setForm(p => ({ ...p, airline: e.target.value }))} placeholder="e.g. KLM" />
          </div>
          <div>
            <Label>Origin</Label>
            <Input value={form.origin} onChange={e => handleOriginChange(e.target.value)} placeholder="OSL" maxLength={4} />
          </div>
          <div>
            <Label>Destination</Label>
            <Input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value.toUpperCase() }))} placeholder="AMS" maxLength={4} />
          </div>
          <div>
            <Label>Departure Date *</Label>
            <Input type="date" value={form.departure_date} onChange={e => setForm(p => ({ ...p, departure_date: e.target.value }))} />
          </div>
          <div>
            <Label>Weight Deadline (time)</Label>
            <Input type="time" value={form.weight_deadline ? form.weight_deadline.slice(11, 16) : ""} onChange={e => {
              const today = new Date().toISOString().split('T')[0];
              setForm(p => ({ ...p, weight_deadline: e.target.value ? `${today}T${e.target.value}:00` : "" }));
            }} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="departed">Departed</SelectItem>
                <SelectItem value="arrived">Arrived</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.flight_number || !form.departure_date || saving}>
              {saving ? "Saving..." : flight ? "Update" : "Add Flight"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}