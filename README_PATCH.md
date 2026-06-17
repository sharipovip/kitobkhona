# Китобхона patch 2

Replace in site repo:
- index.html
- kitobho.html
- reader.html
- honandagon.html
- profile.html
- admin.html
- pages/chat.html
- data/tajikistan_locations.json
- sw.js

Run SQL in Supabase:
1. supabase/sql/11_app_control_and_admin.sql
2. supabase/sql/12_temporary_admin_testing_policies.sql

Important:
- SQL 12 is temporary for testing admin actions (blue check, hero, categories) without manually inserting admin_users.
- Later remove temporary policies and keep strict admin_users security.

Fixes:
- Blue-check RLS testing fix.
- Stories can choose books from all books if reading history is empty.
- Profile edit uses select lists for birth year, region, city/district.
- Admin categories show all books.json categories even if display_names table is empty.
- Admin categories can be reordered by drag/drop or up/down buttons.
- Admin hero section is text-focused; photo URL is editable.
- Hero dots hidden and text animation slowed.
