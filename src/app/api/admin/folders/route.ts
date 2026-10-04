import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { FolderService } from '@/lib/services/folder.service';
import { createAdminClient } from '@/lib/supabase';

export async function GET() {
  try {
    const context = await getAuthContext();
    const folders = await FolderService.listFolders(context);
    return NextResponse.json({ folders });
  } catch (error) {
    console.error('[API admin/folders GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin', 'staff']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required' }, { status: 403 });
    }

    const body = await req.json();
    const { name, year_label, description, is_form_active } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    const folderId = `folder_${slug}_${Date.now()}`;
    const client = createAdminClient();

    const { data: newFolder, error } = await client
      .from('year_folders')
      .insert({
        id: folderId,
        campus_id: context.campusId,
        name: name.trim(),
        slug,
        year_label: year_label?.trim() || name.trim(),
        description: description?.trim() || `${name} Intake Records`,
        is_form_active: is_form_active !== undefined ? (is_form_active ? 1 : 0) : 1,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Folder "${newFolder.name}" created successfully`,
      folder: newFolder,
    });
  } catch (error: any) {
    console.error('[API admin/folders POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create folder' }, { status: 500 });
  }
}
