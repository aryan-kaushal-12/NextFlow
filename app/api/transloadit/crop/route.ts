import { NextRequest, NextResponse } from 'next/server';
import { cropImageViaTransloadit } from '@/lib/transloadit';

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, x, y, w, h } = await req.json();
    
    if (!imageUrl || x === undefined || y === undefined || w === undefined || h === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await cropImageViaTransloadit(imageUrl, x, y, w, h);
    return NextResponse.json({ url: result });
  } catch (error) {
    console.error('Transloadit crop error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Crop failed' },
      { status: 500 }
    );
  }
}
