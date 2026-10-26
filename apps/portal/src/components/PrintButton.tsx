'use client';
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="no-print rounded-lg bg-primary px-4 py-2 font-semibold text-white">Print or save as PDF</button>;
}
