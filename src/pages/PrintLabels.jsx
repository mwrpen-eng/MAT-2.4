// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { appApi as api } from "@/api/appApi";
import { Printer, ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

const extractFlightNumber = (airRouting) => {
  if (!airRouting) return null;
  const match = airRouting.match(/^([A-Z0-9]+)/);
  return match ? match[1] : null;
};

const buildLabelHTML = (shipment, index, total) => `
  <div style="width:100mm;height:130mm;box-sizing:border-box;padding:6mm;margin-top:20mm;font-family:Arial,sans-serif;border:none;page-break-after:${index < total ? 'always' : 'auto'};break-after:${index < total ? 'page' : 'auto'};">
    <div style="display:flex;justify-content:center;align-items:center;border-bottom:3px solid #000;margin-bottom:6px;background:#333;border-radius:4px;padding:10px;">
      <div style="font-size:36px;font-weight:900;color:#000;letter-spacing:6px;font-family:Arial,sans-serif;">MOWI</div>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:6px;text-align:center;">
      <tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;width:45%;text-align:center;">AWB Number:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.awb_number || 'N/A'}</td></tr>
      ${shipment.order_number ? `<tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Order #:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.order_number}</td></tr>` : ''}
      <tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Destination:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.destination_name || 'N/A'} (${shipment.destination_code || 'N/A'})</td></tr>
      <tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Flight:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.flight_number || extractFlightNumber(shipment.air_routing) || 'N/A'}</td></tr>
      ${shipment.uld_type ? `<tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">ULD Type:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.uld_type}</td></tr>` : ''}
      ${shipment.contour ? `<tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Contour:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.contour}</td></tr>` : ''}
      ${shipment.service_provider ? `<tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Provider:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${shipment.service_provider}</td></tr>` : ''}
      <tr><td style="font-weight:900;padding:3px 0;color:#000;text-transform:uppercase;text-align:center;">Box:</td><td style="font-weight:900;color:#000;text-align:center;font-size:14px;">${index} of ${total}</td></tr>
    </table>
    <div style="border-top:3px solid #000;padding-top:6px;text-align:center;">
      <div style="font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:3px;border:4px solid #000;padding:8px;border-radius:4px;color:#000;">${shipment.awb_number || 'N/A'}</div>
      ${shipment.order_number ? `<div style="font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:3px;border:4px solid #000;padding:8px;border-radius:4px;margin-top:6px;color:#000;">${shipment.order_number}</div>` : ''}
    </div>
  </div>
`;

export default function PrintLabels() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const data = await api.entities.ULDFishbox.get(id);
      setShipment(data);
      setLoading(false);
    }
    load();
  }, [id]);

  const handlePrint = () => {
    if (!shipment) return;
    const boxCount = shipment.box_count || 1;
    const labelsHTML = Array.from({ length: boxCount }, (_, i) =>
      buildLabelHTML(shipment, i + 1, boxCount)
    ).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Labels - ${shipment.awb_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: white; }
    @page { size: 100mm 150mm; margin: 0; }
    @media print {
      body { width: 100mm; }
    }
  </style>
</head>
<body>${labelsHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="text-center py-20">
        <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="font-medium text-muted-foreground">Shipment not found</p>
        <Button onClick={() => navigate(-1)} className="mt-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </Button>
      </div>
    );
  }

  const boxCount = shipment.box_count || 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" /> Print {boxCount} Label{boxCount > 1 ? 's' : ''}
        </Button>
        <span className="text-sm text-muted-foreground">AWB: {shipment.awb_number} — {boxCount} label{boxCount > 1 ? 's' : ''}</span>
      </div>

      {/* Preview of labels */}
      <div className="flex flex-col gap-6 items-start">
        {Array.from({ length: boxCount }, (_, i) => (
          <div key={i} style={{ width: '100mm', height: '130mm', boxSizing: 'border-box', padding: '6mm', marginTop: '20mm', fontFamily: 'Arial, sans-serif', border: 'none', borderRadius: '8px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', borderBottom: '3px solid #000', marginBottom: '6px', background: '#333', borderRadius: '4px', padding: '10px' }}>
              <div style={{ fontSize: '36px', fontWeight: 900, color: '#000', letterSpacing: '6px', fontFamily: 'Arial, sans-serif' }}>MOWI</div>
            </div>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', marginBottom: '6px', textAlign: 'center' }}>
              <tbody>
                <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', width: '45%', textAlign: 'center' }}>AWB Number:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.awb_number || 'N/A'}</td></tr>
                {shipment.order_number && <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Order #:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.order_number}</td></tr>}
                <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Destination:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.destination_name || 'N/A'} ({shipment.destination_code || 'N/A'})</td></tr>
                <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Flight:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.flight_number || extractFlightNumber(shipment.air_routing) || 'N/A'}</td></tr>
                {shipment.uld_type && <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>ULD Type:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.uld_type}</td></tr>}
                {shipment.contour && <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Contour:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.contour}</td></tr>}
                {shipment.service_provider && <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Provider:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{shipment.service_provider}</td></tr>}
                <tr><td style={{ fontWeight: 900, padding: '3px 0', color: '#000', textTransform: 'uppercase', textAlign: 'center' }}>Box:</td><td style={{ fontWeight: 900, color: '#000', textAlign: 'center', fontSize: '14px' }}>{i + 1} of {boxCount}</td></tr>
              </tbody>
            </table>
            <div style={{ borderTop: '3px solid #000', paddingTop: '6px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Courier New, monospace', fontSize: '28px', fontWeight: 900, letterSpacing: '3px', border: '4px solid #000', padding: '8px', borderRadius: '4px', color: '#000' }}>{shipment.awb_number || 'N/A'}</div>
              {shipment.order_number && <div style={{ fontFamily: 'Courier New, monospace', fontSize: '28px', fontWeight: 900, letterSpacing: '3px', border: '4px solid #000', padding: '8px', borderRadius: '4px', marginTop: '6px', color: '#000' }}>{shipment.order_number}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}