-- New status: the platform finished the requested work (access ends at that moment).
alter type public.support_grant_status add value if not exists 'completed';
