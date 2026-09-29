BEGIN;

-- CreateTable
CREATE TABLE "cadres" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "cadres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ftc_id" INTEGER NOT NULL,
    "section" VARCHAR(2) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "cadre_id" UUID NOT NULL,
    "bcs_batch" SMALLINT NOT NULL,
    "education" TEXT,
    "university" VARCHAR(255),
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "blood_group" VARCHAR(3),
    "home_district" VARCHAR(100),
    "about_me" TEXT,
    "favourite_quotation" TEXT,
    "profile_photo_key" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cadres_name_key" ON "cadres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "members_ftc_id_key" ON "members"("ftc_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_phone_key" ON "members"("phone");

-- CreateIndex
CREATE INDEX "members_cadre_id_idx" ON "members"("cadre_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_cadre_id_fkey" FOREIGN KEY ("cadre_id") REFERENCES "cadres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma does not express these PostgreSQL CHECK constraints in its schema.
ALTER TABLE "cadres" ADD CONSTRAINT "cadres_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "members"
    ADD CONSTRAINT "members_ftc_id_positive" CHECK ("ftc_id" > 0),
    ADD CONSTRAINT "members_batch_positive" CHECK ("bcs_batch" > 0),
    ADD CONSTRAINT "members_name_not_blank" CHECK (length(btrim("name")) > 0),
    ADD CONSTRAINT "members_section_not_blank" CHECK (length(btrim("section")) > 0),
    ADD CONSTRAINT "members_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{1,14}$'),
    ADD CONSTRAINT "members_blood_group_valid" CHECK ("blood_group" IS NULL OR "blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

COMMIT;
