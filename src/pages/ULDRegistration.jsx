// @ts-nocheck
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { appApi as api } from "@/api/appApi";

/**
 * @param {(...args: any[]) => void} func
 * @param {number} delay
 */
const debounce = (func, delay) => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};
import { Save, Search, RefreshCw, Package2, Printer, Send, Download, Hammer, Copy } from "lucide-react";
import XLSXStyle from 'xlsx-js-style';
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Extract flight number from air_routing (e.g., "EK9905/27" → "EK9905")
const extractFlightNumber = (airRouting) => {
  if (!airRouting) return "No Flight";
  const match = airRouting.match(/^([A-Z0-9]+)/);
  return match ? match[1] : "No Flight";
};

const ULD_TYPES = ["PMC", "PAG", "AKE", "AKL", "FQA", "QKE", "P6P", "PAJ", "PLA", "PLB", "PYB"];
const CONTOUR_CODES = ["P", "E", "A"];
const LOCATION_OPTIONS = ["AIR01", "AIR02", "AIR03", "AIR04", "AIR05", "AIR06", "AIR07", "AIR08", "AIR09", "AIR10", "AIR11", "AIR12", "AIR13", "AIR14", "AIR15", "AIR16", "AIR17", "AIR18", "AIR19", "AIR20", "AIR21", "AIR22", "AIR23", "AIR24", "AIR25", "AIR26", "AIR27", "BRAKKA"];

// OSCC AWB prefixes that should be grouped under OSCC FLIGHT
const OSCC_PREFIXES = ["217", "784", "501", "172", "618", "898", "999", "205", "065", "695"];

const GROUP_COLORS = ["#7A2535", "#1A6B35", "#A0520A", "#5A3070", "#1A6060", "#7A6800", "#4A3A7A", "#266050", "#7A3810", "#1A4A6A"];

const getGroupColor = (groupKey) => {
  if (!groupKey) return null;
  const hash = groupKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return GROUP_COLORS[hash % GROUP_COLORS.length];
};

// Get tomorrow's date formatted
const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const playPlingSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const gainNode = audioContext.createGain();
  gainNode.connect(audioContext.destination);
  
  // Celebratory major chord (C-E-G)
  const frequencies = [523, 659, 784]; // C5, E5, G5
  const oscillators = frequencies.map(freq => {
    const osc = audioContext.createOscillator();
    osc.connect(gainNode);
    osc.frequency.value = freq;
    osc.type = 'sine';
    return osc;
  });
  
  const startTime = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0.4, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6);
  
  oscillators.forEach(osc => {
    osc.start(startTime);
    osc.stop(startTime + 0.6);
  });
};

