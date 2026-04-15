import { NextRequest, NextResponse } from 'next/server';
import { extractFrameViaTransloadit } from '@/lib/transloadit';

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, timestamp } = await req.json();
    
    if (!videoUrl || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await extractFrameViaTransloadit(videoUrl, timestamp);
    return NextResponse.json({ url: result });
  } catch (error) {
    console.error('Transloadit extract frame error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extract frame failed' },
      { status: 500 }
    );
  }
}
