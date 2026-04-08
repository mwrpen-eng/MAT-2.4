// @ts-nocheck
// Suppress prop type errors for custom components
// @ts-ignore
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { appApi as api } from "@/api/appApi";
import { Search, RefreshCw, Trash2, Package2, Plus, RotateCcw, Copy, ArrowRightCircle, Plane, Hammer, ExternalLink, Download, Link2 } from "lucide-react";
import XLSXStyle from "xlsx-js-style";
import { toast } from "sonner";
import FlightFormDialog from "@/components/FlightFormDialog";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

/**
 * @param {string} airRouting
 * @returns {number|null}
 */
const extractDayFromRouting = (airRouting) => {
  if (!airRouting) return null;
  const fullDate = airRouting.match(/(\d{1,2})\s*[A-Za-z]{3}\s*(\d{4})/);
  if (fullDate) {
    const match = airRouting.match(/(\d{1,2}\s*[A-Za-z]{3}\s*\d{4})/);
    if (match && match[0]) {
      const parsed = new Date(match[0]);
      if (!isNaN(parsed.getTime())) return parsed.getDate();
    }
  }
  const slashMatch = airRouting.match(/\/(\d{1,2})(?:[A-Za-z]|$)/);
  if (slashMatch) return parseInt(slashMatch[1], 10);
  const dayMatch = airRouting.match(/^(\d{1,2})(?:\D|$)/);
  return dayMatch ? parseInt(dayMatch[1], 10) : null;
};

/**
 * @param {number} day
 * @returns {string|null}
 */
const buildEtdFromDay = (day) => {
  if (!day) return null;
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (day < now.getDate()) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  const d = new Date(year, month, day);
  return d.toISOString().split('T')[0];
};

/**
 * @param {string} airRouting
 * @returns {string}
 */
const extractFlightNumber = (airRouting) => {
  if (!airRouting) return "No Flight";
  const match = airRouting.match(/^([A-Z0-9]+)/);
  return match ? match[1] : "No Flight";
};

const LOOSE_AWB_PREFIXES = ["214", "220", "221", "501", "065", "999", "105", "217", "406", "618"];
const EXCLUDED_FLIGHTS = ["Q76510S", "QY3317", "SV4760A", "SQ3513", "OSCC FLIGHT", "GPC", "UPS"];

const AWB_AIRLINE_MAP = {
  "074": "KL", "180": "EK", "071": "ET", "006": "UA", "001": "AA",
  "020": "LH", "057": "AF", "117": "SK", "083": "FI", "172": "AY",
  "618": "TK", "043": "CX", "160": "SQ", "176": "QR", "081": "MS",
  "014": "AC", "016": "AR", "026": "IB", "055": "LX",
  "297": "EY", "087": "GF", "157": "SV", "232": "WY", "107": "RJ",
  "235": "TG", "125": "FX", "018": "CV", "615": "GPC",
};

/**
 * @param {string} awb
 * @returns {string|null}
 */
const getAwbAirline = (awb) => {
  if (!awb) return null;
  const prefix = awb.replace(/\D/g, '').slice(0, 3);
  return AWB_AIRLINE_MAP[/** @type {keyof typeof AWB_AIRLINE_MAP} */(prefix)] || null;
};

/**
 * @param {string} flightNumber
 * @returns {string|null}
 */
const getFlightAirline = (flightNumber) => {
  if (!flightNumber) return null;
  const match = flightNumber.match(/^([A-Z]{2,3})/);
  return match ? match[1] : null;
};

const GROUP_COLORS = ["#7A2535", "#1A6B35", "#A0520A", "#5A3070", "#1A6060", "#7A6800", "#4A3A7A", "#266050", "#7A3810", "#1A4A6A"];

const playPlingSound = () => {
  const audioContext = new window.AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.2);
};

/**
 * @param {string} groupKey
 * @returns {string|null}
 */
const getGroupColor = (groupKey) => {
  if (!groupKey) return null;
  const hash = groupKey.split('').reduce((acc /** @type {number} */, char /** @type {string} */) => acc + char.charCodeAt(0), 0);
  return GROUP_COLORS[hash % GROUP_COLORS.length];
};

