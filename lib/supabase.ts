import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** 런타임에 처음 호출될 때 클라이언트를 생성합니다 (빌드 타임 오류 방지) */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.");
  }
  _client = createClient(url, key);
  return _client;
}

/** 직접 import해서 쓸 수도 있는 proxy (선택적) */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as never)[prop];
  },
});
