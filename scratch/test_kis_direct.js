const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function getKisToken() {
  const res = await fetch('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET
    })
  });
  const data = await res.json();
  return data.access_token;
}

async function test() {
  const token = await getKisToken();
  const marketCode = "J";
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-daily-chartprice");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", marketCode);
  url.searchParams.set("FID_INPUT_ISCD", "A75605");
  url.searchParams.set("FID_PERIOD_DIV_CODE", "D");
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "authorization": `Bearer ${token}`,
      "appkey": process.env.KIS_APP_KEY,
      "appsecret": process.env.KIS_APP_SECRET,
      "tr_id": "FHKIF01010100",
      "custtype": "P",
    }
  });
  const data = await res.json();
  console.log("KIS Response:", JSON.stringify(data, null, 2));
}

test();
