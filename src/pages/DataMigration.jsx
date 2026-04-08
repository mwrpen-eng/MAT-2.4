// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Database, Download, RefreshCw, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { appApi } from '@/api/appApi';
import { restProvider } from '@/api/providers/restProvider';

export default function DataMigration() {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sqlCounts, setSqlCounts] = useState({ flights: 0, shipments: 0 });
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const loadSqlCounts = async () => {
    setChecking(true);
    try {
      const [flights, shipments] = await Promise.all([
        appApi.entities.Flight.list('-created_date', 5000),
        appApi.entities.ULDFishbox.list('-created_date', 10000),
      ]);
      setSqlCounts({
        flights: Array.isArray(flights) ? flights.length : 0,
        shipments: Array.isArray(shipments) ? shipments.length : 0,
      });
    } catch (err) {
      console.error('Failed to load SQL counts', err);
      setError(err?.message || 'Failed to load SQL counts');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadSqlCounts();
  }, []);

  const buildBackupPayload = async () => {
    const [flights, shipments] = await Promise.all([
      appApi.entities.Flight.list('-created_date', 5000),
      appApi.entities.ULDFishbox.list('-created_date', 10000),
    ]);

    return {
      exported_at: new Date().toISOString(),
      flights: Array.isArray(flights) ? flights : [],
      shipments: Array.isArray(shipments) ? shipments : [],
    };
  };

  const handleExportBackup = async () => {
    setExporting(true);
    setError('');
    try {
      const backup = await buildBackupPayload();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sql-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('SQL backup exported');
    } catch (err) {
      console.error('Failed to export SQL backup', err);
      setError(err?.message || 'Failed to export SQL backup');
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setSummary(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const flights = parsed?.flights || parsed?.Flight || [];
      const shipments = parsed?.shipments || parsed?.ULDFishbox || [];

      if (!Array.isArray(flights) || !Array.isArray(shipments)) {
        throw new Error('Backup file must contain `flights` and `shipments` arrays.');
      }

      await Promise.all([
        flights.length ? restProvider.entities.Flight.bulkCreate(flights) : Promise.resolve([]),
        shipments.length ? restProvider.entities.ULDFishbox.bulkCreate(shipments) : Promise.resolve([]),
      ]);

      const nextSummary = { flights: flights.length, shipments: shipments.length };
      setSummary(nextSummary);
      toast.success(`Imported ${nextSummary.flights} flights and ${nextSummary.shipments} shipments into SQL`);
      await loadSqlCounts();
    } catch (err) {
      console.error('Backup import failed', err);
      setError(err?.message || 'Import failed. Please select a valid backup JSON file.');
      toast.error('Import failed');
    } finally {
      event.target.value = '';
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6" /> SQL BACKUP & IMPORT
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export your local SQLite data to JSON or import a JSON backup into the app.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">SQL Flights</p>
            <p className="text-2xl font-bold">{checking ? '...' : sqlCounts.flights}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">SQL Shipments</p>
            <p className="text-2xl font-bold">{checking ? '...' : sqlCounts.shipments}</p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            This app now runs fully on the local SQL backend. To move legacy data over, import a JSON backup file.
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {summary && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 flex gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Imported <strong>{summary.flights}</strong> flights and <strong>{summary.shipments}</strong> shipments into SQLite.
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2" disabled={importing}>
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importing...' : 'Import JSON Backup'}
          </Button>
          <Button onClick={handleExportBackup} disabled={exporting} className="gap-2">
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting...' : 'Export SQL Backup'}
          </Button>
          <Button variant="outline" onClick={loadSqlCounts} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh Counts
          </Button>
        </div>
      </div>
    </div>
  );
}
