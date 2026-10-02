BEGIN;
CREATE TABLE test_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id INTEGER NOT NULL UNIQUE CHECK (test_id > 0),
  phone VARCHAR(16) NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  profile JSONB NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verification_method VARCHAR(10),
  verified_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT test_account_verification CHECK (
    (verification_method IS NULL AND verified_at IS NULL) OR
    (verification_method IS NOT NULL AND ((verification_method='local' AND verified_at IS NULL) OR
    (verification_method='sms' AND verified_at IS NOT NULL)))
  )
);
CREATE TABLE test_otp_challenges (
  id UUID PRIMARY KEY,
  test_account_id UUID REFERENCES test_accounts(id) ON DELETE CASCADE,
  phone VARCHAR(16) NOT NULL,
  delivery_mode VARCHAR(10) NOT NULL CHECK (delivery_mode IN ('sms','local')),
  code_hash CHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  consumed_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX test_otp_phone_created ON test_otp_challenges(phone, created_at);
CREATE TABLE test_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  test_account_id UUID NOT NULL REFERENCES test_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  revoked_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX test_session_account ON test_sessions(test_account_id);
ALTER TABLE registration_requests
  ADD COLUMN reviewed_by_test_account_id UUID REFERENCES test_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT registration_single_reviewer CHECK (reviewed_by_member_id IS NULL OR reviewed_by_test_account_id IS NULL);
COMMIT;
