import bcrypt from 'bcryptjs';
import { loadDatabase, saveDatabase } from './store';
import type { FormConfig, StudentRecord } from './schema';

export const DEFAULT_FORM_FIELDS: Array<{
  name: string;
  label: string;
  section: string;
  type: FormConfig['field_type'];
  required: number;
  options?: string[];
  order: number;
}> = [
  // 1. Student Details
  { section: 'Student Details', name: 'name', label: 'Name of the Student', type: 'text', required: 1, order: 1 },
  { section: 'Student Details', name: 'roll_number', label: 'Regd. No.', type: 'text', required: 1, order: 2 },
  { section: 'Student Details', name: 'branch', label: 'Branch / Department', type: 'text', required: 1, order: 3 },
  { section: 'Student Details', name: 'section', label: 'Section', type: 'text', required: 0, order: 4 },
  { section: 'Student Details', name: 'college', label: 'College / Institute', type: 'text', required: 1, order: 5 },
  { 
    section: 'Student Details', 
    name: 'admission_type', 
    label: 'Type of Admission', 
    type: 'select', 
    required: 0, 
    options: ['Convener (EAMCET / ECET)', 'Management Quota', 'NRI Quota', 'Lateral Entry', 'Spot Admission'], 
    order: 6 
  },
  { section: 'Student Details', name: 'dob', label: 'Date of Birth (dd/mm/yyyy)', type: 'text', required: 0, order: 7 },
  { 
    section: 'Student Details', 
    name: 'blood_group', 
    label: 'Blood Group', 
    type: 'select', 
    required: 0, 
    options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], 
    order: 8 
  },
  { section: 'Student Details', name: 'aadhaar_no', label: 'Aadhaar No.', type: 'text', required: 0, order: 9 },
  { section: 'Student Details', name: 'father_name', label: "Father's Name", type: 'text', required: 0, order: 10 },
  { section: 'Student Details', name: 'father_occupation', label: "Father's Occupation", type: 'text', required: 0, order: 11 },
  { section: 'Student Details', name: 'mother_name', label: "Mother's Name", type: 'text', required: 0, order: 12 },
  { section: 'Student Details', name: 'mother_occupation', label: "Mother's Occupation", type: 'text', required: 0, order: 13 },
  { 
    section: 'Student Details', 
    name: 'reservation_category', 
    label: 'Reservation Category', 
    type: 'select', 
    required: 0, 
    options: ['OC / General', 'EWS', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'Minority'], 
    order: 14 
  },
  { 
    section: 'Student Details', 
    name: 'mode_of_transport', 
    label: 'Mode of Transport', 
    type: 'select', 
    required: 0, 
    options: ['College Bus', 'Self Transport (Two Wheeler)', 'Self Transport (Car)', 'Public Bus / Train', 'Bicycle', 'Walk'], 
    order: 15 
  },
  { 
    section: 'Student Details', 
    name: 'accommodation_type', 
    label: 'Type of Accommodation', 
    type: 'select', 
    required: 0, 
    options: ['Day Scholar (Living with Parents)', 'College Hostel', 'Private Hostel / PG', 'Living with Guardian / Relatives'], 
    order: 16 
  },

  // 2. Address Details
  { section: 'Address Details', name: 'permanent_address', label: 'Permanent Address', type: 'textarea', required: 0, order: 17 },
  { section: 'Address Details', name: 'present_address', label: 'Present Address', type: 'textarea', required: 0, order: 18 },
  { section: 'Address Details', name: 'permanent_pincode', label: 'Permanent PIN Code', type: 'text', required: 0, order: 19 },
  { section: 'Address Details', name: 'present_pincode', label: 'Present PIN Code', type: 'text', required: 0, order: 20 },
  { section: 'Address Details', name: 'permanent_phone', label: 'Permanent Phone No.', type: 'tel', required: 0, order: 21 },
  { section: 'Address Details', name: 'present_phone', label: 'Present Phone No.', type: 'tel', required: 0, order: 22 },

  // 3. Contact
  { section: 'Contact', name: 'email', label: 'E-mail ID', type: 'email', required: 1, order: 23 },

  // 4. Academic History
  { section: 'Previous Academic Record', name: 'ssc_marks', label: 'SSC Marks', type: 'text', required: 0, order: 24 },
  { section: 'Previous Academic Record', name: 'ssc_hall_ticket_no', label: 'SSC Hall Ticket No.', type: 'text', required: 0, order: 25 },
  { section: 'Previous Academic Record', name: 'intermediate_marks', label: 'Intermediate Marks', type: 'text', required: 0, order: 26 },
  { section: 'Previous Academic Record', name: 'intermediate_hall_ticket_no', label: 'Intermediate Hall Ticket Number', type: 'text', required: 0, order: 27 },

  // 5. Other Information
  { section: 'Other Information', name: 'achievements', label: 'Any Other Achievements', type: 'textarea', required: 0, order: 28 },
  { section: 'Other Information', name: 'extracurricular', label: 'Extra-curricular Activities', type: 'textarea', required: 0, order: 29 },
  { section: 'Other Information', name: 'hobbies', label: 'Hobbies', type: 'text', required: 0, order: 30 },
  { section: 'Other Information', name: 'sports', label: 'Sports Interested', type: 'text', required: 0, order: 31 },
  { section: 'Other Information', name: 'skills', label: 'Technical Skills (comma separated)', type: 'text', required: 0, order: 32 },
];


