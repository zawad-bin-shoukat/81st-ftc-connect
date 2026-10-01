BEGIN;
ALTER TABLE "otp_challenges" ADD COLUMN "delivery_mode" VARCHAR(10) NOT NULL DEFAULT 'local';
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_delivery_mode" CHECK ("delivery_mode" IN ('local', 'sms'));
COMMIT;
