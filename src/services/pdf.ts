import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { VAZIR_FONT_URL, LRM, PERSIAN_WEEKDAYS, ENGLISH_WEEKDAYS } from '../config/constants';
import { reshapePersianText, getPersianDate, getWeekStatus } from '../utils/persian';
import { calculateIdleTime } from '../utils/time';
import type { UserSchedule, ScheduleLesson } from '../types';

export class PDFService {
  private vazirFontArrayBuffer: ArrayBuffer | null = null;

  /**
   * Fetches and caches Vazir font
   */
  private async getVazirFont(): Promise<ArrayBuffer | null> {
    if (this.vazirFontArrayBuffer) return this.vazirFontArrayBuffer;

    try {
      console.log("[PDF] Fetching Vazir font...");
      const fontResponse = await fetch(VAZIR_FONT_URL, {
        headers: { 'Accept': 'application/octet-stream' }
      });

      if (!fontResponse.ok) {
        throw new Error(`Failed to fetch Vazir font TTF (${fontResponse.status}): ${await fontResponse.text()}`);
      }

      this.vazirFontArrayBuffer = await fontResponse.arrayBuffer();

      if (!this.vazirFontArrayBuffer || this.vazirFontArrayBuffer.byteLength === 0) {
        throw new Error("Received empty font data");
      }

      console.log(`[PDF] Vazir font fetched successfully (${this.vazirFontArrayBuffer.byteLength} bytes)`);
      return this.vazirFontArrayBuffer;
    } catch (e) {
      console.error(`[PDF] Error fetching Vazir font: ${e}`);
      return null;
    }
  }

