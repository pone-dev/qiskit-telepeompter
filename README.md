# CampusFlow

CampusFlow is a role-aware university operations application. The React/Vite client uses a Node.js API and MySQL for authentication and persistent records. The API serves the built client and enforces access permissions on the server; the browser does not connect directly to MySQL.

## Requirements

- Node.js 20 or later
- MySQL 8.0.16 or later
- pnpm 8 or later

## Run locally

1. Install dependencies: `pnpm install`.
2. Create a MySQL database and user, then apply `database/schema.sql` (or run `pnpm db:migrate` after configuring the environment).
3. Copy `.env.example` to `.env` and set the MySQL connection values, a unique random `JWT_SECRET` of at least 32 characters, and initial administrator details. Set `USER_PROVISIONING_TOKEN` to a separate random value of at least 32 characters if administrators should create staff or student accounts; use the same value in the account form's Temporary setup token field.
4. Create the first administrator once with `pnpm bootstrap:admin`. Bootstrap is refused after any user account exists.
5. Run `pnpm dev`. The Vite client is available at `http://localhost:5173`; API requests are proxied to the backend.

For a local Docker setup, copy `.env.example` to `.env`, set `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, and a unique bootstrap admin password, then start MySQL with `docker compose up -d database`. Set `USER_PROVISIONING_TOKEN` if you need to create staff or student accounts. Build the app image with `docker compose build app`; apply the schema and create the first admin once with `docker compose run --rm app npm run db:migrate` and `docker compose run --rm app npm run bootstrap:admin`. Start the application with `docker compose up app`; it is available at `http://localhost:3001`.

## Deployment

The app can be deployed with Vercel serving the Vite frontend, Render running the Node API, and a managed MySQL-compatible database. `vercel.json` builds the frontend and proxies `/api/*` to the Render service. This keeps browser API calls and the session cookie on the Vercel origin; set `APP_ORIGIN` on Render to the exact production Vercel origin.

### Free test deployment: Vercel + Render + TiDB Cloud Starter

1. Create a TiDB Cloud Starter instance. It speaks the MySQL protocol and requires TLS. In its Connect panel, collect the endpoint host, port, database name, username, and generated password; use the complete username TiDB provides.
2. Create a Vercel project from this repository. Vercel should detect Vite and deploy the frontend. Note its production URL; API calls will not work until the backend and database are configured.
3. In Render, create a Blueprint from this repository and apply `render.yaml`. The blueprint creates the `campusflow-api` Docker web service on Render's free plan. Set `APP_ORIGIN` to the exact Vercel production origin (no trailing slash), and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` from TiDB. Keep `MYSQL_SSL=true`; TiDB's public server certificate is publicly trusted, so `MYSQL_SSL_CA` can be left unset. Set `USER_PROVISIONING_TOKEN` to a unique random value of at least 32 characters to enable administrator account creation.
4. Deploy the `campusflow-api` service and note its public `onrender.com` URL. If Render assigns a different URL, update the `/api/:path*` destination in `vercel.json` to that URL and redeploy Vercel. This repository's current rewrite points to `https://campusflow-api-o9b6.onrender.com`.
5. Initialize the database and administrator once from a local Node.js 20+ checkout (Render's free plan does not provide an ephemeral shell). Copy `.env.example` to `.env`, set the TiDB `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` (use the same database name configured on Render), set `MYSQL_SSL=true`, and add `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters. Run `pnpm db:migrate` and then `pnpm bootstrap:admin`. Remove the bootstrap password from `.env` afterward. Keep `.env` local and private; bootstrap is refused once any user account exists.
6. Open the Vercel production URL and sign in with the bootstrap administrator. The API health endpoint is available at `https://<your-render-service>.onrender.com/api/health`; it should report `"status":"ok"` and `"database":"connected"`.

The Render blueprint generates a `JWT_SECRET`. Keep it private and do not commit secrets or `.env`. Keep `USER_PROVISIONING_TOKEN` private as well. When creating staff or student accounts, copy its value from the Render Environment page into the form's Temporary setup token field. Render free web services sleep after 15 minutes without traffic, can take about a minute to wake, and are intended for testing/hobby use rather than production. TiDB Cloud Starter has its own free-tier limits. Production deployments should use paid, always-on compute and a database plan with appropriate backups and support. Production cookies require HTTPS.

For a single-host deployment instead, the included Dockerfile serves both frontend and API; deploy it to a container host and set the same database and JWT environment values there. Do not expose the MySQL port publicly or use the sample values from `.env.example` in a deployment.

## Accounts

There are no built-in demo users or passwords. Create the first administrator with the bootstrap command. Authorized administrators can provision staff and student accounts through `POST /api/users` with `name`, `email`, `password`, and `role` (`administrator`, `staff`, or `student`); optional `department` and `programme` fields are supported. The endpoint requires an administrator session and a separate `USER_PROVISIONING_TOKEN` HTTP header. Keep this token private and rotate it when needed; removing it disables account provisioning. New passwords must be at least 12 characters; there is no public sign-up endpoint.

If the administrator login is lost, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in the private local `.env` to the new credentials, then run `pnpm reset:admin -- --confirm` from a Node.js 20+ checkout connected to the same database. The command resets the existing administrator only when exactly one administrator exists and is active; it does not create an account. Remove the password from `.env` after resetting it.

## Data and access controls

- User passwords are stored as bcrypt hashes. Sessions use an HTTP-only, SameSite-strict cookie and expire after eight hours.
- Login attempts are rate-limited; security headers and same-origin checks are enabled.
- API reads and writes are restricted by role. Student-created records are scoped to that student's account for private modules; authorized staff and administrators can link those records to an active student account by email. Complaint content is stored without a reporter user ID; each anonymous submission returns a one-time tracking token, stored in that browser for status lookups.
- Record mutations are written to an audit log. Complaint audit entries deliberately omit the acting user ID.
- Campus module data uses a MySQL JSON payload alongside indexed module, owner, user, and audit fields. This makes the existing flexible tables persistent, but it is not a normalized student-information-system schema.

## Features not connected to external providers

This deployment persists CampusFlow records but does not integrate a payment processor, email delivery, university identity provider, file storage, or an AI service. The campus assistant summarizes the records available to the signed-in user; it is not an external AI integration. Room and service requests are application records, not a conflict-checked reservation system; timetable overlap checks, authoritative attendance, and grade workflows also need domain-specific validation before operational use. Integrate and test those workflows before relying on them operationally.
