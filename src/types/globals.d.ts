// Global type declarations for jsPDF and autoTable

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
    setR2L(rtl: boolean): void;
    addFileToVFS(filename: string, content: string): void;
    addFont(filename: string, fontName: string, fontStyle: string): void;
  }
}

declare module 'jspdf-autotable' {
  interface AutoTableOptions {
    startY?: number;
    head?: string[][];
    body?: string[][];
    theme?: string;
    styles?: {
      font?: string;
      fontSize?: number;
      cellPadding?: number;
      overflow?: string;
      minCellHeight?: number;
      halign?: string;
      valign?: string;
      lineWidth?: number;
      textColor?: number[];
      fillColor?: number[];
    };
    headStyles?: {
      fillColor?: number[];
      textColor?: number[];
      fontSize?: number;
      fontStyle?: string;
      minCellHeight?: number;
      halign?: string;
    };
    alternateRowStyles?: {
      fillColor?: number[];
    };
    columnStyles?: {
      [key: number]: {
        cellWidth?: number;
        halign?: string;
      };
    };
    margin?: {
      left?: number;
      right?: number;
    };
    tableWidth?: string;
    didDrawPage?: (data: any) => void;
  }

  function autoTable(doc: any, options: AutoTableOptions): void;
  export = autoTable;
}