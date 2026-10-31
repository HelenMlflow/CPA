# PeterCPA — JIN'S CPA website and client portal

Run with Node.js 24+ (no dependencies required):

```sh
npm run dev
```

Open http://localhost:3000 and http://localhost:3000/portal.

The marketing site preserves the reference site's compiled public pages, English/Chinese text, styling and imagery, downloaded October 30, 2026. Its original source components were not available. The editable portal is in `public/portal.html`, `public/portal.css`, and `public/portal.js`; backend in `server.mjs` and Microsoft adapter in `lib/sharepoint.mjs`. Public blog/podcast content is a read-only snapshot, not a live CMS.

## Development

Development mode stores accounts in `.data/portal.sqlite` and synthetic uploads in `.data/uploads`. It deliberately does not contact Microsoft. Registration displays a development-only email verification link. Click it to activate the test account. The dashboard supports multiple files, drag/drop, tax year/category, receipt history and sign out. Passwords are scrypt-hashed and sessions are opaque, hashed in storage, HTTP-only cookies. No passwords or auth tokens are stored in browser storage.

`npm test` runs integration tests against the running development server. Tests create clearly named synthetic accounts and files. They cover email verification and token reuse, uploads before/after verification, unsupported files, account isolation, login and session invalidation.

## Microsoft and production setup

Copy `.env.example` to `.env`; never commit `.env`. Use a persistent disk and HTTPS reverse proxy. Set `DEV_MODE=0` and `PUBLIC_URL` to the exact HTTPS origin. Production startup refuses to proceed without Microsoft and email settings.

1. Register a single-tenant confidential application in Microsoft Entra. Set tenant ID, application/client ID and a secret through the deployment secret manager.
2. A Microsoft administrator must consent to Graph application permissions required for guest invitations and document operations. The invitation endpoint documents `User.Invite.All`; the folder invite endpoint documents `Files.ReadWrite.All`. These are sensitive permissions: use a dedicated app and review the scope with the administrator. Do not give clients access to the parent library. The connector available in ChatGPT is separate from the server application credential.
3. Create a private SharePoint document library and restricted parent folder. Set `SHAREPOINT_DRIVE_ID` and `SHAREPOINT_PARENT_ID` to their Graph IDs. Verify that the parent does not grant access to other clients or broad visitor groups: child folders inherit parent permissions.
4. Configure Resend with a verified sender (`RESEND_API_KEY`, `MAIL_FROM`) to deliver the portal's email verification link. Secrets stay server-side.
5. After verification, the server creates an Entra guest (not a paid tenant member account), persists its ID, creates a UUID-named folder, grants that guest write access to that folder, and records provisioning completion. The client dashboard offers retry on setup failure. Existing clients' remote identifiers are retained for retry. Uploads use the server's Graph credential and the authenticated account's folder ID; browsers cannot choose a folder/user ID.
6. Test with two real test users in your tenant. Confirm their effective SharePoint permissions and direct Microsoft guest redemption behavior before client use. Live Graph provisioning/upload has not been exercised in this workspace. Guest invitation emails are not automatically sent; portal users upload through the dashboard, without needing a separate Microsoft sign-in.

Official references:
- https://learn.microsoft.com/en-us/graph/api/invitation-post?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0

Uploads are limited to 20 MB and supported extensions; PDF headers are checked. These checks are not malware scanning. Before real tax documents, add malware quarantine/scanning, account recovery, MFA, durable rate limiting at the reverse proxy, operational audit trails, encrypted backups/retention policy and managed secret rotation. The included SQLite/local upload development store is not a production document service. Place `.data` on an encrypted restricted disk; never serve it publicly.

The original site's analytics, live chatbot, external booking and inquiry submissions are blocked by CSP so cloned UI cannot transmit client information to the reference site's services. Those integrations need replacement endpoints before going live; phone/email links still work. The website is retained locally in this project, not published to Sites: this backend requires a persistent Node runtime and SQLite disk.
