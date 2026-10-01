BEGIN;
CREATE TABLE registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ftc_id INTEGER NOT NULL CHECK (ftc_id > 0),
  name VARCHAR(150) NOT NULL CHECK (name ~ '[^[:space:]]'),
  phone VARCHAR(16) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  evidence TEXT NOT NULL CHECK (evidence ~ '[^[:space:]]'),
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX registration_pending_phone ON registration_requests(phone) WHERE status='pending';
CREATE UNIQUE INDEX registration_pending_ftc ON registration_requests(ftc_id) WHERE status='pending';
COMMIT;