  /**
   * Generates PDF for user schedule - Exact match with original JS
   */
  async generateSchedulePDF(userSchedule: UserSchedule, userId: number): Promise<ArrayBuffer> {
    console.log(`[PDF] Generating schedule PDF for user ${userId}`);
    
    try {
      const doc = new jsPDF({ 
        orientation: "landscape", 
        unit: "mm", 
        format: "a4",
        putOnlyUsedFonts: true,
        floatPrecision: 16
      });

      const fontArrayBuffer = await this.getVazirFont();
      if (!fontArrayBuffer) {
        throw new Error("Failed to load Vazir font for PDF.");
      }
      
      // Convert ArrayBuffer to base64 using btoa
      const base64Font = btoa(String.fromCharCode(...new Uint8Array(fontArrayBuffer)));
      doc.addFileToVFS('Vazirmatn-Regular.ttf', base64Font);
      doc.addFont('Vazirmatn-Regular.ttf', 'Vazir', 'normal');
      doc.setFont('Vazir');
      doc.setR2L(true); // Enable RTL mode for the document
      
      const pageWidth = (doc as any).internal.pageSize.getWidth();
      const pageHeight = (doc as any).internal.pageSize.getHeight();
      const margin = 10;
      
      // Define logical titles (will be reshaped)
      const pdfTitle = "برنامه هفتگی";
      const nameLabel = "نام: ";
      const weekLabelPrefix = "هفته ";
      
      const weekTypes = [
        { type: "odd", label: "فرد", emoji: "🟣", data: userSchedule.odd_week_schedule },
        { type: "even", label: "زوج", emoji: "🟢", data: userSchedule.even_week_schedule }
      ];
      
      for (let pageIndex = 0; pageIndex < weekTypes.length; pageIndex++) {
        if (pageIndex > 0) {
          doc.addPage();
        }
        doc.setFont('Vazir'); // Ensure font is set for each page
        doc.setR2L(true);     // Ensure RTL is set for each page
        
        const { label, emoji, data } = weekTypes[pageIndex];
        
        // Add title and name (reshaped)
        doc.setFontSize(16);
        doc.text(reshapePersianText(pdfTitle), pageWidth / 2, 15, { align: "center" });
        
        doc.setFontSize(14);
        // Handle mixed LTR/RTL for name: Reshape Persian part, append LTR part
        const persianNameLabel = reshapePersianText(nameLabel);
        const fullName = `کاربر ${userId}`; // Simple fallback name
        const isFullNamePersian = /[\u0600-\u06FF]/.test(fullName);
        const displayName = isFullNamePersian ? reshapePersianText(fullName) : fullName;
        doc.text(persianNameLabel + displayName, pageWidth / 2, 25, { align: "center" });
        doc.text(reshapePersianText(weekLabelPrefix + label) + ` ${emoji}`, pageWidth / 2, 35, { align: "center" });

        // Logical headers (rightmost column first)
        // Time strings will have LRM to enforce LTR rendering
        const logicalHeaders = [
          reshapePersianText('روز'),
          reshapePersianText('کلاس اول') + '\n' + LRM + '08:00 - 10:00' + LRM,
          reshapePersianText('کلاس دوم') + '\n' + LRM + '10:00 - 12:00' + LRM,
          reshapePersianText('کلاس سوم') + '\n' + LRM + '13:00 - 15:00' + LRM,
          reshapePersianText('کلاس چهارم') + '\n' + LRM + '15:00 - 17:00' + LRM,
          reshapePersianText('کلاس پنجم') + '\n' + LRM + '17:00 - 19:00' + LRM
        ];
        
        // Reverse headers for jspdf-autotable if it lays out LTR by default
        const tableHeadersForAutoTable = [...logicalHeaders].reverse();
        
        const tableData: string[][] = [];
        
        for (const dayKey of ENGLISH_WEEKDAYS) {
          const lessonsForDay = data[dayKey] || [];
          // Start with day name (rightmost logical column), then placeholders
          const logicalRowCells = [
            reshapePersianText(PERSIAN_WEEKDAYS[ENGLISH_WEEKDAYS.indexOf(dayKey)]),
            reshapePersianText('-'), // Placeholder for Class 1
            reshapePersianText('-'), // Placeholder for Class 2
            reshapePersianText('-'), // Placeholder for Class 3
            reshapePersianText('-'), // Placeholder for Class 4
            reshapePersianText('-')  // Placeholder for Class 5
          ];
          
          for (const lesson of lessonsForDay) {
            const startTime = lesson.start_time;
            let slotIndex = -1; // This will be the 1-based index in logicalRowCells (after day name)
            
            if (startTime >= '08:00' && startTime < '10:00') slotIndex = 1;
            else if (startTime >= '10:00' && startTime < '12:00') slotIndex = 2;
            else if (startTime >= '13:00' && startTime < '15:00') slotIndex = 3;
            else if (startTime >= '15:00' && startTime < '17:00') slotIndex = 4;
            else if (startTime >= '17:00' && startTime < '19:00') slotIndex = 5;
            
            if (slotIndex !== -1) {
              const lessonText = reshapePersianText(lesson.lesson);
              const locationText = lesson.location ? reshapePersianText(lesson.location) : '';
              logicalRowCells[slotIndex] = lessonText + (locationText ? '\n' + locationText : '');
            }
          }
          
          // Reverse the logically ordered row for jspdf-autotable
          tableData.push([...logicalRowCells].reverse());
        }
        
        // Column styles mapped to VISUAL (LTR) order after reversal
        // If 'روز' (Day) was logically first and now visually last (e.g. 6 columns total, index 5)
        const dayColumnVisualIndex = logicalHeaders.length - 1;
        const classColumnVisualIndices = Array.from({length: 5}, (_, i) => dayColumnVisualIndex - 1 - i);
        const columnStylesConfig: { [key: number]: any } = {
          [dayColumnVisualIndex]: { cellWidth: 25, halign: 'right' }, // Day column (visually last)
          [classColumnVisualIndices[0]]: { cellWidth: 50, halign: 'right' }, // Class 1 (visually second to last)
          [classColumnVisualIndices[1]]: { cellWidth: 50, halign: 'right' }, // Class 2
          [classColumnVisualIndices[2]]: { cellWidth: 50, halign: 'right' }, // Class 3
          [classColumnVisualIndices[3]]: { cellWidth: 50, halign: 'right' }, // Class 4
          [classColumnVisualIndices[4]]: { cellWidth: 50, halign: 'right' }, // Class 5 (visually first)
        };

        autoTable(doc, {
          startY: 45,
          head: [tableHeadersForAutoTable], // Use reversed headers
          body: tableData,                 // Body data already contains reversed rows
          theme: 'grid',
          styles: {
            font: 'Vazir',
            fontSize: 10,
            cellPadding: 2,
            overflow: 'linebreak',
            minCellHeight: 15,
            halign: 'right', // Default horizontal alignment for cells (good for Persian)
            valign: 'middle',
            lineWidth: 0.3
          },
          headStyles: {
            fillColor: [200, 200, 200],
            textColor: [0, 0, 0],
            fontSize: 11,
            fontStyle: 'normal',
            minCellHeight: 20,
            halign: 'center' // Headers can be centered
          },
          columnStyles: columnStylesConfig,
          margin: { left: margin, right: margin },
          tableWidth: 'auto',
          didDrawPage: function(dataHook) {
            doc.setFontSize(8);
            // Footer text should be LTR, align: "right" within RTL context places it on the left
            // To place it on the visual right (near left margin for LTR page):
            // doc.text("@WeekStatusBot", margin, pageHeight - 5, { align: "left" });
            // To place it on the visual left (near right margin for LTR page / true right for RTL page context):
            doc.text("@WeekStatusBot", pageWidth - margin, pageHeight - 5, { align: "right" });
          }
        });
      }
      
      console.log(`[PDF] Generation complete for user ${userId}. Outputting buffer.`);
      const pdfArrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
      return pdfArrayBuffer;
      
    } catch (e) {
      console.error(`[PDF] Error generating PDF for user ${userId}: ${e}`);
      throw e; // Re-throw to be caught by the caller
    }
  }
}