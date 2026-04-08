// @ts-nocheck
import { useEffect, useState } from "react";
import { appApi as api } from "@/api/appApi";
import { Search, RefreshCw, Trash2, Package2, Copy, FileUp, Upload, Loader2, CheckCircle, Printer, ArrowRightCircle, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Map Excel column headers to entity fields
const COLUMN_MAP = {
  "Tender": "tender",
  "AWB Number": "awb_number",
  "Order #": "order_number",
  "STATUS": "import_status",
  "User Defined Image 1 Description": "user_defined",
  "BOX": "box_count",
  "Service Provider ID": "service_provider",
  "Destination City": "destination_name",
  "Destination Location ID": "destination_code",
  "AIR Routing": "air_routing",
  "Start Time": "start_time",
  "Comment": "comment",
  "DLV Status": "dlv_status",
  "Pallets": "pallets",
  "Enroute": "enroute",
  "Mode": "mode",
};

/**
 * @param {string | null | undefined} airRouting
 * @returns {string | null}
 */
const extractFlightNumber = (airRouting) => {
  if (!airRouting) return null;
  const match = airRouting.match(/^([A-Z0-9]+)/);
  return match ? match[1] : null;
};

const LOOSE_AWB_PREFIXES = ["214", "220", "221", "501", "065", "999", "105", "217", "406", "618"];

const isShipmentLoose = (record) => {
  if (!record.awb_number || !record.flight_number) return false;
  if (record.flight_number === 'LOOSE' || record.flight_number === 'OSCC' || record.flight_number === 'GPC') return true;
  if (LOOSE_AWB_PREFIXES.some(prefix => record.awb_number.startsWith(prefix))) return true;
  if (record.awb_number.startsWith('125') || record.awb_number.startsWith('784') || record.awb_number.startsWith('615')) return true;
  if (record.awb_number.startsWith('AY9090')) return true;
  return false;
};

const parseExcel = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
        const mapped = rows.map(row => {
          const record = { status: "registered" };
          for (const [excelCol, entityField] of Object.entries(COLUMN_MAP)) {
            const val = row[excelCol];
            record[entityField] = val !== undefined && val !== null ? String(val) : null;
          }
          if (record.box_count !== null) record.box_count = parseFloat(record.box_count) || null;
          if (record.pallets !== null) record.pallets = parseFloat(record.pallets) || null;
          record.comment_3 = null;
          record.pk = null;
          record.domain_name = null;
          record.end_time = null;
          record.awb_number = record.awb_number || record.pk || record.order_number || "UNKNOWN";
          record.uld_number = null;
          if (record.awb_number && record.awb_number.startsWith("501")) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dd = String(tomorrow.getDate()).padStart(2, "0");
            const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
            record.flight_number = `OSCC LOOSE ${dd}/${mm}`;
          }
          return record;
        });
        resolve(mapped);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
]);

const asArray = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.data) ? value.data : [];

const createManyRecords = async (entityApi, records, label) => {
  if (!records.length) return [];

  try {
    return asArray(await entityApi.bulkCreate(records));
  } catch (error) {
    const message = String(error?.message || '');
    const shouldFallback = error?.status === 404 || /request failed: 404/i.test(message);

    if (!shouldFallback) {
      throw error;
    }

    const createdRecords = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      try {
        const created = await entityApi.create(record);
        createdRecords.push(created);
      } catch (createError) {
        const identifier = record.awb_number || record.order_number || record.flight_number || `row ${index + 1}`;
        throw new Error(`${label} failed for ${identifier}: ${createError?.message || 'Request failed'}`);
      }
    }
    return createdRecords;
  }
};

