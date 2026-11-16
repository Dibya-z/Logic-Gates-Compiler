import type { CompilationResult } from './compiler/types';

export function sourceToHash(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `#code=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function sourceFromHash(hash: string): string | undefined {
  if (!hash.startsWith('#code=') || hash.length > 60000) return;
  try {
    const encoded = hash.slice(6).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return; }
}

export function download(content: string | Blob, name: string, type: string) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPNG(svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(2, 4096 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(image.width * scale); canvas.height = Math.ceil(image.height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('PNG export is unavailable in this browser.');
    context.scale(scale, scale); context.fillStyle = '#171b19'; context.fillRect(0, 0, image.width, image.height); context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed.')), 'image/png'));
    download(blob, 'logic-circuit.png', 'image/png');
  } finally { URL.revokeObjectURL(url); }
}

export function phaseDump(compilation: CompilationResult) { return JSON.stringify(compilation, null, 2); }
