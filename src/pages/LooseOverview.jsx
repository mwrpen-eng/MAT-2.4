// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { toast } from "sonner";
import { appApi as api } from "@/api/appApi";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { RefreshCw, Package, Plane, Plus, Trash2, Copy, ArrowRightCircle, Printer, Download } from "lucide-react";
import * as XLSX from 'xlsx-js-style';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import FlightFormDialog from "@/components/FlightFormDialog";

const LOOSE_PREFIXES = ["217","784","501","172","618","898","999","205","065","695","550","406","615","105","057","074","117","700","125"];

// OSCC AWB prefixes that should be grouped under OSCC FLIGHT
const OSCC_PREFIXES = ["217", "784", "501", "172", "618", "898", "999", "205", "065", "695", "550", "235"];

// TRUCK AWB prefixes that should be grouped under TRUCK
const TRUCK_PREFIXES = ["125", "784"];



// Get tomorrow's date formatted
const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function LooseOverview() {
  const urlParams = new URLSearchParams(window.location.search);
  const highlightId = urlParams.get('shipment');
  const highlightRef = useRef(null);
  const [shipments, setShipments] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [flightOrder, setFlightOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('looseFlightOrder')) || {};
    } catch {
      return {};
    }
  });
  const [flightGroupOrder, setFlightGroupOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('looseFlightGroupOrder')) || [];
    } catch {
      return [];
    }
  });
  const [flights, setFlights] = useState({});
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationValue, setLocationValue] = useState("");
  const [editingETA, setEditingETA] = useState(null);
  const [etaValue, setEtaValue] = useState("");
  const [editingBoxes, setEditingBoxes] = useState(null);
  const [boxesValue, setBoxesValue] = useState(0);

  const [assigningOssc, setAssigningOssc] = useState(false);
  const [flightDialogOpen, setFlightDialogOpen] = useState(false);
  const [editingTransferDate, setEditingTransferDate] = useState(null);
  const [transferDateValue, setTransferDateValue] = useState("");
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [deadlineValue, setDeadlineValue] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [addingFlight, setAddingFlight] = useState(null);
  const [newAwb, setNewAwb] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [newDestinationName, setNewDestinationName] = useState('');
  const [newDestinationCode, setNewDestinationCode] = useState('');
  const [newServiceProvider, setNewServiceProvider] = useState('');
  const [sealNr, setSealNr] = useState('');
  const [deletingFlight, setDeletingFlight] = useState(null);
  const [truckPlates, setTruckPlates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('truckPlates')) || {}; } catch { return {}; }
  });
  const [flightDestinations, setFlightDestinations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('flightDestinations')) || {}; } catch { return {}; }
  });
  const [editingDestination, setEditingDestination] = useState(null);
  const [destinationValue, setDestinationValue] = useState("");
  const [editingPlate, setEditingPlate] = useState(null);
  const [plateValue, setPlateValue] = useState("");
  const [fetchingETA, setFetchingETA] = useState(false);
  const [editingFlightName, setEditingFlightName] = useState(null);
  const [flightNameValue, setFlightNameValue] = useState("");
  const [hiddenFlights, setHiddenFlights] = useState(() => {
    try { return JSON.parse(localStorage.getItem('looseHiddenFlights')) || []; } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('looseFlightOrder', JSON.stringify(flightOrder));
  }, [flightOrder]);

  useEffect(() => {
    localStorage.setItem('looseFlightGroupOrder', JSON.stringify(flightGroupOrder));
  }, [flightGroupOrder]);

  useEffect(() => {
    localStorage.setItem('truckPlates', JSON.stringify(truckPlates));
  }, [truckPlates]);

  useEffect(() => {
    localStorage.setItem('flightDestinations', JSON.stringify(flightDestinations));
  }, [flightDestinations]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [shipments]);

  async function loadData() {
    const scrollY = window.scrollY;
    setLoading(true);
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
    ]);
    try {
      localStorage.removeItem('looseFlightOrder');
      const data = await withTimeout(api.entities.ULDFishbox.list("-created_date", 1000), 15000, 'Loose shipments');
      const flightData = await withTimeout(api.entities.Flight.list("-created_date", 100), 15000, 'Flights');
      const flightMap = flightData.reduce((acc, f) => { acc[f.flight_number] = f; return acc; }, {});
      setFlights(flightMap);
      setAllRecords(data);
      const loose = data.filter(s =>
        (s.awb_number && LOOSE_PREFIXES.some(p => s.awb_number.startsWith(p))) ||
        (s.flight_number && s.flight_number.toUpperCase().includes('OSCC')) ||
        (s.flight_number && s.flight_number.toUpperCase().includes('GPC')) ||
        s.flight_number === 'UPS' ||
        s.service_provider === 'UPS' ||
        (s.awb_number && s.awb_number.startsWith('406') && s.flight_number === 'UPS')
      );
      setShipments(loose);
      setInitialLoad(false);
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: scrollY, behavior: 'auto' });
        } catch {
          window.scrollTo(0, scrollY);
        }
      });
    } catch (error) {
      console.error('Failed to load loose overview data', error);
      setFlights({});
      setAllRecords([]);
      setShipments([]);
      toast.error('Failed to load loose overview data');
    } finally {
      setLoading(false);
    }
  }

  const filtered = shipments.filter(s =>
    !search || [s.awb_number, s.order_number, s.destination_name, s.flight_number, s.uld_number]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  // Filter out specific flights: ET, 5C, 7L9602, EK, CA, AY, CX, DO, KE, ON, CZ, D0, LH, QY
  const excludedFlights = ['ET', '5C', '7L9602', 'EK', 'CA', 'AY', 'CX', 'DO', 'KE', 'ON', 'CZ', 'D0', 'LH', 'QY'];
  const isExcludedFlight = (flightNum) => {
    if (!flightNum) return false;
    return excludedFlights.some(excluded => {
      if (excluded === '7L9602') return flightNum === '7L9602';
      return flightNum.startsWith(excluded);
    });
  };
  
  // Group by flight_number if set, otherwise use AWB prefix logic
  const groupedByFlight = filtered.reduce((acc, s) => {
    let flight;
    // If flight_number is explicitly set, use it (respects drag-and-drop assignments)
    if (s.flight_number && s.flight_number.includes('OSCC')) {
      flight = s.flight_number;
    } else if (s.flight_number && s.flight_number !== 'UPS') {
      flight = s.flight_number;
    } else {
      // Fall back to AWB prefix logic for defaults
      const isOSCC = s.awb_number && OSCC_PREFIXES.some(p => s.awb_number.startsWith(p));
      const is406 = s.awb_number && s.awb_number.startsWith('406');
      const isTRUCK = s.awb_number && TRUCK_PREFIXES.some(p => s.awb_number.startsWith(p));
      if (is406) {
        flight = 'UPS';
      } else if (isTRUCK) {
        flight = 'TRUCK';
      } else if (isOSCC) {
        flight = "OSCC";
      } else {
        flight = "UNKNOWN FLIGHT";
      }
    }
    if (!acc[flight]) acc[flight] = [];
    acc[flight].push(s);
    return acc;
  }, {});
  
  // Always show OSCC, GPC and any OSCC/GPC-variant flights from the flights map even if empty
  // But skip if the user has explicitly deleted them
  if (!groupedByFlight['OSCC'] && !hiddenFlights.includes('OSCC')) groupedByFlight['OSCC'] = [];
  if (!groupedByFlight['GPC'] && !hiddenFlights.includes('GPC')) groupedByFlight['GPC'] = [];
  Object.keys(flights).forEach(fn => {
    if ((fn.toUpperCase().includes('OSCC') || fn.toUpperCase().includes('GPC')) && !groupedByFlight[fn] && !hiddenFlights.includes(fn)) {
      groupedByFlight[fn] = [];
    }
  });
  // Also show GPC variants found in shipments data
  shipments.forEach(s => {
    if (s.flight_number && s.flight_number.toUpperCase().includes('GPC') && !groupedByFlight[s.flight_number] && !hiddenFlights.includes(s.flight_number)) {
      groupedByFlight[s.flight_number] = [];
    }
  });
  
  const filteredShipments = filtered.filter(s => !isExcludedFlight(s.flight_number));

  // Sort all flights by ETD (transfer_date) earliest at top; transfer-complete at bottom
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const sortedFlights = Object.keys(groupedByFlight).filter(flight => {
    const items = groupedByFlight[flight] || [];
    const isComplete = items.length > 0 && items.every(s => s.status === 'transferred');
    if (isComplete) {
      const firstShipment = items[0];
      const etd = firstShipment?.transfer_date || flights[flight]?.departure_date;
      if (etd && new Date(etd) < twoDaysAgo) return false;
    }
    return true;
  }).sort((a, b) => {
    const isCompleteA = (groupedByFlight[a] || []).length > 0 && (groupedByFlight[a] || []).every(s => s.status === 'transferred');
    const isCompleteB = (groupedByFlight[b] || []).length > 0 && (groupedByFlight[b] || []).every(s => s.status === 'transferred');
    if (isCompleteA && !isCompleteB) return 1;
    if (!isCompleteA && isCompleteB) return -1;
    const getEtd = (flight) => {
      const firstShipment = (groupedByFlight[flight] || [])[0];
      if (firstShipment?.transfer_date) return new Date(firstShipment.transfer_date).getTime();
      const f = flights[flight];
      if (f?.departure_date) return new Date(f.departure_date).getTime();
      return Infinity;
    };
    return getEtd(a) - getEtd(b);
  });

  const totalBoxes = filtered.reduce((sum, s) => sum + (s.box_count || 0), 0);

  const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  
  const toggleSelectedTransferred = async () => {
    const selectedShipments = [...selected].map(id => shipments.find(s => s.id === id)).filter(Boolean);
    const allTransferred = selectedShipments.every(s => s.status === "transferred");
    const newStatus = allTransferred ? "registered" : "transferred";
    await Promise.all(
      selectedShipments.map(s => api.entities.ULDFishbox.update(s.id, { status: newStatus }))
    );
    setShipments(prev => prev.map(s => 
      selected.has(s.id) ? { ...s, status: newStatus } : s
    ));
    toast.success(newStatus === "transferred" ? `Marked ${selectedShipments.length} shipment(s) as transferred` : `Marked ${selectedShipments.length} shipment(s) as not transferred`);
  };
  
  const toggleAllFlight = (flight) => {
    const flightIds = (groupedByFlight[flight] || []).map(s => s.id);
    setSelected(prev => {
      const allSelected = flightIds.every(id => prev.has(id));
      const n = new Set(prev);
      if (allSelected) { flightIds.forEach(id => n.delete(id)); }
      else { flightIds.forEach(id => n.add(id)); }
      return n;
    });
  };

  const printManifest = () => {
    const items = filtered.filter(s => selected.has(s.id));
    const totalBoxes = items.reduce((sum, s) => sum + (s.box_count || 0), 0);
    const now = new Date().toLocaleString();
    
    // Get the flight name from the first selected item's grouped flight (must match groupedByFlight logic)
    const firstItem = items[0];
    let flightName = "Multiple Flights";
    if (firstItem) {
      if (firstItem.flight_number && !['OSCC', 'UPS'].includes(firstItem.flight_number)) {
        flightName = firstItem.flight_number;
      } else {
        const is406 = firstItem.awb_number && firstItem.awb_number.startsWith('406');
        const isOSCC = firstItem.awb_number && OSCC_PREFIXES.some(p => firstItem.awb_number.startsWith(p));
        if (is406) flightName = 'UPS';
        else if (isOSCC) flightName = 'OSCC';
        else flightName = firstItem.flight_number || firstItem.air_routing || 'No Flight';
      }
    }
    
    // Get truck plate for this flight
    const truckPlate = truckPlates[flightName] || "";
    const flightDest = flightDestinations[flightName] || "";
    
    // Get the day after import date (from created_date)
    const importDate = items.length > 0 ? new Date(items[0].created_date) : new Date();
    const dayAfterImport = new Date(importDate);
    dayAfterImport.setDate(dayAfterImport.getDate() + 1);
    const dayAfterStr = dayAfterImport.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    const rows = items.map(s => `
      <tr>
        <td style="white-space:nowrap;text-align:center">${s.awb_number || "—"}</td>
        <td style="text-align:center">${s.order_number || "—"}</td>
        <td style="text-align:center">${s.destination_code || "—"}</td>
        <td style="text-align:center">${["HKG","CAN","CTU","PEK","PVG","SZX","MFM","CGK","HAN","SIN","GUM","DXB","JED","DMM","RUH","KWI","BEY","TLV","CPT","SGN","KUL","JNB"].includes(s.destination_code) ? "✕" : ""}</td>
        <td style="text-align:center">${s.flight_number || s.air_routing || "—"}</td>
        <td style="text-align:center">${s.box_count ?? "—"}</td>
        <td style="text-align:center">${s.location || "—"}</td>
        <td style="text-align:center">${s.service_provider || "—"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Loading Manifest</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;text-align:center}h1{font-size:18px;margin-bottom:4px}p{margin:2px 0 12px;color:#666}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:center}th{background:#f0f0f0;font-weight:bold}tfoot td{font-weight:bold;background:#f9f9f9}.logo-header{text-align:center;margin-bottom:16px}@media print{img{display:block!important;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
      <div class="logo-header"><img src="/mowi-logo.svg" alt="MOWI" style="max-height:80px" /></div>
      <h1>LOADING MANIFEST — LOOSE SHIPMENTS</h1>
      <p><strong>Truck:</strong> ${flightName}${truckPlate ? ` · <strong>Truck Plate:</strong> ${truckPlate}` : ""}${flightDest ? ` · <strong>Destination:</strong> ${flightDest}` : ""} · <strong>Transfer:</strong> ${dayAfterStr}${sealNr ? ` · <strong>SEAL NR:</strong> ${sealNr}` : ""}</p>
      <p>Printed: ${now} · ${items.length} shipments · ${totalBoxes} total boxes</p>
      <table><thead><tr><th>AWB Number</th><th>Order #</th><th>Destination</th><th>X-Box</th><th>Flight</th><th>Boxes</th><th>Location</th><th>Service Provider</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">TOTAL</td><td style="text-align:right">${totalBoxes}</td><td colspan="3"></td></tr></tfoot>
      </table>
      ${!flightName.toUpperCase().includes('GPC') && !flightName.toUpperCase().includes('OSCC') && !['GPC','OSCC'].includes(flightName) ? `
      <div style="margin-top:32px;display:inline-block;border:1.5px solid #555;border-radius:4px;padding:14px 20px;min-width:280px">
        <img src="/mowi-logo.svg" alt="MOWI" style="height:36px;margin-bottom:10px;display:block" />
        <div style="font-size:12px;margin-bottom:10px">Dispatched by: <span style="display:inline-block;border-bottom:1px solid #333;width:180px">&nbsp;</span></div>
        <div style="font-size:12px;margin-bottom:10px">Driver: <span style="display:inline-block;border-bottom:1px solid #333;width:210px">&nbsp;</span></div>
        <div style="font-size:12px">Date/Time: <span style="display:inline-block;border-bottom:1px solid #333;width:200px">&nbsp;</span></div>
      </div>` : ''}
      </body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.onload = () => w.print();
  };

  const saveLocation = async (id) => {
    await api.entities.ULDFishbox.update(id, { location: locationValue });
    setShipments(prev => prev.map(s => s.id === id ? { ...s, location: locationValue } : s));
    setEditingLocation(null);
  };

  const saveBoxes = async (id) => {
    const val = parseInt(boxesValue) || 0;
    await api.entities.ULDFishbox.update(id, { box_count: val });
    setShipments(prev => prev.map(s => s.id === id ? { ...s, box_count: val } : s));
    setEditingBoxes(null);
    toast.success("Box count updated");
  };



  const deleteSelected = async () => {
    const selectedShipments = [...selected].map(id => shipments.find(s => s.id === id)).filter(Boolean);
    const sentToBuild = selectedShipments.filter(s => s.uld_type || s.uld_number);
    if (sentToBuild.length > 0) {
      toast.error(`Cannot delete ${sentToBuild.length} shipment(s) already sent to Build`);
      return;
    }
    setDeleting(true);
    await Promise.all([...selected].map(id => api.entities.ULDFishbox.delete(id)));
    setSelected(new Set());
    toast.success(`Deleted ${selected.size} shipment(s)`);
    await loadData();
    setDeleting(false);
  };

  const handleDelete = async () => {
    await api.entities.ULDFishbox.delete(deleteId);
    setDeleteId(null);
    toast.success('Shipment deleted');
    loadData();
  };


  const handleAddShipment = async () => {
  if (!newAwb || !newAwb.trim()) {
    toast.error('AWB number is required');
    return;
  }
  try {
    const trimmedAwb = newAwb.trim();
    // Use the flight the user is adding to, unless no explicit flight was selected
    const flightName = addingFlight || 'OSCC';
      
      console.log('Adding shipment:', { trimmedAwb, flightName, addingFlight });
      
      const payload = {
        awb_number: trimmedAwb,
        order_number: newOrder.trim() || null,
        status: 'registered',
        contour: 'P',
        flight_number: flightName,
      };
      if (newDestinationName.trim()) payload.destination_name = newDestinationName.trim();
      if (newDestinationCode.trim()) payload.destination_code = newDestinationCode.trim();
      if (newServiceProvider.trim()) payload.service_provider = newServiceProvider.trim();
      
      console.log('Payload:', payload);
      await api.entities.ULDFishbox.create(payload);
      setAddingFlight(null);
      setNewAwb('');
      setNewOrder('');
      setNewDestinationName('');
      setNewDestinationCode('');
      setNewServiceProvider('');
      toast.success('Shipment added');
      await loadData();
    } catch (error) {
      console.error('Add shipment error:', error);
      toast.error('Failed to add shipment: ' + error.message);
    }
  };

  const assignOsscFlights = async () => {
    setAssigningOssc(true);
    try {
      const response = await api.functions.invoke('assignOsscFlights', {});
      if (response.data.success) {
        toast.success(`Assigned ${response.data.updated} OSCC shipment(s) to OSCC FLIGHT`);
        await loadData();
      }
    } catch (error) {
      toast.error('Failed to assign OSCC flights: ' + error.message);
    } finally {
      setAssigningOssc(false);
    }
  };

  const saveTransferDate = async (flight) => {
    const flightShipments = groupedByFlight[flight];
    await Promise.all(
      flightShipments.map(s => api.entities.ULDFishbox.update(s.id, { transfer_date: transferDateValue }))
    );
    setShipments(prev => prev.map(s => 
      flightShipments.some(fs => fs.id === s.id) ? { ...s, transfer_date: transferDateValue } : s
    ));
    setEditingTransferDate(null);
    toast.success("Transfer date updated");
  };

  const saveDeadline = (flight) => {
    localStorage.setItem(`deadline_${flight}`, deadlineValue);
    setEditingDeadline(null);
    toast.success("Deadline updated");
  };

  const getDefaultDeadline = (flight) => {
    const saved = localStorage.getItem(`deadline_${flight}`);
    if (saved) return saved;
    if (flight === "OSCC") return "05:00";
    if (flight === "UPS") return "07:00";
    return "";
  };

  const toggleTransferred = async (id, currentStatus) => {
    const newStatus = currentStatus === "transferred" ? "registered" : "transferred";
    await api.entities.ULDFishbox.update(id, { status: newStatus });
    setShipments(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    toast.success(newStatus === "transferred" ? "Marked as transferred" : "Marked as not transferred");
  };

  const toggleFlightTransferred = async (flight, allTransferred) => {
    const flightShipments = groupedByFlight[flight];
    const newStatus = allTransferred ? "registered" : "transferred";
    await Promise.all(
      flightShipments.map(s => api.entities.ULDFishbox.update(s.id, { status: newStatus }))
    );
    setShipments(prev => prev.map(s => 
      flightShipments.some(fs => fs.id === s.id) ? { ...s, status: newStatus } : s
    ));
    toast.success(newStatus === "transferred" ? `Marked ${flightShipments.length} shipments as transferred` : `Marked ${flightShipments.length} shipments as not transferred`);
  };

  const deleteFlightRecord = async (flight) => {
    // Get ALL shipments for this flight from the database, not just filtered ones
    const allFlightShipments = allRecords.filter(s => {
      if (s.flight_number === flight) return true;
      if (s.air_routing === flight) return true;
      // For OSCC, also include shipments grouped by AWB prefix with no explicit flight
      if (flight === 'OSCC' && !s.flight_number && s.awb_number && OSCC_PREFIXES.some(p => s.awb_number.startsWith(p))) return true;
      return false;
    });
    await Promise.all(allFlightShipments.map(s => api.entities.ULDFishbox.delete(s.id)));
    const flightRecord = flights[flight];
    if (flightRecord) await api.entities.Flight.delete(flightRecord.id);
    // Mark flight as hidden so it doesn't re-appear as empty group
    const updated = [...hiddenFlights.filter(f => f !== flight), flight];
    setHiddenFlights(updated);
    localStorage.setItem('looseHiddenFlights', JSON.stringify(updated));
    setDeletingFlight(null);
    toast.success(`Flight ${flight} and ${allFlightShipments.length} shipment(s) deleted`);
    loadData();
  };

  const getFlightRecords = (flight) => {
    const base = groupedByFlight[flight] || [];
    const order = flightOrder[flight];
    let records;
    if (!order) {
      records = base;
    } else {
      const map = Object.fromEntries(base.map(s => [s.id, s]));
      records = order.map(id => map[id]).filter(Boolean);
    }
    // Sort transferred shipments to the bottom
    return [...records].sort((a, b) => {
      const aTransferred = a.status === 'transferred' ? 1 : 0;
      const bTransferred = b.status === 'transferred' ? 1 : 0;
      return aTransferred - bTransferred;
    });
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    
    // Handle flight group reordering
    if (result.source.droppableId === 'flights-container' && result.destination.droppableId === 'flights-container') {
      const newOrder = Array.from(sortedFlights);
      const [moved] = newOrder.splice(result.source.index, 1);
      newOrder.splice(result.destination.index, 0, moved);
      setFlightGroupOrder(newOrder);
      return;
    }
    
    // Handle shipment movement
    const sourceFlight = result.source.droppableId;
    const destFlight = result.destination.droppableId;

    if (sourceFlight === destFlight) {
      // Reorder within same flight
      const ordered = getFlightRecords(sourceFlight);
      const [moved] = ordered.splice(result.source.index, 1);
      ordered.splice(result.destination.index, 0, moved);
      setFlightOrder(prev => ({ ...prev, [sourceFlight]: ordered.map(s => s.id) }));
      // Persist sort_order to database (batched to avoid rate limit)
      await Promise.all(ordered.map((s, idx) => api.entities.ULDFishbox.update(s.id, { sort_order: idx })));

    } else {
      // Cross-flight move
      const sourceRecords = getFlightRecords(sourceFlight);
      const movedRecord = sourceRecords[result.source.index];
      if (!movedRecord) return;

      api.entities.ULDFishbox.update(movedRecord.id, { flight_number: destFlight });
      toast.success(`Moved to ${destFlight}`);
      setTimeout(() => loadData(), 300);
    }
  };

  const sendToBuild = async () => {
    const selectedShipments = [...selected].map(id => shipments.find(s => s.id === id)).filter(Boolean);
    await Promise.all(
      selectedShipments.map((s, idx) => 
        api.entities.ULDFishbox.update(s.id, {
          uld_type: "PMC",
          uld_number: `TMP-${Date.now()}-${idx}`,
          status: "registered"
        })
      )
    );
    setSelected(new Set());
    toast.success(`Sent ${selectedShipments.length} shipment(s) to Build`);
    setTimeout(() => window.location.href = '/build', 500);
  };

  const exportToExcel = () => {
    if (selected.size === 0) {
      toast.error('Please select shipments to export');
      return;
    }
    const selectedShipments = [...selected].map(id => shipments.find(s => s.id === id)).filter(Boolean);
    const wb = XLSX.utils.book_new();
    console.log('Truck plates:', truckPlates);
    
    // Group selected shipments by flight
    const groupedSelected = selectedShipments.reduce((acc, s) => {
      const isOSCC = s.awb_number && OSCC_PREFIXES.some(p => s.awb_number.startsWith(p));
      const is406 = s.awb_number && s.awb_number.startsWith('406');
      const isTRUCK = s.awb_number && TRUCK_PREFIXES.some(p => s.awb_number.startsWith(p));
      let flight;
      if (is406) {
        flight = 'UPS';
      } else if (isTRUCK) {
        flight = 'TRUCK';
      } else if (isOSCC) {
        flight = 'OSCC';
      } else {
        flight = s.flight_number || s.air_routing || 'No Flight';
      }
      if (!acc[flight]) acc[flight] = [];
      acc[flight].push(s);
      return acc;
    }, {});
    
    Object.keys(groupedSelected).forEach(flight => {
      const flightShipments = groupedSelected[flight];
      const firstShipment = flightShipments[0];
      const transferDate = firstShipment?.transfer_date || (() => {
        const d = firstShipment?.created_date ? new Date(firstShipment.created_date) : new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
      })();
      const transferDateDisplay = transferDate ? new Date(transferDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
      const total = flightShipments.reduce((sum, s) => sum + (s.box_count || 0), 0);
      const now = new Date().toLocaleString('en-GB');
      const truckPlate = truckPlates[flight] || '';
      console.log(`Flight ${flight} truck plate:`, truckPlate);

      const wsData = [
        [`LOADING MANIFEST — LOOSE SHIPMENTS`, '', '', '', '', ''],
        [`TRUCK: ${flight.toUpperCase()}`, `TRANSFER DATE: ${transferDateDisplay.toUpperCase()}`, '', `SEAL NR: ${(sealNr || '').toUpperCase()}`, '', ''],
        [`DATE PRINTED: ${now.toUpperCase()}`, truckPlate ? `TRUCK PLATE: ${truckPlate.toUpperCase()}` : '', '', `TOTAL AWB: ${flightShipments.length}`, `TOTAL BOX: ${total}`, ''],
        ['', '', '', '', '', ''],
        ['SEAL', 'AWB NUMBER', 'ORDER NUMBER', 'DESTINATION', 'X-BOX', 'BOX'],
        ...flightShipments.map(s => [
          (sealNr || '').toUpperCase(),
          (s.awb_number || '').toUpperCase(),
          (s.order_number || '').toUpperCase(),
          `${(s.destination_name || '').toUpperCase()}${s.destination_code ? ` (${s.destination_code.toUpperCase()})` : ''}`,
          ["HKG","CAN","CTU","PEK","PVG","SZX","MFM","CGK","HAN","SIN","GUM","DXB","JED","DMM","RUH","KWI","BEY","TLV","CPT","SGN","KUL","JNB"].includes(s.destination_code) ? '✕' : '',
          s.box_count ?? 0,
        ]),
        ['TOTAL', '', '', '', '', total],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      const border = {
        top: { style: 'thin', color: { rgb: '333333' } },
        bottom: { style: 'thin', color: { rgb: '333333' } },
        left: { style: 'thin', color: { rgb: '333333' } },
        right: { style: 'thin', color: { rgb: '333333' } },
      };
      const thickBorder = {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } },
        left: { style: 'medium', color: { rgb: '000000' } },
        right: { style: 'medium', color: { rgb: '000000' } },
      };

      // Merge cells
      const dataStart = 5; // 0-indexed row 5 = first data row
      const dataEnd = 5 + flightShipments.length - 1;
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },
        { s: { r: 1, c: 3 }, e: { r: 1, c: 5 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
        ...(flightShipments.length > 1 ? [{ s: { r: dataStart, c: 0 }, e: { r: dataEnd, c: 0 } }] : []),
      ];

      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border: thickBorder,
      };
      const infoLabelStyle = {
        font: { bold: true, sz: 11, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F5F5F5' } },
        border: thickBorder,
      };
      const spacerStyle = {
        fill: { fgColor: { rgb: 'D0D0D0' } },
        border: { left: thickBorder.left, right: thickBorder.right },
      };
      const headerStyle = {
        font: { bold: true, sz: 11, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0C040' } },
        border: thickBorder,
      };
      const dataCenterStyle = {
        font: { sz: 10, name: 'Calibri', color: { rgb: '1A1A1A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border,
      };
      const dataAltStyle = {
        font: { sz: 10, name: 'Calibri', color: { rgb: '1A1A1A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0F0F0' } },
        border,
      };
      const dataDestStyle = {
        font: { bold: true, sz: 10, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border,
      };
      const dataDestAltStyle = {
        font: { bold: true, sz: 10, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0F0F0' } },
        border,
      };
      const sealStyle = {
        font: { bold: true, sz: 12, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        border: thickBorder,
      };
      const totalLabelStyle = {
        font: { bold: true, sz: 11, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0C040' } },
        border: thickBorder,
      };
      const totalValStyle = {
        font: { bold: true, sz: 13, color: { rgb: '1A1A1A' }, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0C040' } },
        border: thickBorder,
      };

      // Row 1: Title
      if (ws['A1']) ws['A1'].s = titleStyle;

      // Row 2: Info row
      ['A2','B2','C2','D2','E2','F2'].forEach(c => { if (ws[c]) ws[c].s = infoLabelStyle; });

      // Row 3: Date / totals / truck plate
      ['A3','B3','C3','D3','E3','F3'].forEach(c => { if (ws[c]) ws[c].s = infoLabelStyle; });

      // Row 4: Spacer
      ['A4','B4','C4','D4','E4','F4'].forEach(c => {
        if (!ws[c]) ws[c] = { v: '', t: 's' };
        ws[c].s = spacerStyle;
      });

      // Row 5: Header
      ['A5','B5','C5','D5','E5','F5'].forEach(c => { if (ws[c]) ws[c].s = headerStyle; });

      // Data rows — alternating stripes
      flightShipments.forEach((_, i) => {
        const row = i + 6;
        const isAlt = i % 2 === 1;
        if (ws[`A${row}`]) ws[`A${row}`].s = sealStyle;
        ['B','C','F'].forEach(col => { if (ws[`${col}${row}`]) ws[`${col}${row}`].s = isAlt ? dataAltStyle : dataCenterStyle; });
        if (ws[`D${row}`]) ws[`D${row}`].s = isAlt ? dataDestAltStyle : dataDestStyle;
        if (ws[`E${row}`]) ws[`E${row}`].s = isAlt ? dataAltStyle : dataCenterStyle;
      });

      // Total row
      const totalRow = flightShipments.length + 6;
      ['A','B','C','D','E'].forEach(col => {
        if (!ws[`${col}${totalRow}`]) ws[`${col}${totalRow}`] = { v: '', t: 's' };
        ws[`${col}${totalRow}`].s = totalLabelStyle;
      });
      if (ws[`F${totalRow}`]) ws[`F${totalRow}`].s = totalValStyle;

      // Row heights
      ws['!rows'] = [
        { hpt: 36 }, // title
        { hpt: 22 }, // info 1
        { hpt: 22 }, // info 2
        { hpt: 6 },  // spacer
        { hpt: 24 }, // header
        ...flightShipments.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // total
      ];

      ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];

      const sheetName = flight.replace(/[\\/*?:[\]]/g, '').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    XLSX.writeFile(wb, `load-manifest-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel manifest downloaded');
  };

  if (loading && initialLoad) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LOOSE</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sortedFlights.reduce((sum, f) => sum + (groupedByFlight[f]?.length || 0), 0)} loose shipment{sortedFlights.reduce((sum, f) => sum + (groupedByFlight[f]?.length || 0), 0) !== 1 ? "s" : ""} · {sortedFlights.reduce((sum, f) => sum + (groupedByFlight[f] || []).reduce((s2, sh) => s2 + (sh.box_count || 0), 0), 0)} total boxes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <>
            <Button variant="outline" onClick={printManifest} className="gap-2">
              🖨️ Print Manifest ({selected.size})
            </Button>
            <Button variant="outline" onClick={toggleSelectedTransferred} className="gap-2">
              {(() => { const firstId = [...selected][0]; const firstShipment = shipments.find(s => s.id === firstId); return firstShipment?.status === "transferred" ? "Mark as Not Transferred" : "Mark as Transferred"; })()} ({selected.size})
            </Button>
            <Button variant="destructive" onClick={deleteSelected} disabled={deleting} className="gap-2">
              {deleting ? "Deleting..." : `Delete ${selected.size} selected`}
            </Button>
            <div className="flex gap-2 items-center border border-border rounded-md px-3 py-1">
              <label className="text-xs whitespace-nowrap font-medium">SEAL NR:</label>
              <Input
                placeholder="Enter seal number"
                value={sealNr}
                onChange={e => setSealNr(e.target.value)}
                className="h-8 text-xs flex-grow"
              />
            </div>
            </>
          )}
          <Button variant="outline" onClick={() => setFlightDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add New Flight
          </Button>
          <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={async () => {
            setFetchingETA(true);
            try {
              const res = await api.functions.invoke('extractLaPalAriTime', {});
              if (res.data.success) {
                toast.success(`Updated ${res.data.updated} ETA value(s)`);
                loadData();
              }
            } catch (error) {
              toast.error('Failed to fetch ETA data');
            } finally {
              setFetchingETA(false);
            }
          }} disabled={fetchingETA} className="gap-2">
            {fetchingETA ? 'Fetching...' : '📡 Auto-fill ETA'}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by AWB, order, destination..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">No loose shipments found</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="flights-container" type="FLIGHT">
          {(provided) => (
            <div className="space-y-6" ref={provided.innerRef} {...provided.droppableProps}>
          {sortedFlights.map((flight, flightIndex) => {
        const flightShipments = groupedByFlight[flight];
        const flightTotalBoxes = flightShipments.reduce((sum, s) => sum + (s.box_count || 0), 0);
        // Use the transfer_date field if available, otherwise calculate from created_date
        const firstShipment = flightShipments[0];
        const transferDate = firstShipment?.transfer_date || (() => {
          const importDate = firstShipment?.created_date ? new Date(firstShipment.created_date) : new Date();
          const dayAfterImport = new Date(importDate);
          dayAfterImport.setDate(dayAfterImport.getDate() + 1);
          return dayAfterImport.toISOString().split('T')[0];
        })();
        const transferDateDisplay = transferDate ? new Date(transferDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "Not set";
        
        return (
          <Draggable draggableId={`flight-${flight}`} index={flightIndex} type="FLIGHT">
            {(dragProvided) => (
          <div key={flight} className="rounded-xl border border-border overflow-hidden bg-transparent" ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
          <div className="bg-muted/40 px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
              {editingFlightName === flight ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={flightNameValue}
                    onChange={e => setFlightNameValue(e.target.value)}
                    style={{ color: '#000000' }}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        const flightRecord = flights[flight];
                        if (flightRecord) await api.entities.Flight.update(flightRecord.id, { flight_number: flightNameValue });
                        const flightShips = groupedByFlight[flight] || [];
                        await Promise.all(flightShips.map(s => api.entities.ULDFishbox.update(s.id, { flight_number: flightNameValue })));
                        await loadData();
                        setEditingFlightName(null);
                      }
                      if (e.key === 'Escape') setEditingFlightName(null);
                    }}
                  />
                  <button onClick={async () => {
                    const flightRecord = flights[flight];
                    if (flightRecord) await api.entities.Flight.update(flightRecord.id, { flight_number: flightNameValue });
                    const flightShips = groupedByFlight[flight] || [];
                    await Promise.all(flightShips.map(s => api.entities.ULDFishbox.update(s.id, { flight_number: flightNameValue })));
                    await loadData();
                    setEditingFlightName(null);
                  }} className="text-xs text-green-600 font-bold">✓</button>
                  <button onClick={() => setEditingFlightName(null)} className="text-xs text-muted-foreground">✕</button>
                </div>
              ) : (
                <h2 className="font-semibold text-lg cursor-pointer hover:bg-muted/40 px-2 py-1 rounded transition-colors" onClick={() => { setEditingFlightName(flight); setFlightNameValue(flight); }}>{flight}</h2>
              )}
              {editingPlate === flight ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    placeholder="e.g. AB 12345"
                    value={plateValue}
                    onChange={e => setPlateValue(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setTruckPlates(prev => ({ ...prev, [flight]: plateValue })); setEditingPlate(null); }
                      if (e.key === 'Escape') setEditingPlate(null);
                    }}
                    className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground w-28"
                  />
                  <button onClick={() => { setTruckPlates(prev => ({ ...prev, [flight]: plateValue })); setEditingPlate(null); }} className="text-xs text-green-600 font-bold">✓</button>
                  <button onClick={() => setEditingPlate(null)} className="text-xs text-muted-foreground">✕</button>
                </div>
              ) : (
                <span
                  onClick={() => { setEditingPlate(flight); setPlateValue(truckPlates[flight] || ''); }}
                  className="text-xs font-mono border border-dashed border-border rounded px-2 py-1 cursor-pointer hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title="Click to set truck plate"
                >
                  🚛 {truckPlates[flight] || '+ plate'}
                </span>
              )}
              {editingDestination === flight ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    placeholder="e.g. AMSTERDAM"
                    value={destinationValue}
                    onChange={e => setDestinationValue(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setFlightDestinations(prev => ({ ...prev, [flight]: destinationValue })); setEditingDestination(null); }
                      if (e.key === 'Escape') setEditingDestination(null);
                    }}
                    className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground w-32"
                  />
                  <button onClick={() => { setFlightDestinations(prev => ({ ...prev, [flight]: destinationValue })); setEditingDestination(null); }} className="text-xs text-green-600 font-bold">✓</button>
                  <button onClick={() => setEditingDestination(null)} className="text-xs text-muted-foreground">✕</button>
                </div>
              ) : (
                <span
                  onClick={() => { setEditingDestination(flight); setDestinationValue(flightDestinations[flight] || ''); }}
                  className="text-xs font-mono border border-dashed border-border rounded px-2 py-1 cursor-pointer hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title="Click to set destination"
                >
                  ✈️ {flightDestinations[flight] || '+ dest'}
                </span>
              )}
              {editingDeadline === flight ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={deadlineValue}
                    onChange={(e) => setDeadlineValue(e.target.value)}
                    className="h-8 text-xs border border-border rounded px-2"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => saveDeadline(flight)}
                    className="h-8"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDeadline(null)}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <span
                  className="text-sm font-bold text-red-500 px-3 py-1 rounded shadow-[0_0_12px_rgba(239,68,68,0.8)] cursor-pointer hover:opacity-80"
                  onClick={() => {
                    setEditingDeadline(flight);
                    setDeadlineValue(getDefaultDeadline(flight));
                  }}
                  title="Click to edit deadline"
                >
                  Deadline: {getDefaultDeadline(flight) || "Not set"}
                </span>
              )}
              {editingTransferDate === flight ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={transferDateValue}
                    onChange={(e) => setTransferDateValue(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => saveTransferDate(flight)}
                    className="h-8"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingTransferDate(null);
                      setTransferDateValue("");
                    }}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary font-semibold cursor-pointer hover:bg-primary/10 px-2 py-1 rounded transition-colors" onClick={() => { setEditingTransferDate(flight); setTransferDateValue(transferDate); }} title="Click to edit">
                    <span className="text-xs mr-1">ETD:</span>{transferDateDisplay}
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-xs gap-1"
                    onClick={() => setAddingFlight(flight)}
                  >
                    <Plus className="w-3 h-3" /> Add Shipment
                  </Button>
                </div>
              )}
              {!editingFlightName && (() => {
                const flightShipments = groupedByFlight[flight] || [];
                const allTransferred = flightShipments.length > 0 && flightShipments.every(s => s.status === "transferred");
                if (allTransferred) {
                  return (
                    <span className="text-sm font-bold text-green-600 px-3 py-1 rounded shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-500/40 bg-green-500/10 ml-auto">
                      ✓ Transfer Complete
                    </span>
                  );
                }
                return null;
              })()}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
                onClick={() => setDeletingFlight(flight)}
                title="Delete flight"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-xs text-muted-foreground">{groupedByFlight[flight].length} AWB · {flightTotalBoxes} boxes</p>
            </div>
            </div>
          <div className="overflow-x-auto">
           <Table>
             <TableHeader>
               <TableRow className="bg-transparent">
                 <TableHead className="whitespace-nowrap">AWB Number</TableHead>
                 <TableHead className="whitespace-nowrap">Order #</TableHead>
                 <TableHead className="whitespace-nowrap">Destination</TableHead>
                 <TableHead className="text-center whitespace-nowrap">X-Box</TableHead>
                 <TableHead className="whitespace-nowrap">Flight/Truck</TableHead>
                 <TableHead className="whitespace-nowrap">Air Routing</TableHead>
                 <TableHead className="text-right whitespace-nowrap">Boxes</TableHead>
                 <TableHead className="whitespace-nowrap">ETA</TableHead>
                 <TableHead className="whitespace-nowrap">Location</TableHead>
                 <TableHead className="whitespace-nowrap">Service Provider</TableHead>
                 <TableHead className="w-12"></TableHead>
                 <TableHead className="w-10"><input type="checkbox" checked={groupedByFlight[flight].length > 0 && groupedByFlight[flight].every(s => selected.has(s.id))} onChange={() => toggleAllFlight(flight)} className="cursor-pointer" /></TableHead>
               </TableRow>
             </TableHeader>
             <Droppable droppableId={flight}>
               {(provided) => (
             <TableBody ref={provided.innerRef} {...provided.droppableProps} className={getFlightRecords(flight).length === 0 ? 'min-h-[48px]' : ''}>
               {getFlightRecords(flight).length === 0 && (
                 <TableRow>
                   <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-4 italic">
                     Drop shipments here
                   </TableCell>
                 </TableRow>
               )}
               {getFlightRecords(flight).map((s, idx) => (
                   <Draggable key={s.id} draggableId={s.id} index={idx}>
                   {(dragProvided) => (
                  <TableRow
                    ref={(node) => {
                      dragProvided.innerRef(node);
                      if (s.id === highlightId) highlightRef.current = node;
                    }}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`text-sm cursor-grab active:cursor-grabbing ${s.id === highlightId ? 'bg-orange-500/20 ring-2 ring-orange-500 ring-inset' : 'hover:bg-muted/20'}`}
                  >
                  <TableCell className="font-mono font-medium whitespace-nowrap">{s.awb_number || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>{s.order_number || "—"}</span>
                      {s.order_number && (
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(s.order_number); toast.success('Copied'); }} title="Copy order number">
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.destination_code || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {["HKG","CAN","CTU","PEK","PVG","SZX","MFM","CGK","HAN","SIN","GUM","DXB","JED","DMM","RUH","KWI","BEY","TLV","CPT","SGN","KUL","JNB"].includes(s.destination_code) ? <span className="text-red-600 font-bold text-lg shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse">✕</span> : null
                  }</TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.flight_number || s.air_routing || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {s.air_routing || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {editingBoxes === s.id ? (
                      <div className="flex gap-1 items-center justify-end">
                        <input autoFocus type="number" min="0" className="border border-border rounded px-2 py-0.5 text-xs w-16 bg-background text-foreground text-right" value={boxesValue} onChange={e => setBoxesValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveBoxes(s.id); if (e.key === "Escape") setEditingBoxes(null); }} />
                        <button onClick={() => saveBoxes(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                        <button onClick={() => setEditingBoxes(null)} className="text-xs text-muted-foreground">✕</button>
                      </div>
                    ) : (
                      <span onClick={() => { setEditingBoxes(s.id); setBoxesValue(s.box_count || 0); }} className="cursor-pointer text-xs px-2 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Click to edit boxes">{s.box_count ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingETA === s.id ? (
                      <div className="flex gap-1 items-center">
                        <input autoFocus className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground" value={etaValue} onChange={e => setEtaValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { api.entities.ULDFishbox.update(s.id, { eta: etaValue }); setShipments(prev => prev.map(sh => sh.id === s.id ? { ...sh, eta: etaValue } : sh)); setEditingETA(null); } if (e.key === "Escape") setEditingETA(null); }} />
                        <button onClick={() => { api.entities.ULDFishbox.update(s.id, { eta: etaValue }); setShipments(prev => prev.map(sh => sh.id === s.id ? { ...sh, eta: etaValue } : sh)); setEditingETA(null); }} className="text-xs text-green-600 font-bold">✓</button>
                        <button onClick={() => setEditingETA(null)} className="text-xs text-muted-foreground">✕</button>
                      </div>
                    ) : (
                      <span onClick={() => { setEditingETA(s.id); setEtaValue(s.eta || ""); }} className={`cursor-pointer text-xs px-2 py-1 rounded transition-colors ${s.eta ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"}`} title="Click to edit ETA">{s.eta || "+ ETA"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingLocation === s.id ? (
                      <div className="flex gap-1 items-center">
                        <input autoFocus className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground" value={locationValue} onChange={e => setLocationValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveLocation(s.id); if (e.key === "Escape") setEditingLocation(null); }} />
                        <button onClick={() => saveLocation(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                        <button onClick={() => setEditingLocation(null)} className="text-xs text-muted-foreground">✕</button>
                      </div>
                    ) : (
                      <span onClick={() => { setEditingLocation(s.id); setLocationValue(s.location || ""); }} className={`cursor-pointer text-xs px-2 py-1 rounded transition-colors ${s.location ? "bg-green-500/20 text-green-700 hover:bg-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"}`} title="Click to edit location">{s.location || "+ add"}</span>
                    )}
                  </TableCell>
                  <TableCell>{s.service_provider || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant={s.status === 'loaded' ? 'default' : 'outline'} size="sm" className={`h-7 text-xs px-2 ${s.status === 'loaded' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-[0_0_12px_rgba(34,197,94,0.8)] animate-pulse' : ''}`} title="Loaded status" onClick={async () => { const newStatus = s.status === 'loaded' ? 'registered' : 'loaded'; await api.entities.ULDFishbox.update(s.id, { status: newStatus }); setShipments(prev => prev.map(sh => sh.id === s.id ? { ...sh, status: newStatus } : sh)); }}>
                        {s.status === 'loaded' ? '✓ Loaded' : 'Load'}
                      </Button>
                      <Button variant={s.status === 'transferred' ? 'default' : 'outline'} size="sm" className={`h-7 text-xs px-2 ${s.status === 'transferred' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-[0_0_12px_rgba(34,197,94,0.8)] animate-pulse' : ''}`} title="Transfer status" onClick={async () => { const newStatus = s.status === 'transferred' ? 'registered' : 'transferred'; await api.entities.ULDFishbox.update(s.id, { status: newStatus }); setShipments(prev => prev.map(sh => sh.id === s.id ? { ...sh, status: newStatus } : sh)); }}>
                        {s.status === 'transferred' ? '✓ Transferred' : 'Transfer'}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" title="Print Labels" onClick={() => window.location.href = `/print-labels/${s.id}`}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-secondary hover:text-secondary" title="Send to Build" onClick={async () => { await api.entities.ULDFishbox.update(s.id, { uld_type: "PMC", flight_number: "ANONYMOUS FLIGHT", status: "registered" }); toast.success('Sent to Build'); window.location.href = '/build'; }}>
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Duplicate" onClick={async () => { const { id, created_date, updated_date, created_by, ...rest } = s; await api.entities.ULDFishbox.create(rest); loadData(); toast.success('Shipment duplicated'); }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} className="cursor-pointer" /></TableCell>
                  </TableRow>
                   )}
                   </Draggable>
                   ))}
                   {provided.placeholder}
                   </TableBody>
                   )}
                   </Droppable>
                  </Table>
                  </div>
                  </div>
                  )}
                  </Draggable>
                  );
                  })}           
                  {provided.placeholder}
                  </div>
                  )}
                  </Droppable>
                  </DragDropContext>
                  )}

                  <FlightFormDialog
        open={flightDialogOpen}
        onOpenChange={setFlightDialogOpen}
        onSuccess={() => {
          toast.success("Flight created successfully");
          setFlightDialogOpen(false);
        }}
      />

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-sm">
            <h2 className="text-lg font-semibold mb-2">Delete shipment?</h2>
            <p className="text-sm text-muted-foreground mb-4">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {deletingFlight && (
       <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
         <div className="bg-card rounded-lg p-6 max-w-sm">
           <h2 className="text-lg font-semibold mb-2">Delete flight {deletingFlight}?</h2>
           <p className="text-sm text-muted-foreground mb-4">This will permanently delete the flight and all its shipments. This cannot be undone.</p>
           <div className="flex gap-3 justify-end">
             <Button variant="outline" onClick={() => setDeletingFlight(null)}>Cancel</Button>
             <Button variant="destructive" onClick={() => deleteFlightRecord(deletingFlight)}>Delete</Button>
           </div>
         </div>
       </div>
      )}

      {addingFlight && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Add Shipment to {addingFlight}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">AWB Number *</label>
                <Input 
                  autoFocus
                  placeholder="e.g. 6154321098" 
                  value={newAwb} 
                  onChange={e => setNewAwb(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddShipment();
                    if (e.key === 'Escape') setAddingFlight(null);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Order Number</label>
                <Input 
                  placeholder="Optional" 
                  value={newOrder} 
                  onChange={e => setNewOrder(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddShipment();
                    if (e.key === 'Escape') setAddingFlight(null);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Destination</label>
                <Input 
                  placeholder="e.g. DUBAI" 
                  value={newDestinationName} 
                  onChange={e => setNewDestinationName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Destination Code</label>
                <Input 
                  placeholder="e.g. DXB" 
                  value={newDestinationCode} 
                  onChange={e => setNewDestinationCode(e.target.value)}
                  maxLength="3"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Service Provider</label>
                <Input 
                  placeholder="e.g. DHLCARGO" 
                  value={newServiceProvider} 
                  onChange={e => setNewServiceProvider(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button variant="outline" onClick={() => setAddingFlight(null)}>Cancel</Button>
              <Button onClick={handleAddShipment}>Add Shipment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}