export function initializeDatabase() {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[DB Init] initializeDatabase() skipped in production environment.');
    return;
  }
  const db = loadDatabase();

  // 1. Folders (Default 4 academic batches: 1st, 2nd, 3rd, 4th Year)
  const defaultFolders = [
    { id: 'folder_1st_year', name: '1st Year', slug: '1st-year', year_label: '26HT1A43 2026-2030', description: 'First Year (26HT1A43 Batch 2026-2030)', is_form_active: 1, form_token: 'token_1st-year_secret', created_at: new Date().toISOString() },
    { id: 'folder_2nd_year', name: '2nd Year', slug: '2nd-year', year_label: '25HT1A43 2025-2029', description: 'Second Year (25HT1A43 Batch 2025-2029)', is_form_active: 1, form_token: 'token_2nd-year_secret', created_at: new Date().toISOString() },
    { id: 'folder_3rd_year', name: '3rd Year', slug: '3rd-year', year_label: '24HT1A43 2024-2028', description: 'Third Year (24HT1A43 Batch 2024-2028)', is_form_active: 1, form_token: 'token_3rd-year_secret', created_at: new Date().toISOString() },
    { id: 'folder_4th_year', name: '4th Year', slug: '4th-year', year_label: '23HT1A43 2023-2027', description: 'Fourth Year (23HT1A43 Batch 2023-2027)', is_form_active: 1, form_token: 'token_4th-year_secret', created_at: new Date().toISOString() },
  ];

  if (!db.year_folders || db.year_folders.length < 4) {
    db.year_folders = defaultFolders;
  }

  // Populate or upgrade form configurations for all 4 folders
  const currentFolders = db.year_folders;
  db.form_configs = [];

  for (const f of currentFolders) {
    for (const field of DEFAULT_FORM_FIELDS) {
      db.form_configs.push({
        id: `fc_${f.slug}_${field.name}`,
        folder_id: f.id,
        section_name: field.section,
        field_name: field.name,
        field_label: field.label,
        field_type: field.type,
        is_required: field.required,
        options_json: field.options ? JSON.stringify(field.options) : '[]',
        display_order: field.order
      });
    }
  }

  // 2. Admins
  if (!db.admins || db.admins.length === 0) {
    const superAdminPasswordHash = bcrypt.hashSync('zxcvbnm', 10);
    const adminPasswordHash = bcrypt.hashSync('mnbvcxz', 10);
    const now = new Date().toISOString();
    db.admins = [
      {
        id: 'admin_super_01',
        email: 'superadmin@com',
        password_hash: superAdminPasswordHash,
        name: 'Master Super Admin',
        role: 'superadmin',
        created_at: now
      },
      {
        id: 'admin_campus_01',
        email: 'admin@com',
        password_hash: adminPasswordHash,
        name: 'Campus Administrator',
        role: 'admin',
        created_at: now
      }
    ];
  }

  // 3. Default Chatbot Users
  if (!db.users || db.users.length === 0) {
    const userPasswordHash = bcrypt.hashSync('User@123', 10);
    const now = new Date().toISOString();
    db.users = [
      {
        id: 'usr_000',
        email: 'm@com',
        password_hash: userPasswordHash,
        name: 'Student User',
        role: 'user',
        status: 'active',
        created_at: now
      },
      {
        id: 'usr_001',
        email: 'm@1',
        password_hash: userPasswordHash,
        name: 'Student User (Quick)',
        role: 'user',
        status: 'active',
        created_at: now
      }
    ];
  }

  // 4. Student Records (Clean production state: 0 demo records)
  if (!db.student_records) {
    db.student_records = [];
  }

  // 5. Form Diagnostics Telemetry
  if (!db.form_diagnostics) {
    db.form_diagnostics = [];
  }

  saveDatabase(db);
}



