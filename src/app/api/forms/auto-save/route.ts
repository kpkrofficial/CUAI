import { NextResponse } from 'next/server';
import { FormService } from '@/lib/services/form.service';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      sessionId, 
      slug, 
      formData, 
      telemetry 
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const folderSlug = slug || '1st-year';
    const rollNumber = formData?.roll_number || `draft_${sessionId}`;

    // Lookup folder to get folder_id and campus_id
    const client = createAdminClient();
    const { data: folder } = await client
      .from('year_folders')
      .select('id, campus_id')
      .or(`slug.eq.${folderSlug},id.eq.${folderSlug}`)
      .maybeSingle();

    const folderId = folder?.id || 'folder_1st_year';
    const campusId = folder?.campus_id || null;

    // Save directly to form_drafts table in PostgreSQL
    const savedDraft = await FormService.saveDraft({
      folderId,
      rollNumber,
      draftData: {
        sessionId,
        formData: formData || {},
        telemetry: telemetry || {},
      },
      campusId,
    });

    return NextResponse.json({
      success: true,
      sessionId: savedDraft.id,
      lastSaved: savedDraft.updated_at,
    });
  } catch (error: any) {
    console.error('[API forms/auto-save] Error saving draft:', error);
    return NextResponse.json({ error: 'Background auto-save failed' }, { status: 500 });
  }
}
