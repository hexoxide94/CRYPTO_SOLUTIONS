
async function test() {
  const url = "https://api.coinone.co.kr/public/v2/chart/KRW/USDC?interval=1h&size=10";
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
