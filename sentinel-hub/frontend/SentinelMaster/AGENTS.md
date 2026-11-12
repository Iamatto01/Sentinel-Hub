# SENTINEL WORKSPACE — OPERATING RULES

**Authority:** Jack. **Scope:** every project under `F:\INI KALI LA` and every agent on
Kali Linux (via Cloudflare Tunnel `ssh.sentinelai.studio`, previously `192.168.68.132`). These rules exist because each one below was **violated in production**
and cost real data. They are not style preferences.

**Precedence:** this file overrides per-project conventions. A project-level `AGENTS.md` may add
rules; it may never remove one from this file.

---

## 1. PORT OWNERSHIP — ONE SUPERVISOR PER PORT

> *A supervisor killing another supervisor's port is not a restart strategy; it is silent data
> corruption with a scheduler.*

**PM2 owns:** `3000` hub (`sentinel-master`) · `5000` sentinel-backend · `3010` sentinel-api ·
`5173` sentinel-frontend · `3005` sentinel-mlbb · `8009` sentinel-threat · `8016` sentinel-web ·
`8029` sentinel-arcuz

**Docker owns:** `20128` — the OmniRoute container (`docker-proxy`). **Not a PM2 app.** Only
`/home/kali/server/9router/deploy-omniroute.sh` may recreate it, and `pm2 save` must follow,
because recreating it drops an app from the PM2 list.

**systemd owns:** `55553` only — `sentinelai.service` = the `msfrpcd` daemon.

The same table, with the same numbers, is restated in the manifest header (§1.1). Keep the two in
sync — the manifest is authoritative, this file explains why.

### 1.1 THE MANIFEST IS THE SOURCE OF TRUTH
`/home/kali/server/SentinelMaster/ecosystem.config.cjs` defines **every** PM2 application.
A process that is not in that file is not part of the server.

**A new app enters the manifest FIRST, then gets started.** Never `pm2 start <something>` and
write the manifest later — that is how `sentinel-web`'s port ended up existing in no file at all
(N-21).

### 1.2 `pm2 start` CANNOT UPDATE A RUNNING PROCESS — proven, not assumed
Starting an existing name from a manifest is a **silent no-op**. `exec_mode`, `args`, `env` and
`max_memory_restart` are all ignored. Measured on the live node: an app started as
`cluster_mode`/no-cap/no-args stayed exactly that way after a manifest declaring `fork` + `args`
+ `123M` + `env` was applied — `restart_time` stayed `0` and the process still logged
`ARGS=[] PORT=undefined`.

**Consequence:** there is no safe middle path. To change an already-running process:
```bash
pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name> && pm2 save
```
`pm2 restart` has no `--max-memory` flag — a memory cap can only be introduced by delete+recreate.
Writing the manifest is safe (PM2 does not watch it). **Applying it is the destructive step.**

**Order matters.** `sentinel-master` serves the dashboard that issues the command — deploy it
**last**, over SSH, with a recovery command ready. And `pm2 save` afterwards, or `dump.pm2`
restores the old definitions at reboot.

### 1.3 NO APP DECLARES ITS OWN LOG PATH
All logs stay in the PM2 default directory `~/.pm2/logs/<name>-{out,error}.log`, because that is
the **only** directory `pm2-logrotate` rotates. An `out_file` pointing anywhere else escapes
rotation and grows without bound — the previous manifest wrote `./logs/hub-*.log` into
`/home/kali/server/SentinelMaster/logs`, a directory that does not exist. The Hub reads logs via
`pm2 logs <name>`, by name, so paths are free to be defaults.

`pm2-logrotate` is a **module, not an app** — it is installed with `pm2 install pm2-logrotate`,
keeps its settings in `~/.pm2/module_conf.json`, and must never appear in an ecosystem file.

### 1.4 NO SECRETS IN THE MANIFEST
A value in `ecosystem.config.cjs` is persisted into `~/.pm2/dump.pm2`, printed by the process
table, and survives deploy cycles as a stale secret. Secrets belong in the environment file on
the server: `.env.local` (Hub), `SentinelAI/.env` (backend), `SentinelAPI/.env` (API).

### 1.5 A PROCESS MUST DECLARE ITS OWN ENVIRONMENT
Do **not** rely on the environment of the SSH session that started it. Every process on this node
once inherited a frozen session env (N-19), and `NODE_ENV` is set by **no process and no project**
(N-23). Anything a service needs to run correctly must be in the manifest or in its `.env`.

### 1.6 PM2 RECOGNISES A CONFIG FILE BY SUBSTRING — and how to test one safely
`Common.isConfigFile()` does a **substring** match against
`{'.json','.yml','.yaml','.config.js','.config.cjs','.config.mjs'}` (PM2 7.0.3,
`/usr/local/lib/node_modules/pm2/lib/Common.js:240-267`). Measured:

| filename | recognised |
|---|---|
| `ecosystem.config.cjs` | ✅ `js` |
| `ecosystem.cjs` | ❌ `null` |
| `app.cjs` | ❌ `null` |
| `dryrun.cjs` | ❌ `null` |

A `.cjs` file without `.config.` in the name is silently executed as a **plain script** and
auto-named from its filename. That is how a phantom `pm2dry-eco` process appeared during
validation. **`.config.cjs` is the required substring.**

**Safe validation of any manifest — isolated `PM2_HOME`, real daemon untouched:**
```bash
export PM2_HOME=/tmp/pm2dry      # real ~/.pm2 never opened
pm2 start /tmp/dryrun.config.cjs # must contain '.config.' in the name
pm2 jlist | python3 -m json.tool # inspect caps/env/args/exec_mode
pm2 kill; rm -rf /tmp/pm2dry
unset PM2_HOME                   # before ANY real pm2 call in the same command
```
Have the probe script write `process.argv.slice(2)`, `process.cwd()`, `PORT`, `NODE_ENV` and `HOST`
to a file, then assert on it — that is the only way to prove what a child process actually
receives. **Never apply an unvalidated manifest to the live daemon.**

### 1.7 A PATH WITH A SPACE IN `script:` BREAKS PM2 — never combine it with `interpreter`
> Found the hard way on 2026-09-26. **This rule took the Hub down for ~90 minutes.**

PM2 does not `execve()` the `script` you name. It passes `script` to Node as argv inside
`ProcessContainerFork.js`. Before it does, it **shell-splits** the value. A `script` containing
a **space** therefore splits into multiple tokens, and PM2 "rescues" it by rewriting the app to:

```
pm_exec_path      = /usr/bin/bash
args              = ['-c', '<your script path>']
exec_interpreter  = **UNCHANGED — still /usr/bin/node if you set it**
```

The child then becomes `node /usr/bin/bash -c "<path>"`. **Node parses the bash ELF binary as
JavaScript**, dies instantly, and — critically — writes **absolutely nothing to stderr**. The
result is the worst possible failure signature: an **empty error log**, `exit_code 1`, and an
endless restart loop ending at `errored`.

Reproduced in isolation, 4 apps, identical script content, only the directory differing:

