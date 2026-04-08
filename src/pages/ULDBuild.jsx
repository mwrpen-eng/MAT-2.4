// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { appApi as api } from "@/api/appApi";
import { Search, RefreshCw, CheckCircle, Printer, Plane, Hammer, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Max structural payload (kg) per ULD type
const ULD_MAX_WEIGHTS = {
  PMC: 6033,
  PAG: 6033,
  PAJ: 6033,
  PLA: 6033,
  PLB: 6033,
  PYB: 4626,
  P6P: 4626,
  FQA: 3175,
  AKE: 1588,
  AKL: 1588,
  QKE: 1588,
};

export default function ULDBuild() {
  const [shipments, setShipments] = useState([]);
  const [flights, setFlights] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [uncombining, setUncombining] = useState(null);
  const [editingUldNumber, setEditingUldNumber] = useState(null);
  const [uldNumberValue, setUldNumberValue] = useState("");
  const printRef = useRef(null);
  const loadDataTimeoutRef = useRef(null);
  const [editingNetWeight, setEditingNetWeight] = useState(null);
  const [netWeightValue, setNetWeightValue] = useState("");
  const [editingTaraWeight, setEditingTaraWeight] = useState(null);
  const [taraWeightValue, setTaraWeightValue] = useState("");

  useEffect(() => { loadData(); }, []);

  const ensureArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.results)) return value.results;
    return [];
  };

  async function loadData() {
    setLoadError("");
    setLoading(true);
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
    ]);

    try {
      const [shipmentsResponse, flightsResponse] = await Promise.all([
        withTimeout(api.entities.ULDFishbox.list("-created_date", 500), 15000, 'ULD weighing shipments'),
        withTimeout(api.entities.Flight.list("-created_date", 100), 15000, 'Flights'),
      ]);

      const data = ensureArray(shipmentsResponse);
      const flightData = ensureArray(flightsResponse);
      const flightMap = flightData.reduce((acc, f) => { acc[f.flight_number] = f; return acc; }, {});
      setFlights(flightMap);

      // Auto-split combined shipments (sequential to avoid rate limits)
      const combined = data.filter(/** @type {(s: any) => boolean} */(s => s.awb_number && s.awb_number.includes(" + ")));
      if (combined.length > 0) {
        for (const shipment of combined) {
          const awbList = shipment.awb_number.split(" + ").map(s => s.trim()).filter(Boolean);
          const orderList = (shipment.order_number || "").split(" + ").map(s => s.trim()).filter(Boolean);
          const boxesPerShipment = Math.floor((shipment.box_count || 0) / awbList.length);
          const remainder = (shipment.box_count || 0) % awbList.length;
          const newRecords = awbList.map((awb, index) => ({
            awb_number: awb,
            order_number: orderList[index] || "",
            box_count: boxesPerShipment + (index < remainder ? 1 : 0),
            uld_number: shipment.uld_number || undefined,
            uld_type: shipment.uld_type,
            contour: shipment.contour,
            tender: shipment.tender,
            service_provider: shipment.service_provider,
            destination_name: shipment.destination_name,
            destination_code: shipment.destination_code,
            air_routing: shipment.air_routing,
            comment: shipment.comment,
            comment_2: shipment.comment_2,
            comment_3: shipment.comment_3,
            flight_id: shipment.flight_id,
            flight_number: shipment.flight_number,
            status: shipment.status,
            location: shipment.location,
            notes: "Auto-split from merged shipment"
          }));
          await api.entities.ULDFishbox.delete(shipment.id);
          await new Promise(r => setTimeout(r, 300));
          for (const record of newRecords) {
            await api.entities.ULDFishbox.create(record);
            await new Promise(r => setTimeout(r, 200));
          }
        }
        const freshData = ensureArray(await api.entities.ULDFishbox.list("-created_date", 500));
        const withUld = freshData.filter(s => s.uld_number && (!s.awb_number || !s.awb_number.startsWith('105')));
        setShipments(withUld);
      } else {
        const withUld = data.filter(s => s.uld_number && (!s.awb_number || !s.awb_number.startsWith('105')));
        setShipments(withUld);
      }
    } catch (error) {
      console.error('Failed to load ULD weighing data', error);
      setShipments([]);
      setFlights({});
      setLoadError('Failed to load weighing data');
      toast.error('Failed to load weighing data');
    } finally {
      setLoading(false);
    }
  }

  const isCombined = (record) => {
    return record.awb_number && record.awb_number.includes(" + ");
  };

  const handleChange = (id, field, value) => {
    setEdits(prev => {
      const current = prev[id] || {};
      const next = { ...current, [field]: value };
      // Auto-calc gross weight from net + tara
      const net = parseFloat(field === "net_weight" ? value : (next.net_weight ?? "")) || 0;
      const tara = parseFloat(field === "tara_weight" ? value : (next.tara_weight ?? "")) || 0;
      if (net > 0 && tara > 0) {
        next.gross_weight = (net + tara).toFixed(1);
      } else {
        next.gross_weight = "";
      }
      return { ...prev, [id]: next };
    });
  };

  const saveNetWeight = (id) => {
    const val = parseFloat(netWeightValue) || 0;
    handleChange(id, "net_weight", val);
    api.entities.ULDFishbox.update(id, { net_weight: val });
    setEditingNetWeight(null);
  };

  const saveTaraWeight = (id) => {
    const val = parseFloat(taraWeightValue) || 0;
    handleChange(id, "tara_weight", val);
    api.entities.ULDFishbox.update(id, { tara_weight: val });
    setEditingTaraWeight(null);
  };

  const handleCompleteWeighing = async (shipment) => {
    const e = edits[shipment.id] || {};
    setSaving(prev => ({ ...prev, [shipment.id]: true }));
    
    // Calculate individual weights for this shipment
    const net = parseFloat(e.net_weight !== undefined ? e.net_weight : (shipment.net_weight || 0)) || 0;
    
    // For tara: use the same display logic as the input field
    // First check own edits, then own DB value, then first-of-ULD edits/DB value, then PMC default
    const firstOfUld = shipments.find(s => s.uld_number === shipment.uld_number);
    const isFirst = !firstOfUld || firstOfUld.id === shipment.id;
    let tara;
    if (isFirst) {
      // Mirror the input value logic for the first row
      const taraRaw = e.tara_weight !== undefined ? e.tara_weight
        : (shipment.tara_weight !== undefined && shipment.tara_weight !== null ? shipment.tara_weight
        : (shipment.uld_type === "PMC" ? 120 : ""));
      tara = parseFloat(taraRaw) || 0;
    } else {
      // Non-first row: inherit from first row's edits or DB value
      const fe = edits[firstOfUld.id] || {};
      const taraRaw = fe.tara_weight !== undefined ? fe.tara_weight
        : (firstOfUld.tara_weight !== undefined && firstOfUld.tara_weight !== null ? firstOfUld.tara_weight
        : (firstOfUld.uld_type === "PMC" ? 120 : 0));
      tara = parseFloat(taraRaw) || 0;
    }
    const gross = net + tara;
    
    // Update only this shipment with individual weights
    await api.entities.ULDFishbox.update(shipment.id, {
      status: "loaded",
      gross_weight: gross,
      tara_weight: tara,
      net_weight: net,
    });
    
    setSaving(prev => ({ ...prev, [shipment.id]: false }));
    toast.success(`Shipment ${shipment.awb_number} marked as loaded`);
    if (loadDataTimeoutRef.current) clearTimeout(loadDataTimeoutRef.current);
    loadDataTimeoutRef.current = setTimeout(loadData, 500);
  };

  const handleUncompleteWeighing = async (shipment) => {
    setSaving(prev => ({ ...prev, [shipment.id]: true }));
    
    // Reset status only, keep weights
    await api.entities.ULDFishbox.update(shipment.id, {
      status: "registered",
    });
    
    setSaving(prev => ({ ...prev, [shipment.id]: false }));
    toast.success(`Shipment ${shipment.awb_number} marked as not loaded`);
    if (loadDataTimeoutRef.current) clearTimeout(loadDataTimeoutRef.current);
    loadDataTimeoutRef.current = setTimeout(loadData, 500);
  };

  const saveUldNumber = (id) => {
    api.entities.ULDFishbox.update(id, { uld_number: uldNumberValue || null });
    setEditingUldNumber(null);
  };

  const handlePrintTag = (shipment) => {
    // Find all shipments with the same ULD number
    const sameUldShipments = shipments.filter(s => 
      s.uld_number && s.uld_number === shipment.uld_number
    );
    
    // Calculate aggregated weights
    let totalNet = 0;
    let totalTara = 0;
    let totalBoxes = 0;
    const awbNumbers = [];
    const orderNumbers = [];
    
    sameUldShipments.forEach(s => {
      const e = edits[s.id] || {};
      const net = parseFloat(e.net_weight !== undefined ? e.net_weight : (s.net_weight || 0)) || 0;
      const tara = parseFloat(e.tara_weight !== undefined ? e.tara_weight : (s.tara_weight || 0)) || 0;
      totalNet += net;
      totalTara += tara;
      totalBoxes += (s.box_count || 0);
      if (s.awb_number) awbNumbers.push(s.awb_number);
      if (s.order_number) orderNumbers.push(s.order_number);
    });
    
    const totalGross = totalNet + totalTara;
    const flightInfo = flights[shipment.flight_number];
    const departureDate = flightInfo?.departure_date ? new Date(flightInfo.departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "—";
    
    const qrData = encodeURIComponent(`${shipment.uld_type || 'PMC'}${shipment.uld_number || ''}|FLIGHT:${shipment.flight_number || shipment.air_routing || ''}|DATE:${flightInfo?.departure_date || ''}`);
    const qrUrl = `https://quickchart.io/qr?text=${qrData}&size=150`;

    const win = window.open("", "_blank");
    const generateTag = () => `
      <html><head><title>ULD Tag</title>
      <style>
        @page { size: 148mm 210mm; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 8mm; margin: 0; width: 148mm; height: 210mm; }
        .tag { border: 3px solid #000; display: flex; flex-direction: column; height: 100%; }
        .header { text-align: center; padding: 8px 0; border-bottom: 3px solid #000; }
        .header img { max-height: 50px; margin-bottom: 4px; }
        .section { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 2px solid #000; min-height: 30px; }
        .section.full { grid-template-columns: 1fr; }
        .section.triple { grid-template-columns: repeat(3, 1fr); }
        .cell { border-right: 2px solid #000; padding: 6px 8px; display: flex; flex-direction: column; justify-content: center; font-size: 11px; }
        .cell:last-child { border-right: none; }
        .cell-label { font-size: 10px; color: #666; font-weight: 600; }
        .cell-value { font-size: 16px; font-weight: bold; color: #000; }
        .section.compact .cell-value { font-size: 13px; }
        .qr-bottom { display: flex; align-items: center; justify-content: center; border: 2px solid #000; padding: 4px; }
        .id-code { font-size: 24px; font-weight: 900; }
        .section.main { position: relative; }
      </style></head><body>
      <div class="tag">
        <div class="header">
          <img src="/mowi-logo.svg" alt="MOWI" />
        </div>
        
        <!-- ID Code -->
        <div class="section main" style="grid-template-columns: 1.2fr 0.5fr;">
          <div class="cell">
            <div class="cell-label">ID CODE</div>
            <div style="font-size: 28px; font-weight: 900;">${shipment.uld_type || 'PMC'} ${shipment.uld_number || '—'}</div>
          </div>
          <div class="cell" style="border-right: none; text-align: center;">
            <div class="cell-label">Destination</div>
            <div class="cell-value" style="font-size: 28px;">${shipment.destination_code || 'NRT'}</div>
          </div>
        </div>
        
        <!-- Net Weight -->
        <div class="section full">
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Net Weight (Kg)</div>
            <div class="cell-value" style="font-size: 24px;">${totalNet.toFixed(0)}</div>
          </div>
        </div>
        
        <!-- Tara & Contour -->
        <div class="section">
          <div class="cell">
            <div class="cell-label">Tare Weight (Kg)</div>
            <div class="cell-value">${totalTara.toFixed(0)}</div>
          </div>
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Contour</div>
            <div class="cell-value">${shipment.contour || 'P'}</div>
          </div>
        </div>
        
        <!-- Total Weight & Signature -->
        <div class="section">
          <div class="cell" style="grid-column: span 2;">
            <div class="cell-label">Total Weight (Kg)</div>
            <div style="font-size: 22px; font-weight: 900;">${totalGross.toFixed(0)}</div>
          </div>
        </div>
        <div class="section">
          <div class="cell" style="grid-column: span 2; border-right: none;">
            <div class="cell-label">Weight correctly established</div>
            <div style="text-align: right; margin-top: 4px; font-size: 10px;">Signature: _____________</div>
          </div>
        </div>
        
        <!-- Loaded At -->
        <div class="section triple">
          <div class="cell">
            <div class="cell-label">Loaded at:</div>
            <div class="cell-value" style="font-size: 14px;">OSL</div>
          </div>
          <div class="cell">
            <div class="cell-label">Flight no:</div>
            <div class="cell-value" style="font-size: 12px;">${shipment.flight_number || '—'}</div>
          </div>
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Position on a/c</div>
          </div>
        </div>
        
        <!-- 1. Transfer -->
        <div class="section triple">
          <div class="cell">
            <div class="cell-label">1. Transfer</div>
            <div class="cell-value" style="font-size: 14px;">${(sameUldShipments[0]?.comment_2 || '').substring(0, 3).toUpperCase() || '—'}</div>
          </div>
          <div class="cell">
            <div class="cell-label">Flight no:</div>
            <div class="cell-value" style="font-size: 12px;">${(() => {
             const airRouting = sameUldShipments[0]?.air_routing || '';
             const parts = airRouting.split(',').map(s => s.trim());
             return parts[1] || '—';
           })()}</div>
          </div>
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Position on a/c</div>
          </div>
        </div>
        
        <!-- 2. Transfer -->
        <div class="section triple">
          <div class="cell">
            <div class="cell-label">2. Transfer</div>
            <div class="cell-value" style="font-size: 14px;">${(sameUldShipments[0]?.comment_3 || '').toUpperCase() || '—'}</div>
          </div>
          <div class="cell">
            <div class="cell-label">Flight no:</div>
            <div class="cell-value" style="font-size: 12px;">${(() => {
             const airRouting = sameUldShipments[0]?.air_routing || '';
             const parts = airRouting.split(',').map(s => s.trim());
             return parts[2] || '—';
           })()}</div>
          </div>
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Position on a/c</div>
          </div>
        </div>
        
        <!-- Contents & ULD Built -->
        <div class="section">
          <div class="cell">
            <div class="cell-label">Contents:</div>
            <div class="cell-value">C</div>
          </div>
          <div class="cell" style="border-right: none;">
            <div class="cell-label">ULD correctly built up:</div>
            <div style="margin-top: 4px; font-size: 10px;">Signature: _____________</div>
          </div>
        </div>
        
        <!-- Orders -->
        <div class="section full">
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Order Numbers:</div>
            <div class="cell-value" style="font-size: 16px; font-weight: 600;">${orderNumbers.join(', ') || '—'}</div>
          </div>
        </div>
        
        <!-- AWBs -->
        <div class="section full">
          <div class="cell" style="border-right: none;">
            <div class="cell-label">AWBs:</div>
            <div class="cell-value" style="font-size: 18px; font-weight: 700;">${awbNumbers.join(', ') || '—'}</div>
          </div>
        </div>
        
        <!-- Remarks -->
        <div class="section full">
          <div class="cell" style="border-right: none;">
            <div class="cell-label">Remarks:</div>
            <div class="cell-value" style="font-size: 13px; min-height: 20px;">${shipment.notes || 'PES/COL'}</div>
          </div>
        </div>
        
        <!-- QR Code Bottom -->
        <div style="border-top: 2px solid #000; padding: 6px; display: flex; justify-content: center;">
          <div class="qr-bottom">
            <img src="${qrUrl}" style="width: 100px; height: 100px;" alt="QR Code" />
          </div>
        </div>
      </div>
      </body></html>`;
    const html = generateTag();
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const filtered = shipments.filter(s =>
    s.uld_number &&
    (!search || [s.awb_number, s.order_number, s.uld_number, s.destination_name, s.service_provider]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()))
  );

  // Group by flight
  const groupedByFlight = filtered.reduce((acc, s) => {
    const key = s.flight_number || s.air_routing || "No Flight Assigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const flightKeys = Object.keys(groupedByFlight)
    .filter(fn => {
      if (fn.startsWith('SV') || fn.startsWith('SQ') || fn === 'OSCC FLIGHT' || fn === 'OSCC' || fn === 'GPC' || fn === 'LOOSE') return false;
      const recs = groupedByFlight[fn] || [];
      const isComplete = recs.length > 0 && recs.every(s => s.status === "loaded" && s.gross_weight != null && s.tara_weight != null && s.net_weight != null);
      if (isComplete) {
        const etd = flights[fn]?.departure_date;
        if (etd && new Date(etd) < twoDaysAgo) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const deadlineA = flights[a]?.weight_deadline ? new Date(flights[a].weight_deadline).getTime() : Infinity;
      const deadlineB = flights[b]?.weight_deadline ? new Date(flights[b].weight_deadline).getTime() : Infinity;
      return deadlineA - deadlineB;
    });

    const statusColors = {
    registered: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    in_transit: "bg-purple-100 text-purple-700",
    delivered: "bg-gray-100 text-gray-600"
  };

  const GROUP_COLORS = ["#7A2535", "#1A6B35", "#A0520A", "#5A3070", "#1A6060", "#7A6800", "#4A3A7A", "#266050", "#7A3810", "#1A4A6A"];

  const getGroupColor = (groupKey) => {
    if (!groupKey) return null;
    const hash = groupKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return GROUP_COLORS[hash % GROUP_COLORS.length];
  };

  const getUldGroupKey = (shipment) => {
    return shipment.uld_group_id || null;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Hammer className="w-6 h-6" /> ULD WEIGHING</h1>
          <p className="text-muted-foreground text-sm mt-1">Enter tara/net weight, complete weighing and print tags</p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>



      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {flightKeys.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Plane className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">No shipments found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {flightKeys.map(flight => (
            <div key={flight} className="rounded-xl border border-border overflow-hidden bg-transparent">
              {/* Flight Header */}
              <div className="bg-muted/40 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="font-semibold text-lg">Flight {flight}</h2>
                      {flights[flight]?.destination && (
                        <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded">{flights[flight].destination}</span>
                      )}
                      {flights[flight]?.departure_date && (
                        <span className="text-sm font-semibold text-foreground">
                          ETD {new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {flights[flight]?.weight_deadline && (
                        <span className="text-sm font-bold text-red-500 px-3 py-1 rounded shadow-[0_0_12px_rgba(239,68,68,0.8)]">
                          Deadline: {new Date(flights[flight].weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {(() => {
                        const flightShipments = groupedByFlight[flight];
                        const allComplete = flightShipments.length > 0 && flightShipments.every(s => s.status === "loaded" && s.gross_weight != null && s.tara_weight != null && s.net_weight != null);
                        if (allComplete) {
                          return (
                            <span className="text-sm font-bold text-green-600 px-3 py-1 rounded shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-500/40 bg-green-500/10">
                              ✓ WEIGHING COMPLETE
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{groupedByFlight[flight].length} shipments</p>
              </div>

              {/* Shipments Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-32">ULD Number</TableHead>
                      <TableHead className="w-20">ULD Type</TableHead>
                      <TableHead className="w-24">AWB</TableHead>
                      <TableHead className="w-20">Order #</TableHead>
                      <TableHead className="w-16">Boxes</TableHead>
                      <TableHead className="w-20">Net (kg)</TableHead>
                      <TableHead className="w-20">Tara (kg)</TableHead>
                      <TableHead className="w-24">Gross (kg)</TableHead>
                      <TableHead className="w-24">Destination</TableHead>
                      <TableHead className="w-40">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...groupedByFlight[flight]].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)).map((s, idx) => {
                const e = edits[s.id] || {};
                const isDirty = !!edits[s.id];
                const netDisplay = e.net_weight !== undefined ? e.net_weight : (s.net_weight ?? "");
                const isFirstWithUld = !filtered.slice(0, idx).some(prev => prev.uld_number === s.uld_number);
                return (
                  <TableRow key={s.id} className={isDirty ? "bg-primary/10" : "hover:bg-muted/20"} style={getUldGroupKey(s) ? { borderLeft: `4px solid ${getGroupColor(getUldGroupKey(s))}` } : {}}>
                    <TableCell className="font-mono font-bold text-lg">
                      <div className="flex items-center gap-2">
                        {getUldGroupKey(s) && (
                          <div className="w-1.5 h-6 rounded" style={{ backgroundColor: getGroupColor(getUldGroupKey(s)) }}></div>
                        )}
                        {editingUldNumber === s.id ? (
                          <div className="flex gap-1 items-center">
                            <input
                              autoFocus
                              className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground"
                              value={uldNumberValue}
                              onChange={e => setUldNumberValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveUldNumber(s.id); if (e.key === "Escape") setEditingUldNumber(null); }}
                            />
                            <button onClick={() => saveUldNumber(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                            <button onClick={() => setEditingUldNumber(null)} className="text-xs text-muted-foreground">✕</button>
                          </div>
                        ) : (
                          <>
                            <span
                              onClick={() => { setEditingUldNumber(s.id); setUldNumberValue(s.uld_number || ""); }}
                              className="cursor-pointer text-xs px-2 py-1 rounded transition-colors bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Click to edit ULD number"
                            >
                              {s.uld_number || "+ ULD #"}
                            </span>
                            {s.uld_number && (
                              <Hammer className="w-3.5 h-3.5 text-green-500 animate-pulse drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                            )}
                          </>
                        )}
                        {(isCombined(s) || getUldGroupKey(s)) && (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                            Combined
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const uldType = s.uld_type || shipments.find(x => x.uld_number === s.uld_number && x.uld_type)?.uld_type || 'PMC';
                        return (
                          <Badge variant="secondary" className="text-xs">
                            {uldType}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm">{s.awb_number || "—"}</span>
                        {s.awb_number && (
                          <button onClick={() => { navigator.clipboard.writeText(s.awb_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{s.order_number || "—"}</span>
                        {s.order_number && (
                          <button onClick={() => { navigator.clipboard.writeText(s.order_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{s.box_order_1 ?? s.box_count ?? "—"}</TableCell>
                    <TableCell>
                      {editingNetWeight === s.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            autoFocus
                            type="number"
                            step="0.1"
                            className="border border-border rounded px-2 py-0.5 text-xs w-20 bg-background text-foreground text-right"
                            value={netWeightValue}
                            onChange={e => setNetWeightValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveNetWeight(s.id); if (e.key === "Escape") setEditingNetWeight(null); }}
                          />
                          <button onClick={() => saveNetWeight(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                          <button onClick={() => setEditingNetWeight(null)} className="text-xs text-muted-foreground">✕</button>
                        </div>
                      ) : (
                        <span
                          onClick={() => { setEditingNetWeight(s.id); setNetWeightValue(e.net_weight !== undefined ? e.net_weight : (s.net_weight ?? "")); }}
                          className="cursor-pointer text-xs px-2 py-1 rounded transition-colors bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Click to edit net weight"
                        >
                          {(e.net_weight !== undefined ? e.net_weight : s.net_weight) ?? "+ Net"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingTaraWeight === s.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            autoFocus
                            type="number"
                            step="0.1"
                            className="border border-border rounded px-2 py-0.5 text-xs w-20 bg-background text-foreground text-right"
                            value={taraWeightValue}
                            onChange={e => setTaraWeightValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveTaraWeight(s.id); if (e.key === "Escape") setEditingTaraWeight(null); }}
                          />
                          <button onClick={() => saveTaraWeight(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                          <button onClick={() => setEditingTaraWeight(null)} className="text-xs text-muted-foreground">✕</button>
                        </div>
                      ) : (
                        <span
                          onClick={() => { setEditingTaraWeight(s.id); setTaraWeightValue(e.tara_weight !== undefined ? e.tara_weight : (s.tara_weight !== undefined && s.tara_weight !== null ? s.tara_weight : (() => { const defaults = { PMC: 120, FQA: 70, PLA: 100, PAG: 110 }; return defaults[s.uld_type] || ""; })())); }}
                          className="cursor-pointer text-xs px-2 py-1 rounded transition-colors bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Click to edit tara weight"
                        >
                          {(e.tara_weight !== undefined ? e.tara_weight : s.tara_weight) ?? "+ Tara"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const gross = parseFloat(e.gross_weight !== undefined ? e.gross_weight : (s.gross_weight ?? "")) || 0;
                        const effectiveUldType = s.uld_type || shipments.find(x => x.uld_number === s.uld_number && x.uld_type)?.uld_type || 'PMC';
                        const maxW = ULD_MAX_WEIGHTS[effectiveUldType];
                        const exceeded = maxW && gross > 0 && gross > maxW;
                        return (
                          <div className="flex items-center gap-1">
                            <Input
                              readOnly
                              className={`h-8 w-24 text-sm ${exceeded ? "bg-red-100 border-red-500 text-red-700 font-bold shadow-[0_0_8px_rgba(239,68,68,0.7)]" : "bg-muted"}`}
                              placeholder="Auto"
                              value={gross || ""}
                            />
                            {exceeded && (
                              <div title={`Exceeds max ${maxW} kg for ${s.uld_type}`}>
                                <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse drop-shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {s.destination_code ? <span className="font-mono font-semibold text-primary">{s.destination_code}</span> : "—"}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        {s.status === "loaded" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300 text-xs justify-center">
                            <CheckCircle className="w-3 h-3 mr-1" /> Weighted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs justify-center text-muted-foreground">
                            Pending
                          </Badge>
                        )}
                        <div className="flex items-center gap-1">
                          {s.status === "loaded" && (s.net_weight || s.gross_weight) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 gap-1 text-xs text-orange-600 hover:text-orange-700 flex-1"
                              disabled={saving[s.id]}
                              onClick={() => handleUncompleteWeighing(s)}
                            >
                              <RefreshCw className={`w-3 h-3 ${saving[s.id] ? 'animate-spin' : ''}`} />
                              {saving[s.id] ? "..." : "Undo"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs flex-1"
                              disabled={saving[s.id] || !netDisplay}
                              onClick={() => handleCompleteWeighing(s)}
                              title={!netDisplay ? "Enter net weight first" : "Mark as complete"}
                            >
                              <CheckCircle className="w-3 h-3" />
                              {saving[s.id] ? "..." : "Weighing Complete"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => handlePrintTag(s)}
                            title="Print Tag"
                          >
                            <Printer className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                  })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}