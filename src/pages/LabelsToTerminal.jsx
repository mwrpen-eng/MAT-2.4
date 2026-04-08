// @ts-nocheck
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Upload, ScanBarcode, Loader2, X } from 'lucide-react';
import { appApi as api } from '@/api/appApi';

const printWindow = (title, bodyHtml) => {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: white; }
    @page { size: 100mm 150mm; margin: 0; }
    @media print { body { width: 100mm; } }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
};

const printBarcodeLabels = (numbers) => {
  const labelsHtml = numbers.map(num => `
    <div style="width:100mm;height:150mm;box-sizing:border-box;padding:8mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;background:white;page-break-after:always;">
      <img src="https://barcodeapi.org/api/128/${num}" style="max-width:85mm;height:auto;" alt="barcode" />
    </div>
  `).join('');

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Barcode Labels</title>
    <style>* { margin:0;padding:0;box-sizing:border-box; } body{background:white;} @page{size:100mm 150mm;margin:0;} @media print{body{width:100mm;}}</style>
  </head><body>${labelsHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
};

export default function LabelsToTerminal() {
  const [labelType, setLabelType] = useState(null);
  const [extractedNumbers, setExtractedNumbers] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const [manualInput, setManualInput] = useState('');

  const getManualNumbers = () =>
    manualInput.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(n => n.startsWith('3707') ? '00' + n : n);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setExtracting(true);
    setExtractedNumbers([]);
    const { file_url } = await api.integrations.Core.UploadFile({ file });
    const result = await api.integrations.Core.InvokeLLM({
      prompt: 'Extract every number from this image that starts with 3707. These are long numeric strings. Read each digit carefully and accurately. Return all found numbers as an array.',
      file_urls: [file_url],
      response_json_schema: { type: 'object', properties: { numbers: { type: 'array', items: { type: 'string' } } } }
    });
    const nums = (result.numbers || [])
      .map(n => String(n).replace(/^0+/, ''))
      .filter(n => n.startsWith('3707'))
      .map(n => '00' + n);
    setExtractedNumbers(nums);
    setExtracting(false);
  };

  const handlePrint = () => {
    if (labelType === 'awb') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:20mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:72px;font-weight:900;letter-spacing:4px;">TEMP LOG</div></div>
      </div>`;
      printWindow('TEMP LOG Label', html);
    }
    if (labelType === 'xbox') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:2mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:72px;font-weight:900;letter-spacing:4px;">X-BOX</div></div>
        <div style="border-top:4px solid #000;width:100%;margin:12mm 0;"></div>
        <div style="text-align:center;font-size:36px;font-weight:900;letter-spacing:2px;">LOAD ON TOP</div>
      </div>`;
      printWindow('X-BOX Label', html);
    }
    if (labelType === 'screening') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:20mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:48px;font-weight:900;letter-spacing:4px;">SCREENING</div></div>
      </div>`;
      printWindow('SCREENING Label', html);
    }
    if (labelType === 'handling') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:20mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:72px;font-weight:900;letter-spacing:4px;">STOP 2</div></div>
      </div>`;
      printWindow('STOP 2 Label', html);
    }
    if (labelType === 'destination') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:20mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:72px;font-weight:900;letter-spacing:4px;">STOP 4</div></div>
      </div>`;
      printWindow('STOP 4 Label', html);
    }
    if (labelType === 'flight') {
      const html = `<div style="width:100mm;height:150mm;box-sizing:border-box;padding:6mm;padding-top:20mm;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;background:white;">
        <div style="text-align:center;"><div style="font-size:72px;font-weight:900;letter-spacing:4px;">STOP 3</div></div>
      </div>`;
      printWindow('STOP 3 Label', html);
    }
  };

  const labelTypes = [
    { id: 'awb', name: 'TEMP LOG Labels', description: 'Temp log handling labels' },
    { id: 'destination', name: 'STOP 4 Labels', description: 'Stop 4 handling labels' },
    { id: 'handling', name: 'STOP 2 Labels', description: 'Stop 2 handling labels' },
    { id: 'flight', name: 'STOP 3 Labels', description: 'Stop 3 handling labels' },
    { id: 'xbox', name: 'X-BOX Labels', description: 'Box labeling for shipments' },
    { id: 'screening', name: 'Screening Labels', description: 'Security screening labels' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Labels to Print</h1>
        <p className="text-muted-foreground">Select the label type needed for terminal operations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Label type cards */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {labelTypes.map(type => (
              <div
                key={type.id}
                onClick={() => setLabelType(type.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  labelType === type.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-accent border-border'
                }`}
              >
                <h3 className="font-semibold text-lg mb-1">{type.name}</h3>
                <p className={`text-sm ${labelType === type.id ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                  {type.description}
                </p>
              </div>
            ))}
          </div>
          {labelType && (
            <Button className="gap-2 w-full" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              Print {labelTypes.find(t => t.id === labelType)?.name}
            </Button>
          )}
        </div>

        {/* Right: Screenshot + Manual entry */}
        <div className="space-y-4">
          {/* Barcode from Screenshot */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2"><ScanBarcode className="w-5 h-5" /> Barcode Labels from Screenshot</h2>
              <p className="text-sm text-muted-foreground mt-1">Upload a screenshot to extract numbers starting with 3707 and print as barcodes</p>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4" /> Import Screenshot
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {previewUrl && (
                <div className="flex items-center gap-2">
                  <img src={previewUrl} alt="preview" className="h-12 rounded border border-border object-cover" />
                  <button onClick={() => { setPreviewUrl(null); setExtractedNumbers([]); fileInputRef.current.value = ''; }} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove screenshot">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {extracting && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Extracting numbers...</span>}
            </div>
            {extractedNumbers.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {extractedNumbers.map((num, i) => (
                    <div key={i} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-sm font-mono">
                      {num}
                      <button onClick={() => setExtractedNumbers(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button className="gap-2" onClick={() => printBarcodeLabels(extractedNumbers)}>
                  <Printer className="w-4 h-4" /> Print {extractedNumbers.length} Barcode Label{extractedNumbers.length !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
            {!extracting && previewUrl && extractedNumbers.length === 0 && (
              <p className="text-sm text-muted-foreground">No numbers starting with 3707 found.</p>
            )}
          </div>

          {/* Manual Entry */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-3">
            <div>
              <h3 className="text-sm font-semibold mb-1">Manual Entry</h3>
              <p className="text-xs text-muted-foreground">One number per line — numbers starting with 3707 get 00 prepended automatically</p>
            </div>
            <textarea
              className="w-full h-32 border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={"003707123456\n003707789012\nor paste raw 3707 numbers..."}
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
            />
            {manualInput.trim() && (
              <div className="flex items-center gap-3">
                <div className="flex flex-wrap gap-1 flex-1">
                  {getManualNumbers().map((n, i) => (
                    <span key={i} className="bg-muted px-2 py-0.5 rounded-full text-xs font-mono">{n}</span>
                  ))}
                </div>
                <Button className="gap-2 shrink-0" onClick={() => printBarcodeLabels(getManualNumbers())}>
                  <Printer className="w-4 h-4" /> Print {getManualNumbers().length} Label{getManualNumbers().length !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}