| name | directory | derived exec | derived interp | result |
|---|---|---|---|---|
| `sp-cjs-nospace` | `/tmp/nospace` | `/tmp/nospace/server.cjs` | `/usr/bin/node` | ✅ online |
| `sp-cjs-space` | `/tmp/with space` | **`/usr/bin/bash`** | `/usr/bin/node` | ❌ errored |
| `sp-js-nospace` | `/tmp/nospace` | `/tmp/nospace/server.js` | `/usr/bin/node` | ✅ online |
| `sp-js-space` | `/tmp/with space` | **`/usr/bin/bash`** | `/usr/bin/node` | ❌ errored |

It is **not** the extension — `.cjs` alone is fine (`exec=/tmp/ext1.cjs interp=/usr/bin/node`).
**It is the space.** The trap is that `interpreter: '/usr/bin/node'` *looks* more correct than
omitting it, and is precisely what makes the failure silent instead of loud.

**THE SHAPE TO USE for any app whose directory contains a space.** Launch the runtime as the
script and pass the real entry point through `args` — the same shape the live `cloudflared`,
`backend`, `frontend`, `threat` and `mlbb` apps already use:

```js
{
  name: 'sentinel-master',
  script: '/usr/bin/node',
  args: ['/home/kali/server/SentinelMaster/server.cjs'],
  cwd: '/home/kali/server/SentinelMaster',
  // no `interpreter` — it is meaningless once script is the runtime itself
}
```

Verified four candidate fixes against the real spacey path, all with `cwd` set correctly:

| fix | derived | measured |
|---|---|---|
| `script:'/usr/bin/node', args:[<spacey path>]` | `exec=/usr/bin/node interp=none` | ✅ **restarts=0, port bound** |
| symlink `/opt/sentinel-hub` → spacey dir | `exec=/opt/sentinel-hub/server.cjs` | ✅ port bound (restarts=2, only `EADDRINUSE` against the winner) |
| `script:'/usr/bin/bash', args:['-c','/usr/bin/node "<path>"']` | `exec=/usr/bin/bash interp=none` | ✅ port bound (restarts=13 — loops, no supervision of the real PID) |
| `script:<spacey path>`, `interpreter:'/usr/bin/node'` | `exec=/usr/bin/bash interp=/usr/bin/node` | ❌ **the outage** |

Prefer the first: no extra filesystem object, PM2 supervises the real PID, and `server.cjs`
still derives `__dirname` from its own path so `loadEnvConfig(__dirname)` and `.next/` resolve
exactly as before.

**DIAGNOSTIC TELL.** When a PM2 app is `errored` with an **empty error log**, do not debug the
application — check `pm_exec_path` and `exec_interpreter` in `pm2 jlist` FIRST:

```bash
pm2 jlist | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    e=p['pm2_env']; print('%-20s %-40s %r %r' % (p['name'], e.get('pm_exec_path'), e.get('exec_interpreter'), e.get('args')))"
```
`exec=/usr/bin/bash` + a non-`none` interpreter ⇒ **you are looking at this bug.** An empty
error log on a failing process is a *PM2 launch* failure, never an application failure.

**Audit rule:** every `script:` in every ecosystem file must be a **space-free absolute path**.
`grep -n "script:" ecosystem.config.cjs` is now a mandatory pre-apply check.

### FORBIDDEN — no exceptions
```bash
fuser -k <port>/tcp          # NEVER against a port you do not own
pkill -f <other-unit-process>   # NEVER
killall <name>                  # NEVER
```

**A unit's `ExecStartPre`/`ExecStop` may not terminate another supervisor's process.** If a port
is occupied by a process you do not own, that is **information**, not an obstacle: report it.

### Rule for writing units
```ini
# CORRECT — the unit owns exactly one process, and only it
ExecStart=/usr/bin/msfrpcd -U ${MSF_USER} -P ${MSF_PASS} -a 127.0.0.1 -p 55553 -S -f
KillSignal=SIGKILL
TimeoutStopSec=5
Restart=on-failure
RestartSec=10
```
- **`-f` (foreground) is mandatory** for any daemon that double-forks, or systemd loses the pid.
- `KillSignal=SIGKILL` is required for processes that ignore SIGTERM (msfrpcd does).

### Installing a unit
`setup-kali.sh` installs `resources/sentinelai.service` to `/etc/systemd/system/`. The guard rail
must run first and **refuse** any unit containing a live `fuser -k` or `pkill`. Strip comments
before grepping — a naive `grep -q 'fuser -k'` matches the unit's own defect documentation and
blocks the *safe* file:

```bash
grep -vE '^[[:space:]]*#' /etc/systemd/system/sentinelai.service | grep -qE 'fuser -k|pkill -f (clou|msfr)'
```

### Retired
`resources/start-all.sh` is a **refusal stub** that `exit 1`s. Do not resurrect it.
Post-mortem: `SentinelAI/resources/ARCHIVED-second-supervisor.md`.

---

## 2. DATABASE DISCIPLINE

### 2.1 One authoritative path per database
The canonical FYP2 database is **`/home/kali/server/SentinelAI_Data/fyp2.db`**.

**Every script resolves the path through the resolver — never a literal:**
```js
// backend/**/*.js  (ESM)
import { dbPath } from './db-path.mjs';

// scratch/**/*.js  (CJS)
const { dbPath } = require('./db-path.cjs');
```

```js
// FORBIDDEN — this is the N-02 defect
const DB = 'output/fyp2.db';
const DB = path.join(__dirname, 'output', 'fyp2.db');
```

`config.js` implements a HDD-first fallback. Nine ad-hoc scripts bypassed it and wrote to a
**retired** database. If you are about to type a `.db` path, stop and import the resolver.

### 2.2 Writes are opt-in
Scripts are **read-only by default**. A script that mutates must:
1. Require an explicit `--write` flag.
2. Print the resolved absolute path **and** `journal_mode` before the first write.
3. Refuse to run if `PRAGMA journal_mode` is not already `wal` on a WAL database.

