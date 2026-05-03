const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAlerts() {
  const { data, error } = await supabase.from('kimp_alerts').select('*');
  if (error) {
    console.error('Error fetching alerts:', error);
    return;
  }
  console.log('Current Alerts in DB:');
  console.table(data);
}

checkAlerts();
