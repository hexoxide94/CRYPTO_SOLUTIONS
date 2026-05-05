import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const subscription = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 }
      );
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    // Check if subscription already exists
    const { data: existing, error: searchError } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .single();

    if (searchError && searchError.code !== "PGRST116") { // PGRST116 is "not found", which is fine
      console.error("[Push Subscribe] Search error:", searchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!existing) {
      // Insert new subscription
      const { error: insertError } = await supabase
        .from("push_subscriptions")
        .insert([{ endpoint, p256dh, auth }]);

      if (insertError) {
        console.error("[Push Subscribe] Insert error:", insertError);
        return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Subscription saved." });
  } catch (error) {
    console.error("[Push Subscribe] Server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
