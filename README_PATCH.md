# Китобхона complete patch

Replace these files in site repo:
- index.html
- kitobho.html
- reader.html
- honandagon.html
- profile.html
- admin.html
- books.json
- sw.js
- manifest.json
- pages/chat.html
- data/tajikistan_locations.json

Run SQL in Supabase:
1) supabase/sql/09_admin_core.sql
2) supabase/sql/11_app_control_and_admin.sql
3) supabase/sql/12_temporary_admin_testing_policies.sql  (temporary testing policies)

What is fixed:
- Fresh local books.json v3 and fast loading/local fallback.
- Categories show from fresh books.json.
- Admin categories show all books.json categories and can reorder/edit.
- Hero can be controlled from admin hero_slides.
- Main header hidden; hero text slower, no vertical line/dots.
- Ozmun icons and categories are compact.
- Reader settings compact; 10-star rating; PDF cache and share progress.
- Offline/downloaded books in kitobho:
  * Downloaded section.
  * Lock on unavailable offline books.
  * Download button becomes delete if cached.
  * Delete one/all cached books.
- Last category/subcategory is remembered.
- Chat opened for testing and controlled by app_settings.
- User verification temporary RLS policy for testing.

After upload:
- Hard refresh: Ctrl+Shift+R.
- If still old: unregister Service Worker / clear site data.
- On Android: clear app cache if WebView still shows old version.
