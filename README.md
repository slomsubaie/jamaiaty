# جمعيتي (Jamaiah)

An Arabic-first platform for homeowners associations: a website plus iOS and Android apps, built as a multi-tenant SaaS.

| Folder | What it is |
|---|---|
| `apps/web` | Website (Next.js, RTL Arabic). Includes the platform-admin screens. |
| `apps/mobile` | iOS + Android app (Expo / React Native). |
| `packages/shared` | Code shared by both apps: phone validation, roles and permissions, Arabic text, data queries, login. |
| `supabase/migrations` | Database tables and permission rules (RLS). |
| `supabase/functions` | Server functions: `create-association`, `add-member`, `delete-association`, `send-otp` (WhatsApp login codes), `whatsapp-webhook`. |
| `supabase/tests` | Permission tests that run the real migrations in an in-memory Postgres. |

## Support contacts on the login page
Edit `packages/shared/src/config/support.ts`: `email`, `whatsapp` (international digits, e.g. `966500000000`), the pre-filled `whatsappMessage`, an optional `phone` for calls, and `hours`. Leave a value as `""` to hide it. The website and the mobile app both read this file.

## Archive, vendors & contracts, finance
- **Archive (`/a/<id>/archive`):** documents with a category (contract, invoice, minutes, decision, correspondence, other), title, date, file (private `association-archive` bucket, 50 MB), notes, an optional linked vendor, and visibility. Only the president can share a document with owners. Deleting is a soft delete with a required reason; the board can view and restore deleted documents. Search and filter by category and year.
- **Vendors & contracts (`/a/<id>/vendors`):** vendors, then offers and contracts with a services checklist per field (`SERVICE_CATALOG` in `packages/shared/src/domain.ts`) and a price per unit or in total, monthly or yearly. Contracts can be renewed or ended. The **comparison** tab converts every price to a yearly total and per unit per year, highlights the cheapest, and shows services ✓/✗. Owners see only the **vendor directory**.
- **Finance (`/a/<id>/finance`):** one budget per fiscal year with income and expense lines (planned and actual), a planned-against-actual report, Excel (CSV) export and printing. Owners see yearly totals of **approved** budgets only.
- Mobile shows these three sections view-only. Managing them happens on the website.

## Archive AI analysis
The top of the archive shows an analysis written by Claude (`claude-opus-5-5`) from the documents, in five tabs: overview, finance, contracts & vendors, maintenance, governance.
- **Historical overview:** free for every association. Owners get a version built only from documents shared with owners. When a shared document is unshared or deleted, the owners' version is withdrawn straight away and rebuilt without it.
- **Details & forecast** (the next 3 years, with recommended actions): premium only, for the president and board members. A superadmin sees both, on any plan, only while a support request covering **التحليل الذكي** is accepted.
- **Refresh:** the president can press **تحديث التحليل** (refresh), at most 3 times a day. It also runs by itself once the president's interval (7, 30 or 90 days) has passed, as long as documents changed since the last run.
- **How it works:**
  - When a file is uploaded, `digest-document` reads it once (PDF, image or text, so Word and Excel files are used by their details only) and stores a digest. These digests are only reachable by the functions.
  - `analyze-archive` then writes the analysis from the digests.
  - An hourly `pg_cron` job retries failed digests and starts runs that are due.
- **Setup:** run this once per project. Keep the same random secret in both places.
  ```sh
  npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-..." INTERNAL_FUNCTIONS_SECRET="$(openssl rand -hex 32)"
  npm run functions:deploy
  ```
  Then, in the Supabase SQL editor:
  ```sql
  select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
  select vault.create_secret('<the same INTERNAL_FUNCTIONS_SECRET>', 'internal_functions_secret');
  ```

## Complaints & suggestions
Public form at `/feedback` (website) and in the app, linked from the login page and the menu under your name. Submissions go through the `submit-feedback` function. It validates every field (name, email and details required; details at most 1,000 characters), drops bots via a hidden honeypot field, and rate-limits to 5 per hour per device (IP stored only as a salted hash) and 3 per hour per email. The `feedback` table re-checks every field, and only superadmins can read it (**الشكاوى والاقتراحات** in the platform menu) or change its status. Change the limits at the top of `supabase/functions/submit-feedback/index.ts`.

## Session time
A session lasts **24 hours** from login. Then a pop-up offers **تمديد 24 ساعة** (extend) or **إنهاء الجلسة** (end, logs out). If nobody answers within **10 minutes**, the user is logged out automatically. Coming back after the deadline with the app closed also logs out. Values are in `packages/shared/src/session.ts` (`SESSION_HOURS`, `EXTENSION_HOURS`, `RESPONSE_GRACE_MINUTES`).

