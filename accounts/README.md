# The site's server

`worker.js` is the site's one Cloudflare Worker (requirement `1.50` in
[the spec](../dev/requirements/requirements.md)). It answers only `/api/*`; every other address is the
static site. It checks Google's sign-in token, keeps sessions and one settings record per user in the
D1 database `norfinder-accounts` (binding `DB`), and makes its own tables the first time it runs. No
address returns anything about a user except to that user's own session.

## Who was active in the last 24 hours

Not served by the site; ask the database. From the repo root, signed in to Cloudflare
(`npx wrangler login`):

```
npx wrangler d1 execute norfinder-accounts --remote --command="$(cat accounts/active_users.sql)"
```

Each row is one user (email, name, when last seen, in UTC) and carries `total`, how many there are. The
`=` after `--command` matters: the query starts with a `--` comment, which wrangler otherwise reads as a
flag. The same query can be pasted into the database's console in the Cloudflare dashboard (Storage &
Databases → D1 → `norfinder-accounts` → Console).

This command has been run with `--local` against a local copy of the database, not yet with `--remote`
against the live one, which exists only after the first release that carries this server.

## Logs

Workers Logs is on (`observability` in `wrangler.json`): each request, and one line per sign-in,
sign-out and settings save naming the user by Google id, never by email. They are in the Cloudflare
dashboard under Workers & Pages → `norfinder` → Logs.
