import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase';

export async function GET() {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin', 'staff']);
    if (!context) {
      return NextResponse.json({ error: 'Forbidden: Campus Administrator privileges required' }, { status: 403 });
    }

    const client = createAdminClient();
    const campusId = context.campusId;

    // 1. Student counts by year
    let studentQuery = client.from('student_records').select('year, folder_id, created_at');
    if (context.role !== 'superadmin' && campusId) {
      studentQuery = studentQuery.eq('campus_id', campusId);
    }
    const { data: students, error: sErr } = await studentQuery;
    if (sErr) throw sErr;

    const studentList = students || [];
    const totalStudents = studentList.length;

    let firstYear = 0;
    let secondYear = 0;
    let thirdYear = 0;
    let fourthYear = 0;

    studentList.forEach((s) => {
      const y = (s.year || '').toLowerCase();
      const f = (s.folder_id || '').toLowerCase();
      if (y.includes('1') || f.includes('1st')) firstYear++;
      else if (y.includes('2') || f.includes('2nd')) secondYear++;
      else if (y.includes('3') || f.includes('3rd')) thirdYear++;
      else if (y.includes('4') || f.includes('4th')) fourthYear++;
    });

    const yearDistribution = [
      { name: '1st Year', count: firstYear },
      { name: '2nd Year', count: secondYear },
      { name: '3rd Year', count: thirdYear },
      { name: '4th Year', count: fourthYear },
    ];

    // 2. Chat / Query stats from chat_messages
    let messageQuery = client.from('chat_messages').select('created_at, role');
    const { data: messages } = await messageQuery;
    const msgList = (messages || []).filter((m) => m.role === 'user');

    const totalQueries = msgList.length;
    const today = new Date().toISOString().split('T')[0];
    const queriesToday = msgList.filter((m) => m.created_at.startsWith(today)).length;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const queriesThisWeek = msgList.filter((m) => m.created_at >= last7Days).length;

    // 3. User counts
    let userQuery = client.from('tenant_memberships').select('id');
    if (context.role !== 'superadmin' && campusId) {
      userQuery = userQuery.eq('campus_id', campusId);
    }
    const { count: totalUsers } = await userQuery;

    const stats = {
      totalStudents,
      firstYear,
      secondYear,
      thirdYear,
      fourthYear,
      totalQueries,
      totalUsers: totalUsers || 0,
      queriesToday,
      queriesThisWeek,
      failedSearches: 0,
      topQueries: [],
      recentSearches: [],
      yearDistribution,
    };

    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error('[API admin/stats GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard statistics' }, { status: 500 });
  }
}
