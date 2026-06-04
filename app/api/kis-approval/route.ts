import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;

  if (!appkey || !appsecret) {
    return NextResponse.json({ error: "KIS credentials missing in ENV" }, { status: 500 });
  }

  try {
    const res = await fetch("https://openapi.koreainvestment.com:9443/oauth2/Approval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey,
        secretkey: appsecret,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`KIS Approval HTTP ${res.status}`);
    }

    const data = await res.json();
    const approvalKey = data?.approval_key;

    if (!approvalKey) {
      return NextResponse.json({ error: "Failed to get approval key", raw: data }, { status: 500 });
    }

    return NextResponse.json({ approvalKey });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