export default function Shipments() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [flights, setFlights] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState('created_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Import Excel state
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [imported, setImported] = useState(false);
  const [fileName, setFileName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [importSummary, setImportSummary] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setFileName(file.name);
      setParsing(true);
      setPreview(null);
      setImported(false);
      const parsed = await parseExcel(file);
      if (parsed.length === 0) {
        setImportStatus("No data found in the file.");
        toast.error("No data found in file.");
      } else {
        setPreview(parsed);
        setImportStatus(`Ready to import ${parsed.length} records.`);
        toast.success(`Found ${parsed.length} records — review and import`);
      }
    } catch (error) {
      console.error('Failed to parse import file', error);
      setImportStatus(error?.message || "Failed to read the Excel file.");
      toast.error(error?.message || "Failed to read the Excel file.");
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Please upload a valid Excel or CSV file.");
      return;
    }

    try {
      setFileName(file.name);
      setParsing(true);
      setPreview(null);
      setImported(false);
      const parsed = await parseExcel(file);
      if (parsed.length === 0) {
        setImportStatus("No data found in the file.");
        toast.error("No data found in file.");
      } else {
        setPreview(parsed);
        setImportStatus(`Ready to import ${parsed.length} records.`);
        toast.success(`Found ${parsed.length} records — review and import`);
      }
    } catch (error) {
      console.error('Failed to parse dropped import file', error);
      setImportStatus(error?.message || "Failed to read the Excel file.");
      toast.error(error?.message || "Failed to read the Excel file.");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!preview?.length || importing) return;
    setImporting(true);
    setImportStatus('Checking existing flights...');

    try {
      const flightNumbers = new Set();
      preview.forEach(record => {
        const flightNum = extractFlightNumber(record.air_routing);
        if (flightNum) flightNumbers.add(flightNum);
      });

      const existingFlights = asArray(await withTimeout(api.entities.Flight.list(), 15000, 'Load flights for import'));
      const existingFlightNumbers = new Set(existingFlights.map(f => f.flight_number).filter(Boolean));
      const flightIdMap = {};
      existingFlights.forEach(f => { if (f?.flight_number) flightIdMap[f.flight_number] = f.id; });

      const flightsToCreate = [];
      flightNumbers.forEach(flightNum => {
        if (!existingFlightNumbers.has(flightNum)) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dd = String(tomorrow.getDate()).padStart(2, "0");
          const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
          flightsToCreate.push({
            flight_number: flightNum,
            airline: flightNum.substring(0, 2),
            origin: "OSL",
            destination: "UNKNOWN",
            departure_date: `${tomorrow.getFullYear()}-${mm}-${dd}`,
            status: "scheduled"
          });
        }
      });

      let createdFlights = [];
      let flightImportWarning = '';

      if (flightsToCreate.length > 0) {
        setImportStatus(`Creating ${flightsToCreate.length} missing flights...`);
        try {
          createdFlights = asArray(await withTimeout(createManyRecords(api.entities.Flight, flightsToCreate, 'Create flights'), 30000, 'Create flights'));
          createdFlights.forEach(f => { if (f?.flight_number) flightIdMap[f.flight_number] = f.id; });
        } catch (error) {
          console.warn('Flight creation failed during shipment import; continuing without linked flights', error);
          flightImportWarning = error?.message || 'Some flights could not be created';
          setImportStatus(`${flightImportWarning}. Continuing with shipment import...`);
          toast.warning('Some flights could not be created. Importing shipments without linked flights.');
        }
      }

      const shipmentsWithFlightId = preview.map(record => {
        const flightNum = extractFlightNumber(record.air_routing);
        return {
          ...record,
          flight_id: flightNum ? flightIdMap[flightNum] || null : null,
          flight_number: flightNum || record.flight_number || null
        };
      });

      setImportStatus(`Importing ${preview.length} shipments...`);
      const createdShipments = asArray(await withTimeout(createManyRecords(api.entities.ULDFishbox, shipmentsWithFlightId, 'Create shipments'), 60000, 'Create shipments'));
      setImportStatus('Refreshing shipment list...');
      await loadData();
      setImported(true);
      setPreview(null);
      setImportSummary({
        shipments: createdShipments.length || preview.length,
        flights: createdFlights.length,
      });
      setImportStatus(flightImportWarning ? `Import complete with warnings: ${flightImportWarning}` : 'Import complete.');
      toast.success(
        flightImportWarning
          ? `Imported ${createdShipments.length || preview.length} records. Some flights were skipped.`
          : `Successfully imported ${createdShipments.length || preview.length} records and created ${createdFlights.length} flights`
      );
    } catch (error) {
      console.error('Shipment import failed', error);
      setImportStatus(error?.message || 'Failed to import shipments');
      toast.error(error?.message || 'Failed to import shipments');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request timed out`)), ms))
    ]);

    try {
      const [data, flightData] = await Promise.all([
        withTimeout(api.entities.ULDFishbox.list("-updated_date", 500), 15000, 'Shipments'),
        withTimeout(api.entities.Flight.list("-departure_date", 200), 15000, 'Flights')
      ]);

      const flightMap = {};
      asArray(flightData).forEach(f => { flightMap[f.id] = f; });
      setFlights(flightMap);
      setRecords(asArray(data));
    } catch (error) {
      console.error('Failed to load shipments page data', error);
      setFlights({});
      setRecords([]);
      toast.error('Failed to load shipments data');
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async () => {
    const shipment = records.find(r => r.id === deleteId);
    const flightId = shipment?.flight_id;
    const flightNumber = shipment?.flight_number || extractFlightNumber(shipment?.air_routing);

    await api.entities.ULDFishbox.delete(deleteId);

    if (flightId) {
      const remainingShipments = await api.entities.ULDFishbox.filter({ flight_id: flightId });
      if (remainingShipments.length === 0) {
        await api.entities.Flight.delete(flightId);
      }
    } else if (flightNumber) {
      const remainingByFlightNum = await api.entities.ULDFishbox.filter({ flight_number: flightNumber });
      if (remainingByFlightNum.length === 0) {
        const flights = await api.entities.Flight.filter({ flight_number: flightNumber });
        if (flights.length > 0) {
          await api.entities.Flight.delete(flights[0].id);
        }
      }
    }

    setDeleteId(null);
    loadData();
  };

  const handleDuplicate = async (r) => {
    const { id, created_date, updated_date, created_by, ...rest } = r;
    await api.entities.ULDFishbox.create(rest);
    loadData();
  };

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.awb_number, r.order_number, r.pk, r.destination_name, r.destination_code, r.service_provider, r.air_routing, r.domain_name]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortedData = (data) => {
    return [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortOrder === 'asc' ? 1 : -1;
      if (bVal == null) return sortOrder === 'asc' ? -1 : 1;
      if (typeof aVal === 'string') return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const SortHeader = ({ column, children }) => {
    const isActive = sortBy === column;
    return (
      <TableHead
        className="cursor-pointer hover:bg-muted/60 transition-colors whitespace-nowrap"
        onClick={() => handleSort(column)}
        title={`Click to sort by ${children}`}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive && <span className="text-xs font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
        </div>
      </TableHead>
    );
  };

  const toggleOne = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleAll = () => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)));

  const handleExportExcel = () => {
    const exportData = filtered.map(r => ({
      "AWB Number": r.awb_number || "",
      "Order #": r.order_number || "",
      "PK": r.pk || "",
      "ULD Number": r.uld_number || "",
      "ULD Type": r.uld_type || "",
      "BOX": r.box_count ?? "",
      "Pallets": r.pallets ?? "",
      "Gross (kg)": r.gross_weight ?? "",
      "Tara (kg)": r.tara_weight ?? "",
      "Net (kg)": r.net_weight ?? "",
      "Service Provider": r.service_provider || "",
      "Destination": r.destination_name || "",
      "Code": r.destination_code || "",
      "AIR Routing": r.air_routing || "",
      "Start Time": r.start_time || "",
      "End Time": r.end_time || "",
      "DLV": r.dlv_status || "",
      "Comment": r.comment || "",
      "Comment 3": r.comment_3 || "",
      "Extra Service": r.extra_service || "",
      "Domain": r.domain_name || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shipments");
    XLSX.writeFile(wb, `shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exported ${filtered.length} records`);
  };

  const handleBulkDelete = async () => {
    setDeletingBulk(true);

    const flightIdsToDelete = new Set();
    const flightNumbersToDelete = new Set();
    const shipmentsToDelete = [...selected].map(id => records.find(r => r.id === id));

    shipmentsToDelete.forEach(s => {
      if (s?.flight_id) flightIdsToDelete.add(s.flight_id);
      const flightNum = s?.flight_number || extractFlightNumber(s?.air_routing);
      if (flightNum) flightNumbersToDelete.add(flightNum);
    });

    await Promise.all([...selected].map(id => api.entities.ULDFishbox.delete(id)));

    for (const flightId of flightIdsToDelete) {
      try {
        const remainingShipments = await api.entities.ULDFishbox.filter({ flight_id: flightId });
        if (remainingShipments.length === 0) {
          await api.entities.Flight.delete(flightId);
        }
      } catch (error) {
      }
    }

    for (const flightNum of flightNumbersToDelete) {
      try {
        const remainingByFlightNum = await api.entities.ULDFishbox.filter({ flight_number: flightNum });
        if (remainingByFlightNum.length === 0) {
          const flights = await api.entities.Flight.filter({ flight_number: flightNum });
          if (flights.length > 0) {
            await api.entities.Flight.delete(flights[0].id);
          }
        }
      } catch (error) {
      }
    }

    setSelected(new Set());
    setDeletingBulk(false);
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
          <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
          <p className="text-muted-foreground text-sm mt-1">{records.length} records imported</p>
        </div>
        <div className="flex gap-2 self-start">
          {selected.size > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deletingBulk} className="gap-2">
              <Trash2 className="w-4 h-4" />{deletingBulk ? "Deleting..." : `Delete ${selected.size} selected`}
            </Button>
          )}
          <Button variant="outline" onClick={handleExportExcel} disabled={filtered.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> Export to Excel
          </Button>
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import from Excel</CardTitle>
          <CardDescription>Upload your MOWI Excel export to bulk-import shipment records</CardDescription>
        </CardHeader>
        <CardContent>
          <label
            className={cn(
              "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              (parsing || importing) && "opacity-80 cursor-wait"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Reading file...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground/60" />
                <span className="text-sm font-medium text-muted-foreground">
                  {fileName ? fileName : "Click to upload or drag & drop Excel/CSV"}
                </span>
                <span className="text-xs text-muted-foreground/60">.xlsx, .xls, .csv</span>
              </div>
            )}
            <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={parsing || importing} />
          </label>

          {(fileName || importStatus) && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div>
                {fileName && <p className="text-sm font-medium">Selected file: {fileName}</p>}
                {importStatus && <p className="text-xs text-muted-foreground">{importStatus}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setImported(false);
                  setFileName('');
                  setImportStatus('');
                  setImportSummary(null);
                }}
                disabled={parsing || importing}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && !imported && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-lg">Preview — {preview.length} records</CardTitle>
                <CardDescription>Review before importing</CardDescription>
              </div>
              <Button onClick={handleImport} disabled={importing || parsing} className="gap-2 min-w-[180px]">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {importing ? "Working..." : `Import ${preview.length} Records`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="whitespace-nowrap">Flight</TableHead>
                    <TableHead className="whitespace-nowrap">ETD</TableHead>
                    <TableHead className="whitespace-nowrap">AWB Number</TableHead>
                    <TableHead className="whitespace-nowrap">Order #</TableHead>
                    <TableHead className="whitespace-nowrap">ULD Number</TableHead>
                    <TableHead className="text-right whitespace-nowrap">BOX</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Gross (kg)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Tara (kg)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Net (kg)</TableHead>
                    <TableHead className="whitespace-nowrap">Service Provider</TableHead>
                    <TableHead className="whitespace-nowrap">Destination</TableHead>
                    <TableHead className="whitespace-nowrap">Code</TableHead>
                    <TableHead className="whitespace-nowrap">AIR Routing</TableHead>
                    <TableHead className="whitespace-nowrap">Start Time</TableHead>
                    <TableHead className="whitespace-nowrap">DLV</TableHead>
                    <TableHead className="whitespace-nowrap">Comment</TableHead>
                    <TableHead className="whitespace-nowrap">Extra Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 10).map((row, i) => (
                    <TableRow key={i} className="text-sm">
                      <TableCell className="font-mono text-sm whitespace-nowrap">{row.flight_number || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="font-mono font-medium whitespace-nowrap flex items-center gap-2">
                        {row.awb_number || "—"}
                        {row.awb_number && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                            isShipmentLoose(row) ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isShipmentLoose(row) ? 'LOOSE' : 'BUILD'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.order_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs flex items-center gap-2">
                        <span className="text-base font-semibold">{row.uld_number || "—"}</span>
                        {row.uld_type && <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded text-primary font-semibold">{row.uld_type}</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.box_count ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{row.gross_weight != null ? row.gross_weight.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{row.tara_weight != null ? row.tara_weight.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{row.net_weight != null ? row.net_weight.toFixed(1) : "—"}</TableCell>
                      <TableCell>
                        {row.service_provider ? <Badge variant="secondary" className="text-xs">{row.service_provider}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.destination_name || "—"}</TableCell>
                      <TableCell className="font-mono font-semibold text-primary">{row.destination_code || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.air_routing || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.start_time || "—"}</TableCell>
                      <TableCell>{row.dlv_status || "—"}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs">{row.comment || "—"}</TableCell>
                      <TableCell className="text-xs">{row.extra_service || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.length > 10 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">Showing first 10 of {preview.length} records</p>
            )}
          </CardContent>
        </Card>
      )}

      {imported && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Import complete!</p>
                <p className="text-sm text-green-700">
                  Imported {importSummary?.shipments ?? 0} shipment(s)
                  {typeof importSummary?.flights === 'number' ? ` and created ${importSummary.flights} flight(s)` : ''}.
                </p>
              </div>
            </div>
            <Button onClick={() => setImported(false)} className="gap-2 bg-green-700 hover:bg-green-800">
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search AWB, order, destination..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Package2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">No shipment records found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Upload an Excel file above to import data</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortHeader column="flight_number">Flight</SortHeader>
                  <SortHeader column="created_date">ETD</SortHeader>
                  <SortHeader column="awb_number">AWB Number</SortHeader>
                  <SortHeader column="order_number">Order #</SortHeader>
                  <SortHeader column="uld_number">ULD Number</SortHeader>
                  <SortHeader column="box_count">BOX</SortHeader>
                  <SortHeader column="gross_weight">Gross (kg)</SortHeader>
                  <SortHeader column="tara_weight">Tara (kg)</SortHeader>
                  <SortHeader column="net_weight">Net (kg)</SortHeader>
                  <SortHeader column="service_provider">Service Provider</SortHeader>
                  <SortHeader column="destination_name">Destination</SortHeader>
                  <SortHeader column="destination_code">Code</SortHeader>
                  <SortHeader column="air_routing">AIR Routing</SortHeader>
                  <SortHeader column="start_time">Start Time</SortHeader>
                  <SortHeader column="dlv_status">DLV</SortHeader>
                  <SortHeader column="comment">Comment</SortHeader>
                  <SortHeader column="extra_service">Extra Service</SortHeader>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="w-10"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="cursor-pointer" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getSortedData(filtered).map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/20 text-sm">
                    <TableCell className="whitespace-nowrap font-mono font-semibold text-primary">{r.flight_number || extractFlightNumber(r.air_routing) || "LOOSE"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.flight_id && flights[r.flight_id]?.departure_date ? new Date(flights[r.flight_id].departure_date).toLocaleDateString('en-GB') : "—"}</TableCell>
                    <TableCell className="font-mono font-medium whitespace-nowrap flex items-center gap-2">
                      {r.awb_number || "—"}
                      {r.awb_number && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                          isShipmentLoose(r) ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isShipmentLoose(r) ? 'LOOSE' : 'BUILD'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.order_number || "—"}</TableCell>
                    <TableCell className="font-mono text-xs flex items-center gap-2">
                      <span className="text-base font-semibold">{r.uld_number || "—"}</span>
                      {r.uld_type && <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded text-primary font-semibold">{r.uld_type}</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.box_count ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.gross_weight != null ? r.gross_weight.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.tara_weight != null ? r.tara_weight.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.net_weight != null ? r.net_weight.toFixed(1) : "—"}</TableCell>
                    <TableCell>
                      {r.service_provider ? (
                        <Badge variant="secondary" className="text-xs">{r.service_provider}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.destination_name || "—"}</TableCell>
                    <TableCell>
                      {r.destination_code ? (
                        <span className="font-mono font-semibold text-primary">{r.destination_code}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{r.air_routing || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.start_time || "—"}</TableCell>
                    <TableCell>
                      {r.dlv_status ? <Badge variant="outline">{r.dlv_status}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs">{r.comment || "—"}</TableCell>
                    <TableCell className="text-xs">{r.extra_service || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary"
                          onClick={() => window.open(`/print-labels/${r.id}`, '_blank')}
                          title="Print Labels"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-secondary hover:text-secondary"
                          onClick={async () => {
                            const { id, created_date, updated_date, created_by, ...rest } = r;
                            const newRecord = await api.entities.ULDFishbox.create(rest);
                            navigate(`/build?shipment=${newRecord.id}`);
                          }}
                          title="Transfer to Build Up"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-orange-500 hover:text-orange-500"
                          onClick={async () => {
                            const { id, created_date, updated_date, created_by, ...rest } = r;
                            const newRecord = await api.entities.ULDFishbox.create(rest);
                            navigate(`/loose-overview?shipment=${newRecord.id}`);
                          }}
                          title="Transfer to Loose"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleDuplicate(r)} title="Duplicate">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="cursor-pointer" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            Showing {filtered.length} of {records.length} records
          </div>
        </div>
      )}

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
    </div>
  );
}