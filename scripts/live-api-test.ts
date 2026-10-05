import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('================================================================');
  console.log('LIVE END-TO-END HTTP TEST — AUTHENTICATED REAL SESSION & SERVER');
  console.log('Testing running server at:', BASE_URL);
  console.log('================================================================\n');

  // 1. Authenticate via POST /api/auth/login
  console.log('Step 1: Authenticating student m@com...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm@com', password: 'Password@123' }),
  });

  const cookieHeader = loginRes.headers.get('set-cookie');
  const loginJson = await loginRes.json();
  console.log('Login Response Status:', loginRes.status, loginJson);
  if (!cookieHeader) {
    throw new Error('No session cookie returned from /api/auth/login');
  }

  // Extract auth cookie
  const cookies = cookieHeader.split(',').map((c: string) => c.split(';')[0]).join('; ');

  // 2. Create Chat Session via POST /api/chat/sessions
  console.log('\nStep 2: Creating Chat Session for authenticated student...');
  const sessionRes = await fetch(`${BASE_URL}/api/chat/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies,
    },
    body: JSON.stringify({ title: 'Live Hardening Test Session' }),
  });
  const sessionJson = await sessionRes.json();
  console.log('Session Created:', sessionJson.session?.id);
  const sessionId = sessionJson.session?.id;

  // 3. Test queries
  const queries = [
    'my details',
    'my profile',
    'my marks',
    'my SSC marks',
    'my intermediate percentage',
    'my CGPA',
    'my application status',
    'am I eligible?',
    'what documents are required for admission?',
  ];

  console.log('\nStep 3: Executing 9 Required Queries...\n');

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`QUERY ${i + 1}: "${q}"`);
    console.log(`----------------------------------------------------------------`);

    const msgRes = await fetch(`${BASE_URL}/api/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
      body: JSON.stringify({ sessionId, content: q }),
    });

    const msgJson = await msgRes.json();
    const reply = msgJson.assistantMessage?.content || msgJson.ragResult?.answer || '';
    const tools = (msgJson.ragResult?.toolResults || []).map((t: any) => t.tool);
    console.log(`Tools Used: [${tools.join(', ')}]`);
    console.log(`Reply Preview:\n${reply}\n`);
  }
}

main().catch(err => {
  console.error('Fatal live test failure:', err);
  process.exit(1);
});
