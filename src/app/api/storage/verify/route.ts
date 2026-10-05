import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { createAdminClient, getBucketName } from '@/lib/supabase';
import { AuditService } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { path } = body;

    if (!path) {
      return NextResponse.json({ error: 'Storage path is required' }, { status: 400 });
    }

    const client = createAdminClient();
    const bucket = getBucketName();

    // Create a 1-hour signed download URL for private verification
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);

    if (error || !data) {
      return NextResponse.json({ error: 'File verification failed or file not found' }, { status: 404 });
    }

    await AuditService.log(
      {
        action: 'STORAGE_UPLOAD_VERIFIED',
        entityType: 'storage',
        entityId: path,
        details: { path },
      },
      context
    );

    return NextResponse.json({
      success: true,
      verified: true,
      path,
      signedUrl: data.signedUrl,
    });
  } catch (error: any) {
    console.error('[Storage Verify] Error:', error);
    return NextResponse.json({ error: 'Verification error' }, { status: 500 });
  }
}
