import { useState, useEffect } from "react";
import { appApi as api } from "@/api/appApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function ULDFormDialog({ open, onOpenChange, uld, onSaved }) {
  const [flights, setFlights] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    uld_number: "", flight_id: "", flight_number: "",
    gross_weight: "", tara_weight: "", net_weight: "",
    pieces: "", species: "", shipper: "", consignee: "",
    awb_number: "", status: "registered", notes: "", uld_type: ""
  });

  useEffect(() => {
    api.entities.Flight.list("-departure_date", 100).then(setFlights);
  }, []);

  useEffect(() => {
    if (uld) {
      setForm({
        uld_number: uld.uld_number || "",
        flight_id: uld.flight_id || "",
        flight_number: uld.flight_number || "",
        gross_weight: uld.gross_weight || "",
        tara_weight: uld.tara_weight || "",
        net_weight: uld.net_weight || "",
        pieces: uld.pieces || "",
        species: uld.species || "",
        shipper: uld.shipper || "",
        consignee: uld.consignee || "",
        awb_number: uld.awb_number || "",
        status: uld.status || "registered",
        notes: uld.notes || ""
      });
    } else {
      setForm({
        uld_number: "", flight_id: "", flight_number: "",
        gross_weight: "", tara_weight: "", net_weight: "",
        pieces: "", species: "", shipper: "", consignee: "",
        awb_number: "", status: "registered", notes: "", uld_type: ""
      });
    }
  }, [uld, open]);

  const handleChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calculate net weight
      if (field === "gross_weight" || field === "tara_weight") {
        const gross = parseFloat(field === "gross_weight" ? value : next.gross_weight) || 0;
        const tara = parseFloat(field === "tara_weight" ? value : next.tara_weight) || 0;
        next.net_weight = gross > 0 && tara > 0 ? (gross - tara).toFixed(1) : "";
      }
      // Set flight number when flight selected
      if (field === "flight_id") {
        const flight = flights.find(f => f.id === value);
        next.flight_number = flight ? flight.flight_number : "";
      }
      // Set tara weight based on ULD type
      if (field === "uld_type") {
        const taraDefaults = { FQA: 70, PLA: 100, PAG: 110 };
        if (taraDefaults[value]) {
          next.tara_weight = String(taraDefaults[value]);
          if (next.gross_weight) {
            const gross = parseFloat(next.gross_weight);
            next.net_weight = gross > 0 ? (gross - taraDefaults[value]).toFixed(1) : "";
          }
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      gross_weight: form.gross_weight ? parseFloat(form.gross_weight) : null,
      tara_weight: form.tara_weight ? parseFloat(form.tara_weight) : null,
      net_weight: form.net_weight ? parseFloat(form.net_weight) : null,
      pieces: form.pieces ? parseInt(form.pieces) : null,
      uld_type: form.uld_type || null,
    };
    if (uld) {
      await api.entities.ULDFishbox.update(uld.id, data);
    } else {
      await api.entities.ULDFishbox.create(data);
    }
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{uld ? "Edit ULD Fishbox" : "Register ULD Fishbox"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="sm:col-span-2">
            <Label>ULD Number *</Label>
            <Input value={form.uld_number} onChange={e => handleChange("uld_number", e.target.value)} placeholder="e.g. AKE12345KL" />
          </div>
          <div className="sm:col-span-2">
            <Label>Flight</Label>
            <Select value={form.flight_id} onValueChange={v => handleChange("flight_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select a flight" /></SelectTrigger>
              <SelectContent>
                {flights.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flight_number} — {f.origin || "?"} → {f.destination || "?"} ({f.departure_date})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>AWB Number</Label>
            <Input value={form.awb_number} onChange={e => handleChange("awb_number", e.target.value)} placeholder="Air Waybill" />
          </div>
          <div>
            <Label>Pieces</Label>
            <Input type="number" value={form.pieces} onChange={e => handleChange("pieces", e.target.value)} placeholder="Number of boxes" />
          </div>
          <div>
            <Label>Gross Weight (kg)</Label>
            <Input type="number" step="0.1" value={form.gross_weight} onChange={e => handleChange("gross_weight", e.target.value)} placeholder="0.0" />
          </div>
          <div>
            <Label>Tara Weight (kg)</Label>
            <Input type="number" step="0.1" value={form.tara_weight} onChange={e => handleChange("tara_weight", e.target.value)} placeholder="0.0" />
          </div>
          <div>
            <Label>Net Weight (kg)</Label>
            <Input value={form.net_weight} readOnly className="bg-muted" placeholder="Auto-calculated" />
          </div>
          <div>
            <Label>ULD Type</Label>
            <Select value={form.uld_type} onValueChange={v => handleChange("uld_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PMC">PMC</SelectItem>
                <SelectItem value="PAG">PAG</SelectItem>
                <SelectItem value="AKE">AKE</SelectItem>
                <SelectItem value="AKL">AKL</SelectItem>
                <SelectItem value="FQA">FQA</SelectItem>
                <SelectItem value="QKE">QKE</SelectItem>
                <SelectItem value="P6P">P6P</SelectItem>
                <SelectItem value="PAJ">PAJ</SelectItem>
                <SelectItem value="PLA">PLA</SelectItem>
                <SelectItem value="PLB">PLB</SelectItem>
                <SelectItem value="PYB">PYB</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Species</Label>
            <Input value={form.species} onChange={e => handleChange("species", e.target.value)} placeholder="e.g. Salmon, Cod" />
          </div>
          <div>
            <Label>Shipper</Label>
            <Input value={form.shipper} onChange={e => handleChange("shipper", e.target.value)} />
          </div>
          <div>
            <Label>Consignee</Label>
            <Input value={form.consignee} onChange={e => handleChange("consignee", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => handleChange("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="registered">Registered</SelectItem>
                <SelectItem value="loaded">Loaded</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => handleChange("notes", e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.uld_number || saving}>
              {saving ? "Saving..." : uld ? "Update" : "Register"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}