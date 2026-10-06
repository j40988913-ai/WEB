# BNHS Portal - Node.js + TiDB/MySQL

Kinonvert mula PHP papuntang Node.js. Ginagamit pa rin ang **parehong TiDB/MySQL database** mo,
kaya **gumagana pa rin ang lahat ng existing users** (bcrypt hashes) at data.

## Requirements
- Node.js 18 o mas bago
- TiDB Cloud / MySQL database (yung dati mo)

## Setup
```bash
npm install                 # mysql2 + bcryptjs lang
cp .env.example .env        # o gamitin ang existing .env mo (parehong keys)
npm start
```
Buksan: http://localhost:3000

`.env` keys: `SESSION_SECRET, NODE_ENV, PORT, DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_SSL, TRUST_PROXY`
- TiDB Cloud: `DB_PORT=4000`, `DB_SSL=true`
- Render/nginx/Cloudflare: `TRUST_PROXY=true` (para tama ang IP sa rate limit)

Auto-create/auto-repair ng tables (users, violations, messages, rate_limits, **sessions**) sa pag-start,
kaya hindi mo na kailangang i-run ang `database_setup.sql` (pero okay lang kung na-run na).

## Admin account
```bash
node create-admin.js "Pangalan Mo" email@example.com ADMIN-001 mypassword
```
(Gumagawa ng bago o nagpo-promote ng existing email.)

## Mga file
- `server.js` - lahat ng API (dating `api/*.php`), auth, sessions, rate limit, upload
- `public/` - login/register, CSS, JS, assets (hindi binago)
- `views/` - admin/teacher/student pages (handbook naka-embed na)
- `uploads/profile/` - profile pictures (local disk; sa Render free tier ay nabubura ito sa restart)

## Tandaan
- Gumagana pa rin ang `/api/*.php` URLs (alias lang) kaya hindi na binago ang frontend.
- Naka-store sa `sessions` table ang login sessions, kaya hindi nalo-logout ang users kapag nag-restart.