## Switching roles
Click your name at the top of the website (or use the switcher on the app's home screen) to pick which of your roles you're acting in: **مدير المنصة** (superadmin), or president, board member or owner of a specific association. The app sends the choice with every request (`x-acting-role` header), and the database only applies that role's privileges. It can narrow your access but never widen it. As superadmin you get platform powers only, and association data still needs a support request accepted by the association.

## Support requests
The **association asks the platform for help**. The president (or a board member with the support permission) clicks **طلب دعم فني** on the association's overview page, fills in the reason, the sections, the duration and view-only or edit, and sends it. A superadmin sees it under **طلبات الدعم** (linked from the superadmin overview, with a waiting count) and accepts or rejects it, from the list or from the request's details page. Accepting gives the platform temporary access to just those sections. Every page it opens is logged, and the president can end the access at any time on the association's **الدعم الفني** page. Superadmins can't create requests themselves; the database refuses it.

- **Accept:** a note box opens (optional note), then **إرسال**. Access starts with exactly the requested sections and edit right, and the countdown for the requested duration begins.
- **Reject:** the note box requires a reason.
- **Done (تم الإنجاز):** while access is active, the superadmin explains what was done (required). Access ends immediately.
- **Superadmin overview:** **الطلبات الجارية** lists active requests with the association's name and a live countdown.
- **The journey:** every step (requested, accepted, rejected, done, cancelled, ended) is recorded by the database with who, when and the note (`support_grant_events`). It can't be edited or deleted from the apps. The president sees the full journey on **الدعم الفني** and the latest replies on the association overview.

## Custom sections
Presidents, and board members given the **الأقسام المخصصة** permission, can create sections of their own, e.g. "المرافق → النادي الرياضي". Sections hold subfolders, notes, links and files of up to 50 MB, stored in the private `association-files` bucket. Each folder is visible to **all owners** or to the **board only**, and subfolders are never more visible than their parent. The superadmin can manage sections only through a support grant that the president approves, with "allow editing" ticked.

## Roles (milestone 1)

- **Superadmin** creates associations and assigns their presidents. They cannot see an association's data unless the president or a delegated board member grants time-limited, read-only support access. Every view under that access is logged.
- **President** manages units and owners, adds board members and ticks each board member's permissions.
- **Board member** gets only the permissions the president ticks: documents, vendors and contracts, finance, owners and units, announcements, approving support access.
- **Owner** is view-only and sees only their own units.
- **Roles combine.** A person can be superadmin and also hold any mix of president, board member and owner in each association, e.g. a president who owns a unit. President + board member together is blocked, since the president already has every board power. Only a superadmin can grant or revoke superadmin (platform-admin page → مديرو المنصة), and the last superadmin can't be removed.

Only phone numbers that a president or superadmin has added (from the association's Mullak records) can log in.

## One-time setup

### 1. Supabase (database and login)
1. Create a free account at https://supabase.com and a new project. Pick the region closest to Saudi Arabia that's offered.
2. In **Project Settings → API Keys**, copy the project URL, the **publishable** key and the **secret** key.
3. Copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill it in.
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill it in. Use the publishable key only.
5. Link the project and push the database:
   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npm run db:push
   npm run functions:deploy
   ```

### 2. Login codes (OTP) over WhatsApp, free while developing
- **Test numbers (no message sent):** `+966500000001` to `+966500000004`, all with code `123456`. They're defined in `supabase/config.toml` under `[auth.sms.test_otp]`.
- **Real codes over WhatsApp:** Supabase Auth calls the `send-otp` Edge Function (a *Send SMS Hook*), which sends the code with **Meta's WhatsApp Cloud API**. Meta's free test number can message up to 5 registered recipient numbers with no payment method. Setup:
  1. Go to https://developers.facebook.com → **My Apps → Create app**, use case **"Connect with customers through WhatsApp"**, and create or select a business portfolio.
  2. **WhatsApp → API Setup**: copy the **Phone number ID** and the **WhatsApp Business Account ID**, generate an access token, and under "To" add and verify each phone number that should receive codes (up to 5).
  3. Put the values in the root `.env` (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`), then run:
     ```sh
     set -a; source .env; set +a
     node scripts/whatsapp-template.mjs     # creates the Arabic "login_code" authentication template
     npx supabase secrets set WHATSAPP_TOKEN="$WHATSAPP_TOKEN" WHATSAPP_PHONE_NUMBER_ID="$WHATSAPP_PHONE_NUMBER_ID"
     ```
  - **Free test account limitation:** Meta's test account can't create templates (that needs a payment method), so `WHATSAPP_TEMPLATE_MODE=sample` sends the code inside Meta's pre-approved sample template `jaspers_market_order_confirmation_v1`, where it appears as the "order number". Once a payment method or business verification is in place, run `scripts/whatsapp-template.mjs` and set `WHATSAPP_TEMPLATE_MODE=authentication`.
  - In the current Meta dashboard, the credentials are under **Use cases → Connect with customers through WhatsApp → Customize → Basic setup → Step 1. Try it out**.
  - The temporary token from API Setup expires after 24 hours. For a lasting token, create a **System User** in Meta Business Settings, give it the app and WhatsApp account, and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`.
- **If sign-in fails with "تعذّر إرسال رمز التحقق عبر واتساب"**, the WhatsApp token has almost always expired. The platform-admin page shows **حالة إرسال رموز الدخول** (login-code delivery status) and warns 3 days before a temporary token expires. Use a permanent System User token (expiry "Never") to avoid this. Test numbers keep working meanwhile, because they don't go through WhatsApp.
- Auth settings (sign-ups off, phone login on, test numbers, the hook) live in `supabase/config.toml`. Push them with `npm run config:push`, after loading `.env` the same way.
- **Later, for production:** complete Meta business verification and register your own number, or switch the hook to a Saudi SMS provider (Unifonic, Taqnyat, Msegat). The apps don't change either way.

### 3. Make yourself the superadmin
```sh
node --env-file=apps/web/.env.local scripts/bootstrap.mjs +966500000001 "اسمك" "اسم جمعيتك" "الرياض"
```
Use your real number once WhatsApp codes are set up. Otherwise use a test number.

## Running

```sh
npm run dev:web        # http://localhost:3000
npm run dev:mobile     # scan the QR code with the Expo Go app
```

## Checks

```sh
npm test               # phone/validation tests + database permission tests (no Supabase account needed)
npm run typecheck
npm run lint
```

## Notes
- Expo Go ignores the native "force RTL" setting, so the app sets the RTL direction in its own styles. Real builds (`npx eas-cli build`) also force RTL natively.
- `packages/shared/src/database.types.ts` is hand-written to match the migrations. Regenerate it after linking with `npm run db:types`.
- Hosting must be reviewed against Saudi PDPL data-residency rules before production.