export default function ULDRegistration() {
  const [shipments, setShipments] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [flights, setFlights] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [prevBoxCounts, setPrevBoxCounts] = useState({});
  const updateTimeoutsRef = useRef({});

  const [localGroups, setLocalGroups] = useState({});
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationValue, setLocationValue] = useState("");
  const [editingBoxCount, setEditingBoxCount] = useState(null);
  const [boxCountValue, setBoxCountValue] = useState("");
  const [editingUldNumber, setEditingUldNumber] = useState(null);
  const [uldNumberValue, setUldNumberValue] = useState("");
  const [editingEta, setEditingEta] = useState(null);
  const [etaValue, setEtaValue] = useState("");
  const updateEtaRef = useRef(debounce((id, value) => {
    api.entities.ULDFishbox.update(id, { eta: value });
  }, 500));
  const completedFlightsRef = useRef(new Set());

  const saveLocation = (id) => {
    handleChange(id, "location", locationValue);
    debouncedUpdate(id, "location", locationValue);
    setEditingLocation(null);
  };

  const saveBoxCount = (id) => {
    const val = parseInt(boxCountValue, 10);
    if (isNaN(val) || val < 0) return;
    handleChange(id, "box_count", val);
    debouncedUpdate(id, "box_count", val);
    setEditingBoxCount(null);
  };

  const saveUldNumber = (id, myGroup, flightShipments) => {
    handleChange(id, "uld_number", uldNumberValue);
    if (myGroup) {
      const groupIds = flightShipments.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
      groupIds.forEach(gid => {
        if (gid !== id) handleChange(gid, "uld_number", uldNumberValue);
        debouncedUpdate(gid, "uld_number", uldNumberValue);
      });
    }
    debouncedUpdate(id, "uld_number", uldNumberValue);
    setEditingUldNumber(null);
  };

  const saveEta = (id) => {
    handleChange(id, "eta", etaValue);
    debouncedUpdate(id, "eta", etaValue);
    setEditingEta(null);
  };

  useEffect(() => { 
    loadData();
  }, []);

  // Compute sortedFlights early so it can be used in useEffect
  const filtered = useMemo(() => shipments.filter(s =>
    !search || [s.awb_number, s.order_number, s.destination_name, s.uld_number, s.service_provider]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  ), [shipments, search]);

  const groupedByFlight = useMemo(() => filtered.reduce((acc, s) => {
    const flight = s.flight_number || extractFlightNumber(s.air_routing);
    if (!acc[flight]) acc[flight] = [];
    acc[flight].push(s);
    return acc;
  }, {}), [filtered]);

  const sortedFlights = useMemo(() => {
    const LOOSE_PREFIXES_CHECK = ["214", "220", "221", "501", "065", "999", "105", "217", "406", "618"];
    const flightHasNonLoose = allRecords.reduce((acc, r) => {
      const fn = r.flight_number || extractFlightNumber(r.air_routing);
      if (fn && fn !== "No Flight" && fn !== "TRUCK" && fn !== "CZ134" && fn !== "CZ143") {
        const isLoose = r.awb_number && LOOSE_PREFIXES_CHECK.some(p => r.awb_number.startsWith(p));
        if (!isLoose) acc[fn] = true;
      }
      return acc;
    }, {});
    const MANUALLY_CREATED_FLIGHTS = ['UPS', 'OSCC', 'GPC', 'TRUCK'];
    const allFlightKeys = new Set(Object.keys(groupedByFlight));
    Object.keys(flights).forEach(fn => {
      if (MANUALLY_CREATED_FLIGHTS.includes(fn)) allFlightKeys.add(fn);
    });
    const EXCLUDED_FLIGHTS = ["Q76510S", "QY3317", "SV4760A", "SQ3513", "OSCC FLIGHT", "OSCC", "GPC", "LOOSE", "TRUCK", "CZ134", "CZ143"];
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    return [...allFlightKeys]
      .filter(fn => {
        if (EXCLUDED_FLIGHTS.includes(fn) || fn.startsWith('SV')) return false;
        const recs = groupedByFlight[fn] || [];
        const isComplete = recs.length > 0 && recs.every(s => { const u = s.uld_number; return u && u.trim() !== ""; });
        if (isComplete) {
          const etd = flights[fn]?.departure_date;
          if (etd && new Date(etd) < twoDaysAgo) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Build-complete flights go to the bottom
        const isCompleteA = (groupedByFlight[a] || []).length > 0 && (groupedByFlight[a] || []).every(s => {
          const uldNum = s.uld_number;
          return uldNum && uldNum.trim() !== "";
        });
        const isCompleteB = (groupedByFlight[b] || []).length > 0 && (groupedByFlight[b] || []).every(s => {
          const uldNum = s.uld_number;
          return uldNum && uldNum.trim() !== "";
        });
        if (isCompleteA && !isCompleteB) return 1;
        if (!isCompleteA && isCompleteB) return -1;
        const deadlineA = flights[a]?.weight_deadline ? new Date(flights[a].weight_deadline).getTime() : Infinity;
        const deadlineB = flights[b]?.weight_deadline ? new Date(flights[b].weight_deadline).getTime() : Infinity;
        const etdA = flights[a]?.departure_date ? new Date(flights[a].departure_date).getTime() : Infinity;
        const etdB = flights[b]?.departure_date ? new Date(flights[b].departure_date).getTime() : Infinity;
        if (deadlineA !== Infinity || deadlineB !== Infinity) {
          if (deadlineA === Infinity && deadlineB === Infinity) return etdA - etdB;
          if (deadlineA === Infinity) return 1;
          if (deadlineB === Infinity) return -1;
          return deadlineA - deadlineB;
        }
        return etdA - etdB;
      });
  }, [groupedByFlight, allRecords, flights]);

  const initializedRef = useRef(false);

  useEffect(() => {
    sortedFlights.forEach(flight => {
      const flightRecs = (groupedByFlight[flight] || []).slice().sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
      const allCompleted = flightRecs.length > 0 && flightRecs.every(s => {
        const uldNum = edits[s.id]?.uld_number !== undefined ? edits[s.id].uld_number : s.uld_number;
        return uldNum && uldNum.trim() !== "";
      });
      const wasCompleted = completedFlightsRef.current.has(flight);
      if (allCompleted && !wasCompleted) {
        if (initializedRef.current) playPlingSound();
        completedFlightsRef.current.add(flight);
      } else if (!allCompleted && wasCompleted) {
        completedFlightsRef.current.delete(flight);
      }
    });
    if (!initializedRef.current && sortedFlights.length > 0) {
      initializedRef.current = true;
    }
  }, [sortedFlights, edits]);

  // Save unsaved edits when leaving page
   useEffect(() => {
       return () => {
         Object.keys(edits).forEach(id => {
           const shipment = shipments.find(s => s.id === id);
           if (shipment) {
             const update = {};
             if (edits[id].uld_number !== undefined) update.uld_number = edits[id].uld_number || null;
             if (edits[id].uld_type !== undefined) update.uld_type = edits[id].uld_type;
             if (edits[id].location !== undefined) update.location = edits[id].location;
             if (edits[id].box_count !== undefined) update.box_count = edits[id].box_count;
             if (Object.keys(update).length > 0) api.entities.ULDFishbox.update(id, update);
           }
         });
       };
     }, [edits, shipments]);

   useEffect(() => {
     Object.keys(edits).forEach(id => {
       if (edits[id].box_count !== undefined && prevBoxCounts[id] !== undefined && prevBoxCounts[id] !== edits[id].box_count) {
         const shipment = shipments.find(s => s.id === id);
         if (shipment) {
           toast.info(`BOX AMOUNT CHANGE ${shipment.order_number || shipment.awb_number} ON SHIPMENT`);
         }
       }
     });
     const newPrevBoxCounts = {};
     Object.keys(edits).forEach(id => {
       if (edits[id].box_count !== undefined) {
         newPrevBoxCounts[id] = edits[id].box_count;
       }
     });
     setPrevBoxCounts(newPrevBoxCounts);
    }, [edits])



  async function loadData() {
    setLoadError("");
    setLoading(true);
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
    ]);
    const loadingGuard = setTimeout(() => {
      setLoadError("Loading timed out. Please refresh or sign in again.");
      setLoading(false);
    }, 16000);
    try {
      const [data, flightDataRaw] = await Promise.all([
        withTimeout(api.entities.ULDFishbox.list("-created_date", 500), 15000, 'ULD Registration shipments'),
        withTimeout(api.entities.Flight.list("-created_date", 100), 15000, 'Flights'),
      ]);
      const flightData = Array.isArray(flightDataRaw) ? flightDataRaw : (Array.isArray(flightDataRaw?.items) ? flightDataRaw.items : []);
      const safeData = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      const flightMap = flightData.reduce((acc, f) => { acc[f.flight_number] = f; return acc; }, {});
      setFlights(flightMap);
      const LOOSE_PREFIXES = ["214", "220", "221", "501", "065", "999", "105", "217", "406", "618", "615"];
      // Keep all records to check which flights have non-loose shipments
      setAllRecords(safeData.filter(r => {
        const fn = r.flight_number || extractFlightNumber(r.air_routing);
        return fn !== "CZ134" && fn !== "CZ143";
      }));
      const filtered = safeData.filter(s => {
        const flightNum = s.flight_number || extractFlightNumber(s.air_routing);
        return (!s.awb_number || !LOOSE_PREFIXES.some(p => s.awb_number.startsWith(p))) &&
          s.flight_number !== 'LOOSE' &&
          !s.flight_number?.includes('OSCC') &&
          s.flight_number !== 'GPC' &&
          flightNum !== 'TRUCK' &&
          flightNum !== 'CZ134' &&
          flightNum !== 'CZ143' &&
          (!s.awb_number || !s.awb_number.startsWith('125')) &&
          (!s.awb_number || !s.awb_number.startsWith('784')) &&
          (!s.awb_number || !s.awb_number.startsWith('172'));
      });
      setShipments(filtered);
      // Load groups from database
      const groups = {};
      filtered.forEach(s => {
        if (s.uld_group_id) {
          groups[s.id] = s.uld_group_id;
        }
      });
      setLocalGroups(groups);
    } catch (error) {
      console.error('Failed to load ULD registration data', error);
      setShipments([]);
      setAllRecords([]);
      setFlights({});
      setLoadError('Failed to load registration data');
      toast.error('Failed to load registration data');
    } finally {
      clearTimeout(loadingGuard);
      setLoading(false);
    }
  }

  const handleSendToWeighing = async (id, groupKey) => {
    const shipment = shipments.find(s => s.id === id);
    const uldNumber = edits[id]?.uld_number !== undefined ? edits[id].uld_number : shipment?.uld_number;
    
    if (!shipment || !uldNumber) {
      toast.error('ULD number required');
      return;
    }

    const flightNumber = extractFlightNumber(shipment.air_routing);
    const isRemoving = shipment.status === 'loaded' && uldNumber;
    if (flightNumber.startsWith('TK') && !uldNumber.endsWith('TK') && !isRemoving) {
      toast.error('TK flights require ULD number with TK suffix');
      return;
    }

    const isSent = shipment.status === "loaded" && shipment.uld_number;
    const newStatus = isSent ? "registered" : "loaded";

    if (groupKey) {
      // Update all shipments in the group with delays to avoid rate limiting
      const groupShipments = shipments.filter(s => localGroups[s.id] === groupKey);
      for (const s of groupShipments) {
        await api.entities.ULDFishbox.update(s.id, { status: newStatus });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      // Update single shipment
      await api.entities.ULDFishbox.update(id, { status: newStatus });
    }

    toast.success(isSent ? 'Removed from weighing' : 'Sent to weighing');
    loadData();
  };

  const handleChange = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const debouncedUpdate = (id, field, value) => {
    if (updateTimeoutsRef.current[id]) clearTimeout(updateTimeoutsRef.current[id]);
    updateTimeoutsRef.current[id] = setTimeout(() => {
      api.entities.ULDFishbox.update(id, { [field]: value || null });
    }, 300);
  };

  const exportToExcel = () => {
    const wb = XLSXStyle.utils.book_new();

    const centerStyle = { alignment: { horizontal: 'center', vertical: 'center' } };
    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1F3864' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const titleStyle = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0D1F3C' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const deadlineRowStyle = { font: { bold: true, sz: 11, color: { rgb: '1F3864' } }, fill: { fgColor: { rgb: 'FFE699' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const flightRowStyle = { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2E5FA3' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const cellEven = { font: { sz: 10 }, fill: { fgColor: { rgb: 'DCE6F1' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const cellOdd = { font: { sz: 10 }, fill: { fgColor: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' } };

    const cols = ['FLIGHT', 'ULD', 'BOX', 'ORDER', 'DEST', 'AWB', 'LOCATION', 'X-BOX'];
    const numCols = cols.length;

    const wsData = [];
    const rowHeights = [];
    const merges = [];

    // Title row
    wsData.push([{ v: 'MOWI | BUILD UP', t: 's', s: titleStyle }]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } });
    rowHeights.push({ hpt: 28 });

    // Column headers
    wsData.push(cols.map(h => ({ v: h, t: 's', s: headerStyle })));
    rowHeights.push({ hpt: 20 });

    const isOSCC = (s) => s.awb_number && OSCC_PREFIXES.some(p => s.awb_number.startsWith(p));
    const groupedByFlightLocal = filtered.reduce((acc, s) => {
      const flight = isOSCC(s) ? 'OSCC FLIGHT' : (s.flight_number || extractFlightNumber(s.air_routing));
      if (!acc[flight]) acc[flight] = [];
      acc[flight].push(s);
      return acc;
    }, {});

    const sortedFlightsLocal = Object.keys(groupedByFlightLocal).sort((a, b) => {
      if (a === 'OSCC FLIGHT') return -1;
      if (b === 'OSCC FLIGHT') return 1;
      return a.localeCompare(b);
    });

    sortedFlightsLocal.forEach(flight => {
      const flightShipments = groupedByFlightLocal[flight];
      const deadline = flight !== 'OSCC FLIGHT' && flights[flight]?.weight_deadline
        ? new Date(flights[flight].weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : null;

      // Flight header row
      const flightRow = wsData.length;
      const flightLabel = deadline ? `Flight ${flight}   |   Deadline: ${deadline}` : `Flight ${flight}`;
      wsData.push([{ v: flightLabel, t: 's', s: deadline ? deadlineRowStyle : flightRowStyle }]);
      merges.push({ s: { r: flightRow, c: 0 }, e: { r: flightRow, c: numCols - 1 } });
      rowHeights.push({ hpt: 20 });

      // Sort: group combined shipments together, then ungrouped
      const sortedShipments = [...flightShipments].sort((a, b) => {
        const gA = localGroups[a.id] || '';
        const gB = localGroups[b.id] || '';
        if (gA && gB) return gA.localeCompare(gB);
        if (gA) return -1;
        if (gB) return 1;
        return 0;
      });

      sortedShipments.forEach((s, idx) => {
        const isEven = idx % 2 === 0;
        const base = isEven ? cellEven : cellOdd;
        const xBox = ['HKG','CAN','CTU','PEK','PVG','SZX','MFM','CGK','HAN','SIN','GUM','DXB','JED','DMM','RUH','KWI','BEY','TLV','CPT','SGN','KUL','JNB'].includes(s.destination_code) ? '✕' : '';
        wsData.push([
          { v: flight, t: 's', s: base },
          { v: edits[s.id]?.uld_number || s.uld_number || '', t: 's', s: base },
          { v: s.box_order_1 ?? s.box_count ?? '', t: 'n', s: base },
          { v: s.order_number || '', t: 's', s: base },
          { v: s.destination_code || '', t: 's', s: base },
          { v: s.awb_number || '', t: 's', s: base },
          { v: s.location || '', t: 's', s: base },
          { v: xBox, t: 's', s: base },
        ]);
        rowHeights.push({ hpt: 18 });
      });

      // Spacer
      wsData.push(Array(numCols).fill({ v: '', s: {} }));
      rowHeights.push({ hpt: 8 });
    });

    const ws = XLSXStyle.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [14, 14, 8, 14, 8, 18, 12, 8].map(w => ({ wch: w }));
    ws['!rows'] = rowHeights;
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Build Up');
    XLSXStyle.writeFile(wb, 'mowi-build-up.xlsx');
    toast.success('Excel file downloaded');
  };

  const handleCreateShipment = async (data) => {
    // Set contour to P by default if not specified
    await api.entities.ULDFishbox.create({ ...data, contour: data.contour || 'P' });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ULD REGISTRATION</h1>
          <p className="text-muted-foreground text-sm mt-1">Prepare and register shipments for ULD build</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}



      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Package2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">No shipment records found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Import data from the Import Excel page</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedFlights.map(flight => {
            const flightShipments = (groupedByFlight[flight] || []).slice().sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
            return (
            <div key={flight} className="rounded-xl border border-border overflow-hidden bg-transparent">
            <div className="bg-muted/40 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <h2 className="font-semibold text-lg">Flight {flight}</h2>
                    {flights[flight]?.destination && (
                      <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded">{flights[flight].destination}</span>
                    )}
                    {flights[flight] && (
                      <span className="text-sm font-semibold text-foreground">
                        ETD {new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {flight !== "OSCC FLIGHT" && flights[flight]?.weight_deadline && (
                      <span className="text-sm font-bold text-red-500 px-3 py-1 rounded shadow-[0_0_12px_rgba(239,68,68,0.8)]">
                        Deadline: {new Date(flights[flight].weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {(() => {
                      const allCompleted = flightShipments.length > 0 && flightShipments.every(s => {
                        const uldNum = edits[s.id]?.uld_number !== undefined ? edits[s.id].uld_number : s.uld_number;
                        return uldNum && uldNum.trim() !== "";
                      });
                      if (allCompleted) {
                        return (
                          <span className="text-sm font-bold text-green-600 px-3 py-1 rounded shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-500/40 bg-green-500/10">
                            ✓ BUILD COMPLETE
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{flightShipments.length} AWB shipments</p>
            </div>
              <div className="overflow-x-auto">
                <div className="relative h-1 w-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-80 animate-[ledstrip_2.5s_linear_infinite]" style={{backgroundSize: '40% 100%', backgroundRepeat: 'no-repeat'}} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-transparent">
                      <TableHead className="whitespace-nowrap">ULD Number</TableHead>
                      <TableHead className="whitespace-nowrap">ULD Type</TableHead>
                      <TableHead className="whitespace-nowrap">AWB Number</TableHead>
                      <TableHead className="whitespace-nowrap">Order #</TableHead>
                      <TableHead className="text-right whitespace-nowrap">BOX</TableHead>
                      <TableHead className="whitespace-nowrap">Service Provider</TableHead>
                      <TableHead className="whitespace-nowrap">Code</TableHead>
                      <TableHead className="whitespace-nowrap">Location</TableHead>
                      <TableHead className="whitespace-nowrap">ETA</TableHead>
                      <TableHead className="text-center whitespace-nowrap">X-Box</TableHead>
                      <TableHead className="w-16">Print</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flightShipments.map(s => {
                       const myGroup = localGroups[s.id];
                       const nextIdx = flightShipments.findIndex(x => x.id === s.id) + 1;
                       const prevIdx = flightShipments.findIndex(x => x.id === s.id) - 1;
                       const nextItem = flightShipments[nextIdx];
                       const prevItem = flightShipments[prevIdx];
                       const nextGroup = nextItem ? localGroups[nextItem.id] : null;
                       const prevGroup = prevItem ? localGroups[prevItem.id] : null;
                       const isSameUldAsNext = myGroup && nextGroup === myGroup;
                       const isFirstOfGroup = myGroup && myGroup !== prevGroup;
                       return (
                      <TableRow key={s.id} className={`hover:bg-muted/20 text-sm cursor-default ${isSameUldAsNext ? 'border-b-0 [&>td]:border-b-0' : '[&>td]:border-b [&>td]:border-border'}`} style={myGroup ? { borderLeft: `4px solid ${getGroupColor(myGroup)}` } : {}}>
                        <TableCell className="align-middle">
                          {isFirstOfGroup || !myGroup ? (
                            <div className="flex items-center gap-2">
                              {myGroup && (
                                <div className="w-2 h-7 rounded" style={{ backgroundColor: getGroupColor(myGroup) }}></div>
                              )}
                              {editingUldNumber === s.id ? (
                                <div className="flex gap-1 items-center">
                                  <input
                                    autoFocus
                                    className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground"
                                    value={uldNumberValue}
                                    onChange={e => setUldNumberValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") saveUldNumber(s.id, myGroup, flightShipments); if (e.key === "Escape") setEditingUldNumber(null); }}
                                  />
                                  <button onClick={() => saveUldNumber(s.id, myGroup, flightShipments)} className="text-xs text-green-600 font-bold">✓</button>
                                  <button onClick={() => setEditingUldNumber(null)} className="text-xs text-muted-foreground">✕</button>
                                </div>
                              ) : (
                                <>
                                 <span
                                   onClick={() => { setEditingUldNumber(s.id); setUldNumberValue(edits[s.id]?.uld_number !== undefined ? edits[s.id].uld_number : (s.uld_number || "")); }}
                                   className="cursor-pointer text-xs px-2 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                   title="Click to edit ULD number"
                                 >
                                   {(edits[s.id]?.uld_number !== undefined ? edits[s.id].uld_number : s.uld_number) || "+ ULD #"}
                                 </span>
                                 {(edits[s.id]?.uld_number !== undefined ? edits[s.id].uld_number : s.uld_number) && (
                                   <Hammer className="w-3.5 h-3.5 text-green-500 animate-pulse drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                                 )}
                                </>
                              )}
                              </div>
                              ) : null}
                              </TableCell>
                        <TableCell>
                          {isFirstOfGroup || !myGroup ? (
                            <Select
                              value={edits[s.id]?.uld_type !== undefined ? edits[s.id].uld_type : (s.uld_type || "PMC")}
                              onValueChange={val => {
                                handleChange(s.id, "uld_type", val);
                                api.entities.ULDFishbox.update(s.id, { uld_type: val });
                                if (myGroup) {
                                  const groupIds = flightShipments.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
                                  groupIds.forEach(id => {
                                    if (id !== s.id) {
                                      handleChange(id, "uld_type", val);
                                      api.entities.ULDFishbox.update(id, { uld_type: val });
                                    }
                                  });
                                }
                              }}
                              disabled={saving[s.id]}
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {ULD_TYPES.map(t => (
                                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm whitespace-nowrap">{s.awb_number || "—"}</span>
                            {s.awb_number && (
                              <button onClick={() => { navigator.clipboard.writeText(s.awb_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-sm whitespace-nowrap">{s.order_number || "—"}</span>
                            {s.order_number && (
                              <button onClick={() => { navigator.clipboard.writeText(s.order_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {editingBoxCount === s.id ? (
                            <div className="flex gap-1 items-center justify-end">
                              <input
                                autoFocus
                                type="number"
                                min="0"
                                className="border border-border rounded px-2 py-0.5 text-xs w-16 bg-background text-foreground text-right"
                                value={boxCountValue}
                                onChange={e => setBoxCountValue(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveBoxCount(s.id); if (e.key === "Escape") setEditingBoxCount(null); }}
                              />
                              <button onClick={() => saveBoxCount(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                              <button onClick={() => setEditingBoxCount(null)} className="text-xs text-muted-foreground">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              <span
                                onClick={() => { setEditingBoxCount(s.id); setBoxCountValue(s.box_order_1 ?? s.box_count ?? 0); }}
                                className="cursor-pointer text-xs px-2 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Click to edit box count"
                              >
                                {s.box_order_1 ?? s.box_count ?? "—"}
                              </span>
                            </div>
                          )}
                          {myGroup && !isSameUldAsNext && (
                            <div className="text-sm font-bold text-primary border-t-2 border-primary pt-1 mt-1">
                              Σ {flightShipments.filter(x => localGroups[x.id] === myGroup).reduce((sum, x) => sum + (edits[x.id]?.box_count !== undefined ? Number(edits[x.id].box_count) : (x.box_order_1 ?? x.box_count ?? 0)), 0)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.service_provider ? (
                            <Badge variant="secondary" className="text-xs">{s.service_provider}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {s.destination_code ? (
                            <span className="font-mono font-semibold text-primary">{s.destination_code}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const locValue = edits[s.id]?.location !== undefined ? edits[s.id].location : (s.location || "");
                            return editingLocation === s.id ? (
                              <div className="flex gap-1 items-center">
                                <input autoFocus className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground" value={locationValue} onChange={e => setLocationValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveLocation(s.id); if (e.key === "Escape") setEditingLocation(null); }} />
                                <button onClick={() => saveLocation(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                                <button onClick={() => setEditingLocation(null)} className="text-xs text-muted-foreground">✕</button>
                              </div>
                            ) : (
                              <span onClick={() => { setEditingLocation(s.id); setLocationValue(locValue); }} className={`cursor-pointer text-xs px-2 py-1 rounded transition-colors ${locValue ? "bg-green-500/20 text-green-700 hover:bg-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"}`} title="Click to edit location">{locValue || "+ add"}</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {editingEta === s.id ? (
                            <div className="flex gap-1 items-center">
                              <input
                                autoFocus
                                className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground"
                                value={etaValue}
                                onChange={e => setEtaValue(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveEta(s.id); if (e.key === "Escape") setEditingEta(null); }}
                              />
                              <button onClick={() => saveEta(s.id)} className="text-xs text-green-600 font-bold">✓</button>
                              <button onClick={() => setEditingEta(null)} className="text-xs text-muted-foreground">✕</button>
                            </div>
                          ) : (
                            <span
                              onClick={() => { setEditingEta(s.id); setEtaValue(edits[s.id]?.eta !== undefined ? edits[s.id].eta : (s.eta || "")); }}
                              className={`cursor-pointer text-xs px-2 py-1 rounded transition-colors ${(edits[s.id]?.eta !== undefined ? edits[s.id].eta : s.eta) ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                              title="Click to edit ETA"
                            >
                              {(edits[s.id]?.eta !== undefined ? edits[s.id].eta : s.eta) || "+ ETA"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {["HKG","CAN","CTU","PEK","PVG","SZX","MFM","CGK","HAN","SIN","GUM","DXB","JED","DMM","RUH","KWI","BEY","TLV","CPT","SGN","KUL","JNB"].includes(s.destination_code) ? (
                            <span className="text-red-600 font-bold text-lg shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse">✕</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => window.location.href = `/print-labels/${s.id}`}
                            title="Print Labels"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                        </TableRow>
                        );
                        })}
                  </TableBody>
                </Table>
              </div>
            </div>
            );
          })}
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} records across {sortedFlights.length} flights
          </div>
        </div>
      )}
    </div>
  );
}