-- Admin-selectable category colors.
-- Run manually in the Supabase SQL editor (no DDL-execution tool in this environment).

alter table ops_categories add column if not exists color text;

-- Preserve the colors the 4 seeded categories already rendered with before
-- this migration (see CATEGORY_COLOR_PRESETS in lib/ops-guide.ts).
update ops_categories set color = 'blue' where name = 'Camera Coefficients' and color is null;
update ops_categories set color = 'purple' where name = 'Credit Card Terminal Setup' and color is null;
update ops_categories set color = 'amber' where name = 'IT Troubleshooting Manual' and color is null;
update ops_categories set color = 'accent' where name = 'Tech Support' and color is null;

update ops_categories set color = 'slate' where color is null;
