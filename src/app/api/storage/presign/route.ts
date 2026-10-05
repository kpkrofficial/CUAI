import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { createAdminClient, getBucketName } from '@/lib/supabase';
import { AuditService } from '@/lib/services/audit.service';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required for upload' }, { status: 401 });
    }

    const body = await req.json();
    const { filename, fileType, fileSize, category } = body;

    if (!filename || !fileType) {
      return NextResponse.json({ error: 'filename and fileType are required' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(fileType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType}. Allowed: JPEG, PNG, WEBP, PDF.` },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size exceeds maximum allowed limit (10MB)' }, { status: 400 });
    }

    const client = createAdminClient();
    const bucket = getBucketName();
    const campusId = context.campusId || 'global';
    const folder = category || 'documents';
    const ext = filename.split('.').pop() || 'bin';
    const sanitizedFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = `${campusId}/${folder}/${sanitizedFileName}`;

    // Create signed upload URL valid for 15 minutes
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(filePath);

    if (error || !data) {
      console.error('[Storage Presign] Failed to create signed upload URL:', error);
      return NextResponse.json({ error: 'Failed to generate secure upload credentials' }, { status: 500 });
    }

    await AuditService.log(
      {
        action: 'STORAGE_PRESIGN_CREATED',
        entityType: 'storage',
        entityId: filePath,
        details: { filename, fileType, fileSize, campusId },
      },
      context
    );

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    });
  } catch (error: any) {
    console.error('[Storage Presign] Error:', error);
    return NextResponse.json({ error: 'Internal server error while preparing upload' }, { status: 500 });
  }
}
