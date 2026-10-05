import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase
    .from('student_records')
    .select('id, roll_number, name, ssc_marks, intermediate_marks, previous_marks_obtained, previous_max_marks, inter_marks, standing_arrears, student_data')
    .order('roll_number', { ascending: true });
  if (error) {
    console.error('Fetch error:', error);
    return;
  }
  console.log('Total records:', data.length);
  for (let i = 0; i < data.length; i++) {
    const s = data[i];
    console.log(`[${i+1}] Roll: ${s.roll_number} | Name: ${s.name}`);
    console.log(`    ssc_marks: "${s.ssc_marks}" | intermediate_marks: "${s.intermediate_marks}" | inter_marks: "${s.inter_marks}"`);
    console.log(`    prev_obtained: "${s.previous_marks_obtained}" | prev_max: "${s.previous_max_marks}" | arrears: "${s.standing_arrears}"`);
    console.log(`    canonical_academic:`, s.student_data?.canonical_academic ? 'PRESENT' : 'ABSENT');
  }
}

main().catch(console.error);
