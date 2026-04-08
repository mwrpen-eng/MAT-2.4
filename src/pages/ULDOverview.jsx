import { useState, useRef, useEffect } from "react";
import { appApi as api } from "@/api/appApi";
import { RefreshCw, Plane, Printer, Copy, Mail, MailOpen } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ULDOverview() {
  /** @type {[any[], Function]} */
  const [shipments, setShipments] = useState([]);
  /** @type {[any[], Function]} */
  const [allShipments, setAllShipments] = useState([]);
  const [flights, setFlights] = useState(/** @type {Record<string, any>} */ ({}));
  const [loading, setLoading] = useState(true);

  /** @type {[Record<string, any>, Function]} */
  const [localGroups, setLocalGroups] = useState({});

  const [finalsEmails, setFinalsEmails] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finalsEmails') ?? '[]') || []; } catch { return []; }
  });
  const [sendingFinals, setSendingFinals] = useState({});
  /** @type {[string|null, Function]} */
  const [editingEmailFlight, setEditingEmailFlight] = useState(/** @type {string|null} */ (null));
  const [emailInput, setEmailInput] = useState("");
  const [editingRemark, setEditingRemark] = useState(null);
  const [remarkText, setRemarkText] = useState("");
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]; });
  /** @type {import('react').MutableRefObject<number|null>} */
  const loadDataTimeoutRef = useRef(null);

  /**
   * @param {string[]} emails
   */
  const saveEmails = (emails) => {
    setFinalsEmails(emails);
    localStorage.setItem('finalsEmails', JSON.stringify(emails));
  };

  /**
   * @param {string} flight
   * @param {any[]} items
   */
  const buildPrefinals = (flight, items) => {
    const groupedByUld = items.reduce((acc, s) => {
      const key = s.uld_number || "No ULD";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});
    const totalBoxes = items.reduce((sum, s) => sum + (s.box_count || 0), 0);
    const totalGross = items.reduce((sum, s) => sum + (s.gross_weight || 0), 0);
    const totalNet = items.reduce((sum, s) => sum + (s.net_weight || 0), 0);
    let body = 'FISHBOX Prefinals ' + String.fromCharCode(8212) + ' ' + flight + '\n';
    body += 'Departure: ' + (flights[flight]?.departure_date ? new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—') + '\n';
    body += 'Generated: ' + new Date().toLocaleString('nb-NO') + '\n';
    body += 'Status: Work in Progress\n\n';
    Object.keys(groupedByUld).sort().forEach(uld => {
      const ui = groupedByUld[uld];
      const groupUldType = ui.find(i => i.uld_type)?.uld_type || '—';
      const groupContour = ui.find(i => i.contour)?.contour || 'P';
      body += 'ULD: ' + uld + ' (' + groupUldType + ' / ' + groupContour + ')\n';
      ui.forEach(/** @param {any} s */ s => {
        const status = s.status === "loaded" || s.status === "completed" ? "✓" : "○";
        body += '  ' + status + ' AWB: ' + (s.awb_number || '—') + '  Order: ' + (s.order_number || '—') + '  Dest: ' + (s.destination_name || '—') + '  Boxes: ' + (s.box_count || 0) + '  Gross: ' + (s.gross_weight || 0).toFixed(1) + ' kg  Net: ' + (s.net_weight || 0).toFixed(1) + ' kg\n';
      });
      const ug = ui.reduce(/** @param {number} a @param {any} s */ (a, s) => a + (s.gross_weight || 0), 0);
      const un = ui.reduce(/** @param {number} a @param {any} s */ (a, s) => a + (s.net_weight || 0), 0);
      const ub = ui.reduce(/** @param {number} a @param {any} s */ (a, s) => a + (s.box_count || 0), 0);
      if (ui.length > 1) body += '  Combined: ' + ub + ' boxes  ' + ug.toFixed(1) + ' kg gross  ' + un.toFixed(1) + ' kg net\n';
      body += '\n';
    });
    body += 'TOTAL SO FAR: ' + totalBoxes + ' boxes  ' + totalGross.toFixed(1) + ' kg gross  ' + totalNet.toFixed(1) + ' kg net\n';
    return body;
  };

  /**
   * @param {string} flight
   * @param {any[]} items
   */
  const buildFinalsText = (flight, items) => {
    const groupedByUld = items.reduce(
      /** @param {Record<string, any[]>} acc @param {any} s */
      (acc, s) => {
      const key = s.uld_number || "No ULD";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
      },
      {}
    );
    const totalBoxes = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.box_count || 0),
      0
    );
    const totalGross = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.gross_weight || 0),
      0
    );
    const totalNet = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.net_weight || 0),
      0
    );
    let body = 'FISHBOX Finals ' + String.fromCharCode(8212) + ' ' + flight + '\n';
    body += 'Departure: ' + (flights[flight]?.departure_date ? new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—') + '\n';
    body += 'Generated: ' + new Date().toLocaleString('nb-NO') + '\n\n';
    Object.keys(groupedByUld).sort().forEach(uld => {
      const ui = groupedByUld[uld];
      const groupUldType = ui.find(i => i.uld_type)?.uld_type || '—';
      const groupContour = ui.find(i => i.contour)?.contour || 'P';
      body += 'ULD: ' + uld + ' (' + groupUldType + ' / ' + groupContour + ')\n';
      ui.forEach(/** @param {any} s */ s => {
        body += '  AWB: ' + (s.awb_number || '—') + '  Order: ' + (s.order_number || '—') + '  Dest: ' + (s.destination_name || '—') + '  Boxes: ' + (s.box_count || 0) + '  Gross: ' + (s.gross_weight || 0).toFixed(1) + ' kg  Net: ' + (s.net_weight || 0).toFixed(1) + ' kg\n';
      });
      const ug = ui.reduce(
        /** @param {number} a @param {any} s */
        (a, s) => a + (s.gross_weight || 0),
        0
      );
      const un = ui.reduce(
        /** @param {number} a @param {any} s */
        (a, s) => a + (s.net_weight || 0),
        0
      );
      const ub = ui.reduce(
        /** @param {number} a @param {any} s */
        (a, s) => a + (s.box_count || 0),
        0
      );
      if (ui.length > 1) body += '  Combined: ' + ub + ' boxes  ' + ug.toFixed(1) + ' kg gross  ' + un.toFixed(1) + ' kg net\n';
      body += '\n';
    });
    body += 'GRAND TOTAL: ' + totalBoxes + ' boxes  ' + totalGross.toFixed(1) + ' kg gross  ' + totalNet.toFixed(1) + ' kg net\n';
    return body;
  };

  /** @param {any} shipment */
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

  useEffect(() => { 
    loadData();
    const reload = () => {
      if (loadDataTimeoutRef.current) clearTimeout(loadDataTimeoutRef.current);
      loadDataTimeoutRef.current = setTimeout(loadData, 200);
    };
    const unsubFlight = api.entities.Flight.subscribe(reload);
    const unsubShipment = api.entities.ULDFishbox.subscribe(reload);
    return () => {
      unsubFlight();
      unsubShipment();
      if (loadDataTimeoutRef.current) clearTimeout(loadDataTimeoutRef.current);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const dataRaw = await api.entities.ULDFishbox.list("-created_date", 500);
      await new Promise(r => setTimeout(r, 200));
      const flightDataRaw = await api.entities.Flight.list("-created_date", 100);
      const data = Array.isArray(dataRaw) ? dataRaw : (Array.isArray(dataRaw?.items) ? dataRaw.items : []);
      const flightData = Array.isArray(flightDataRaw) ? flightDataRaw : (Array.isArray(flightDataRaw?.items) ? flightDataRaw.items : []);
      const flightMap = flightData.reduce((acc, f) => { acc[f.flight_number] = f; return acc; }, {});
      setFlights(flightMap);
      setAllShipments(data);

      const filterFn = /** @param {any} s */ (s) => {
        if (!(s.status === "loaded" || s.status === "completed" || s.status === "delivered" || s.status === "transferred")) {
          return false;
        }
        if (s.uld_number && (s.gross_weight == null && s.tara_weight == null)) {
          return false;
        }
        // Include if ULD number, type, or contour is set
        if (!s.uld_number && !s.uld_type && !s.contour) {
          return false;
        }
        return true;
      };
      const complete = data.filter(filterFn);
      setShipments(complete);

      /** @type {Record<string, any>} */
      const groups = {};
      complete.forEach(/** @param {any} s */ (s) => {
        if (s.uld_group_id) {
          groups[s.id] = s.uld_group_id;
        }
      });
      setLocalGroups(groups);
    } catch (error) {
      console.error('Failed to load ULD data', error);
      toast.error('Failed to load ULD overview data');
    } finally {
      setLoading(false);
    }
  }

  const grouped = shipments.reduce(
    /** @param {Record<string, any[]>} acc @param {any} s */
    (acc, s) => {
      const key = s.flight_number || s.air_routing || "No Flight Assigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    },
    {}
  );

  const twoDaysAgo = new Date(dateFrom);
  twoDaysAgo.setHours(0, 0, 0, 0);
  const dateToCutoff = new Date(dateTo);
  dateToCutoff.setHours(23, 59, 59, 999);

  const flightKeys = Object.keys(grouped).filter(fn => {
    const dep = flights[fn]?.departure_date;
    if (!dep) return true;
    const d = new Date(dep);
    return d >= twoDaysAgo && d <= dateToCutoff;
  }).sort(
    (a, b) => {
      const flightA = flights[a];
      const flightB = flights[b];
      if (!flightA?.departure_date) return 1;
      if (!flightB?.departure_date) return -1;
      return new Date(flightA.departure_date).getTime() - new Date(flightB.departure_date).getTime();
    }
  );

  const flightsByDay = flightKeys.reduce((acc, fn) => {
    const dep = flights[fn]?.departure_date;
    const dayKey = dep ? new Date(dep).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : 'No Date';
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(fn);
    return acc;
  }, {});
  const dayKeys = Object.keys(flightsByDay);

  /** @param {any[]} items */
  const groupByUld = (items) => {
    return items.reduce(
      /** @param {Record<string, any[]>} acc @param {any} s */
      (acc, s) => {
        const key = (s.uld_number || "No ULD").trim().toUpperCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
      },
      {}
    );
  };

  const GROUP_COLORS = ["#7A2535", "#1A6B35", "#A0520A", "#5A3070", "#1A6060", "#7A6800", "#4A3A7A", "#266050", "#7A3810", "#1A4A6A"];

  /** @param {string} groupKey */
  const getGroupColor = (groupKey) => {
    if (!groupKey) return null;
    const hash = groupKey.split('').reduce(
      /** @param {number} acc @param {string} char */
      (acc, char) => acc + char.charCodeAt(0),
      0
    );
    return GROUP_COLORS[hash % GROUP_COLORS.length];
  };

  /**
   * @param {string} flight
   * @param {any[]} items
   */
  function handlePrintFlight(flight, items) {
    const groupedByUld = items.reduce(
      /** @param {Record<string, any[]>} acc @param {any} s */
      (acc, s) => {
      const key = s.uld_number || "No ULD";
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
      },
      {}
    );

    const uldKeys = Object.keys(groupedByUld).sort(
      /** @param {string} a @param {string} b */
      (a, b) => {
        const aMulti = groupedByUld[a].length > 1 ? 0 : 1;
        const bMulti = groupedByUld[b].length > 1 ? 0 : 1;
        return aMulti - bMulti || a.localeCompare(b);
      }
    );
    
    const totalBoxes = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.box_order_1 ?? s.box_count ?? 0),
      0
    );
    const totalGross = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.gross_weight || 0),
      0
    );
    const totalTara = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.tara_weight || 0),
      0
    );
    const totalNet = items.reduce(
      /** @param {number} sum @param {any} s */
      (sum, s) => sum + (s.net_weight || 0),
      0
    );
      // Removed extra closing brace to fix block structure
    const win = window.open("", "_blank");
    const destCode = flights[flight]?.destination || items[0]?.destination_code || '—';
    let html = '<html><head><title>Finals - ' + flight + '</title><style>\n      @import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap\');\n      * { box-sizing: border-box; }\n      body { font-family: \'Inter\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; padding: 12px; font-size: 9px; color: #000; background: #fff; position: relative; }\n      .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.15; pointer-events: none; z-index: 0; }\n      .watermark img { width: 400px; height: auto; }\n      .header { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #000; position: relative; z-index: 1; text-align: center; }\n      .logo { width: 120px; height: auto; margin: 0 auto 8px; display: block; }\n      h1 { font-size: 18px; margin: 0 0 4px 0; font-weight: 700; color: #000; letter-spacing: -0.5px; }\n      .subtitle { font-size: 16px; color: #333; font-weight: 500; }\n      .meta { font-size: 11px; color: #666; margin-top: 4px; }\n      table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0 auto 8px auto; position: relative; z-index: 1; }\n      th { background: #fff; text-align: left; padding: 2px 4px; border-bottom: 2px solid #000; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.3px; }\n      td { padding: 5px 8px; border-bottom: 1px solid #ddd; color: #000; font-size: 10px; }\n      tr:last-child td { border-bottom: none; }\n      .totals { font-weight: 600; background: #f5f5f5; }\n      .totals td { border-top: 2px solid #000; border-bottom: none; color: #000; }\n      .uld-section td { border-top: 2px solid #333; }\n      .awb-number { font-family: \'SF Mono\', \'Fira Code\', monospace; font-size: 10px; font-weight: 600; color: #000; }\n      .numeric { text-align: right; font-variant-numeric: tabular-nums; }\n      .destination { font-weight: 500; color: #000; }\n      .badge { display: inline-block; padding: 2px 6px; background: #fff; border: 1px solid #000; border-radius: 4px; font-size: 12px; font-weight: 600; color: #000; }\n      @media print { \n        body { padding: 10px; }\n        .header { border-bottom-color: #000; }\n        th { background: #fff !important; }\n        .totals { background: #f5f5f5 !important; }\n      }\n    </style></head><body>';
    html += '<div class="watermark"><img src="/mowi-logo.svg" alt="MOWI" /></div>';
    html += '<div class="header">\n      <img src="/mowi-logo.svg" alt="MOWI" class="logo" />\n      <h1>MOWI FINALS</h1>\n      <div class="subtitle">' + flight + '</div>\n      <div class="subtitle" style="font-size: 11px; margin-top: 2px; color: #666;">OSL ' + String.fromCharCode(8594) + ' ' + destCode + '</div>\n      <div class="meta">Departure: <span style="font-size: 14px; font-weight: 700; color: #000;">' + (flights[flight]?.departure_date ? new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—') + '</span> ' + String.fromCharCode(183) + ' Generated: ' + new Date().toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }) + '</div>\n    </div>';
    html += '<table><thead><tr>\n      <th style="width: 10%">ULD Number</th>\n      <th style="width: 7%">Type</th>\n      <th style="width: 5%">Contour</th>\n      <th style="width: 8%">Remarks</th>\n      <th style="width: 14%">AWB Number</th>\n      <th style="width: 10%">Order #</th>\n      <th style="width: 11%">Destination</th>\n      <th style="width: 8%">1. Transfer</th>\n      <th style="width: 8%">2. Transfer</th>\n      <th style="width: 4%">BOX ORDER 1</th>\n      <th style="width: 4%">TOTAL ORDER</th>\n      <th style="width: 6%">Gross (KG)</th>\n      <th style="width: 6%">Tara (KG)</th>\n      <th style="width: 6%">Net (KG)</th>\n    </tr></thead><tbody>';
    
    uldKeys.forEach(
    /** @param {string} uldNumber */
    uldNumber => {
      const uldItems = groupedByUld[uldNumber];
      const groupUldType = uldItems.find(i => i.uld_type)?.uld_type || 'PMC';
      const groupContour = uldItems.find(i => i.contour)?.contour || 'P';
      uldItems.forEach(
        /** @param {any} s @param {number} idx */
        (s, idx) => {
            const uldClass = idx === 0 ? ' class="uld-section"' : '';
            const badge = s.uld_number || '—';
            const badgeHtml = idx === 0 ? '<span class="badge">' + badge + '</span>' : '';
            const typeHtml = idx === 0 ? groupUldType : '';
            const contourHtml = idx === 0 ? groupContour : '';
            html += '<tr' + uldClass + '>';
            html += '<td>' + badgeHtml + '</td>';
            html += '<td>' + typeHtml + '</td>';
            html += '<td>' + contourHtml + '</td>';
            html += '<td style="color: #666;">' + (s.notes || '—') + '</td>';
            html += '<td class="awb-number">' + (s.awb_number || '—') + '</td>';
            html += '<td class="awb-number">' + (s.order_number || '—') + '</td>';
            html += '<td style="font-weight: 600; text-align: center;">' + (s.destination_code || '—') + '</td>';
            const transferFlight = s.air_routing && s.air_routing.includes(',') ? s.air_routing.split(',')[1].trim() : '—';
            html += '<td style="font-weight: 600;">' + transferFlight + '</td>';
            html += '<td style="font-weight: 600;">—</td>';
            html += '<td class="numeric">' + (s.box_order_1 ?? s.box_count ?? '—') + '</td>';
            html += '<td class="numeric">' + (s.box_count ?? '—') + '</td>';
            html += '<td class="numeric">' + ((s.gross_weight || 0).toFixed(1)).replace(/\.0$/, '') + '</td>';
            html += '<td class="numeric">' + ((s.tara_weight || 0).toFixed(1)).replace(/\.0$/, '') + '</td>';
            html += '<td class="numeric" style="font-weight: 600;">' + ((s.net_weight || 0).toFixed(1)).replace(/\.0$/, '') + '</td>';
          }
        );
        if (uldItems.length > 1) {
          const combGross = uldItems.reduce(
            /** @param {number} a @param {any} s */
            (a, s) => a + (s.gross_weight || 0),
            0
          );
          const combTara = uldItems.reduce(
            /** @param {number} a @param {any} s */
            (a, s) => a + (s.tara_weight || 0),
            0
          );
          const combNet = uldItems.reduce(
            /** @param {number} a @param {any} s */
            (a, s) => a + (s.net_weight || 0),
            0
          );
          const combBoxes = uldItems.reduce(
            /** @param {number} a @param {any} s */
            (a, s) => a + (s.box_order_1 ?? s.box_count ?? 0),
            0
          );
          html += '<tr style="background: #f5f5f5; font-weight: 600; border-top: 1px solid #ddd;"><td colspan="9" style="text-align: right; border: none;">Combined:</td><td class="numeric" style="border: none;">' + combBoxes + '</td><td style="border: none;"></td><td class="numeric" style="border: none;">' + combGross.toFixed(1).replace(/\.0$/, '') + '</td><td class="numeric" style="border: none;">' + combTara.toFixed(1).replace(/\.0$/, '') + '</td><td class="numeric" style="border: none;">' + combNet.toFixed(1).replace(/\.0$/, '') + '</td></tr>';
        }
        const uldBoxOrder1Total = uldItems.reduce(
          /** @param {number} a @param {any} s */
          (a, s) => a + (s.box_order_1 ?? s.box_count ?? 0),
          0
        );
        html += '<tr style="background: #e8f4e8; border-top: 2px solid #333;"><td colspan="13" style="text-align: left; font-weight: 700; font-size: 10px; padding: 4px 8px; color: #1a6b1a;">TOTAL PACKED ON ULD: <span style="font-size: 12px;">' + uldBoxOrder1Total + ' boxes</span></td><td></td></tr>';
      }
    );
    html += '<tr class="totals"><td colspan="9" style="text-align: right;">TOTAL:</td><td class="numeric">' + totalBoxes + '</td><td></td><td class="numeric">' + totalGross.toFixed(1).replace(/\.0$/, '') + '</td><td class="numeric">' + totalTara.toFixed(1).replace(/\.0$/, '') + '</td><td class="numeric">' + totalNet.toFixed(1).replace(/\.0$/, '') + '</td></tr>';
    html += '</tbody></table>';
    html += '<div style="margin-top: 12px; padding: 8px 12px; background: #1a1a2e; color: #fff; display: inline-block; border-radius: 4px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">TOTAL ULD\'s ON FLIGHT: ' + uldKeys.length + '</div>';
    html += '<div style="margin-top: 8px; padding: 8px 12px; background: #1a1a2e; color: #fff; display: inline-block; border-radius: 4px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; margin-left: 8px;">TOTAL GROSS WEIGHT (KG): ' + totalGross.toFixed(1) + '</div>';
    html += '</body></html>';
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }

  if (loading) {
    return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin"><RefreshCw className="w-8 h-8" /></div>
    </div>
  );
}