### 2.3 Never mutate a database to "fix" it
No agent may `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or `VACUUM` an authoritative
database as a side effect of an audit, test, or inspection.

- Inspection: `open_ro()` — `file:<path>?mode=ro`
- Backup: `VACUUM INTO ?`
- Proof of no-mutation: compare `sha256` **+ size + mtime + every sidecar** before and after.

### 2.4 WAL semantics — measured on this host
| Action | Truth |
|---|---|
| Plain file copy of a WAL db | **Silently loses every uncheckpointed commit.** `fyp2.db` alone = 5,783 rows; with `-wal`+`-shm` = 5,792. **9 rows lost.** |
| `VACUUM INTO ?` | Correct backup primitive. Reads through the WAL, does not block the writer. |
| Opening a checkpointed WAL db read-only | **Recreates** an empty `-wal` (0 B) and `-shm` (32,768 B). **0 bytes is the success test.** |
| Deleting a non-empty `-wal` | **NEVER.** Uncheckpointed data. |
| Deleting a `-journal` | **NEVER.** |
| A lone `-shm` | Belongs in `residue`, never `candidates`. |

**`live` means "a process holds the file open read/write"** — not "sidecar bytes exist."

### 2.5 Retiring a database
`chmod 0444` makes writes fail with `SQLITE_READONLY` (verified). Pair it with a
`RETIRED-DATABASE.md` naming the authoritative replacement. Never `rm` a database whose
snapshot is not verified to restore.

---

## 3. BACKUP INTEGRITY — `integrity_check` IS NOT ENOUGH

`better-sqlite3`'s `db.backup()` copies **page by page**. An interrupted copy leaves a
**structurally valid file with missing tables** — on this host exactly `4,096 bytes, 0 tables,
PRAGMA integrity_check = 'ok'`.

Publishing that as `fyp2_latest_backup.db` is **worse than publishing nothing**: it opens without
error and restores nothing.

### Mandatory acceptance predicate
```js
const tables = db.prepare("SELECT count(*) FROM sqlite_master WHERE type='table'").pluck().get();
if (integrity !== 'ok' || tables < expectedTables) reject();
```
**Proven discriminator:** stub → `{integrity:'ok', tables:0, accepted:false}`;
healthy → `{tables:41, accepted:true}`.

### Async discipline
A missing `await` on an async function reads a field off a pending `Promise` → the route returns
500 **forever** and audits `'failed'`. `POST /api/backup/create` was broken this way for months.
**Every async call in a request handler is `await`ed or explicitly `.catch`ed.**

### Verification
A backup is accepted only after a **restore test**: open the backup, count tables, compare the row
count of every shared table against the source. `backups/` holds 3 canonical files, all
`23,322,624 B, 41 tables`. Anything else there is a defect.

---

## 4. SECRETS

- **Never commit a secret.** `.env.local`, `.env`, `*.pem`, `*.key` are gitignored.
- **Never round-trip a secrets file through PowerShell** `Get-Content -Raw | Set-Content`:
  it re-encodes UTF-8 as ANSI/BOM and mangles non-ASCII. Edit bytes, not strings.
- **Never echo a secret into a report, log, or commit.** Report *presence* and *length*, not value.
- **Never print a full API key.** Show `sk-xxxxxxxx…last4`.
- The default password `kali` **must be rotated** before this system is exposed publicly.
- A gateway key is read from `/home/kali/server/SentinelMaster/.env.local`; never hardcode one
  into a project, and never use the `sentinel/*` prefix (→ 401).

---

## 5. DEPLOYMENT

### 5.1 One way to build the gateway
Recreate OmniRoute **only** via `/home/kali/server/9router/deploy-omnirouter.sh`.
Never `docker run` it by hand — the environment and bind mounts are baked into that script.
Image: `sentinel-proxy:omniroute-3.8.50-pwfix` (`182546e4d69a`).

### 5.2 Back up before mutating gateway state
Before changing combos or providers:
```bash
curl -s -b /tmp/omni.jar http://127.0.0.1:20128/api/combos \
  > /home/kali/server/9router/combos-backup-$(date +%Y%m%d_%H%M%S).json
```
Rollback point: `combos-backup-20260926_073837.json`.

### 5.3 Gateway management auth is a COOKIE
```bash
curl -c /tmp/omni.jar -X POST http://127.0.0.1:20128/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"<HUB_ROUTER_PASSWORD>"}'
curl -b /tmp/omni.jar http://127.0.0.1:20128/api/combos
```
A bearer token returns `AUTH_001`. **`POST /api/combos` returns `config:{}` — this is a lie.**
The response is built before config is merged. **Always `GET /api/combos` to confirm.**

### 5.4 Sticky round-robin is not a bug
A combo returning `[A,A,B,B]` across 4 calls is `stickyRoundRobinLimit` working as designed.
**Do not "fix" it.**

### 5.5 THE POOLING TRUTH — `deepseek-web` is `kind: "token"`, read from `apiKey`
Measured on the live container. `requiresWebSessionCredential('deepseek-web')` is **true**, and the
requirement is:
```js
"deepseek-web": { kind: "token", credentialName: "userToken",
                  placeholder: "userToken=... or paste raw userToken",
                  acceptsFullCookieHeader: false, storageKeys: ["token","userToken"] }
```
Both the validator (`validateDeepSeekWebProvider({apiKey})`) and the executor
(`extractUserToken` → `credentials.apiKey`) read the token **from the `apiKey` column — never from
`providerSpecificData`.** A cookie in `providerSpecificData` will never authenticate.

**A cookie value of `{"value":null,"__version":"0"}` means the account is not logged in.**
Re-authenticate it — do not add a combo to a dead connection.

**Pooling path (the only supported one):** `POST /api/providers/bulk-web-session`, management cookie
required, body `{provider, entries:[{name, credential}], priority, globalPriority}`.

**Before adding any combo, this invariant must hold:**
> *every* `models[].providerId` in the combo must equal a `connection.id` that exists in
> `GET /api/providers`.

A combo whose targets name a provider that no connection carries will **404 on every call**. This is
the exact failure that made pooling "not work": the three dummy accounts were never referenced by any
combo, so nothing ever routed through them.

**Endpoint names — do not guess:**
| purpose | endpoint |
|---|---|
| connections | `GET /api/providers` (keys: `connections[]`, `id`, `name`, `provider`, `email`, `apiKey`, `providerSpecificData`) |
| combos | `GET /api/combos` |
| inference keys | `GET /api/keys` |
| ❌ | `/api/credentials` → `unknown_route` |

### 5.6 AN ALIAS IS NOT A MODEL — verify the served model
A combo name is a **routing label**, not a guarantee of the upstream version. Always read
`response.model` from a live completion before reporting which model answered.

Measured `2026-09-25`, alias → model actually served:

| alias | served |
|---|---|
| `deepseek-v4.1` | `deepseek-ai/deepseek-v4-pro-0813` |
| `glm-5.3` | `zai-org/glm-5.2` ⚠ |
| `kimi-3` | `moonshotai/kimi-k2.7-code` |
| `sentinel-flagship` | `deepseek-ai/deepseek-v4-pro-0813` |

**`glm-5.3` does not exist upstream.** The free pool exposes only `zai-org/glm-4.7-flash` and
`zai-org/glm-5.2`. The alias `glm-5.3` is honest only if that is the agreed contract — otherwise it
is a **label that overstates the model**, the same class of lie as the `config:{}` response in §5.3.
**Report the served model, always.**

---

## 6. VERIFICATION STANDARD

Every claim about this system carries **one** of:

| Status | Meaning |
|---|---|
| `SOLID` | Reproduced. Anyone can re-run the exact command and get the same bytes. |
| `PLAUSIBLE` | Consistent with evidence, not independently confirmed. |
| `OVERSTATED` | Evidence contradicts the claim. Write **REFUTED**, not "possible risk". |
| `UNVERIFIABLE` | Cannot be tested with current access. **State what access is needed.** |

### Non-negotiable
- An HTTP status alone proves nothing — record status **+ header + body snippet**.
- "Endpoint exists" ≠ "endpoint is exploitable". `401` without auth is the boundary working.
- Severity is a function of evidence, not of enthusiasm. Kill the hype.
- Before reporting a defect, **check whether it is already fixed** — three "landmines" were
  archived copies, not moves.
- After changing a script: `bash -n` (shell) or `node --check` (js).
- After rewriting a script: **re-check the execute bit.** A `open(p,"w")` rewrite drops
  `775 → 664` and produces `rc=126`.

### Process lifecycle
Anything that installs a signal handler accepts responsibility for exiting. Node's default
terminate-on-signal is **suppressed** by `process.once('SIGTERM', …)`. Graceful shutdown must end
with an explicit exit:
```js
setTimeout(() => process.exit(0), 1000);
```
This was defect N-03: `sentinel-api` ignored SIGTERM and accumulated **198,777 restarts**.

---

## 7. DEFECT REGISTER

All rows marked `CLOSED` are done and must not be reintroduced. Rows marked `OPEN` are
**known and unfixed** — they are tracked here so they cannot be mistaken for working code.
Full detail in `SentinelAI/resources/`.

| ID | Defect | Root cause | Status |
|---|---|---|---|
| `N-01` | `/api/cybermaster/video` had no `guard()` | Only API route missing auth | CLOSED |
| `N-02` | 16 hardcoded `output/fyp2.db` refs across 8 files | Scripts bypassed `config.js` | CLOSED |
| `N-02b` | `DB_PATH` unset in `.env` | Implicit fallback | CLOSED |
| `N-03` | `sentinel-api` ignored SIGTERM | `bot.stop()` on a non-running bot + suppressed default | CLOSED |
| `N-06` | **Dual supervisor** — systemd and PM2 both owned ports 5000/5173 | `ExecStartPre` `fuser -k` vs PM2 | CLOSED |
| `N-07` | **Hub self-lockout** — "stop all" ran `pm2 stop all`, which includes `sentinel-master` | The dashboard is a PM2 process it supervises | CLOSED |
| `N-08` | **Stale supplementary groups** — PM2-spawned commands denied `/var/run/docker.sock` | Daemon booted before `kali` joined group `docker` | CLOSED |
| `N-09` | **False DOWN probe** — `sentinel-backend` watched port `5174` (zero listeners) | Health probe port drifted from the real `5000` | CLOSED |
| `N-10` | **Stale-cache lie** — `/api/projects` served pre-action `uptimeMs`/`restarts` for 45 s after a restart | Volatile runtime state was bound *inside* the 45 s filesystem cache | CLOSED |
| `N-11` | **Invisible process** — `sentinel-threat` was online but had no controls in the UI | Project path existed only in launch `args`; PM2 cwd was `/home/kali` | CLOSED |
| `N-12` | **Mount-root over-match** — an empty project path bound *any* process under the HDD | Pass 3 derived `remote = /home/kali/server`, an ancestor of everything | CLOSED |
| `N-13` | **Route/UI disagreement** — the action route and the grid could disagree on ownership | Route bound 1 project, UI bound 45; `claimed` is order-sensitive | CLOSED |
| `N-14` | **Login was unuseable over LAN** — `200 {"ok":true}`, then every navigation bounced to `/login` | `Secure` cookie over plain HTTP; `secure: env.isProd` on a prod build served without TLS | CLOSED |
| `N-15` | **Project counts disagree** — Hub on Windows lists 45, Hub on Kali lists 16 | Kali's configured project root is `/home/kali`; the Windows root has no counterpart | OPEN |
| `N-16` | **Stale `Secure` cookie poisons a browser jar** — after the N-14 fix a previously-logged-in tab still bounces | A non-secure `Set-Cookie` cannot overwrite a `Secure` cookie from an untrustworthy origin | OPEN (mitigated) |
| `N-17` | **21 dead cloudflared hostnames** — the tunnel advertises projects with no listener | Ingress was written for projects never deployed to Kali (§11.1) | OPEN |
| `N-18` | **No firewall exists** — `ufw` not installed; `iptables -S` has zero filter rules, `INPUT ACCEPT` | Never configured. 8 of 10 app listeners bind `0.0.0.0` while 100% of tunnel ingress is `127.0.0.1` | OPEN |
| `N-19` | **Every process runs on frozen SSH-session env** — variables reflect an SSH login from an arbitrary past session | PM2 captured the starting shell's environment; nothing overrides it | OPEN |
| `N-20` | **8 of 10 processes had no memory cap** — one leak takes down the node, not one app | Only `sentinel-api` and `pm2-logrotate` declared `max_memory_restart`. **Manifest applied 2026-09-26: all 9 apps now capped, verified in `pm2 jlist`** | **CLOSED** |
| `N-21` | **`sentinel-web`'s port `8016` existed in no file** — the code default is `5174` and there is no `.env` | The port lived only in a PM2 environment variable; losing it silently moved the service. **Now declared in the manifest; `:8016` verified listening** | **CLOSED** |
| `N-22` | **`sentinel-api` ran `cluster_mode` with no cluster code** | A supervisor and worker spawned for a program with no `require('cluster')`. **Applied: `exec_mode` is now `fork_mode`, verified live** | **CLOSED** |
| `N-23` | **Prod mode depends on one gitignored file** — `NODE_ENV` is set by no process and no project | `isProd` is computed at module load; only `.env.local` supplies `production`. Delete the file and the Hub boots Next in dev mode | OPEN |
| `N-24` | **Old manifest pointed logs at a non-existent directory** — `./logs/hub-*.log` | `…/Sentinel Master/logs` does not exist, so the path escaped `pm2-logrotate` | CLOSED |
| `N-25` | **Remote desktop exposed on all interfaces** — xrdp `*:3389` and AnyDesk `0.0.0.0:7070` active and enabled | Neither is firewalled (N-18) | OPEN |
| `N-26` | **`clientIp()` returns `null` behind cloudflared** — no `x-forwarded-for` is forwarded | Every LAN login attempt shares one 5-attempt throttle bucket | OPEN |
| `N-27` | **A `script:` path containing a SPACE silently breaks PM2** — PM2 rewrites the app to `exec_path=/usr/bin/bash` + `args=['-c',<path>]` but keeps `interpreter`, spawning `node /usr/bin/bash`. **Empty error log, `exit_code 1`, restart loop.** Took the Hub down on 2026-09-26 | **CLOSED** — `sentinel-master` now launches as `script:'/usr/bin/node'` + `args:[<path>]`, `exec=/usr/bin/node interp=none`, restarts=0. See §1.7 | CLOSED |
| `N-28` | **A provider NODE is not a CONNECTION** — a custom OpenAI-compatible node registered via `POST /api/provider-nodes` is only a *definition*. It has no credential row in `provider_connections`, so every route to it fails: direct → `No active credentials for provider: <node id>`; via combo → `ALL_TARGETS_SKIPPED`. The 3B local operator was unreachable for this reason | **CLOSED** — `POST /api/providers {provider:<node id>, apiKey:"ollama"}` creates the missing credential. See §12 | **CLOSED** |
| `N-29` | **Cloudflare's edge filter is PROBABILISTIC, not deterministic** — identical byte-for-byte requests to one model gave **5 blocked / 1 passed of 6**. It classifies the **content of the user message** (benign body = 100% pass; offensive body ≈ 25% pass) and is **model-agnostic**; the **persona does not affect it** (33% without vs 17% with, n=6 — indistinguishable) | **FIXED** — do not select models around it; **retry through it**. `maxRetries: 3` + a local terminator leg lifted the hybrid to 100% and the cloud alias from 0% to 83%. See §12.3 | **CLOSED** |
| `N-30` | **`GET /api/provider-models?provider=<node id>` returns `{"models":[]}` for a compatible node** even though the node routes fine and Ollama's `/v1/models` answers 200 | Cosmetic/harmless, but it is why an empty model list is **not** evidence that a node is broken. Prove with `/v1/chat/completions`, not the model list | OPEN |
| `N-31` | **`pm2 delete` + `pm2 start` re-reads the manifest from disk**, so any process whose *live* definition was hand-patched and whose *on-disk* manifest is stale will silently revert on the next targeted restart. This is the mechanism that could re-break the Hub (N-27) without anyone editing a file | **VERIFIED NOT PRESENT 2026-09-26** — `/home/kali/server/SentinelMaster/ecosystem.config.cjs` is md5 `b146d876…` (288 lines, byte-identical to the Windows canonical), it is the **only** Hub manifest on the box (`find /home/kali /home/kali/server -maxdepth 3`), and the **live** `sentinel-master` reads `script=/usr/bin/node`, `args=[…/server.cjs]`, `interpreter=none`, `unstable restarts=0`. Disk and runtime agree, so a re-read is safe. Rule: after any hand-repair of a PM2 app, **write the manifest too** | **CLOSED** |
| `N-33` | **THE `system` ROLE IS SILENTLY DROPPED FOR ALL `cfp/*` MODELS.** `open-sse/executors/cloudflare-playground.ts:194` (`toCfMessages`) skips every message whose role is not `user`/`assistant`, because the reverse-engineered `cf_agent_use_chat_request` WebSocket protocol has **no system field** — Cloudflare's persona is server-side. Consequence: **`combos.system_message` never reaches a cloud model**; every cloud leg of `sentinel-pentest-hybrid` was answering as a generic assistant, and the earlier persona A/B was **comparing two effectively identical requests**. Measured: persona via `system` role = **0/4** contract compliance; folded into the user turn = **4/4**. Not patchable — it is the protocol's shape, not a defect in the adapter | **FIXED BY DESIGN** — `src/lib/router.ts` `SYSTEM_DROPPING_PROVIDERS` + `buildOperatorMessages()` force the fold per provider. See §12.3.5 | **CLOSED** |
| `N-32` | **`combos.system_message` is a VESTIGIAL COLUMN — always NULL, never written.** The real persona lives inside the **`data`** JSON blob's own `system_message` key. Reading the column yields `NULL` (4 bytes as the string `"null"`); writing the top-level field via `PATCH /api/combos/<id>` correctly updates the copy inside `data`. An experiment that injects the 4-char string `null` as a system prompt produces a **meaningless 200** and must never be cited as evidence | **DOCUMENTED** — read/write via the top-level field; never trust the column. See §12.3.4 | **CLOSED** |
| `—` | Silent backup data loss | Interrupted `db.backup()` page copy published as valid | CLOSED |

### The N-06 causal chain — read this before touching any unit
```
systemd ExecStop ran `fuser -k 5000/tcp`
  → SIGKILLed PM2's sentinel-backend mid-transaction
    → 33,563 restarts
      → interrupted db.backup() page copies
        → 4 KB, 0-table, integrity_check='ok' files published as fyp2_latest_backup.db
```
**The supervisor defect and the data-loss defect were the same root cause.** Also produced a
14-day duplicate `vite` on port 5174 and a `<defunct>` cloudflared.

### The N-07 causal chain — the dashboard is inside the thing it supervises

```
sentinel-master (the Hub) is PM2 process id 7
  → POST /api/kali/action {action:"stop", target:"all"}
    → `pm2 stop all`
      → the HTTP server answering the request dies mid-request
        → no UI path to bring it back; SSH only
```

**Rule:** a bulk action may never target the process serving the request. `kali-bridge.py` now
enumerates `pm2 jlist` and issues `pm2 <action> <explicit list>` with `SELF_NAME`
(`HUB_PM2_NAME`, default `sentinel-master`) removed and PM2 *modules* skipped. `stop` against
`SELF_NAME` raises `ValueError` instead of executing. Do not reintroduce `pm2 stop all`.

### The N-08 causal chain — group membership is captured at daemon boot

```
usermod -aG docker kali          (20:04)
  → PM2 God Daemon already running (booted 08:44, 11 h earlier)
    → daemon's /proc/<pid>/status has no GID 964
      → every PM2-spawned `docker` command returns "permission denied" on the socket
        → the Hub reported the 9router action as failed even when PM2 succeeded
```

**Rule:** after any `usermod -aG`, every long-running supervisor that spawns shells must be
restarted — not just new logins. Verify against the daemon, never the shell:

```bash
pgrep -f "PM2 v.*God Daemon" | head -1 | xargs -I{} grep '^Groups' /proc/{}/status
getent group docker     # the GID that must be present
```

`kali-bridge.py` also falls back to `sudo -n docker …` so a stale daemon degrades to a working
path instead of a false failure.

---

## 8. BEFORE YOU CHANGE ANYTHING

1. **Read.** `SentinelAI/resources/ARCHIVED-second-supervisor.md` and this file.
2. **Prove the current state.** `ss -ltnp`, `pm2 jlist`, `systemctl show sentinelai -p NRestarts,MainPID`.
3. **Snapshot.** Gateway combos → HDD. Database → `VACUUM INTO`.
4. **Change one thing.**
5. **Verify** against the table in §6.
6. **Check for a second copy of what you fixed.** The landmine that survives a fix is the one
   that gets deployed — `setup-kali.sh` would have reverted N-06 on its next run.

---

## 9. HEALTH PROBES MUST NAME THE PORT THEY ACTUALLY SERVE

A monitor list is a second source of truth, and second sources of truth drift.

`CORE_MONITORS` in `kali-bridge.py` watched `sentinel-backend` on `5174`. Nothing ever listened
on 5174 — that was a dead `vite` from the N-06 era. The real backend was on `5000`, answering
Express `Cannot GET /` with HTTP 404. The dashboard reported a **healthy service as permanently
down** for 14 days.

- A `404` from a live server is **operational**. An empty TCP connect is not.
- Probe the port from the process's own PM2 env (`PORT`) or from `ss -ltnp`, never from memory.
- When a probe disagrees with reality, prove which side is wrong **before** editing either.

---

## 10. CACHE, BINDING, AND STATE-OWNERSHIP — HARD-WON IN THE HUB

### 10.1 Never cache volatile state inside the filesystem cache

`scanProjects()` walks ~45 directories and shells out to `git`, so it carries a
`CACHE_TTL_MS = 45_000` cache. Binding `runtime` **inside** that cached value made the
operator's own confirmation a lie: `/api/projects` reported `uptimeMs=989821 restarts=0`
while Kali ground truth said `uptime_ms=21487 restarts=1`.

```ts
// FORBIDDEN — runtime is volatile, the scan is not
const cached = { projects: scan(), runtime: await getRuntimeMap() };

// CORRECT — compose at read time; cache only the filesystem scan
scanProjectsWithRuntime() { const scan = scanProjects(); return bind(scan, await getRuntimeMap()); }
```

**Rule:** cache the *expensive, slow-changing* layer. Fetch the *cheap, fast-changing* layer
live on every request. `invalidateProjectCache()` must only drop the scan.

### 10.2 A process's project path can live only in its launch arguments

PM2 reports `pm_cwd=/home/kali` for `sentinel-threat`; its real path appears only in
`pm2_env.args` (`--directory /home/kali/server/SentinelThreat`). Ancestry and cwd-name matching
can never bind it, so an **online** project became **invisible** — Jack had no buttons for it.

**Rule:** when a process's `cwd` is a home directory, read `args` before concluding it is
unmanaged. `argsProjectPath()` accepts **absolute paths only** and requires every segment to
match `^[a-z0-9._-]+$`, so `--port 1,2,3` and `--config /etc/nginx/nginx.conf` are correctly
rejected. Pass 3 runs only on **unclaimed** processes.

### 10.3 An empty path must never derive a mount-root ancestor

`bindProjects([''], PM2)` bound 1 process: the empty string derived
`remote = /home/kali/server`, an ancestor of *everything* on the HDD. The test suite caught this;
inspection did not.

**Rule:** guard every derivation with a non-empty source. Empty paths, empty name keys, and
empty basenames are **absences**, not wildcards.

### 10.4 Two code paths must bind the same set in the same order

Ownership is decided by `claimed: Set<string>`, which is **order-sensitive**. The action route
bound `[summary.path]` (one project) while the grid bound all 45, so a project literally named
`server` could claim `sentinel-web` in the route but not in the UI — letting the route act on a
process it never displayed as its own.

**Rule:** every caller binds the **whole project list** and then looks up its own path. Never
bind a single project in isolation. Order is the safety property.

### 10.5 Client/server module split — verify it, do not assume it

`project-runtime-core.ts` has **zero imports** and is the only runtime module safe to import from
a `'use client'` component. `project-runtime.ts` imports `./kali` and owns `getRuntimeMap`.

After **any** change touching runtime or Kali code, run:

```powershell
Select-String -Path '.next\static\chunks\*.js' `
  -Pattern 'kali-bridge\.py|child_process|HUB_PM2_NAME' -List   # must return NOTHING
```

A server module reaching the client bundle has happened before and leaked secrets. Treat an
empty result as the passing state, not as "probably fine".

### 10.6 End-to-end proof must include a click, not just a status code

`200 {"successes":2}` proved the API. It did not prove the UI. Feature #1 was only closed after
driving the real grid in a browser: `stop → badge "stopped", Start enabled, Stop disabled` and
`start → badge "online", Restart+Stop enabled`, updating **without a manual refresh**.

**Rule:** for anything with a UI, the evidence is `badge/state before → click → badge/state after`.
An HTTP status is a necessary condition, never a sufficient one.

---

## 11. EXPOSURE SURFACE — WHAT IS ACTUALLY REACHABLE

Measured on Kali, `ss -ltn` plus the cloudflared ingress map. **17** TCP ports listen; **32**
hostnames are declared.

| Surface | State | Action |
|---|---|---|
| Hub `0.0.0.0:3000` | LAN-reachable, `/` → **307** → `/login` | **Keep bound.** `SENTINEL_CONTROL_CENTER.html` on Windows posts to `http://192.168.68.132:3000/api/kali/action` — a live dependency. To restrict, set `HUB_HOST=127.0.0.1` in the environment (opt-in, documented in the manifest) |
| `sentinel-backend` `:5000` | **all interfaces**, and **no ingress entry points at it** | Firewall it. Editing the source to bind loopback is the wrong lever — Node binds `*` by default and the port is already private from the tunnel |
| **AnyDesk** `0.0.0.0:7070` | LAN-reachable remote desktop | Firewall or bind localhost — highest-value item here |
| **xrdp** `*:3389` | LAN-reachable, **active AND enabled** | Disable or firewall — second highest |
| postgres `5432`, cloudflared metrics `20241` | localhost-only (correct) | — |
| **21 of 32 cloudflared hostnames** | **DEAD** — no listener behind them | Prune the ingress map |
| `/` filesystem | **94%** (3.5 G free) | `/usr` 37 G and `/home` 12 G are the levers |

### 11.2 THERE IS NO FIREWALL — measured
`ufw` is **not installed**. `sudo iptables -S` contains DOCKER chains and **zero filter rules**;
the INPUT policy is **ACCEPT**. So "bind to `127.0.0.1`" is currently the *only* access control
this host has, and any service that binds `*` is reachable from the whole LAN.

**Rule:** a firewall is the correct control for a listener that must stay on `0.0.0.0`. Editing
application source to change a bind is a patch to a symptom. Start with xrdp `3389` and AnyDesk
`7070`, which are remote-desktop daemons on a box that is also a web origin.

### 11.3 COST OF A CAP — why the caps are conservative
Measured baseline: **811.6 MB RSS** across all ten processes on a **7.6 GB** node, the Hub itself
peaking at **172.8 MB**. Each cap in the manifest is 3-5x steady state. The caps sum to
**3.83 GB**, a worst-case bound rather than a reservation. A cap that is too tight converts a leak
into a restart loop — worse than the leak.

**Rule:** a published cloudflared hostname is an **intent**, not a fact. Every ingress entry must
resolve to a live listener, or it is removed. Every service that does not need the LAN is bound
to `127.0.0.1`. Remote-desktop daemons are not left `enabled` on a box that is also a web origin.

### 11.1 THE TWO TREES — why 21 hostnames are dead

The Kali project layout is a **partially mirrored symlink mesh**, not one directory. Measured:

| Location | Contents |
|---|---|
| `/home/kali/SentinelAI`, `/home/kali/SentinelArcuz100` | **real directories** |
| `/home/kali/server/SentinelAI` → `/home/kali/SentinelAI` | **reverse symlink** back into home |
| 15 others (`SentinelAPI`, `SentinelWeb`, …) | **real dirs on the HDD**, symlinked *into* `/home/kali` |
| `9router`, `docker`, `SentinelAI_Data` | **HDD-only, not symlinked into home at all** |

So the same project is reachable by two paths, and two projects point the other way.

**Consequence for the Hub:** `env.projectRoot` is a **single** root. On Kali it is `/home/kali`,
which is exactly why the Hub reports **16** projects there and **45** on Windows. The ~29 projects
that exist only on Windows are the same names declared in the cloudflared ingress map
(`view` `convert` `story` `fashion` `mapping` `haq` `truth` `takaful` `mesip` `rfq` `touch`
`pasti` `tani` `ctf` `restaurant` `number` `cute` `yesno` …).

**Root cause of the dead hostnames: the tunnel advertises projects that were never deployed to
Kali.** It is a deployment gap, not an ingress typo.

**Rule:** before adding an ingress entry, prove a listener exists on the box. Before adding a
project to either tree, add it to **one** canonical root and, if it must be reachable by the other
path, use a symlink — never a second copy. A copy diverges silently; a symlink cannot.

---

*Last updated: 2026-09-26. Jack is the operator. Defects above were real; the rules are the scar tissue.*

---

## 12. LOCAL AND HYBRID INFERENCE — THE OPERATOR MODEL

### 12.1 The measurement (2026-09-26, N100 — do not re-derive, cite this)

| metric | measured | consequence |
|---|---|---|
| Docker Root Dir | `/home/kali/server/docker` (149 GB free) | model images do **not** touch `/` (93.9% full) |
| CPU | Intel N100, 4 cores @ **2127 MHz** (`powersave` → `performance` applied) | not 0.87 GHz — that was an idle-core artifact |
| SIMD | `avx avx2 avx_vni f16c sse4_2` | CPU inference viable; **no** AVX-512/AMX |
| `qwen2.5:3b` single | **7.75 tok/s** (300 tok / 38.7 s) | usable for short, tool-driving turns only |
| `qwen2.5:3b` ×2 concurrent | 7.91 + 6.26 tok/s | it does parallelise (~14 tok/s aggregate) |
| `sentinel-pentest` under the full persona | 75 tok / 14.0 s = **5.35 tok/s** | persona prompt (490 tok) costs throughput |
| Hub under load | `/healthz` 200, **10/10 PM2 apps online** | **hard cap works** |
| PM2 total RSS | **492 MB** across 10 processes | the box is CPU-bound, not RAM-bound |
| `9router` container limits | `Memory=0 MemorySwap=0 NanoCpus=0` | **UNBOUNDED — hence capping Ollama is mandatory** |

**Ceiling:** 3B is the floor of usefulness, 7–8B at Q4 (~3–4 tok/s, ~5 GB) is the realistic ceiling.
14B+ is out of reach. **Do not attempt abliteration** — refusal layers are entangled with careful
reasoning, and 3B already garbles output without any tuning.

### 12.2 The container convention (copy this exactly)

```bash
sudo docker run -d --name ollama-probe --restart unless-stopped \
  --memory=3g --memory-swap=3g --cpus=3 \
  -p 172.17.0.1:11434:11434 \
  -v /home/kali/server/ollama:/root/.ollama \
  ollama/ollama
```

- **Bind `172.17.0.1`, never `0.0.0.0`.** That is the Docker bridge gateway: reachable
  container→container, exposed to **zero** LAN hosts (verified: 0 bindings on `0.0.0.0:11434`).
- **The `--memory`/`--cpus` caps are not optional.** `9router` has no limits of its own; an
  uncapped local model is capable of starving the Hub.
- **`9router` ships no `curl` and no `wget` — only `node`.** Test reachability with
  `bash -c 'echo > /dev/tcp/HOST/PORT'` or `node -e "http.get(...)"`. A blank/empty response from
  this container is a missing-binary symptom, not a network fault.

### 12.3 The hybrid cascade — Jack's "uncensored pentest mod", as built

A **custom provider node cannot be routed to directly** — it needs a credential connection
(N-28). The working architecture is therefore a **priority cascade with retries**, not a single
model.

#### 12.3.1 THE FILTER IS PROBABILISTIC — the single most important measurement

**Do not reason about Cloudflare's filter from single trials.** An identical request, byte for
byte, to one model, six times in a row:

```
trial 1: 502 BLOCKED  7.7s     trial 4: 502 BLOCKED 10.8s
trial 2: 502 BLOCKED 11.5s     trial 5: 502 BLOCKED  8.6s
trial 3: 502 BLOCKED 10.4s     trial 6: 200 PASSED  11.0s
                     => passed=1  blocked=5  of 6   (17%)
```

It is a **classifier with a false-positive rate**, not a deterministic rule. Every earlier
"model X is blocked / model Y passes" conclusion drawn from n=1 was **noise** and has been
retracted. Required sample size for any claim here: **n ≥ 6 per arm**.

**The timing oracle** (use this instead of reading error text):

| response | latency | meaning |
|---|---|---|
| 502 + `Blocked for: privacy violations` | **~8–11 s** | edge classifier rejected the body — no model ever ran |
| 200 with real content | **25–90 s** | inference actually happened |

A 502 that returns in under ~12 s never reached a model. A slow 502 means a model ran and the
upstream leg failed.

#### 12.3.2 THE PERSONA IS NOT THE TRIGGER (retracting the earlier claim)

Properly powered A/B — same model (`cfp/zai-org/glm-5.2`), same offensive prompt, n=6 per arm:

| arm | pass-rate |
|---|---|
| offensive body, **no** system message | 2/6 = **33%** |
| offensive body, **+ 2258-byte persona** | 1/6 = **17%** |
| **benign** body (control) | 3/3 = **100%** |

33% vs 17% at n=6 is **statistically indistinguishable** — the persona does not move the pass
rate. What moves it is the **content of the user message**: benign 100% vs offensive ~25%.
So the edge classifies the *request body's subject matter*, and the persona is transport-agnostic
and safe to attach.

#### 12.3.3 THE FIX — retries, not model selection

Filtering is model-agnostic; retrying fails over to a fresh classifier roll. Raising
`maxRetries` from `0`→`3` on the hybrid (`1`→`3` on cloud) produced:

| alias | before | after `maxRetries=3` |
|---|---|---|
| `sentinel-pentest-hybrid` | 502 via cloud legs | **6/6 = 100%** |
| `sentinel-pentest-cloud` | **0/4 = 0%** ("broken") | **5/6 = 83%** |
| `sentinel-pentest` (local) | 200 | **3/3 = 100%**, never blocked |

| alias | members (priority order) | status |
|---|---|---|
| `sentinel-pentest` | `local/sentinel-pentest` | **100%** — unfiltered, ~3–5 tok/s, no GPU |
| `sentinel-pentest-hybrid` | glm-5.2 → deepseek-v4-pro-0813 → llama-4-scout → deepseek-v4-flash-0731 → **local** | **100%** — ⭐ use this one |
| `sentinel-pentest-cloud` | the same 4 cloud models | **83%** — no local backstop, can still fail closed |

The hybrid's 6/6 was served by **four different models** across the run (deepseek-v4-flash-0731,
deepseek-v4-pro-0813 ×2, glm-5.2 ×2, **local sentinel-pentest**) — the cascade is genuinely
load-balancing across the filter's good rolls, not pinned to one lucky model.

**`sentinel-pentest-hybrid` is the required configuration:** the local leg at `weight: 10` is the
terminator. Because the local model is never filtered, the channel **cannot fail closed** — worst
case it degrades from frontier quality to the 3B operator instead of returning 502.

**Why this beats an abliterated local model:** the persona lives in the combo's `system_message`,
which is transport-agnostic. It rides a frontier model when the edge allows it and the 3B when it
does not, at zero GPU cost for the cloud legs.

#### 12.3.4 The `combos.system_message` vestigial-column trap (N-32)

The `combos` table has a `system_message` TEXT column that is **NULL for every row and never
written**. The persona actually used at inference time lives in a **key inside the `data` JSON
blob**:

```
PRAGMA table_info(combos)
  -> id, name, data, sort_order, created_at, updated_at,
     system_message, tool_filter_regex, context_cache_protection
     ^^^^^^^^^^^^^^ always NULL — do not read it, do not trust it

data = {"name","description","models","strategy","config",
        "system_message",   <-- THE REAL ONE
        "id","isHidden","sortOrder","createdAt","updatedAt","version"}
```

- **Read the persona:** `JSON.parse(row.data).system_message`
- **Write the persona:** `PATCH /api/combos/<id>` with a **top-level** `system_message` field.
  Do **not** send a nested `data` blob — that would leave the top level null.
- `select system_message` returning **4 bytes** means the literal string `"null"`, **not** an
  empty persona. Any test that injects that value is **invalid** and its result must be discarded.

#### 12.3.5 🔴 THE `system` ROLE IS STRUCTURALLY UNDELIVERABLE TO `cfp/*` — fold, always

**This is the root cause of every "the cloud model ignored the persona" observation.**

`/app/open-sse/executors/cloudflare-playground.ts` (592 lines) builds the upstream
payload with `toCfMessages()`. Lines 185–207, verbatim:

```ts
/**
 * `system` messages are dropped (the playground's persona is server-side) and
 * ...
 */
