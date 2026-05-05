const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      url = line.split('=')[1].trim().replace(/"/g, '');
    }
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
      key = line.split('=')[1].trim().replace(/"/g, '');
    }
  });
}

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('push_subscriptions').select('*');
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log(`Found ${data.length} subscriptions.`);
    console.log(data);
  }
}

check();
