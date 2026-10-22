-- New enum values must be committed before they can be used, so they get their own migration.

-- Board permission the president can tick to delegate custom-section management.
alter type public.board_permission add value if not exists 'custom_sections';

-- Support grants can now cover custom sections.
alter type public.support_section add value if not exists 'sections';
