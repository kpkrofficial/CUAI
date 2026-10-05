import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = createAdminClient();
  const { data: folder, error } = await client
    .from('year_folders')
    .select('*')
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .maybeSingle();

  if (error || !folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }
  return NextResponse.json({ folder });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin', 'staff']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required' }, { status: 403 });
    }

    const { slug } = await params;
    const client = createAdminClient();

    const { data: folder } = await client
      .from('year_folders')
      .select('id')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.year_label !== undefined) updateData.year_label = body.year_label;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.is_form_active !== undefined) updateData.is_form_active = body.is_form_active ? 1 : 0;
    if (body.regenerate_token) {
      updateData.form_token = `token_${slug}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }

    const { data: updated, error } = await client
      .from('year_folders')
      .update(updateData)
      .eq('id', folder.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, folder: updated });
  } catch (error: any) {
    console.error('[API admin/folders/[slug] PATCH] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update folder' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required' }, { status: 403 });
    }

    const { slug } = await params;
    const client = createAdminClient();
    const { error } = await client
      .from('year_folders')
      .delete()
      .or(`slug.eq.${slug},id.eq.${slug}`);

    if (error) throw error;
    return NextResponse.json({ success: true, message: `Folder deleted successfully` });
  } catch (error: any) {
    console.error('[API admin/folders/[slug] DELETE] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete folder' }, { status: 500 });
  }
}
