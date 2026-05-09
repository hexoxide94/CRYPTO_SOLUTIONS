
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim();
  });
}

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function getKisToken() {
  const res = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchKisDailyChart(token) {
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-daily-chartprice");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "CF");
  url.searchParams.set("FID_INPUT_ISCD", "A75605"); // USD Futures
  url.searchParams.set("FID_PERIOD_DIV_CODE", "D");
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "appkey": KIS_APP_KEY,
      "appsecret": KIS_APP_SECRET,
      "tr_id": "FHKIF01010100", // Domestic Futures Daily Chart
      "custtype": "P",
    },
  });
  const data = await res.json();
  return data;
}

async function run() {
  try {
    const token = await getKisToken();
    if (!token) return;
    const data = await fetchKisDailyChart(token);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();
