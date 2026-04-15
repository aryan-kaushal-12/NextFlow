import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function createSignature(params: string): string {
  const secret = process.env.TRANSLOADIT_SECRET!;
  return crypto.createHmac('sha384', secret).update(params).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

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

    const paramsStr = JSON.stringify(paramsObj);
    const signature = `sha384:${createSignature(paramsStr)}`;

    // Create FormData with proper signature
    const transloaditFormData = new FormData();
    transloaditFormData.append('params', paramsStr);
    transloaditFormData.append('signature', signature);
    transloaditFormData.append('file', file);

    // Upload to Transloadit
    const res = await fetch('https://api2.transloadit.com/assemblies', {
      method: 'POST',
      body: transloaditFormData,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Transloadit error response:', JSON.stringify(data, null, 2));
      console.error('Status:', res.status);
      return NextResponse.json({ error: data.error || 'Upload failed', details: data }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
