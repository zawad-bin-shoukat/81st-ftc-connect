/*
  Warnings:

  - Made the column `education` on table `members` required. This step will fail if there are existing NULL values in that column.
  - Made the column `university` on table `members` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `members` required. This step will fail if there are existing NULL values in that column.
  - Made the column `blood_group` on table `members` required. This step will fail if there are existing NULL values in that column.
  - Made the column `home_district` on table `members` required. This step will fail if there are existing NULL values in that column.

*/
BEGIN;
-- AlterTable
ALTER TABLE "members" ALTER COLUMN "education" SET NOT NULL,
ALTER COLUMN "university" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "blood_group" SET NOT NULL,
ALTER COLUMN "home_district" SET NOT NULL;
ALTER TABLE "members"
ADD CONSTRAINT "members_education_not_blank"
    CHECK ("education" ~ '[^[:space:]]'),
ADD CONSTRAINT "members_university_not_blank"
    CHECK ("university" ~ '[^[:space:]]'),
ADD CONSTRAINT "members_email_not_blank"
    CHECK ("email" ~ '[^[:space:]]'),
ADD CONSTRAINT "members_home_district_not_blank"
    CHECK ("home_district" ~ '[^[:space:]]');
ALTER TABLE "members"
ADD CONSTRAINT "members_email_format"
CHECK (
    char_length("email") <= 254
    AND char_length(split_part("email", '@', 1)) <= 64
    AND "email" ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
);
COMMIT;
