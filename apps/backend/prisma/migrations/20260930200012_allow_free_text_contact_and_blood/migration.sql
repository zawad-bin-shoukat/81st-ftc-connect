BEGIN;

ALTER TABLE "members"
  DROP CONSTRAINT "members_phone_e164",
  DROP CONSTRAINT "members_blood_group_valid";

ALTER TABLE "members"
  ALTER COLUMN "phone" TYPE TEXT,
  ALTER COLUMN "blood_group" TYPE TEXT;

ALTER TABLE "members"
  ADD CONSTRAINT "members_phone_not_blank" CHECK ("phone" ~ '[^[:space:]]'),
  ADD CONSTRAINT "members_blood_group_not_blank" CHECK ("blood_group" ~ '[^[:space:]]');

COMMIT;
