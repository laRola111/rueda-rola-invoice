"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useInvoice } from "@/hooks/use-invoice";
import { InvoiceData } from "@/types/invoice";
import SplitLayout from "@/components/layout/SplitLayout";
import ControlPanel from "@/components/invoice/ControlPanel";
// InvoiceForm moved to ControlPanel

import InvoiceHeader from "@/components/invoice/InvoiceHeader";
import Watermark from "@/components/invoice/Watermark";
import ClientInfo from "@/components/invoice/ClientInfo";
import ItemsTable from "@/components/invoice/ItemsTable";
import InvoiceSummary from "@/components/invoice/InvoiceSummary";
// import InvoiceHistory, { InvoiceRecord } from "@/components/invoice/InvoiceHistory";
// Icons and Button removed as they are now in ControlPanel
import { getNextInvoiceNumber, saveInvoice } from "@/app/actions";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

export default function InvoicePage() {
  const { data, calculations, actions, setData } = useInvoice();

  // Note: canvasRef is used by LiveCanvas wrapper
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch next invoice number
  const fetchNextInvoiceNumber = useCallback(async () => {
    try {
      const nextNumber = await getNextInvoiceNumber();
      actions.setInvoiceNumber(nextNumber);
    } catch (error) {
      console.error("Error fetching next invoice number:", error);
      toast.error("Error conectando con Google Sheets");
    }
  }, [actions]);

  // Initial fetch
  useEffect(() => {
    fetchNextInvoiceNumber();
  }, [fetchNextInvoiceNumber]);

  // Update document title
  useEffect(() => {
    document.title = data.number ? `Factura ${data.number}` : "Nueva Factura";
  }, [data.number]);

  // -- PDF Export logic using Hidden Clone Strategy --
  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      if (!canvasRef.current) throw new Error("Canvas ref is null");

      const originalElement = canvasRef.current;

      // 1. Create a temporary container for the clone
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.top = "-10000px";
      container.style.left = "-10000px";
      // Force A4 dimensions
      container.style.width = "210mm";
      container.style.minHeight = "297mm";
      container.style.backgroundColor = "#ffffff";
      container.style.zIndex = "-100";
      document.body.appendChild(container);

      // 2. Clone the invoice element
      const clonedElement = originalElement.cloneNode(true) as HTMLElement;

      // 3. Clean up the clone
      // Ensure the clone has the correct width/height constraints explicitly
      clonedElement.style.width = "210mm";
      clonedElement.style.minHeight = "297mm";
      clonedElement.style.transform = "none"; // Remove any scaling
      clonedElement.style.margin = "0";
      clonedElement.style.boxShadow = "none";

      // Append clone to temporary container
      container.appendChild(clonedElement);

      // 4. Capture the CLONE, not the original
      const canvas = await html2canvas(clonedElement, {
        scale: 4, // High quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        imageTimeout: 15000,
        logging: true,
        // Ensure html2canvas sees the full width
        windowWidth: 210 * 3.7795275591,
        onclone: (clonedDoc: Document) => {
          // Fallback for html2canvas unsupported color functions
          const allElements = clonedDoc.querySelectorAll("*");
          allElements.forEach((el: Element) => {
            const style = window.getComputedStyle(el);
            const isUnsupported = (val: string) =>
              val &&
              (val.includes("oklab") ||
                val.includes("lab(") ||
                val.includes("oklch"));

            if (isUnsupported(style.backgroundColor)) {
              (el as HTMLElement).style.backgroundColor = "#ffffff";
            }
            if (isUnsupported(style.color)) {
              (el as HTMLElement).style.color = "#000000";
            }
            if (isUnsupported(style.borderColor)) {
              (el as HTMLElement).style.borderColor = "#cbd5e1";
            }
          });
        },
      } as any);

      // 5. Clean up DOM
      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");

      // A4 size in mm
      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, imgHeight);

      // Auto-save
      const fileName = data.number
        ? `Factura-${data.number}.pdf`
        : "Factura-RuedaRola.pdf";
      pdf.save(fileName);

      toast.success("PDF generado exitosamente (Layout Fixed)");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Error al generar PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!data.client.name) {
      toast.error("Nombre de cliente requerido");
      return;
    }
    if (data.items.length === 0) {
      toast.error("Agregue items a la factura");
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveInvoice(data);
      toast.success(
        `Guardado en: ${result.sheetName} (${result.range}). ID: ...${result.spreadsheetId.slice(-4)}`,
      );
      setIsLocked(true);
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Error al guardar en Google Sheets");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewInvoice = async () => {
    actions.resetInvoice();
    setIsLocked(false);
    await fetchNextInvoiceNumber();
  };

  /* 
  const loadInvoiceFromHistory = async (invoice: InvoiceRecord) => {
    // History loading disabled during Google Sheets migration
    // TODO: Implement getHistory action
    toast.error("Historial no disponible en esta versión.");
  }; 
  */

  return (
    <SplitLayout
      controlPanelContent={
        <ControlPanel
          data={data}
          actions={actions}
          isLocked={isLocked}
          isSaving={isSaving}
          isExporting={isExporting}
          onSave={handleSaveInvoice}
          onNew={handleNewInvoice}
          onHistory={() => toast.info("Historial en mantenimiento")}
          onPrint={handleExportPDF}
        />
      }
      liveCanvasContent={
        <>
          <div className="flex justify-center p-8 min-h-full bg-slate-100/50 overflow-auto">
            {/* Scale Wrapper: Ensures A4 dimensions while scaling down if necessary on smaller screens */}
            <div
              className="relative origin-top transform scale-[0.45] sm:scale-[0.6] md:scale-[0.8] lg:scale-100 transition-transform duration-300"
              style={{ minWidth: "210mm", minHeight: "297mm" }}
            >
              <div
                id="invoice-preview-container"
                className="w-[210mm] min-h-[297mm] bg-white shadow-2xl relative z-10 flex flex-col pt-16 px-[12mm] pb-[12mm] mx-auto origin-top"
                ref={canvasRef}
              >
                <Watermark />
                <InvoiceHeader data={data} />
                <ClientInfo client={data.client} />
                <ItemsTable items={data.items} />
                <div className="flex-1" />
                <div className="invoice-footer invoice-break-avoid mt-12">
                  <div className="mb-4">
                    <div className="flex items-end justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/imagenes/qr_contacto.png"
                            alt="QR Contacto"
                            className="w-24 h-24 object-contain"
                            onError={(e) =>
                              (e.currentTarget.style.display = "none")
                            }
                          />
                        </div>
                        <p className="text-sm text-slate-600 font-medium">
                          Métodos de pago: Martha P. Martinez Cel. (469)
                          428-6018
                        </p>
                      </div>

                      <InvoiceSummary
                        calculations={calculations}
                        payments={data.payments || []}
                      />
                    </div>
                  </div>
                  <div className="mt-12 pt-8 border-t-2 border-slate-900">
                    <div className="flex flex-row justify-between items-end">
                      {/* Left: Thank You & Notes */}
                      <div className="mb-0 max-w-sm">
                        <h4 className="font-black text-xl text-slate-900 mb-2 italic">
                          Thank you for your Business
                        </h4>
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                              NOTES
                            </p>
                            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100 min-h-[60px]">
                              {data.notes ||
                                "Payment due as specified in terms."}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Agency Info */}
                      <div className="text-right space-y-1 text-sm text-slate-600">
                        <p className="font-bold text-slate-900 text-lg">Patt</p>
                        <p>469 428 6018</p>
                        <p className="text-primary font-medium">
                          patt@ruedalarolamedia.com
                        </p>
                        <p>www.ruedalarolamedia.com</p>
                        <p className="text-slate-500">@ruedalarolamedia</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="print-footer-fixed hidden print:flex">
                  <span>www.ruedalarolamedia.com</span>
                  <span className="page-number"></span>
                </div>
              </div>
            </div>
          </div>
        </>
      }
    />
  );
}
