import { NextRequest, NextResponse } from 'next/server';

const PYTHON_CAPTION_URL =
  process.env.CAPTION_API_URL ?? 'http://127.0.0.1:8000/caption';

/**
 * POST /api/caption
 *
 * Accepts multipart/form-data with field "file" (image).
 * Proxies the request to the local FastAPI server and returns:
 *   { caption: string, elapsed_ms?: number }
 */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "file" field in form data' }, { status: 400 });
  }

  // Size guard — reject before hitting Python (optional)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 413 });
  }

  // Forward to FastAPI
  let pyRes: Response;
  try {
    pyRes = await fetch(PYTHON_CAPTION_URL, {
      method: 'POST',
      body: formData,     // pass the multipart body through as-is
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'Caption server unreachable. Make sure the Python server is running.',
        detail: msg,
        hint: 'Run: python app.py   (in the project root)',
      },
      { status: 503 }
    );
  }

  const body = await pyRes.json().catch(() => ({ error: 'Non-JSON response from caption server' }));

  if (!pyRes.ok) {
    return NextResponse.json(
      { error: body?.detail ?? body?.error ?? 'Caption server error' },
      { status: pyRes.status }
    );
  }

  return NextResponse.json(body);
}