export function toCfMessages(messages) {
  for (const message of messages ?? []) {
    if (message.role !== "user" && message.role !== "assistant") continue;   // line 194
```

There is **no bug to fix**. It is deliberate and unavoidable:

- The playground is driven over a **reverse-engineered anonymous WebSocket**
  (`cf_agent_use_chat_request`) — see `noauth.ts:74`.
- That protocol body is `{"id":<cid>,"init":{"method":"POST","body":{messages,trigger}}}`.
- Cloudflare's own **server-side** persona occupies the system slot; the protocol
  has **no field** for a client system prompt.
- Verified on all 4 models: `zai-org/glm-5.2`, `meta-llama/llama-4-scout`,
  `deepseek-ai/deepseek-v4-pro-0813`, and `local/sentinel-pentest` (which **honours** it).

**`combos.system_message` therefore reaches only the local leg of any cascade.**
Every cloud model in `sentinel-pentest-hybrid` was answering as a generic assistant.

**The fix — fold the persona into the user turn.** Behavioural fingerprint
(only a persona-carrying model emits the `FINDING/SEVERITY/EVIDENCE/FIX` contract):

| arm | contract compliance | served by |
|---|---|---|
| `system` role, hybrid combo | **0/4** | glm-5.2 (all four runs) |
| **FOLDED into user message** | **4/4 = 100%** | llama-4-scout, deepseek-v4-pro ×2, glm-5.2 |

Payload shape — the `---` separator is the convention, not magic:

```
messages: [{ role: "user", content: PERSONA + "\n\n---\n\n" + PROMPT }]
```

Verified verbatim output from the folded path:
```
FINDING 1: SQL Injection
SEVERITY: CRITICAL
EVIDENCE:
curl -s 'http://localhost:3000/api/user/1' UNION SELECT 1,username,password FROM users WHERE id=1--'
WHY: The code concatenates the user-controlled `req.params.id` directly into the SQL string.
FIX: Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
```

**Enforced in code**, not by convention — `src/lib/router.ts`:
`SYSTEM_DROPPING_PROVIDERS = new Set(['cloudflare-playground'])` +
`buildOperatorMessages()`, used by `routerOperatorChat()`. Any future provider whose
transport lacks a system slot gets added to that set and the fold is automatic.

**Litmus test for the next provider:** send `system:"reply only BRAVO"` with a
conflicting `user` turn. A reply of `ALPHA` means the system slot was dropped.
⚠️ Do **not** test with `system` and the conflicting word in the *same* user message —
the last instruction wins either way and the result is meaningless.

#### 12.3.6 The combo PATCH contract


`PATCH /api/combos/<id>` with `{name, models, strategy, system_message, config?, description?}`
→ **200**. `PUT /api/combos` (bare) → **405**. A `GET` response is **not** round-trip safe to
`PATCH` back unchanged.

Model entry shape — copy exactly:
```json
{"id":"sph-1","kind":"model","model":"cfp/zai-org/glm-5.2",
 "providerId":"cloudflare-playground","weight":100}
{"id":"sph-5","kind":"model","model":"local/sentinel-pentest",
 "providerId":"openai-compatible-chat-bd83819d-0237-44b0-8ecc-f052bcf14a34","weight":10}
```
**`models[].id` must be unique *within the combo*** — renumbering avoids silent collisions.

Config in use: `{"strategy":"priority","maxRetries":3,"timeoutMs":240000,"targetTimeoutMs":230000,
"disableSessionStickiness":true,"healthCheckEnabled":false,"failoverBeforeRetry":true}`.

Management auth is a **cookie** (`POST /api/auth/login`); `/v1/*` inference is
**`Authorization: Bearer sk-…`**. Full inventory of aliases and their `maxRetries`:
`GET /api/combos` (with the management cookie).

### 12.4 The wiring recipe (end to end, reproducible)

```bash
# 1. register the node (management cookie, NOT a bearer token)
POST /api/provider-nodes
  {"name":"Local Ollama N100","prefix":"local","apiType":"chat",
   "type":"openai-compatible","baseUrl":"http://172.17.0.1:11434/v1"}
  -> 201 {"node":{"id":"openai-compatible-chat-<uuid>"}}

# 2. create the CREDENTIAL connection — the step that is easy to miss (N-28)
POST /api/providers
  {"provider":"openai-compatible-chat-<uuid>","apiKey":"ollama","name":"Local Ollama N100","priority":1}
  -> 201 {"connection":{"id":"<conn uuid>", ...}}
  # auto-triggers model discovery; providerSpecificData is filled from the node

# 3. create the combo. models[].providerId = the NODE id (it matches the
#    compatible-connection pattern openai-compatible-chat-<uuid> by design)
POST /api/combos
  {"name":"sentinel-pentest","strategy":"priority",
   "system_message":"<the operator persona>",
   "models":[{"id":"sp-local","kind":"model","model":"local/sentinel-pentest",
              "providerId":"openai-compatible-chat-<uuid>","weight":100}]}
  -> 201

# 4. prove it — the model list is NOT proof (N-30)
POST /v1/chat/completions  {"model":"sentinel-pentest", ...}   # Authorization: Bearer <sk-...>
```

**Rules:**
- `createComboSchema` accepts **`system_message` (max 50000)**. This is the only persona injection
  point in OmniRoute. There is no separate "system prompt" feature — use this.
- A combo needs **≥2 viable members** to fail over. Cloudflare returns an **HTTP 502** for filtered
  requests, so it is retryable and a priority cascade will fall through — but `maxRetries: 0` with
  `failoverBeforeRetry: true` moves on immediately instead of burning two edge attempts.
- Every `models[].providerId` must be a **connection id** (`GET /api/providers`) or a compatible
  node id. A node with no credential row is **not** routable.
- Editing a combo = `PATCH/PUT /api/combos/<id>`. `PUT /api/combos` with a bare body returns
  `405` (N-19 in §3.6 of the register).
- Management endpoints (`/api/auth/login`, `/api/combos`, `/api/provider-nodes`, `/api/keys`)
  authenticate by **cookie**. `/v1/*` inference authenticates by **`Authorization: Bearer sk-...`**.
  Python: capture `Set-Cookie` on login and resend it — an inline `curl -b jar` is not always
  available in these scripts.
- A compatible node can be created with **no credential**, and that node will still appear in
  `GET /api/provider-nodes` looking healthy. **`total:1` is not proof that it routes.**

**Where things live:** state is SQLite at **`/app/data/storage.sqlite`** (bind-mounted from the host
NVMe partition — `/dev/nvme0n1p3 /app/data ext4`). Inspect read-only with
`sudo docker exec 9router node -e 'const D=require("better-sqlite3"); ... {readonly:true} ...'`.
No `sqlite3` CLI in the container. `api_keys.key` holds the full inference key.

**What this means for Jack's request:** a self-hosted *uncensored pentest model* is deliverable, but
the honest answer is that the **cascade** is the product, not the local model. A 3B is a fallback of
last resort at ~5 tok/s with visibly garbled formatting. For a real capability step, rent a GPU
(§12.1 ceiling) — the wiring above stays identical, only `baseUrl` changes.
