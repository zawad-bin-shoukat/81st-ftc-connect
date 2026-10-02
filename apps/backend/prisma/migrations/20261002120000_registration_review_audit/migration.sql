BEGIN;
ALTER TABLE registration_requests
  ADD COLUMN reviewed_by_member_id UUID REFERENCES members(id) ON DELETE RESTRICT,
  ADD COLUMN review_note VARCHAR(1000);
CREATE INDEX registration_status_created ON registration_requests(status, created_at);
COMMIT;
