import { NextRequest, NextResponse } from 'next/server';
import { importUrlThroughTransloadit } from '@/lib/transloadit';

export async function POST(req: NextRequest) {
  try {
    const { sourceUrl } = await req.json();
    
    if (!sourceUrl) {
      return NextResponse.json({ error: 'Missing sourceUrl' }, { status: 400 });
    }

    const result = await importUrlThroughTransloadit(sourceUrl);
    return NextResponse.json({ url: result });
  } catch (error) {
    console.error('Transloadit import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}
