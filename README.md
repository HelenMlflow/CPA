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

Copy `.env.example` to `.env`; never commit `.env`. Use a persistent disk and HTTPS reverse proxy. Set `DEV_MODE=0` and `PUBLIC_URL` to the exact HTTPS origin. The public website can start without portal settings. The portal displays a setup message and its account/upload endpoints return 503 until all required settings are available.

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

The original site's analytics, live chatbot, external booking and inquiry submissions are blocked by CSP so cloned UI cannot transmit client information to the reference site's services. Those integrations need replacement endpoints before going live; phone/email links still work. The project supports a persistent Node server locally and Vercel Functions with a hosted Turso account database.


## Deploying to Vercel

The repository includes `vercel.json` with static marketing assets in `public`, page refresh routes, security headers, and the `/api/index.mjs` function. Use the repository root as the project root; leave Framework Preset as **Other**. The checked-in build command prepares static files without importing the database or requiring secrets. The public website deploys without any environment variables.

To activate the portal, add the following in Vercel Project Settings → Environment Variables, then redeploy:

- `PUBLIC_URL`: the exact production HTTPS origin, e.g. `https://cpa-nu.vercel.app`.
- `DEV_MODE=0` (development mode is forcibly disabled on Vercel).
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`: a dedicated hosted database URL and database-scoped read/write token. Create these in Turso; enter the token directly in Vercel, never in source control. Tables are created automatically on first portal use. The adapter uses the documented HTTPS SQL pipeline with bound parameters. No local SQLite or `/tmp` database is used on Vercel.
- All five Microsoft/SharePoint variables and the two email variables listed in `.env.example`.

Without these settings, `/portal` shows a setup message; registration and document uploads are disabled. Existing development accounts are not transferred to the hosted database. Vercel uploads are limited to **4 MB per file** to stay below its function request-body limit; the persistent local server retains the 20 MB limit. Larger uploads need a separate direct-upload flow.

The original server failed in serverless deployment because it required production secrets at module import and initialized a writable local database. The function entry point now exports a request handler without starting a listening server, and account database initialization is lazy. Static pages are served separately from the API.

Verification: `TEST_URL=http://localhost:3001 npm test` against a development server at port 3001 also runs the Vercel startup regression and typed hosted-database adapter tests. A live Turso/Microsoft integration still requires real service configuration.
