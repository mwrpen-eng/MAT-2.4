// @ts-nocheck
import { useState, useEffect } from "react";
import { appApi as api } from "@/api/appApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, MailOpen, Mail } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export default function QRNetReplacement() {
  const [qrEmails, setQrEmails] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qrNetEmails') ?? '[]') || []; } catch { return []; }
  });
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const saveQrEmails = (emails) => {
    setQrEmails(emails);
    localStorage.setItem('qrNetEmails', JSON.stringify(emails));
  };

  const handleSendOutlook = () => {
    const filledRows = rows.filter(row => row.uldId && row.newNetSerialNr);
    if (filledRows.length === 0) { toast.error("No filled rows to send"); return; }
    const subject = 'QR Net Replacement Log — ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    let body = 'QR NET REPLACEMENT LOG\n';
    body += 'Generated: ' + new Date().toLocaleString('nb-NO') + '\n\n';
    body += 'AMOUNT\tULD ID\tNEW NET SERIAL NR\tDATE & TIME\n';
    filledRows.forEach((row, index) => {
      body += (filledRows.length - index) + '\t' + row.uldId + '\t' + row.newNetSerialNr + '\t' + row.timestamp + '\n';
    });
    body += '\nTotal Records: ' + filledRows.length;
    const to = qrEmails.join(';');
    const outlookUrl = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(to) + '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.open(outlookUrl, '_blank');
  };

  const [rows, setRows] = useState(() => {
    const saved = localStorage.getItem('qrNetReplacementRows');
    return saved ? JSON.parse(saved) : [{ id: Date.now(), uldId: "", newNetSerialNr: "", timestamp: "" }];
  });

  useEffect(() => {
    localStorage.setItem('qrNetReplacementRows', JSON.stringify(rows));
  }, [rows]);

  const addRow = () => {
    const newRow = { id: Date.now(), uldId: "", newNetSerialNr: "", timestamp: "" };
    setRows([newRow, ...rows]);
  };

  const removeRow = (id) => {
    setRows(rows.filter(row => row.id !== id));
  };

  const updateRow = (id, field, value) => {
    setRows(rows.map(row => {
      if (row.id === id) {
        const updated = { ...row, [field]: value };
        if (!row.timestamp && (field === 'uldId' || field === 'newNetSerialNr') && value) {
          updated.timestamp = new Date().toLocaleString('en-GB');
        }
        return updated;
      }
      return row;
    }));
  };

  const handleExport = () => {
    const filledRows = rows.filter(row => row.uldId && row.newNetSerialNr);
    if (filledRows.length === 0) {
      toast.error("Please fill in at least one row");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = margin;

    const logoUrl = '/mowi-logo.svg';
    try {
      doc.addImage(logoUrl, 'PNG', pageWidth / 2 - 15, yPos, 30, 11);
      yPos += 25;
    } catch (err) {
      yPos += 10;
    }

    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text("QR NET REPLACEMENT LOG", pageWidth / 2, yPos, { align: "center" });
    doc.setFont(undefined, 'normal');
    yPos += 12;

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Generated: ${now}`, margin, yPos);
    yPos += 6;
    doc.text(`Total Records: ${filledRows.length}`, margin, yPos);
    yPos += 12;

    const colWidths = [20, 55, 60, 45];
    const startX = margin;
    
    doc.setFillColor(0, 0, 0);
    doc.setTextColor(255, 255, 255);
    doc.rect(startX, yPos, colWidths[0], 8, 'F');
    doc.rect(startX + colWidths[0], yPos, colWidths[1], 8, 'F');
    doc.rect(startX + colWidths[0] + colWidths[1], yPos, colWidths[2], 8, 'F');
    doc.rect(startX + colWidths[0] + colWidths[1] + colWidths[2], yPos, colWidths[3], 8, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text("AMOUNT", startX + 2, yPos + 6);
    doc.text("ULD ID", startX + colWidths[0] + 2, yPos + 6);
    doc.text("NEW NET SERIAL NR", startX + colWidths[0] + colWidths[1] + 2, yPos + 6);
    doc.text("DATE & TIME", startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 6);
    doc.setFont(undefined, 'normal');
    yPos += 10;

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(50, 50, 50);
    filledRows.forEach((row, index) => {
      const amount = filledRows.length - index;
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(startX, yPos, 180, 7, 'F');
      }
      doc.text(amount.toString(), startX + 2, yPos + 5);
      doc.text(row.uldId, startX + colWidths[0] + 2, yPos + 5);
      doc.text(row.newNetSerialNr, startX + colWidths[0] + colWidths[1] + 2, yPos + 5);
      doc.text(row.timestamp, startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, yPos + 5);
      yPos += 7;
    });

    const fileName = `QR_NET_Replacement_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    toast.success(`Exported ${filledRows.length} records`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">QR NET REPLACEMENT</h1>
        <p className="text-muted-foreground text-sm mt-1">Track and manage QR net serial number replacements</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>QR NET REPLACEMENT LOG</CardTitle>
              <CardDescription>Enter ULD IDs and new net serial numbers</CardDescription>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <Button onClick={addRow} className="gap-2">
                <Plus className="w-4 h-4" /> Add Row
              </Button>
              <Button variant="outline" onClick={handleExport}>
                Export
              </Button>
              <button
                type="button"
                onClick={handleSendOutlook}
                className="h-9 px-3 gap-1 text-sm bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_rgba(34,197,94,0.8)] rounded flex items-center"
              >
                <MailOpen className="w-4 h-4" />
                <span>Send in Outlook</span>
              </button>
              <button
                type="button"
                onClick={() => { setEditingEmail(true); setEmailInput(qrEmails.join(', ')); }}
                className="h-9 w-9 p-0 rounded border border-border flex items-center justify-center"
                title="Edit recipient emails"
              >
                <Mail className="w-4 h-4" />
              </button>
              {editingEmail && (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    className="border border-border rounded px-2 py-1 text-xs bg-background w-64"
                    placeholder="email1@example.com, email2@example.com"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { saveQrEmails(emailInput.split(',').map(s => s.trim()).filter(Boolean)); setEditingEmail(false); toast.success('Emails saved'); }
                      if (e.key === 'Escape') setEditingEmail(false);
                    }}
                  />
                  <button type="button" className="h-7 text-xs rounded bg-primary text-white px-3" onClick={() => { saveQrEmails(emailInput.split(',').map(s => s.trim()).filter(Boolean)); setEditingEmail(false); toast.success('Emails saved'); }}>Save</button>
                  <button type="button" className="h-7 text-xs rounded border border-border px-3" onClick={() => setEditingEmail(false)}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-20 text-center">AMOUNT</TableHead>
                  <TableHead>ULD ID</TableHead>
                  <TableHead>NEW NET SERIAL NR</TableHead>
                  <TableHead className="w-40">DATE & TIME</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold text-center text-lg">{rows.length - index}</TableCell>
                    <TableCell>
                      <Input
                        placeholder="e.g. ULD123"
                        value={row.uldId}
                        onChange={(e) => updateRow(row.id, "uldId", e.target.value)}
                        className="text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="e.g. NET-2026-001"
                        value={row.newNetSerialNr}
                        onChange={(e) => updateRow(row.id, "newNetSerialNr", e.target.value)}
                        className="text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.timestamp}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}