// Type declarations for PDF libraries when not installed

declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: any);
    addFileToVFS(filename: string, data: string): void;
    addFont(filename: string, fontName: string, style: string): void;
    setFont(fontName: string): void;
    setR2L(rtl: boolean): void;
    setFontSize(size: number): void;
    text(text: string, x: number, y: number, options?: any): void;
    addPage(): void;
    setPage(page: number): void;
    getNumberOfPages(): number;
    output(type: string): ArrayBuffer;
    lastAutoTable?: {
      finalY: number;
    };
  }
}

declare module 'jspdf-autotable' {
  function autoTable(doc: any, options: any): void;
  export default autoTable;
}

declare module 'luxon' {
  export class DateTime {
    static now(): DateTime;
    setZone(zone: string): DateTime;
    setLocale(locale: string): DateTime;
    toLocaleString(options: any): string;
    toISODate(): string | null;
    year: number;
    month: number;
    day: number;
  }
}

declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    from(table: string): any;
  }
  
  export function createClient(url: string, key: string, options?: any): SupabaseClient;
}