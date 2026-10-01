BEGIN;
-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "login_phone" VARCHAR(16) NOT NULL,
    "verification_method" VARCHAR(10) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "member_id" UUID,
    "invite_id" UUID,
    "phone" VARCHAR(16) NOT NULL,
    "purpose" VARCHAR(10) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "token_hash" CHAR(64) NOT NULL,
    "account_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" CHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_member_id_key" ON "accounts"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_login_phone_key" ON "accounts"("login_phone");

-- CreateIndex
CREATE UNIQUE INDEX "claim_invites_token_hash_key" ON "claim_invites"("token_hash");

-- CreateIndex
CREATE INDEX "claim_invites_member_id_idx" ON "claim_invites"("member_id");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_created_at_idx" ON "otp_challenges"("phone", "created_at");

-- CreateIndex
CREATE INDEX "auth_sessions_account_id_idx" ON "auth_sessions"("account_id");

-- CreateIndex
CREATE INDEX "auth_rate_limits_expires_at_idx" ON "auth_rate_limits"("expires_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_invites" ADD CONSTRAINT "claim_invites_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "claim_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE accounts ADD CONSTRAINT accounts_login_phone_format CHECK (login_phone ~ '^\+[1-9][0-9]{7,14}$'),
ADD CONSTRAINT accounts_verification_method CHECK (
  (verification_method = 'local' AND verified_at IS NULL) OR
  (verification_method = 'sms' AND verified_at IS NOT NULL)
);
ALTER TABLE otp_challenges ADD CONSTRAINT otp_attempts_limit CHECK (attempts BETWEEN 0 AND 5),
ADD CONSTRAINT otp_purpose CHECK (purpose IN ('claim', 'login'));
COMMIT;
