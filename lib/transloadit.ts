import crypto from 'crypto';
import probe from 'probe-image-size';
import { TransloaditAssembly } from '@/types/workflow';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Map 0–100% rect (x,y,width,height) to pixel crop for Transloadit `/image/resize` `crop` step. */
function percentRectToCropPixels(
  iw: number,
  ih: number,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number
): { x1: number; y1: number; x2: number; y2: number } {
  const x = Number.isFinite(xPct) ? clamp(xPct, 0, 100) : 0;
  const y = Number.isFinite(yPct) ? clamp(yPct, 0, 100) : 0;
  const wp = Number.isFinite(wPct) ? clamp(wPct, 0.01, 100) : 100;
  const hp = Number.isFinite(hPct) ? clamp(hPct, 0.01, 100) : 100;

  let x1 = Math.round((x / 100) * iw);
  let y1 = Math.round((y / 100) * ih);
  let x2 = Math.round(x1 + (wp / 100) * iw);
  let y2 = Math.round(y1 + (hp / 100) * ih);

  x1 = clamp(x1, 0, Math.max(0, iw - 1));
  y1 = clamp(y1, 0, Math.max(0, ih - 1));
  x2 = clamp(x2, x1 + 1, iw);
  y2 = clamp(y2, y1 + 1, ih);

  return { x1, y1, x2, y2 };
}

async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  try {
    const result = await probe(imageUrl);
    if (!result.width || !result.height) {
      throw new Error('Could not read image dimensions');
    }
    return { width: result.width, height: result.height };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    throw new Error(`Failed to probe image size (${msg}). Check that the URL is reachable.`);
  }
}

const TRANSLOADIT_API = 'https://api2.transloadit.com';

function parseTimestampOffset(
  rawTimestamp: string
): { offset: number; unit: 'seconds' | 'percentage' } {
  const value = rawTimestamp.trim();
  const normalizedTime = value.includes(':') ? value.replace(/:+/g, ':') : value;
  if (!normalizedTime) throw new Error('Timestamp is required');

  if (normalizedTime.endsWith('%')) {
    const pct = Number.parseFloat(normalizedTime.slice(0, -1).trim());
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new Error('Invalid timestamp percentage. Use 0% to 100%.');
    }
    return { offset: pct, unit: 'percentage' };
  }

  // hh:mm:ss (also accepts h:mm:ss)
  if (normalizedTime.includes(':')) {
    const parts = normalizedTime.split(':').map(p => p.trim());
    if (parts.length !== 3 || parts.some(p => p === '' || !/^\d+$/.test(p))) {
      throw new Error('Invalid timestamp format. Use hh:mm:ss, seconds, or %.');
    }
    const [hh, mm, ss] = parts.map(Number);
    if (mm > 59 || ss > 59) {
      throw new Error('Invalid timestamp format. Minutes and seconds must be 00-59.');
    }
    return { offset: hh * 3600 + mm * 60 + ss, unit: 'seconds' };
  }

  // Plain seconds
  const seconds = Number.parseFloat(normalizedTime);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Invalid timestamp format. Use hh:mm:ss, seconds, or %.');
  }
  return { offset: seconds, unit: 'seconds' };
}

function createSignature(params: string): string {
  const secret = process.env.TRANSLOADIT_SECRET!;
  return crypto.createHmac('sha384', secret).update(params).digest('hex');
}

function buildParams(steps: Record<string, unknown>, expiresMs = 3600000): { params: string; signature: string } {
  const expires = new Date(Date.now() + expiresMs).toISOString().replace('T', ' ').substring(0, 19);
  const params = JSON.stringify({
    auth: {
      key: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY,
      expires,
    },
    steps,
  });
  const signature = `sha384:${createSignature(params)}`;
  return { params, signature };
}

/** Poll Transloadit status; short interval so we notice completion quickly after work finishes. */
async function pollAssembly(
  url: string,
  maxAttempts = 120,
  intervalMs = 400
): Promise<TransloaditAssembly> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url);
    const data: TransloaditAssembly = await res.json();
    if (data.ok === 'ASSEMBLY_COMPLETED') return data;
    if (data.error) throw new Error(`Transloadit error: ${data.error}`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Transloadit assembly timed out');
}