export default function Build() {
    /** @type {[boolean, Function]} */
    const [combiningUld, setCombiningUld] = useState(false);
    /** @type {[boolean, Function]} */
    const [flightDialogOpen, setFlightDialogOpen] = useState(false);
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const highlightId = urlParams.get('shipment');
  /** @type {React.MutableRefObject<any>} */
  const highlightRef = useRef(null);
  /** @type {React.MutableRefObject<Set<any>>} */
  const completedFlightsRef = useRef(new Set());
  /** @type {React.MutableRefObject<boolean>} */
  const isInitialLoadRef = useRef(true);
  /** @type {React.MutableRefObject<{ [key: string]: any }>} */
  const originalBoxCountsRef = useRef({});
  /** @type {React.MutableRefObject<Set<any>>} */
  const locallyEditedRef = useRef(new Set());
  /** @type {React.MutableRefObject<any[]>} */
  const deletedFlightHistoryRef = useRef([]);
  /** @type {React.MutableRefObject<Array<{id: string, updates: any}>>} */
  const undoStackRef = useRef([]);
  /** @type {React.MutableRefObject<{id: string, field: string, value: any}|null>} */
  const preFocusRef = useRef(null);

  const pushUndo = (id, prevUpdates) => {
    undoStackRef.current.push({ id, updates: prevUpdates });
  };

  const handleInputFocus = (id, field, value) => {
    console.log('FOCUS', id, field, value);
    preFocusRef.current = { id, field, value, pushed: false };
  };

  // Call this on every onChange — pushes undo only once per focus session (first edit)
  const trackChange = (id, field, newValue) => {
    const pre = preFocusRef.current;
    console.log('TRACK', id, field, newValue, 'pre:', pre);
    if (pre && String(pre.id) === String(id) && pre.field === field && !pre.pushed && pre.value !== newValue) {
      pushUndo(id, { [field]: pre.value });
      preFocusRef.current = { ...pre, pushed: true };
      console.log('PUSHED UNDO, stack size:', undoStackRef.current.length);
    }
  };

  const handleInputBlurUndo = () => {
    preFocusRef.current = null;
  };
  /** @type {[any[], Function]} */
  const [records, setRecords] = useState([]);
  /** @type {[any[], Function]} */
  const [allRecords, setAllRecords] = useState([]);
  /** @type {[{ [key: string]: any }, Function]} */
  const [flights, setFlights] = useState({});
  /** @type {[boolean, Function]} */
  const [loading, setLoading] = useState(true);
  /** @type {[string, Function]} */
  const [search, setSearch] = useState("");
  /** @type {[string|null, Function]} */
  const [deleteId, setDeleteId] = useState(null);
  /** @type {[string|null, Function]} */
  const [deleteFlightId, setDeleteFlightId] = useState(null);
  /** @type {[Set<any>, Function]} */
  const [selectedFlights, setSelectedFlights] = useState(new Set());
  /** @type {[boolean, Function]} */
  const [deletingMultipleFlights, setDeletingMultipleFlights] = useState(false);
  /** @type {[Set<any>, Function]} */
  const [selected, setSelected] = useState(new Set());
  /** @type {[boolean, Function]} */
  const [deletingBulk, setDeletingBulk] = useState(false);
  /** @type {[{ [key: string]: any }, Function]} */
  const [updatingUldType, setUpdatingUldType] = useState({});
  /** @type {[{ [key: string]: any }, Function]} */
  const [localGroups, setLocalGroups] = useState(() => {
    try {
      const item = localStorage.getItem('buildLocalGroups');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });
  /** @type {[{ [key: string]: any }, Function]} */
  const [flightOrder, setFlightOrder] = useState(() => {
    try {
      const item = localStorage.getItem('buildFlightOrder');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });
  /** @type {[{ [key: string]: any }, Function]} */
  const [groupNotes, setGroupNotes] = useState(() => {
    try {
      const item = localStorage.getItem('buildGroupNotes');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });
  /** @type {[{ [key: string]: any }, Function]} */
  const [flightDestinations, setFlightDestinations] = useState(() => {
    try {
      const item = localStorage.getItem('buildFlightDestinations');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });
  /** @type {[{ [key: string]: any }, Function]} */
  const [originalBoxCounts, setOriginalBoxCounts] = useState(() => {
    try {
      const item = localStorage.getItem('buildOriginalBoxCounts');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });
  /** @type {[Set<any>, Function]} */
  const [externallyUpdated, setExternallyUpdated] = useState(new Set());
  /** @type {[string|null, Function]} */
  const [editingFlight, setEditingFlight] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingFlightNum, setEditingFlightNum] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingDate, setEditingDate] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingBoxCount, setEditingBoxCount] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingBoxOrder1, setEditingBoxOrder1] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingUldNumber, setEditingUldNumber] = useState(null);
  /** @type {[string|null, Function]} */
  const [editingRemark, setEditingRemark] = useState(null);
  /** @type {[string, Function]} */
  const [remarkText, setRemarkText] = useState("");
  /** @type {[string, Function]} */
  const [boxCountValue, setBoxCountValue] = useState("");
  /** @type {[string, Function]} */
  const [boxOrder1Value, setBoxOrder1Value] = useState("");
  /** @type {[string, Function]} */
  const [flightNumInput, setFlightNumInput] = useState("");
  /** @type {[string, Function]} */
  const [dateInput, setDateInput] = useState("");
  /** @type {[string, Function]} */
  const [deadlineInput, setDeadlineInput] = useState("");
  /** @type {[string, Function]} */
  const [uldNumberValue, setUldNumberValue] = useState("");

  const ULD_TYPES = ["PMC", "PAG", "AKE", "AKL", "FQA", "QKE", "P6P", "PAJ", "PLA", "PLB", "PYB"];
  const CONTOUR_CODES = ["P", "E", "A"];

  /**
   * @param {string|number} id
   * @param {string} value
   */
  const handleUldTypeChange = async (id, value) => {
    const prev = records.find(r => r.id === id);
    if (prev) pushUndo(id, { uld_type: prev.uld_type ?? null });
    setUpdatingUldType((/** @type {any} */prev) => ({ ...prev, [id]: true }));
    await api.entities.ULDFishbox.update(String(id), { uld_type: value });
    setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === id ? { ...r, uld_type: value } : r));
    setUpdatingUldType((/** @type {any} */prev) => ({ ...prev, [id]: false }));
  };

  /**
   * @param {string|number} id
   * @param {string} value
   */
  const handleContourChange = async (id, value) => {
    const prev = records.find(r => r.id === id);
    if (prev) pushUndo(id, { contour: prev.contour ?? null });
    await api.entities.ULDFishbox.update(String(id), { contour: value });
    setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === id ? { ...r, contour: value } : r));
  };

  /**
   * @param {string|number} id
   */
  const handleBoxCountChange = async (id) => {
    const value = parseInt(boxCountValue, 10);
    if (isNaN(value) || value < 0) return;
    const prev = records.find(r => r.id === id);
    if (prev) pushUndo(id, { box_count: prev.box_count ?? null });
    locallyEditedRef.current.add(id);
    setOriginalBoxCounts((/** @type {any} */prev) => ({ ...prev, [id]: value }));
    setExternallyUpdated((/** @type {Set<any>} */prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await api.entities.ULDFishbox.update(String(id), { box_count: value });
    setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === id ? { ...r, box_count: value } : r));
    setEditingBoxCount(null);
  };

  /**
   * @param {string} flight
   */
  const handleDateSave = async (flight) => {
    if (!dateInput) return;
    /** @type {any[]} */
    const flightRecords = records.filter((/** @type {any} */r) => (r.flight_number || extractFlightNumber(r.air_routing)) === flight);
    await Promise.all(flightRecords.map((/** @type {any} */r) => api.entities.ULDFishbox.update(r.id, { transfer_date: dateInput })));
    if (flights[flight]) {
      await api.entities.Flight.update(flights[flight].id, { departure_date: dateInput });
      setFlights((/** @type {{[key: string]: any}} */prev) => ({ ...prev, [flight]: { ...prev[flight], departure_date: dateInput } }));
    }
    setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) =>
      (r.flight_number || extractFlightNumber(r.air_routing)) === flight ? { ...r, transfer_date: dateInput } : r
    ));
    setEditingDate(null);
    setDateInput("");
  };

  /**
   * @param {string} oldFlight
   */
  const handleFlightNumSave = async (oldFlight) => {
    const newFlight = flightNumInput.trim().toUpperCase();
    if (!newFlight) return;
    /** @type {any[]} */
    const flightRecords = records.filter((/** @type {any} */r) => (r.flight_number || extractFlightNumber(r.air_routing)) === oldFlight);
    await Promise.all(flightRecords.map((/** @type {any} */r) => api.entities.ULDFishbox.update(r.id, { flight_number: newFlight })));
    setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) =>
      (r.flight_number || extractFlightNumber(r.air_routing)) === oldFlight ? { ...r, flight_number: newFlight } : r
    ));
    setEditingFlightNum(null);
    setFlightNumInput("");
  };

  /**
   * @param {any} flightNumber
   */
  const handleDeadlineUpdate = async (flightNumber) => {
    const flight = flights[flightNumber];
    if (!flight) {
      alert("Flight not found. Please add the flight first on the Flights page.");
      return;
    }
    let deadlineValue = null;
    if (deadlineInput) {
      const today = new Date().toISOString().split('T')[0];
      deadlineValue = `${today}T${deadlineInput}:00`;
    }
    await api.entities.Flight.update(flight.id, { weight_deadline: deadlineValue });
    setFlights((/** @type {{[key: string]: any}} */prev) => ({ ...prev, [flightNumber]: { ...prev[flightNumber], weight_deadline: deadlineValue } }));
    setEditingFlight(null);
    setDeadlineInput("");
    if (deadlineValue) {
      toast.success(`Deadline set for ${new Date(deadlineValue).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    }
  };

  useEffect(() => {
    localStorage.setItem('buildLocalGroups', JSON.stringify(localGroups));
  }, [localGroups]);

  useEffect(() => {
    localStorage.setItem('buildFlightOrder', JSON.stringify(flightOrder));
  }, [flightOrder]);

  useEffect(() => {
    localStorage.setItem('buildGroupNotes', JSON.stringify(groupNotes));
  }, [groupNotes]);

  useEffect(() => {
    localStorage.setItem('buildFlightDestinations', JSON.stringify(flightDestinations));
  }, [flightDestinations]);

  useEffect(() => { 
    loadData();
    const unsubscribe = api.entities.ULDFishbox.subscribe((/** @type {any} */event) => {
      if (event.type === 'update') {
        const currentRecord = allRecords.find((/** @type {any} */r) => r.id === event.id);
        const boxCountChanged = currentRecord && event.data.box_count !== undefined && event.data.box_count !== currentRecord.box_count;
        setAllRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === event.id ? { ...r, ...event.data } : r));
        setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === event.id ? { ...r, ...event.data } : r));
        if (locallyEditedRef.current.has(event.id)) {
          locallyEditedRef.current.delete(event.id);
        } else if (boxCountChanged) {
          setExternallyUpdated((/** @type {Set<any>} */prev) => new Set([...prev, event.id]));
          toast.info(`Box count updated: ${event.data.order_number || event.data.awb_number || 'Shipment'} → ${event.data.box_count} boxes`);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    localStorage.setItem('buildOriginalBoxCounts', JSON.stringify(originalBoxCounts));
  }, [originalBoxCounts]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [records]);

  async function loadData() {
    setLoading(true);
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
    ]);

    try {
      const data = await withTimeout(api.entities.ULDFishbox.list("-created_date", 500), 15000, 'Build shipments');
      setAllRecords(data);
      let nonLoose = data.filter(r =>
        (!r.awb_number || !LOOSE_AWB_PREFIXES.some(prefix => r.awb_number.startsWith(prefix))) &&
        !r.flight_number?.startsWith('OSCC') &&
        !r.flight_number?.startsWith('GPC') &&
        r.service_provider !== 'UPS' &&
        (!r.awb_number || !r.awb_number.startsWith('125')) &&
        (!r.awb_number || !r.awb_number.startsWith('784')) &&
        (!r.awb_number || !r.awb_number.startsWith('AY9090')) &&
        (!r.awb_number || !r.awb_number.startsWith('615')) &&
        (!r.awb_number || !r.awb_number.startsWith('172'))
      );
      // Auto-save PES/COL as default remark for records without notes
      const withoutNotes = nonLoose.filter(r => !r.notes);
      if (withoutNotes.length > 0) {
        await Promise.all(withoutNotes.map(r => api.entities.ULDFishbox.update(r.id, { notes: 'PES/COL' })));
        nonLoose = nonLoose.map(r => !r.notes ? { ...r, notes: 'PES/COL' } : r);
      }
      setRecords(nonLoose);
      const groups = {};
      nonLoose.forEach(/** @type {(r: any) => void} */(r => {
        if (r.uld_group_id) {
          /** @type {any} */(groups)[r.id] = r.uld_group_id;
        }
      }));
      setLocalGroups(groups);
      const originals = {};
      nonLoose.forEach(/** @type {(r: any) => void} */(r => {
        /** @type {any} */(originals)[r.id] = /** @type {any} */(originalBoxCounts)[r.id] ?? r.box_count;
      }));
      originalBoxCountsRef.current = originals;
      setOriginalBoxCounts(originals);
      localStorage.setItem('buildOriginalBoxCounts', JSON.stringify(originals));

      const flightsData = await withTimeout(api.entities.Flight.list(), 15000, 'Flights');
      const flightsMap = {};
      flightsData.forEach(/** @type {(f: any) => void} */(f => { /** @type {any} */(flightsMap)[f.flight_number] = f; }));
      setFlights(flightsMap);
      const destFromDb = {};
      flightsData.forEach(/** @type {(f: any) => void} */(f => { if (f.destination) /** @type {any} */(destFromDb)[f.flight_number] = f.destination; }));
      setFlightDestinations((/** @type {any} */prev) => ({ ...prev, ...destFromDb }));

      const groupedOnLoad = nonLoose.reduce((acc, r) => {
        const flight = r.flight_number || extractFlightNumber(r.air_routing);
        if (!acc[flight]) acc[flight] = [];
        acc[flight].push(r);
        return acc;
      }, {});
      Object.keys(groupedOnLoad).forEach(/** @type {(flight: any) => void} */(flight => {
        const recs = groupedOnLoad[flight];
        if (recs.length > 0 && recs.every(/** @type {(r: any) => boolean} */(r => r.uld_number?.trim?.()))) {
          completedFlightsRef.current.add(flight);
        }
      }));
      isInitialLoadRef.current = false;
    } catch (error) {
      console.error('Failed to load build page data', error);
      setAllRecords([]);
      setRecords([]);
      setFlights({});
      toast.error('Failed to load build data');
      isInitialLoadRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async () => {
    await api.entities.ULDFishbox.delete(String(deleteId));
    setDeleteId(null);
    loadData();
  };

  const handleBulkDelete = async () => {
    setDeletingBulk(true);
    await Promise.all([...selected].map(id => api.entities.ULDFishbox.delete(id)));
    setSelected(new Set());
    setDeletingBulk(false);
    loadData();
  };

  /**
   * @param {any[]} flightNumbers
   */
  const handleDeleteFlights = async (flightNumbers) => {
    setDeletingMultipleFlights(true);
    for (const flightNumber of flightNumbers) {
      const flight = flights[flightNumber];
      if (!flight) continue;
      const flightRecords = allRecords.filter(r => r.flight_number === flightNumber);
      /** @type {any[]} */
      const shipmentIds = flightRecords.map((/** @type {any} */r) => r.id);
      /** @type {any[]} */
      const arr = /** @type {any[]} */ (deletedFlightHistoryRef.current);
      arr.push({
        flight: { ...flight },
        shipmentIds,
        flightNumber
      });
      await Promise.all(flightRecords.map(r => api.entities.ULDFishbox.update(r.id, { flight_number: null })));
      await api.entities.Flight.delete(flight.id);
    }
    setDeletingMultipleFlights(false);
    setSelectedFlights(new Set());
    toast.success(`${flightNumbers.length} flight(s) deleted. Click Revert to undo.`);
    await loadData();
  };

  /**
   * @param {string} flightNumber
   */
  const handleDeleteFlight = async (flightNumber) => {
    const flight = flights[flightNumber];
    if (!flight) {
      toast.error(`Flight ${flightNumber} not found in database`);
      setDeleteFlightId(null);
      return;
    }
    const flightRecords = allRecords.filter(r => r.flight_number === flightNumber);
    /** @type {any[]} */
    const shipmentIds = flightRecords.map((/** @type {any} */r) => r.id);
    /** @type {any[]} */
    const arr = /** @type {any[]} */ (deletedFlightHistoryRef.current);
    arr.push({
      flight: { ...flight },
      shipmentIds,
      flightNumber
    });
    await Promise.all(flightRecords.map(r => api.entities.ULDFishbox.update(r.id, { flight_number: null })));
    await api.entities.Flight.delete(flight.id);
    setDeleteFlightId(null);
    toast.success(`Flight ${flightNumber} deleted. Click Revert to undo.`);
    await loadData();
  };

  const filtered = records.filter(/** @type {(r: any) => boolean} */(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.awb_number, r.order_number, r.pk, r.destination_name, r.destination_code, r.service_provider, r.air_routing, r.uld_number]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  }));

  /**
   * @param {any} result
   */
  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const sourceFlight = result.source.droppableId;
    const destFlight = result.destination.droppableId;

    if (sourceFlight === destFlight) {
      const ordered = getFlightRecords(sourceFlight);
      const [moved] = ordered.splice(result.source.index, 1);
      ordered.splice(result.destination.index, 0, moved);
      setFlightOrder((/** @type {any} */prev) => ({ ...prev, [sourceFlight]: ordered.map((/** @type {any} */r) => r.id) }));
      ordered.forEach((r, idx) => {
        api.entities.ULDFishbox.update(r.id, { sort_order: idx });
      });
    } else {
      const sourceRecords = getFlightRecords(sourceFlight);
      const movedRecord = sourceRecords[result.source.index];
      if (!movedRecord) return;



      await api.entities.ULDFishbox.update(movedRecord.id, { flight_number: destFlight });
      setRecords((/** @type {any[]} */prev) => prev.map((/** @type {any} */r) => r.id === movedRecord.id ? { ...r, flight_number: destFlight } : r));
      toast.success(`Moved to flight ${destFlight}`);
    }
  };

  /**
   * @param {string} flight
   * @returns {any[]}
   */
  const getFlightRecords = (flight) => {
    if (!sortedFlights.length) return [];
    return [...(groupedByFlight[flight] || [])].sort((/** @type {any} */a, /** @type {any} */b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  };

  const groupedByFlight = filtered.reduce(
    /** @type {(acc: any, r: any) => any} */
    ((acc, r) => {
      let flight = r.flight_number || extractFlightNumber(r.air_routing);
      if (!flight || flight === 'No Flight') {
        if (r.awb_number && r.awb_number.startsWith('615')) {
          flight = 'GPC';
        }
      }
      if (!acc[flight]) acc[flight] = [];
      acc[flight].push(r);
      return acc;
    }), {});

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const allFlightKeys = [...new Set([...Object.keys(groupedByFlight), ...Object.keys(flights)])]
    .filter(/** @type {(fn: any) => boolean} */(fn => {
      if (EXCLUDED_FLIGHTS.includes(fn) || fn.startsWith('SV') || fn.startsWith('OSCC') || fn.startsWith('GPC') || fn === 'LOOSE') return false;
      const recs = groupedByFlight[fn] || [];
      const isComplete = recs.length > 0 && recs.every(/** @type {(r: any) => boolean} */ r => r.uld_number?.trim?.());
      if (isComplete) {
        const etd = flights[fn]?.departure_date;
        if (etd && new Date(etd) < twoDaysAgo) return false;
      }
      return true;
    }));

  const sortedFlights = allFlightKeys
    .sort(
      /** @type {(a: any, b: any) => number} */
      ((a, b) => {
        const aRecs = groupedByFlight[a] || [];
        const bRecs = groupedByFlight[b] || [];
        const aComplete = aRecs.length > 0 && aRecs.every(/** @type {(r: any) => boolean} */(r => r.uld_number?.trim?.()));
        const bComplete = bRecs.length > 0 && bRecs.every(/** @type {(r: any) => boolean} */(r => r.uld_number?.trim?.()));
        if (aComplete && !bComplete) return 1;
        if (!aComplete && bComplete) return -1;
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
      })
    );

  useEffect(() => {
    sortedFlights.forEach(flight => {
      const flightRecs = (groupedByFlight[flight] || []).sort(/** @type {(a: any, b: any) => number} */ (a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
      const allCompleted = flightRecs.length > 0 && flightRecs.every(/** @type {(r: any) => boolean} */ r => r.uld_number?.trim?.());
      const wasCompleted = completedFlightsRef.current.has(flight);
      if (allCompleted && !wasCompleted) {
        if (!isInitialLoadRef.current) playPlingSound();
        completedFlightsRef.current.add(flight);
      } else if (!allCompleted && wasCompleted) {
        completedFlightsRef.current.delete(flight);
      }
    });
  }, [sortedFlights]);

  /**
   * @param {any} id
   */
  const toggleOne = (id) => setSelected((/** @type {Set<any>} */prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /**
   * @param {any} shipment
   */
  const handleSendToLoose = async (shipment) => {
    const update = { uld_number: null, uld_type: null, contour: null, uld_group_id: null, flight_number: 'LOOSE' };
    await api.entities.ULDFishbox.update(shipment.id, update);
    toast.success(`Shipment sent to loose inventory`);
    navigate('/loose-overview');
  };

  /**
   * @param {any} shipment
   */
  const handleSendToOsccFlight = async (shipment) => {
    const update = { uld_number: null, uld_type: null, contour: null, uld_group_id: null, flight_number: 'OSCC' };
    await api.entities.ULDFishbox.update(shipment.id, update);
    toast.success(`Shipment sent to OSCC FLIGHT`);
    navigate('/loose-overview');
  };

  /**
   * @param {any} shipment
   */
  const handleSendToGpcFlight = async (shipment) => {
    const update = { uld_number: null, uld_type: null, contour: null, uld_group_id: null, flight_number: 'GPC' };
    await api.entities.ULDFishbox.update(shipment.id, update);
    toast.success(`Shipment sent to GPC flight`);
    navigate('/loose-overview');
  };

  const handleCombine = async () => {
    setCombiningUld(true);
    const groupKey = `GRP-${Date.now()}`;
    await Promise.all([...selected].map(id => api.entities.ULDFishbox.update(id, { uld_group_id: groupKey })));
    setLocalGroups((/** @type {any} */prev) => {
      const next = { ...prev };
      selected.forEach((/** @type {any} */id) => { next[id] = groupKey; });
      return next;
    });
    setOriginalBoxCounts((/** @type {any} */prev) => {
      const next = { ...prev };
      selected.forEach((/** @type {any} */id) => {
        const record = records.find((/** @type {any} */r) => r.id === id);
        if (record) next[id] = record.box_count;
      });
      return next;
    });
    setExternallyUpdated((/** @type {Set<any>} */prev) => {
      const next = new Set(prev);
      selected.forEach((/** @type {any} */id) => next.delete(id));
      return next;
    });
    setSelected(new Set());
    setCombiningUld(false);
    loadData();
  };

  /**
   * @param {any} shipment
   */
  const handleDuplicate = async (shipment) => {
    try {
      const { id, created_date, updated_date, created_by, ...newShipment } = shipment;
      await api.entities.ULDFishbox.create(newShipment);
      toast.success('Shipment duplicated');
      loadData();
    } catch (error) {
      toast.error('Failed to duplicate shipment');
    }
  };

  const handleUncombine = async () => {
    const groupsToRemove = new Set();
    selected.forEach(id => {
      if (localGroups[id]) groupsToRemove.add(localGroups[id]);
    });
    await Promise.all([...selected].map(id => api.entities.ULDFishbox.update(id, { uld_group_id: null })));
    setLocalGroups((/** @type {any} */prev) => {
      const next = { ...prev };
      selected.forEach((/** @type {any} */id) => { delete next[id]; });
      return next;
    });
    setGroupNotes((/** @type {any} */prev) => {
      const next = { ...prev };
      groupsToRemove.forEach((/** @type {any} */group) => { delete next[group]; });
      return next;
    });
    setSelected(new Set());
    loadData();
  };

  /**
   * @param {string} flight
   */
  const toggleAllFlight = (flight) => {
    const flightIds = (groupedByFlight[flight] || []).map((/** @type {any} */r) => r.id);
    setSelected((/** @type {Set<any>} */prev) => {
      const allSelected = flightIds.every((/** @type {any} */id) => prev.has(id));
      const n = new Set(prev);
      if (allSelected) { flightIds.forEach((/** @type {any} */id) => n.delete(id)); }
      else { flightIds.forEach((/** @type {any} */id) => n.add(id)); }
      return n;
    });
  };

  /**
   * @param {any} flight
   */
  const sortRecsForExport = (recs) => {
    // Group combined shipments together, ungrouped stay in place
    const groups = {};
    const ungrouped = [];
    recs.forEach(r => {
      if (r.uld_group_id) {
        if (!groups[r.uld_group_id]) groups[r.uld_group_id] = [];
        groups[r.uld_group_id].push(r);
      } else {
        ungrouped.push(r);
      }
    });
    // Rebuild order: insert group members where first member appeared
    const seen = new Set();
    const result = [];
    recs.forEach(r => {
      if (!r.uld_group_id) {
        result.push(r);
      } else if (!seen.has(r.uld_group_id)) {
        seen.add(r.uld_group_id);
        groups[r.uld_group_id].forEach(gr => result.push(gr));
      }
    });
    return result;
  };

  const exportFlightExcel = (flight) => {
    const flightRecs = sortRecsForExport(getFlightRecords(flight));
    if (!flightRecs.length) { toast.error('No records for this flight'); return; }
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
      fill: { fgColor: { rgb: "1F3864" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: { top: { style: "thin", color: { rgb: "FFFFFF" } }, bottom: { style: "thin", color: { rgb: "FFFFFF" } }, left: { style: "thin", color: { rgb: "FFFFFF" } }, right: { style: "thin", color: { rgb: "FFFFFF" } } }
    };
    const cellStyleEven = { font: { sz: 10, name: "Calibri" }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "DCE6F1" } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
    const cellStyleOdd = { font: { sz: 10, name: "Calibri" }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "FFFFFF" } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
    const getGroupStyle = (groupId) => {
      const hex = (getGroupColor(groupId) || '#4A6FA5').replace('#', '');
      return { font: { sz: 10, name: "Calibri", bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: hex } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
    };
    const routingStyle = (isEven) => ({ ...(isEven ? cellStyleEven : cellStyleOdd), font: { sz: 10, name: "Calibri", bold: true, color: { rgb: "1F3864" } }, fill: { fgColor: { rgb: isEven ? "FFF2CC" : "FFEB9C" } }, alignment: { horizontal: "center", vertical: "center" } });
    const cols = ["AWB", "ORDER", "BOX", "CARRIER", "DEST CITY", "DEST", "AIR ROUTING"];
    const colWidths = [18, 14, 8, 12, 18, 8, 40];
    const wsData = [];
    wsData.push([{ v: `MOWI BUILD LIST — FLIGHT ${flight}`, t: "s", s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "0D1F3C" } }, alignment: { horizontal: "center", vertical: "center" } } }]);
    wsData.push([{ v: "", s: { fill: { fgColor: { rgb: "0D1F3C" } } } }]);
    wsData.push(cols.map(h => ({ v: h, t: "s", s: headerStyle })));
    let ungroupedIdx = 0;
    flightRecs.forEach((r) => {
      let base, routingSt;
      if (r.uld_group_id) {
        base = getGroupStyle(r.uld_group_id);
        routingSt = base;
      } else {
        const isEven = ungroupedIdx % 2 === 0;
        ungroupedIdx++;
        base = isEven ? cellStyleEven : cellStyleOdd;
        routingSt = routingStyle(isEven);
      }
      wsData.push([{ v: r.awb_number || "", t: "s", s: base }, { v: r.order_number || "", t: "s", s: base }, { v: r.box_order_1 ?? r.box_count ?? "", t: "n", s: base }, { v: r.service_provider || "", t: "s", s: base }, { v: r.destination_name || "", t: "s", s: base }, { v: r.destination_code || "", t: "s", s: base }, { v: r.air_routing || "", t: "s", s: routingSt }]);
    });
    const ws = XLSXStyle.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } }];
    ws["!cols"] = colWidths.map(w => ({ wch: w }));
    ws["!rows"] = [{ hpt: 28 }, { hpt: 4 }, { hpt: 20 }, ...flightRecs.map(() => ({ hpt: 18 }))];
    const wb = XLSXStyle.utils.book_new();
    const safeName = flight.replace(/[\\/:*?[\]]/g, '_').substring(0, 31);
    XLSXStyle.utils.book_append_sheet(wb, ws, safeName);
    XLSXStyle.writeFile(wb, `build_list_${flight}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exported build list for flight ${flight}`);
  };

  /**
   * @param {any} flight
   */
  const getDefaultDeadline = (flight) => {
    if (flight?.toUpperCase?.()?.includes('GPC')) return "04:00";
    if (flight === "OSCC") return "05:00";
    if (flight === "UPS") return "07:00";
    return "";
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
          <h1 className="text-2xl font-bold tracking-tight">BUILD</h1>
          <p className="text-muted-foreground text-sm mt-1">{sortedFlights.reduce((sum, f) => sum + (groupedByFlight[f]?.length || 0), 0)} ULD shipments (loose excluded)</p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          {selected.size > 0 && (
            <>
              <Button variant="outline" onClick={handleCombine} disabled={combiningUld} className="gap-2">
                <Package2 className="w-4 h-4" /> {combiningUld ? "Combining..." : `Combine ${selected.size} on ULD`}
              </Button>
              {[...selected].some(id => localGroups[id]) && (
                <Button variant="outline" onClick={handleUncombine} className="gap-2">
                  <Package2 className="w-4 h-4" /> Uncombine {selected.size}
                </Button>
              )}
              <Button variant="destructive" onClick={handleBulkDelete} disabled={deletingBulk} className="gap-2">
                <Trash2 className="w-4 h-4" />{deletingBulk ? "Deleting..." : `Delete ${selected.size}`}
              </Button>
            </>
          )}
          {selectedFlights.size > 0 && (
            <Button variant="destructive" onClick={() => handleDeleteFlights([...selectedFlights])} disabled={deletingMultipleFlights} className="gap-2">
              <Trash2 className="w-4 h-4" />{deletingMultipleFlights ? "Deleting..." : `Delete ${selectedFlights.size} Flight${selectedFlights.size > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button variant="outline" onClick={() => setFlightDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Flight
          </Button>
          <Button variant="outline" size="icon" onClick={async () => {
            console.log('Undo stack:', JSON.stringify(undoStackRef.current));
            const last = undoStackRef.current.pop();
            if (!last) { toast.info('Nothing to undo'); return; }
            console.log('Undoing:', last);
            try {
              await api.entities.ULDFishbox.update(String(last.id), last.updates);
              setRecords(prev => prev.map(r => String(r.id) === String(last.id) ? { ...r, ...last.updates } : r));
              toast.success('Last change undone');
            } catch (err) {
              console.error('Undo error:', err);
              toast.error('Undo failed: ' + err?.message);
              undoStackRef.current.push(last);
            }
          }} className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" title="Undo last change">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => {
            const flightsWithRecords = sortedFlights.filter(f => getFlightRecords(f).length > 0);
            if (!flightsWithRecords.length) { toast.error('No records to export'); return; }
            const headerStyle = {
              font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
              fill: { fgColor: { rgb: "1F3864" } },
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
              border: { top: { style: "thin", color: { rgb: "FFFFFF" } }, bottom: { style: "thin", color: { rgb: "FFFFFF" } }, left: { style: "thin", color: { rgb: "FFFFFF" } }, right: { style: "thin", color: { rgb: "FFFFFF" } } }
            };
            const cellStyleEven = { font: { sz: 10, name: "Calibri" }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "DCE6F1" } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
            const cellStyleOdd = { font: { sz: 10, name: "Calibri" }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "FFFFFF" } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
            const getGroupStyleAll = (groupId) => {
              const hex = (getGroupColor(groupId) || '#4A6FA5').replace('#', '');
              return { font: { sz: 10, name: "Calibri", bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: hex } }, border: { top: { style: "thin", color: { rgb: "B8CCE4" } }, bottom: { style: "thin", color: { rgb: "B8CCE4" } }, left: { style: "thin", color: { rgb: "B8CCE4" } }, right: { style: "thin", color: { rgb: "B8CCE4" } } } };
            };
            const routingStyle = (isEven) => ({ ...(isEven ? cellStyleEven : cellStyleOdd), font: { sz: 10, name: "Calibri", bold: true, color: { rgb: "1F3864" } }, fill: { fgColor: { rgb: isEven ? "FFF2CC" : "FFEB9C" } }, alignment: { horizontal: "center", vertical: "center" } });
            const cols = ["AWB", "ORDER", "BOX", "CARRIER", "DEST CITY", "DEST", "AIR ROUTING"];
            const colWidths = [18, 14, 8, 12, 18, 8, 16];
            const wsData = [];
            const rowHeights = [];
            const merges = [];
            flightsWithRecords.forEach(flight => {
              const flightRecs = sortRecsForExport(getFlightRecords(flight));
              const titleRow = wsData.length;
              wsData.push([{ v: `MOWI BUILD LIST — FLIGHT ${flight}`, t: "s", s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "0D1F3C" } }, alignment: { horizontal: "center", vertical: "center" } } }]);
              rowHeights.push({ hpt: 28 });
              merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: cols.length - 1 } });
              wsData.push(cols.map(h => ({ v: h, t: "s", s: headerStyle })));
              rowHeights.push({ hpt: 20 });
              let ungroupedIdx = 0;
              flightRecs.forEach((r) => {
                let base, routingSt;
                if (r.uld_group_id) {
                  base = getGroupStyleAll(r.uld_group_id);
                  routingSt = base;
                } else {
                  const isEven = ungroupedIdx % 2 === 0;
                  ungroupedIdx++;
                  base = isEven ? cellStyleEven : cellStyleOdd;
                  routingSt = routingStyle(isEven);
                }
                wsData.push([{ v: r.awb_number || "", t: "s", s: base }, { v: r.order_number || "", t: "s", s: base }, { v: r.box_order_1 ?? r.box_count ?? "", t: "n", s: base }, { v: r.service_provider || "", t: "s", s: base }, { v: r.destination_name || "", t: "s", s: base }, { v: r.destination_code || "", t: "s", s: base }, { v: r.air_routing || "", t: "s", s: routingSt }]);
                rowHeights.push({ hpt: 18 });
              });
              wsData.push([{ v: "", s: {} }]);
              rowHeights.push({ hpt: 10 });
            });
            const ws = XLSXStyle.utils.aoa_to_sheet(wsData);
            ws["!merges"] = merges;
            ws["!cols"] = colWidths.map(w => ({ wch: w }));
            ws["!rows"] = rowHeights;
            const wb = XLSXStyle.utils.book_new();
            XLSXStyle.utils.book_append_sheet(wb, ws, "Build List");
            XLSXStyle.writeFile(wb, `build_list_ALL_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast.success(`Exported ${flightsWithRecords.length} flights stacked on one sheet`);
          }} className="gap-2">
            <Download className="w-4 h-4" /> Export All Flights
          </Button>
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>



      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Package2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">No shipment records found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Import data from the Import Excel page</p>
        </div>
      ) : (
        <div className="space-y-6">
          <DragDropContext onDragEnd={onDragEnd}>
          {sortedFlights.map(flight => {
            const flightRecords = groupedByFlight[flight] || [];

            return (
              <div key={flight} className="rounded-xl border border-border overflow-hidden bg-transparent">
                <div className="bg-muted/40 px-4 py-3 border-b border-border">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const flightRecords = getFlightRecords(flight);
                        const allCompleted = flightRecords.length > 0 && flightRecords.every(r => r.uld_number?.trim?.());
                        if (allCompleted) {
                          return (
                            <span className="text-sm font-bold text-green-600 px-3 py-1 rounded shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-500/40 bg-green-500/10">
                              ✓ BUILD COMPLETE
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {editingFlightNum === flight ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className="border border-border rounded px-2 py-1 text-sm font-semibold bg-foreground text-background w-32 uppercase"
                            value={flightNumInput}
                            onChange={e => setFlightNumInput(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === 'Enter') handleFlightNumSave(flight); if (e.key === 'Escape') { setEditingFlightNum(null); setFlightNumInput(''); } }}
                          />
                          <Button size="sm" variant="default" onClick={() => handleFlightNumSave(flight)} className="h-8">Save</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingFlightNum(null); setFlightNumInput(''); }} className="h-8">Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <h2
                            className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
                            onClick={() => { setEditingFlightNum(flight); setFlightNumInput(flight); }}
                            title="Click to edit flight number"
                          >Flight {flight}</h2>
                          {(() => {
                             const allFlightRecs = getFlightRecords(flight);
                             const rep = allFlightRecs[0];
                             if (!rep) return null;
                             const repWithRouting = allFlightRecs.find(r => r.air_routing) || rep;
                             const routingDay = extractDayFromRouting(repWithRouting.air_routing);
                             const flightFromDb = flights[flight];
                             let dateVal;
                             if (flightFromDb?.departure_date) {
                               dateVal = flightFromDb.departure_date;
                             } else if (rep.transfer_date) {
                               dateVal = rep.transfer_date;
                             } else if (routingDay) {
                               dateVal = buildEtdFromDay(routingDay);
                             } else {
                               dateVal = (() => { const d = new Date(rep.created_date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();
                             }
                             const displayDate = new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            if (editingDate === flight) {
                              return (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-muted-foreground">ETD</span>
                                  <input
                                    autoFocus
                                    type="date"
                                    className="border border-border rounded px-2 py-1 text-xs bg-background h-7"
                                    value={dateInput}
                                    onChange={e => setDateInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleDateSave(flight); if (e.key === 'Escape') { setEditingDate(null); setDateInput(''); } }}
                                  />
                                  <Button size="sm" variant="default" onClick={() => handleDateSave(flight)} className="h-7 text-xs">Save</Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingDate(null); setDateInput(''); }} className="h-7 text-xs">Cancel</Button>
                                </div>
                              );
                            }
                            return (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="DEST"
                                maxLength={3}
                                className="border border-border rounded px-2 py-1 text-xs w-16 bg-background uppercase font-mono font-semibold text-center"
                                value={flightDestinations[flight] || ""}
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setFlightDestinations(prev => ({ ...prev, [flight]: val }));
                                }}
                                onBlur={async e => {
                                  const val = e.target.value.toUpperCase();
                                  if (flights[flight]) {
                                    await api.entities.Flight.update(flights[flight].id, { destination: val });
                                  }
                                }}
                                title="Flight destination airport code"
                              />
                              <span
                                className="text-sm text-primary font-semibold cursor-pointer hover:bg-primary/10 px-2 py-1 rounded transition-colors"
                                onClick={() => { setEditingDate(flight); setDateInput(flights[flight]?.departure_date || dateVal); }}
                                title="Click to edit ETD"
                              >
                                <span className="text-xs mr-1">ETD:</span>{displayDate}
                              </span>
                            </div>
                          );
                            })()}
                        </div>
                      )}
                      {editingFlight === flight ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={deadlineInput}
                            onChange={(/** @type {any} */ e) => setDeadlineInput(e.target.value)}
                            className="h-8 w-32 text-xs"
                          />
                          <Button size="sm" variant="default" onClick={() => handleDeadlineUpdate(flight)} className="h-8">Save</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingFlight(null); setDeadlineInput(""); }} className="h-8">Cancel</Button>
                        </div>
                      ) : (
                        !flights[flight]?.weight_deadline ? (
                           <Button
                             size="sm"
                             variant="outline"
                             onClick={() => {
                               setEditingFlight(flight);
                               setDeadlineInput(getDefaultDeadline(flight));
                             }}
                            className="h-7 text-xs animate-pulse border-red-500 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                          >
                            Set Deadline
                          </Button>
                        ) : (
                          <span
                            className="text-sm font-bold text-red-500 px-3 py-1 rounded shadow-[0_0_12px_rgba(239,68,68,0.8)] cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setEditingFlight(flight);
                              setDeadlineInput(new Date(flights[flight].weight_deadline).toTimeString().slice(0, 5));
                            }}
                            title="Click to edit deadline"
                          >
                            Deadline: {new Date(flights[flight].weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )
                      )}
                    </div>

                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2">
                   <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={() => exportFlightExcel(flight)} title="Export this flight to Excel">
                     <Download className="w-4 h-4" />
                   </Button>
                   <input
                     type="checkbox"
                     checked={selectedFlights.has(flight)}
                     onChange={() => setSelectedFlights((/** @type {Set<any>} */ prev) => { const n = new Set(prev); n.has(flight) ? n.delete(flight) : n.add(flight); return n; })}
                     className="cursor-pointer"
                     title="Select flight for bulk delete"
                   />
                   <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteFlightId(flight)} title="Delete flight">
                     <Trash2 className="w-4 h-4" />
                   </Button>
                  </div>
                    </div>
                    <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-transparent">
                        <TableHead className="whitespace-nowrap">ULD Type</TableHead>
                        <TableHead className="whitespace-nowrap">Contour</TableHead>
                        <TableHead className="whitespace-nowrap">ULD Number</TableHead>
                        <TableHead className="whitespace-nowrap">AWB Number</TableHead>
                        <TableHead className="whitespace-nowrap">Order #</TableHead>
                        <TableHead className="text-right whitespace-nowrap">BOX ORDER 1</TableHead>
                        <TableHead className="text-right whitespace-nowrap">TOTAL ORDER</TableHead>
                        <TableHead className="whitespace-nowrap">Service Provider</TableHead>
                        <TableHead className="whitespace-nowrap">Destination</TableHead>
                        <TableHead className="whitespace-nowrap">AIR Routing</TableHead>
                        <TableHead className="whitespace-nowrap">AIRPORT</TableHead>
                        <TableHead className="whitespace-nowrap">TRANS FLIGHT 1</TableHead>
                        <TableHead className="whitespace-nowrap">AIRPORT 2</TableHead>

                        <TableHead className="whitespace-nowrap">TRANS FLIGHT 2</TableHead>
                        <TableHead className="whitespace-nowrap">Code</TableHead>
                        <TableHead className="whitespace-nowrap">Remarks</TableHead>
                        <TableHead className="whitespace-nowrap">Extra Service</TableHead>
                        <TableHead className="w-12"></TableHead>
                        <TableHead className="w-10">
                          <input type="checkbox"
                            checked={flightRecords.length > 0 && flightRecords.every(/** @type {(r: any) => boolean} */ r => selected.has(r.id))}
                            onChange={() => toggleAllFlight(flight)}
                            className="cursor-pointer"
                          />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <Droppable droppableId={flight}>
                      {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps} className={flightRecords.length === 0 ? 'min-h-[48px]' : ''}>
                      {getFlightRecords(flight).map((r, idx) => {
                        const orderedRecords = getFlightRecords(flight);
                        const prevR = orderedRecords[idx - 1];
                        const nextR = orderedRecords[idx + 1];
                        const myGroup = localGroups[r.id];
                        const isSameUldAsPrev = myGroup && localGroups[prevR?.id] === myGroup;
                        const isSameUldAsNext = myGroup && localGroups[nextR?.id] === myGroup;
                        const isFirstOfGroup = myGroup && !isSameUldAsPrev;
                        return (
                        <Draggable key={r.id} draggableId={r.id} index={idx}>
                          {(dragProvided) => (
                        <TableRow
                          ref={(node) => {
                            dragProvided.innerRef(node);
                            if (r.id === highlightId) highlightRef.current = node;
                          }}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={`text-sm cursor-grab active:cursor-grabbing ${isSameUldAsNext ? 'border-b-0 [&>td]:border-b-0' : 'border-b border-border [&>td]:border-b [&>td]:border-border'} ${r.id === highlightId ? 'bg-secondary/20 ring-2 ring-secondary ring-inset' : selected.has(r.id) ? 'bg-accent/50' : ''}`}
                          style={myGroup ? { borderLeft: `4px solid ${getGroupColor(myGroup)}` } : {}}
                        >
                          <TableCell>
                            {isFirstOfGroup ? (
                              <Select value={r.uld_type || "PMC"} onValueChange={val => {
                                handleUldTypeChange(r.id, val);
                                const groupIds = orderedRecords.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
                                groupIds.forEach(id => {
                                  if (id !== r.id) handleUldTypeChange(id, val);
                                });
                              }} disabled={updatingUldType[r.id]}>
                                <SelectTrigger className="h-7 w-24 text-xs">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ULD_TYPES.map(t => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : !myGroup ? (
                              <Select value={r.uld_type || "PMC"} onValueChange={val => handleUldTypeChange(r.id, val)} disabled={updatingUldType[r.id]}>
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
                          <TableCell>
                            {isFirstOfGroup ? (
                              <Select value={r.contour || "P"} onValueChange={val => {
                                handleContourChange(r.id, val);
                                const groupIds = orderedRecords.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
                                groupIds.forEach(id => {
                                  if (id !== r.id) handleContourChange(id, val);
                                });
                              }}>
                                <SelectTrigger className="h-7 w-16 text-xs">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONTOUR_CODES.map(c => (
                                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : !myGroup ? (
                              <Select value={r.contour || "P"} onValueChange={val => handleContourChange(r.id, val)}>
                                <SelectTrigger className="h-7 w-16 text-xs">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONTOUR_CODES.map(c => (
                                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono font-medium whitespace-nowrap">
                            {isFirstOfGroup || !myGroup ? (
                              <div className="flex items-center gap-2">
                                {myGroup && (
                                  <div className="w-1.5 h-5 rounded" style={{ backgroundColor: getGroupColor(myGroup) || 'transparent' }}></div>
                                )}
                                {editingUldNumber === r.id ? (
                                  <div className="flex gap-1 items-center">
                                    <input
                                      autoFocus
                                      className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground"
                                      value={uldNumberValue}
                                      onChange={e => setUldNumberValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") {
                                          const newUld = uldNumberValue;
                                          setRecords((/** @type {any[]} */ prev) => prev.map(/** @type {(item: any) => any} */ item => item.id === r.id ? { ...item, uld_number: newUld } : item));
                                          if (myGroup) {
                                            const groupIds = orderedRecords.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
                                            Promise.all(groupIds.map(id => api.entities.ULDFishbox.update(id, { uld_number: newUld })));
                                          } else {
                                            api.entities.ULDFishbox.update(r.id, { uld_number: newUld });
                                          }
                                          setEditingUldNumber(null);
                                        }
                                        if (e.key === "Escape") setEditingUldNumber(null);
                                      }}
                                    />
                                    <button onClick={() => {
                                      const newUld = uldNumberValue;
                                      setRecords((/** @type {any[]} */ prev) => prev.map(/** @type {(item: any) => any} */ item => item.id === r.id ? { ...item, uld_number: newUld } : item));
                                      if (myGroup) {
                                        const groupIds = orderedRecords.filter(item => localGroups[item.id] === myGroup).map(item => item.id);
                                        Promise.all(groupIds.map(id => api.entities.ULDFishbox.update(id, { uld_number: newUld })));
                                      } else {
                                        api.entities.ULDFishbox.update(r.id, { uld_number: newUld });
                                      }
                                      setEditingUldNumber(null);
                                    }} className="text-xs text-green-600 font-bold">✓</button>
                                    <button onClick={() => setEditingUldNumber(null)} className="text-xs text-muted-foreground">✕</button>
                                  </div>
                                ) : (
                                  <>
                                   <span
                                     onClick={() => { setEditingUldNumber(r.id); setUldNumberValue(r.uld_number || ""); }}
                                     className="cursor-pointer text-xs px-2 py-1 rounded transition-colors bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                                     title="Click to edit ULD number"
                                   >
                                     {r.uld_number || "+ ULD #"}
                                   </span>
                                   {r.uld_number && (
                                     <Hammer className="w-3.5 h-3.5 text-green-500 animate-pulse drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                                   )}
                                  </>
                                )}
                                </div>
                                ) : null}
                                </TableCell>
                                <TableCell className="font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                className="border border-border rounded px-2 py-1 text-xs w-28 bg-background font-mono"
                                value={r.awb_number || ""}
                                onFocus={e => handleInputFocus(r.id, 'awb_number', e.target.value)}
                                onBlur={handleInputBlurUndo}
                                onChange={e => {
                                  const val = e.target.value;
                                  trackChange(r.id, 'awb_number', val);
                                  setRecords(prev => prev.map(item => item.id === r.id ? { ...item, awb_number: val } : item));
                                  api.entities.ULDFishbox.update(r.id, { awb_number: val });
                                }}
                              />
                              {r.awb_number && (
                                <button onClick={() => { navigator.clipboard.writeText(r.awb_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                className="border border-border rounded px-2 py-1 text-xs w-28 bg-background"
                                value={r.order_number || ""}
                                onFocus={e => handleInputFocus(r.id, 'order_number', e.target.value)}
                                onBlur={handleInputBlurUndo}
                                onChange={e => {
                                  const val = e.target.value;
                                  trackChange(r.id, 'order_number', val);
                                  setRecords(prev => prev.map(item => item.id === r.id ? { ...item, order_number: val } : item));
                                  api.entities.ULDFishbox.update(r.id, { order_number: val });
                                }}
                              />
                              {r.order_number && (
                                <button onClick={() => { navigator.clipboard.writeText(r.order_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {editingBoxOrder1 === r.id ? (
                              <div className="flex gap-1 items-center justify-end">
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  className="border border-border rounded px-2 py-0.5 text-xs w-16 bg-background text-foreground text-right"
                                  value={boxOrder1Value}
                                  onChange={e => setBoxOrder1Value(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      const val = parseInt(boxOrder1Value, 10);
                                      if (!isNaN(val) && val >= 0) {
                                        api.entities.ULDFishbox.update(r.id, { box_order_1: val });
                                        setRecords(prev => prev.map(item => item.id === r.id ? { ...item, box_order_1: val } : item));
                                      }
                                      setEditingBoxOrder1(null);
                                    }
                                    if (e.key === "Escape") setEditingBoxOrder1(null);
                                  }}
                                  />
                                  <button onClick={() => {
                                  const val = parseInt(boxOrder1Value, 10);
                                  if (!isNaN(val) && val >= 0) {
                                    api.entities.ULDFishbox.update(r.id, { box_order_1: val });
                                    setRecords(prev => prev.map(item => item.id === r.id ? { ...item, box_order_1: val } : item));
                                  }
                                  setEditingBoxOrder1(null);
                                  }} className="text-xs text-green-600 font-bold">✓</button>
                                  <button onClick={() => setEditingBoxOrder1(null)} className="text-xs text-muted-foreground">✕</button>
                                  </div>
                                  ) : (
                                  <span
                                  onClick={() => { setEditingBoxOrder1(r.id); setBoxOrder1Value(r.box_order_1 ?? r.box_count ?? 0); }}
                                className="cursor-pointer text-xs px-2 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Click to edit box order 1"
                              >
                                {r.box_order_1 ?? r.box_count ?? "—"}
                                </span>
                                )}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                            {editingBoxCount === r.id ? (
                              <div className="flex gap-1 items-center justify-end">
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  className="border border-border rounded px-2 py-0.5 text-xs w-16 bg-background text-foreground text-right"
                                  value={boxCountValue}
                                  onChange={e => setBoxCountValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleBoxCountChange(r.id); if (e.key === "Escape") setEditingBoxCount(null); }}
                                />
                                <button onClick={() => handleBoxCountChange(r.id)} className="text-xs text-green-600 font-bold">✓</button>
                                <button onClick={() => setEditingBoxCount(null)} className="text-xs text-muted-foreground">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <span
                                  onClick={() => { setEditingBoxCount(r.id); setBoxCountValue(r.box_count || 0); }}
                                  className="cursor-pointer text-xs px-2 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Click to edit box count"
                                >
                                  {r.box_count ?? "—"}
                                </span>
                                {externallyUpdated.has(r.id) ? (
                                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"></div>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.service_provider ? (
                              <Badge variant="secondary" className="text-xs">{r.service_provider}</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.destination_name || "—"}</TableCell>
                          <TableCell>
                            <input
                              type="text"
                              placeholder="E.g. EK9905/27, EK8902/27"
                              className="border border-border rounded px-2 py-1 text-xs w-40 bg-background"
                              value={r.air_routing || ""}
                              onFocus={e => handleInputFocus(r.id, 'air_routing', e.target.value)}
                              onChange={e => {
                                const newVal = e.target.value;
                                trackChange(r.id, 'air_routing', newVal);
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, air_routing: newVal } : item));
                                if (newVal && !r.comment_2 && flightDestinations[flight]) {
                                  const update = { air_routing: newVal, comment_2: flightDestinations[flight] };
                                  api.entities.ULDFishbox.update(r.id, update);
                                  setRecords(prev => prev.map(item => item.id === r.id ? { ...item, ...update } : item));
                                } else {
                                  api.entities.ULDFishbox.update(r.id, { air_routing: newVal });
                                }
                              }}
                              onBlur={e => { handleInputBlurUndo(); api.entities.ULDFishbox.update(r.id, { air_routing: e.target.value }); }}
                              />
                              </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <input
                              type="text"
                              placeholder={flightDestinations[flight] || "Destination"}
                              className="border border-border rounded px-2 py-1 text-xs w-24 bg-background uppercase font-mono font-semibold"
                              value={r.comment_2 || flightDestinations[flight] || ""}
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, comment_2: val } : item));
                                api.entities.ULDFishbox.update(r.id, { comment_2: val });
                              }}
                              maxLength="3"
                              title={`Default: ${flightDestinations[flight] || 'Not set'}. Override for this shipment.`}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            <input
                              type="text"
                              placeholder="E.g. EK1234/27"
                              className="border border-border rounded px-2 py-1 text-xs w-32 bg-background"
                              value={r.air_routing && r.air_routing.split(",").length > 1 ? r.air_routing.split(",")[1].trim() : ""}
                              onChange={e => {
                                const parts = (r.air_routing || "").split(",").map(s => s.trim());
                                while (parts.length < 3) parts.push("");
                                parts[1] = e.target.value;
                                const newVal = parts.join(", ").replace(/,\s*$/, "").trim();
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, air_routing: newVal } : item));
                                api.entities.ULDFishbox.update(r.id, { air_routing: newVal });
                              }}
                              onBlur={e => {
                                const parts = (r.air_routing || "").split(",").map(s => s.trim());
                                while (parts.length < 3) parts.push("");
                                parts[1] = e.target.value;
                                const newVal = parts.join(", ").replace(/,\s*$/, "").trim();
                                api.entities.ULDFishbox.update(r.id, { air_routing: newVal });
                              }}
                              />
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                              <input
                              type="text"
                              placeholder="E.g. AMS"
                              className="border border-border rounded px-2 py-1 text-xs w-24 bg-background uppercase font-mono font-semibold"
                              value={r.comment_4 || ""}
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, comment_4: val } : item));
                              }}
                              onBlur={e => api.entities.ULDFishbox.update(r.id, { comment_4: e.target.value.toUpperCase() })}
                              maxLength="3"
                              />
                              </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            <input
                              type="text"
                              placeholder="E.g. EK1234/27"
                              className="border border-border rounded px-2 py-1 text-xs w-32 bg-background"
                              value={r.comment_5 || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, comment_5: val } : item));
                                api.entities.ULDFishbox.update(r.id, { comment_5: val });
                              }}
                              />
                              </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.destination_code ? (
                              <span className="font-mono font-semibold text-primary">{r.destination_code}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {editingRemark === r.id ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  autoFocus
                                  className="border border-border rounded px-2 py-0.5 text-xs w-28 bg-background text-foreground"
                                  value={remarkText}
                                  onChange={e => setRemarkText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      api.entities.ULDFishbox.update(r.id, { notes: remarkText });
                                      setRecords(prev => prev.map(item => item.id === r.id ? { ...item, notes: remarkText } : item));
                                      setEditingRemark(null);
                                    }
                                    if (e.key === "Escape") setEditingRemark(null);
                                  }}
                                />
                                <button onClick={() => {
                                  api.entities.ULDFishbox.update(r.id, { notes: remarkText });
                                  setRecords(prev => prev.map(item => item.id === r.id ? { ...item, notes: remarkText } : item));
                                  setEditingRemark(null);
                                }} className="text-xs text-green-600 font-bold">✓</button>
                                <button onClick={() => setEditingRemark(null)} className="text-xs text-muted-foreground">✕</button>
                              </div>
                            ) : (
                              <span
                                onClick={() => { setEditingRemark(r.id); setRemarkText(r.notes || "PES/COL"); }}
                                className="cursor-pointer text-xs px-2 py-1 rounded transition-colors bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="Click to edit remarks"
                              >
                                {r.notes || "PES/COL"}
                              </span>
                            )}
                              </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <input
                              type="text"
                              placeholder=""
                              className="border border-border rounded px-2 py-1 text-xs w-28 bg-background"
                              value={r.extra_service || (flight.startsWith('KE') ? 'BUTTOM LAYER' : '')}
                              onChange={e => {
                                setRecords(prev => prev.map(item => item.id === r.id ? { ...item, extra_service: e.target.value } : item));
                                api.entities.ULDFishbox.update(r.id, { extra_service: e.target.value });
                              }}
                              onBlur={e => api.entities.ULDFishbox.update(r.id, { extra_service: e.target.value })}
                              />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex gap-1">
                              <Button
                                                 variant="ghost"
                                                 size="icon"
                                                 className={`h-7 w-7 ${selected.has(r.id) ? 'text-secondary bg-secondary/20' : 'text-muted-foreground hover:text-secondary'}`}
                                                 title={selected.has(r.id) ? `Selected for combine (${selected.size} selected — click another row's combine to merge)` : 'Combine with another shipment'}
                                                 onClick={async () => {
                                                   if (selected.has(r.id)) {
                                                     // Deselect
                                                     setSelected(prev => { const n = new Set(prev); n.delete(r.id); return n; });
                                                   } else if (selected.size >= 1) {
                                                     // Add this row and immediately combine all
                                                     const newSelected = new Set(selected);
                                                     newSelected.add(r.id);
                                                     setSelected(newSelected);
                                                     setCombiningUld(true);
                                                     const groupKey = `GRP-${Date.now()}`;
                                                     await Promise.all([...newSelected].map(id => api.entities.ULDFishbox.update(id, { uld_group_id: groupKey })));
                                                     setLocalGroups(prev => { const next = { ...prev }; newSelected.forEach(id => { next[id] = groupKey; }); return next; });
                                                     setSelected(new Set());
                                                     setCombiningUld(false);
                                                     toast.success('Shipments combined on ULD');
                                                     loadData();
                                                   } else {
                                                     // First selection
                                                     setSelected(new Set([r.id]));
                                                     toast.info('Now click combine on another shipment to merge them');
                                                   }
                                                 }}
                                               >
                                                 <Link2 className="w-3.5 h-3.5" />
                                               </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-500" onClick={() => handleSendToLoose(r)} title="Send to Loose">
                                                 <Plane className="w-3.5 h-3.5" />
                                               </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleDuplicate(r)} title="Duplicate shipment">
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                              {r.awb_number && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-500" title="Track AWB" onClick={() => window.open(`https://www.track-trace.com/aircargo#${r.awb_number.replace(/-/g, '')}`, '_blank')}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="cursor-pointer" />
                          </TableCell>
                        </TableRow>
                          )}
                        </Draggable>
                        );
                        })}
                        {flightRecords.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={17} className="text-center text-xs text-muted-foreground py-4 italic">
                              Drop shipments here
                            </TableCell>
                          </TableRow>
                        )}
                        {provided.placeholder}
                        </TableBody>
                        )}
                        </Droppable>
                  </Table>
                </div>
              </div>
            );
          })}
          </DragDropContext>
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} records across {sortedFlights.length} flights
          </div>
        </div>
      )}

      <FlightFormDialog
        open={flightDialogOpen}
        onOpenChange={setFlightDialogOpen}
        onSuccess={() => { setFlightDialogOpen(false); loadData(); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFlightId} onOpenChange={setDeleteFlightId}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete flight {deleteFlightId}?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the flight record but all shipments will remain unassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteFlightId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await handleDeleteFlight(deleteFlightId); }} className="bg-destructive text-destructive-foreground">Delete Flight</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}