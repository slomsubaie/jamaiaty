-- Allow server-side deletion of feedback (data-protection requests, cleanup).
-- Still not possible from the browser: there is no delete policy for users.
grant delete on public.feedback to service_role;
