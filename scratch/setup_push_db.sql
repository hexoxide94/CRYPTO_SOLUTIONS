-- Supabase SQL Editor에 아래 쿼리를 복사해서 실행해주세요.
-- 이 테이블은 푸시 알림을 받을 기기들의 정보를 저장합니다.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 알림을 보낼 때 쉽게 조회할 수 있도록 인덱스를 추가합니다.
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
