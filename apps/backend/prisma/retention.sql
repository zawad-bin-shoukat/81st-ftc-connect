-- Daily cleanup of expired authentication data and old membership requests.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DELETE FROM public.otp_challenges
WHERE expires_at < now();

DELETE FROM public.test_otp_challenges
WHERE expires_at < now();

DELETE FROM public.auth_rate_limits
WHERE expires_at < now();

DELETE FROM public.auth_sessions
WHERE expires_at < now()
   OR revoked_at < now();

DELETE FROM public.test_sessions
WHERE expires_at < now()
   OR revoked_at < now();

DELETE FROM public.claim_invites
WHERE expires_at < now() - interval '30 days'
   OR consumed_at < now() - interval '30 days'
   OR revoked_at < now() - interval '30 days';

DELETE FROM public.registration_requests
WHERE (status = 'pending' AND created_at < now() - interval '90 days')
   OR (status IN ('approved', 'rejected')
       AND reviewed_at < now() - interval '90 days');

COMMIT;
