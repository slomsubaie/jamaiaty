-- New enum values must be committed before they can be used, so they get their own migration.

-- Support grants can now cover the archive's AI analysis (historical overview and forecast).
alter type public.support_section add value if not exists 'analysis';
