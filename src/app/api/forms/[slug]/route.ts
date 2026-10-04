import { NextResponse } from 'next/server';
import { createAdminClient, uploadBase64ToSupabase } from '@/lib/supabase';
import { FormService } from '@/lib/services/form.service';
import { AuditService } from '@/lib/services/audit.service';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const client = createAdminClient();

    const { data: folder, error } = await client
      .from('year_folders')
      .select('*')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !folder) {
      return NextResponse.json({ error: 'Form not found for this year' }, { status: 404 });
    }

    const fields = await FormService.getFormConfig(folder.id);

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        slug: folder.slug,
        year_label: folder.year_label,
        description: folder.description,
        is_form_active: folder.is_form_active,
      },
      fields,
    });
  } catch (error: any) {
    console.error('[API forms/[slug] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch form configuration' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimitResponse = enforceRateLimit(req, 'form_submit', RATE_LIMIT_PRESETS.FORM_SUBMISSION);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { slug } = await params;
    const client = createAdminClient();

    const { data: folder, error: fErr } = await client
      .from('year_folders')
      .select('id, name, is_form_active, campus_id')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (fErr || !folder) {
      return NextResponse.json({ error: 'Form not found for this academic folder' }, { status: 404 });
    }

    if (!folder.is_form_active) {
      return NextResponse.json(
        { error: 'This registration form is currently closed by the administration.' },
        { status: 403 }
      );
    }

    const data = await req.json();

    if (!data.name || !data.name.trim()) {
      return NextResponse.json({ error: 'Name of the Student is required' }, { status: 400 });
    }
    if (!data.roll_number || !data.roll_number.trim()) {
      return NextResponse.json({ error: 'Regd. No. is required' }, { status: 400 });
    }

    const cleanRoll = data.roll_number.trim().toUpperCase();

    // Check duplicate in student_records
    const { data: existing } = await client
      .from('student_records')
      .select('id, name')
      .eq('roll_number', cleanRoll)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `A student with Regd. No. "${cleanRoll}" is already registered in the system.` },
        { status: 409 }
      );
    }

    // Process photo upload
    let profileImageUrl = data.profile_image || '';
    if (profileImageUrl && profileImageUrl.startsWith('data:')) {
      try {
        const uploadResult = await uploadBase64ToSupabase(profileImageUrl, cleanRoll, 'student-photos');
        if (uploadResult.success && uploadResult.url) {
          profileImageUrl = uploadResult.url;
        }
      } catch (uploadErr) {
        console.warn('Student photo Supabase upload warning:', uploadErr);
      }
    }

    // Submit application transactionally via FormService
    const result = await FormService.submitApplication({
      ...data,
      folder_id: folder.id,
      roll_number: cleanRoll,
      profile_image: profileImageUrl,
      campus_id: folder.campus_id,
    });

    await AuditService.log({
      action: 'PUBLIC_FORM_SUBMISSION',
      entityType: 'student',
      entityId: result.studentId,
      campusId: folder.campus_id,
      details: {
        roll_number: cleanRoll,
        folder_id: folder.id,
        folder_name: folder.name,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Application submitted and verified successfully.',
      studentId: result.studentId,
    });
  } catch (error: any) {
    console.error('[API forms/[slug] POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit application' }, { status: 500 });
  }
}
