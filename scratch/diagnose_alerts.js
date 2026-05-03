const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('--- [KIMP Alerts Detailed Diagnosis] ---');
  
  // 1. 모든 데이터 조회 (필터링 없이)
  const { data: allAlerts, error: err1 } = await supabase.from('kimp_alerts').select('*');
  if (err1) return console.error('DB Fetch Error:', err1);

  console.log(`Total records found: ${allAlerts.length}`);
  console.table(allAlerts.map(a => ({
    id: a.id,
    value: a.value,
    enabled: a.enabled,
    type: a.type,
    last_triggered: a.last_triggered_at,
    created_at: a.created_at
  })));

  // 2. 현재 '활성화(enabled=true)'된 것들만 따로 분석
  const activeAlerts = allAlerts.filter(a => a.enabled === true);
  console.log(`\nCurrently ACTIVE alerts (Should be triggering): ${activeAlerts.length}`);
  activeAlerts.forEach(a => {
    console.log(`- ID: ${a.id}, Value: ${a.value}, Type: ${a.type}`);
  });

  // 3. 최근 1분 이내에 생성되었거나 트리거된 게 있는지 확인
  const now = new Date();
  const recent = allAlerts.filter(a => {
    const triggerDate = a.last_triggered_at ? new Date(a.last_triggered_at) : null;
    return triggerDate && (now - triggerDate < 120000); // 2분 이내
  });
  console.log(`\nRecently triggered (last 2 mins): ${recent.length}`);
  recent.forEach(a => {
    console.log(`- ID: ${a.id}, Value: ${a.value}, TriggeredAt: ${a.last_triggered_at}`);
  });
}

diagnose();
