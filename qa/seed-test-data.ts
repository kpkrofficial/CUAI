import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { DatabaseData } from '../src/lib/db/store';

const DB_PATH = path.resolve(process.cwd(), 'data', 'db.json');

export async function seedTestData(): Promise<DatabaseData> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: seedTestData cannot be executed in production environment.');
  }
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const hashedPasswordSuper = await bcrypt.hash('zxcvbnm', 10);
  const hashedPasswordAdmin = await bcrypt.hash('mnbvcxz', 10);
  const hashedPasswordUser = await bcrypt.hash('User@123', 10);

  const initialData: DatabaseData = {
    admins: [
      {
        id: 'admin_super_01',
        email: 'superadmin@com',
        password_hash: hashedPasswordSuper,
        name: 'Master SuperAdmin',
        role: 'superadmin',
        created_at: new Date().toISOString()
      },
      {
        id: 'admin_campus_01',
        email: 'admin@com',
        password_hash: hashedPasswordAdmin,
        name: 'Campus Admin',
        role: 'admin',
        created_at: new Date().toISOString()
      }
    ],
    users: [
      {
        id: 'usr_000',
        email: 'm@com',
        password_hash: hashedPasswordUser,
        name: 'Student User',
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'usr_001',
        email: 'm@1',
        password_hash: hashedPasswordUser,
        name: 'Student User (Quick)',
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'usr_001',
        email: 'student.alice@campus.edu',
        password_hash: hashedPasswordUser,
        name: 'Alice Johnson',
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'usr_002',
        email: 'student.bob@campus.edu',
        password_hash: hashedPasswordUser,
        name: 'Bob Smith',
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'usr_003',
        email: 'student.charlie@campus.edu',
        password_hash: hashedPasswordUser,
        name: 'Charlie Davis',
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString()
      }
    ],
    year_folders: [
      {
        id: '1st-year',
        name: '1st Year (2024-2028)',
        slug: '1st-year',
        year_label: '1st Year',
        description: 'First year engineering batch',
        is_form_active: 1,
        form_token: 'token_1st_year_2026',
        created_at: new Date().toISOString()
      },
      {
        id: '2nd-year',
        name: '2nd Year (2023-2027)',
        slug: '2nd-year',
        year_label: '2nd Year',
        description: 'Second year engineering batch',
        is_form_active: 1,
        form_token: 'token_2nd_year_2026',
        created_at: new Date().toISOString()
      },
      {
        id: '3rd-year',
        name: '3rd Year (2022-2026)',
        slug: '3rd-year',
        year_label: '3rd Year',
        description: 'Third year engineering batch',
        is_form_active: 1,
        form_token: 'token_3rd_year_2026',
        created_at: new Date().toISOString()
      },
      {
        id: '4th-year',
        name: '4th Year (2021-2025)',
        slug: '4th-year',
        year_label: '4th Year',
        description: 'Final year graduating batch',
        is_form_active: 1,
        form_token: 'token_4th_year_2026',
        created_at: new Date().toISOString()
      }
    ],
    form_configs: [],
    student_records: [
      {
        id: 'std_001',
        folder_id: '1st-year',
        year: '1st_year',
        roll_number: '24CS001',
        name: 'Alice Johnson',
        email: 'student.alice@campus.edu',
        phone: '+91 9123456701',
        branch: 'CSE',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'Python, TypeScript, Next.js, Machine Learning',
        father_name: 'Robert Johnson',
        permanent_phone: '+91 9123456702',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_002',
        folder_id: '2nd-year',
        year: '2nd_year',
        roll_number: '23CS045',
        name: 'Bob Smith',
        email: 'student.bob@campus.edu',
        phone: '+91 9123456703',
        branch: 'CSE',
        section: 'B',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'Java, Spring Boot, PostgreSQL, Docker',
        father_name: 'David Smith',
        permanent_phone: '+91 9123456704',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_003',
        folder_id: '3rd-year',
        year: '3rd_year',
        roll_number: '22EC012',
        name: 'Charlie Davis',
        email: 'student.charlie@campus.edu',
        phone: '+91 9123456705',
        branch: 'ECE',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'Embedded C, Verilog, IoT, Arduino',
        father_name: 'George Davis',
        permanent_phone: '+91 9123456706',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_004',
        folder_id: '4th-year',
        year: '4th_year',
        roll_number: '21ME088',
        name: 'Diana Prince',
        email: 'student.diana@campus.edu',
        phone: '+91 9123456707',
        branch: 'MECH',
        section: 'C',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'AutoCAD, SolidWorks, FEA, Robotics',
        father_name: 'Hippolyta Prince',
        permanent_phone: '+91 9123456708',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_005',
        folder_id: '1st-year',
        year: '1st_year',
        roll_number: '24IT023',
        name: 'Evan Wright',
        email: 'student.evan@campus.edu',
        phone: '+91 9123456709',
        branch: 'IT',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'HTML, CSS, JavaScript, React',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_006',
        folder_id: '2nd-year',
        year: '2nd_year',
        roll_number: '23EE055',
        name: 'Fiona Gallagher',
        email: 'student.fiona@campus.edu',
        phone: '+91 9123456711',
        branch: 'EEE',
        section: 'B',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'MATLAB, Simulink, Power Systems, Python',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_007',
        folder_id: '3rd-year',
        year: '3rd_year',
        roll_number: '22CS099',
        name: 'George Clark',
        email: 'student.george@campus.edu',
        phone: '+91 9123456713',
        branch: 'CSE',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'Go, Kubernetes, Cloud Computing, Distributed Systems',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_008',
        folder_id: '4th-year',
        year: '4th_year',
        roll_number: '21CV014',
        name: 'Hannah Abbott',
        email: 'student.hannah@campus.edu',
        phone: '+91 9123456715',
        branch: 'CIVIL',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'STAAD Pro, GIS, Surveying, Project Management',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_009',
        folder_id: '1st-year',
        year: '1st_year',
        roll_number: '24AI007',
        name: 'Ian Malcolm',
        email: 'student.ian@campus.edu',
        phone: '+91 9123456717',
        branch: 'AI_DS',
        section: 'A',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'PyTorch, NLP, Computer Vision, Pandas',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_010',
        folder_id: '2nd-year',
        year: '2nd_year',
        roll_number: '23CS102',
        name: 'Julia Roberts',
        email: 'student.julia@campus.edu',
        phone: '+91 9123456719',
        branch: 'CSE',
        section: 'C',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'Full Stack Development, Next.js, Tailwind, GraphQL',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_011',
        folder_id: '3rd-year',
        year: '3rd_year',
        roll_number: '22IT041',
        name: 'Kevin Bacon',
        email: 'student.kevin@campus.edu',
        phone: '+91 9123456721',
        branch: 'IT',
        section: 'B',
        college: 'Campus Institute of Technology',
        gender: 'Male',
        skills: 'Cybersecurity, Ethical Hacking, Linux, Network Security',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'std_012',
        folder_id: '4th-year',
        year: '4th_year',
        roll_number: '21EC077',
        name: 'Laura Croft',
        email: 'student.laura@campus.edu',
        phone: '+91 9123456723',
        branch: 'ECE',
        section: 'B',
        college: 'Campus Institute of Technology',
        gender: 'Female',
        skills: 'Digital Signal Processing, FPGA, Python, C++',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    chat_sessions: [],
    chat_messages: [],
    search_logs: [],
    audit_logs: [
      {
        id: 'audit_init_01',
        actor: 'Master SuperAdmin',
        action: 'SYSTEM_INITIALIZATION',
        entity_type: 'system',
        entity_id: 'seed',
        details: 'Deterministic test dataset seeded with 12 students, 4 year folders, and role matrices.',
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString()
      }
    ],
    notifications: [],
    system_settings: [
      { key: 'maintenance_mode', value: 'false', updated_at: new Date().toISOString() },
      { key: 'maintenance_message', value: 'System is undergoing scheduled maintenance. Please check back shortly.', updated_at: new Date().toISOString() },
      { key: 'allow_student_registration', value: 'true', updated_at: new Date().toISOString() },
      { key: 'default_chat_limit', value: '100', updated_at: new Date().toISOString() },
      { key: 'auto_clear_days', value: '7', updated_at: new Date().toISOString() },
      { key: 'session_timeout_minutes', value: '30', updated_at: new Date().toISOString() }
    ],
    form_diagnostics: []
  };

  fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
  console.log('Test database seeded successfully with 12 students, 4 folders, and 3 user roles.');
  return initialData;
}

if (require.main === module) {
  seedTestData().catch(console.error);
}