return (
  <div className="relative bg-background min-h-screen p-4 md:p-6">
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <span className="text-sm text-muted-foreground font-medium">Filter by departure:</span>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">From</label>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">To</label>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
        />
      </div>
      <div className="flex items-center gap-1">
        {[{label:'Today', from:0, to:0},{label:'3 days', from:-2, to:1},{label:'This week', from:-2, to:5},{label:'2 weeks', from:-2, to:12}].map(({label, from, to}) => (
          <button
            key={label}
            onClick={() => {
              const f = new Date(); f.setDate(f.getDate() + from);
              const t = new Date(); t.setDate(t.getDate() + to);
              setDateFrom(f.toISOString().split('T')[0]);
              setDateTo(t.toISOString().split('T')[0]);
            }}
            className="px-2 py-1 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="space-y-8">
      {dayKeys.map(dayKey => (
        <div key={dayKey}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-3 py-1 bg-muted rounded-full">{dayKey}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-6">
            {flightsByDay[dayKey].map(flight => {
          const items = grouped[flight];
          const uldGroups = groupByUld(items);
          const uldKeys = Object.keys(uldGroups).sort();
          const totalBoxes = items.reduce((sum, s) => sum + (s.box_count || 0), 0);
          const totalGross = items.reduce((sum, s) => sum + (s.gross_weight || 0), 0);
          const totalNet = items.reduce((sum, s) => sum + (s.net_weight || 0), 0);

          return (
            <div key={flight} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 bg-muted/30 border-b border-border">
                <Plane className="w-5 h-5 text-primary" />
                <div className="flex-1">
                 <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                     <span className="font-semibold text-xl">{flight}</span>
                     {flights[flight]?.destination && (
                       <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded">{flights[flight].destination}</span>
                     )}
                   </div>
                    {flights[flight] && (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-foreground">
                          ETD {new Date(flights[flight].departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {flights[flight].weight_deadline && (
                          <span className="text-sm font-bold text-red-500 px-3 py-1 rounded shadow-[0_0_12px_rgba(239,68,68,0.8)]">
                            Deadline: {new Date(flights[flight].weight_deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {(() => {
                          const LOOSE_AWB_PREFIXES = ["217","784","501","172","618","898","999","205","065","695","214","220","221","105"];
                          const flightAll = allShipments.filter(s => (s.flight_number || s.air_routing) === flight && (!s.awb_number || !LOOSE_AWB_PREFIXES.some(p => s.awb_number.startsWith(p)) || s.awb_number.startsWith("071")));
                          const allDone = flightAll.length > 0 && flightAll.every(s => s.uld_number && (s.status === "loaded" || s.status === "completed") && s.gross_weight != null);
                          if (allDone) {
                            return (
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-bold text-green-600 px-3 py-1 rounded shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-500/40 bg-green-500/10">
                                  ✓ Flight Complete
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const flightData = flights[flight];
                                    const dateStr = flightData?.departure_date ? new Date(flightData.departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                                    const subject = 'MOWI Finals ' + String.fromCharCode(8212) + ' ' + flight + ' ' + String.fromCharCode(8212) + ' ' + dateStr;
                                    const to = finalsEmails.join(';');
                                    const outlookUrl = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(to) + '&subject=' + encodeURIComponent(subject);
                                    window.open(outlookUrl, '_blank');
                                  }}
                                  className="h-7 px-2 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_rgba(34,197,94,0.8)] rounded flex items-center"
                                >
                                  <MailOpen className="w-3 h-3" />
                                  <span>Send Finals</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingEmailFlight(String(flight)); setEmailInput(finalsEmails.join(', ')); }}
                                  className="h-7 w-7 p-0 rounded border border-border flex items-center justify-center"
                                  title="Edit recipient emails"
                                >
                                  <Mail className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          } else {
                            return (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const flightData = flights[flight];
                                    const dateStr = flightData?.departure_date ? new Date(flightData.departure_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                                    const subject = 'MOWI Prefinals ' + String.fromCharCode(8212) + ' ' + flight + ' ' + String.fromCharCode(8212) + ' ' + dateStr;
                                    const to = finalsEmails.join(';');
                                    const outlookUrl = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(to) + '&subject=' + encodeURIComponent(subject);
                                    window.open(outlookUrl, '_blank');
                                  }}
                                  className="h-7 px-2 gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center"
                                >
                                  <MailOpen className="w-3 h-3" />
                                  <span>Send Prefinals</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingEmailFlight(String(flight)); setEmailInput(finalsEmails.join(', ')); }}
                                  className="h-7 w-7 p-0 rounded border border-border flex items-center justify-center"
                                  title="Edit recipient emails"
                                >
                                  <Mail className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          }
                        })()}
                        {editingEmailFlight === flight && (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              autoFocus
                              type="text"
                              className="border border-border rounded px-2 py-1 text-xs bg-background w-64"
                              placeholder="email1@example.com, email2@example.com"
                              value={emailInput}
                              onChange={e => setEmailInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  saveEmails(emailInput.split(',').map(s => s.trim()).filter(Boolean));
                                  setEditingEmailFlight(null);
                                  toast.success('Emails saved');
                                }
                                if (e.key === 'Escape') setEditingEmailFlight(null);
                              }}
                            />
                            <button type="button" className="h-7 text-xs rounded bg-primary text-white px-3" onClick={() => { saveEmails(emailInput.split(',').map(s => s.trim()).filter(Boolean)); setEditingEmailFlight(null); toast.success('Emails saved'); }}>Save</button>
                            <button type="button" className="h-7 text-xs rounded border border-border px-3" onClick={() => setEditingEmailFlight(null)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground text-sm ml-0 block mt-1">
                    {uldKeys.length} ULD{uldKeys.length !== 1 ? "s" : ""} · {totalBoxes} boxes · {totalGross.toFixed(1)} kg gross · {totalNet.toFixed(1)} kg net · <span className="font-semibold text-foreground">{uldKeys.reduce((sum, uld) => sum + uldGroups[uld].length, 0)} Shipments</span>
                  </span>
                </div>
                <button type="button" className="gap-1.5 px-3 py-2 rounded border border-border flex items-center" onClick={() => handlePrintFlight(flight, items)}>
                  <Printer className="w-3.5 h-3.5" /> <span>Print Finals</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/5">
                      <TableHead>ULD Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Contour</TableHead>
                      <TableHead>AWB</TableHead>
                      <TableHead>Order #</TableHead>
                      <TableHead className="text-right">Boxes</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right">Gross (kg)</TableHead>
                      <TableHead className="text-right">Tara (kg)</TableHead>
                      <TableHead className="text-right">Net (kg)</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uldKeys.map(uldNumber => {
                      const uldItems = uldGroups[uldNumber];
                      const combinedGross = uldItems.reduce((sum, s) => sum + (s.gross_weight || 0), 0);
                      const combinedTara = uldItems.reduce((sum, s) => sum + (s.tara_weight || 0), 0);
                      const combinedNet = uldItems.reduce((sum, s) => sum + (s.net_weight || 0), 0);

                      const groupUldType = uldItems.find(i => i.uld_type)?.uld_type || 'PMC';
                      const groupContour = uldItems.find(i => i.contour && i.contour !== null)?.contour || 'P';
                      return uldItems.map((s, idx) => {
                        const myGroup = localGroups[s.id];
                        const nextItem = uldItems[idx + 1];
                        const nextGroup = nextItem ? localGroups[nextItem.id] : null;
                        const isSameUldAsNext = myGroup && nextGroup === myGroup;
                        const isFirstInUld = idx === 0;
                        return (
                          <TableRow key={s.id} className={`hover:bg-muted/20 ${isFirstInUld ? '[&>td]:border-t-2 [&>td]:border-t-border' : ''} ${isSameUldAsNext ? 'border-b-0 [&>td]:border-b-0' : '[&>td]:border-b [&>td]:border-border'}`} style={myGroup ? { borderLeft: `4px solid ${getGroupColor(myGroup)}` } : {}}>
                            <TableCell className="font-mono font-bold text-primary text-xl">{isFirstInUld ? (s.uld_number || "—") : ""}</TableCell>
                            <TableCell>{isFirstInUld ? <Badge variant="secondary" className="text-xs">{groupUldType}</Badge> : null}</TableCell>
                            <TableCell>{isFirstInUld ? <Badge variant="outline" className="text-xs w-8 justify-center">{groupContour || "—"}</Badge> : null}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                {s.awb_number || "—"}
                                {s.awb_number && (
                                  <button onClick={() => { navigator.clipboard.writeText(s.awb_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {myGroup && (
                                  <div className="w-1.5 h-5 rounded" style={{ backgroundColor: getGroupColor(myGroup) || '#ccc' }}></div>
                                )}
                                {s.order_number || "—"}
                                {s.order_number && (
                                  <button onClick={() => { navigator.clipboard.writeText(s.order_number); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{s.box_order_1 ?? s.box_count ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {s.destination_name ? s.destination_name + (s.destination_code ? ' (' + s.destination_code + ')' : "") : "—"}
                            </TableCell>
                            <TableCell className="text-right">{s.gross_weight}</TableCell>
                            <TableCell className="text-right">{s.tara_weight}</TableCell>
                            <TableCell className="text-right font-semibold">{s.net_weight}</TableCell>
                            <TableCell className="max-w-xs">
                              {editingRemark === s.id ? (
                                <div className="flex gap-1">
                                  <input
                                    autoFocus
                                    type="text"
                                    className="border border-border rounded px-2 py-1 text-xs flex-1 bg-background"
                                    value={remarkText}
                                    onChange={e => setRemarkText(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter') {
                                        await api.entities.ULDFishbox.update(s.id, { notes: remarkText });
                                        setEditingRemark(null);
                                        loadData();
                                      }
                                      if (e.key === 'Escape') setEditingRemark(null);
                                    }}
                                  />
                                  <button type="button" className="h-7 text-xs rounded bg-primary text-white px-2" onClick={async () => { await api.entities.ULDFishbox.update(s.id, { notes: remarkText }); setEditingRemark(null); if (loadDataTimeoutRef.current) clearTimeout(loadDataTimeoutRef.current); loadDataTimeoutRef.current = setTimeout(loadData, 500); }}>✓</button>
                                </div>
                              ) : (
                                <div onClick={() => { setEditingRemark(s.id); setRemarkText(s.notes || ''); }} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition">
                                  {s.notes || '—'}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      }).concat(
                        uldItems.length > 1 ? [
                          <TableRow key={`combined-${uldNumber}`} className="bg-primary/5 font-semibold">
                            <TableCell colSpan={5} className="text-right text-primary">Combined:</TableCell>
                            <TableCell className="text-right text-primary">{uldItems.reduce((sum, s) => sum + (s.box_order_1 ?? s.box_count ?? 0), 0)}</TableCell>
                            <TableCell className="text-right text-primary">Weight:</TableCell>
                            <TableCell className="text-right text-primary">{combinedGross.toFixed(1)}</TableCell>
                            <TableCell className="text-right text-primary">{combinedTara.toFixed(1)}</TableCell>
                            <TableCell className="text-right text-primary">{combinedNet.toFixed(1)}</TableCell>
                            <TableCell />
                          </TableRow>
                        ] : []
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}