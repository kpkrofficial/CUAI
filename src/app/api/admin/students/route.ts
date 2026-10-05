import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { StudentService } from '@/lib/services/student.service';
import { AuditService } from '@/lib/services/audit.service';
import { uploadBase64ToSupabase } from '@/lib/supabase';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, 'admin_students_get', RATE_LIMIT_PRESETS.ADMIN_GENERAL);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const context = await getAuthContext(['superadmin', 'campus_admin', 'staff']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Campus Administrator privileges required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId') || undefined;
    const year = searchParams.get('year') !== 'all' ? searchParams.get('year') || undefined : undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const { students, total } = await StudentService.listStudents(
      {
        folderId: folderId && folderId !== 'all' ? folderId : undefined,
        year,
        search,
        page,
        limit,
      },
      context
    );

    return NextResponse.json({
      records: students,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[API admin/students GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch student records' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, 'admin_students_post', RATE_LIMIT_PRESETS.ADMIN_GENERAL);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const context = await getAuthContext(['superadmin', 'campus_admin', 'staff']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Campus Administrator privileges required' }, { status: 403 });
    }

    const data = await req.json();

    if (!data.name || !data.roll_number || !data.branch || !data.year) {
      return NextResponse.json({ error: 'Name, Roll Number, Branch, and Year are required.' }, { status: 400 });
    }

    let folderId = data.folder_id;
    if (!folderId) {
      const folderMap: Record<string, string> = {
        '1st_year': 'folder_1st_year',
        '2nd_year': 'folder_2nd_year',
        '3rd_year': 'folder_3rd_year',
        '4th_year': 'folder_4th_year',
      };
      folderId = folderMap[data.year] || 'folder_1st_year';
    }

    let profileImageUrl = data.profile_image || '';
    if (profileImageUrl && profileImageUrl.startsWith('data:')) {
      try {
        const uploadResult = await uploadBase64ToSupabase(profileImageUrl, data.roll_number, 'student-photos');
        if (uploadResult.success && uploadResult.url) {
          profileImageUrl = uploadResult.url;
        }
      } catch (uploadErr) {
        console.warn('Student photo Supabase upload non-fatal warning:', uploadErr);
      }
    }

    const newStudent = await StudentService.upsertStudent(
      {
        ...data,
        folder_id: folderId,
        profile_image: profileImageUrl,
      },
      context
    );

    await AuditService.log(
      {
        action: 'STUDENT_RECORD_UPSERTED',
        entityType: 'student',
        entityId: newStudent.id,
        details: {
          roll_number: newStudent.roll_number,
          name: newStudent.name,
          folder_id: folderId,
        },
      },
      context
    );

    return NextResponse.json({ success: true, student: newStudent });
  } catch (error: any) {
    console.error('[API admin/students POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upsert student' }, { status: 500 });
  }
}