// Upload a file from a URL through Transloadit (import + store)
export async function importUrlThroughTransloadit(sourceUrl: string): Promise<string> {
  const steps = {
    imported: {
      robot: '/http/import',
      url: sourceUrl,
    },
    exported: {
      robot: '/file/serve',
      use: 'imported',
      result: true,
    },
  };

  const { params, signature } = buildParams(steps);
  const formData = new FormData();
  formData.append('params', params);
  formData.append('signature', signature);

  const res = await fetch(`${TRANSLOADIT_API}/assemblies`, {
    method: 'POST',
    body: formData,
  });
  const data: TransloaditAssembly = await res.json();
  const assembly = await pollAssembly(data.assembly_ssl_url);
  return assembly.results.exported[0].ssl_url;
}

// Crop an image using Transloadit's /image/resize robot (`crop` uses pixels, not % geometry)
export async function cropImageViaTransloadit(
  imageUrl: string,
  x: number, y: number, w: number, h: number
): Promise<string> {
  const { width: iw, height: ih } = await getImageDimensions(imageUrl);
  const crop = percentRectToCropPixels(iw, ih, x, y, w, h);

  const steps = {
    imported: {
      robot: '/http/import',
      url: imageUrl,
    },
    cropped: {
      robot: '/image/resize',
      use: 'imported',
      result: true,
      strip: false,
      crop: {
        x1: crop.x1,
        y1: crop.y1,
        x2: crop.x2,
        y2: crop.y2,
      },
    },
  };

  const { params, signature } = buildParams(steps);
  const formData = new FormData();
  formData.append('params', params);
  formData.append('signature', signature);

  const res = await fetch(`${TRANSLOADIT_API}/assemblies`, {
    method: 'POST',
    body: formData,
  });
  const data: TransloaditAssembly = await res.json();
  
  if (data.error) {
    console.error('Transloadit crop response:', JSON.stringify(data, null, 2));
    throw new Error(`Transloadit crop failed: ${data.error}`);
  }
  
  const assembly = await pollAssembly(data.assembly_ssl_url);

  return assembly.results.cropped[0].ssl_url;
}

// Extract a frame from video using Transloadit's /video/thumbs robot
export async function extractFrameViaTransloadit(
  videoUrl: string,
  timestamp: string
): Promise<string> {
  const { offset, unit } = parseTimestampOffset(timestamp);

  const steps = {
    imported: { robot: '/http/import', url: videoUrl },
    frame: {
      robot: '/video/thumbs',
      use: 'imported',
      result: true,
      count: 1,
      offsets: [offset],
      unit,
      format: 'jpg',
      width: 1280,
      height: 720,
      resize_strategy: 'fit',
    },
  };

  const { params, signature } = buildParams(steps);
  const formData = new FormData();
  formData.append('params', params);
  formData.append('signature', signature);

  const res = await fetch(`${TRANSLOADIT_API}/assemblies`, {
    method: 'POST',
    body: formData,
  });
  const data: TransloaditAssembly = await res.json();
  const assembly = await pollAssembly(data.assembly_ssl_url);
  return assembly.results.frame[0].ssl_url;
}

// Client-side: upload a File object to Transloadit and return the CDN URL
export async function uploadFileClient(file: File): Promise<string> {
  const expires = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').substring(0, 19);
  const paramsObj = {
    auth: {
      key: process.env.NEXT_PUBLIC_TRANSLOADIT_KEY,
      expires,
    },
    steps: {
      handle: {
        robot: '/file/serve',
        result: true,
      },
    },
  };

  const params = JSON.stringify(paramsObj);
  const formData = new FormData();
  formData.append('params', params);
  formData.append('file', file);

  const res = await fetch(`${TRANSLOADIT_API}/assemblies`, {
    method: 'POST',
    body: formData,
  });
  const data: TransloaditAssembly = await res.json();

  let assembly = data;
  for (let i = 0; i < 120; i++) {
    if (assembly.ok === 'ASSEMBLY_COMPLETED') break;
    if (assembly.error) throw new Error(assembly.error);
    await new Promise(r => setTimeout(r, 400));
    const pollRes = await fetch(assembly.assembly_ssl_url);
    assembly = await pollRes.json();
  }

  if (!assembly.results?.handle?.[0]) throw new Error('Upload failed');
  return assembly.results.handle[0].ssl_url;
}
