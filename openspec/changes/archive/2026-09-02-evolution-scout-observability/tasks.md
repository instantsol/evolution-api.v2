## 1. Prerequisites

- [x] 1.1 Set `enableRecentMessageCache: true` in the socket config (`whatsapp.baileys.service.ts`, `socketConfig`) so `sock.messageRetryManager` is populated instead of `null`
- [x] 1.2 Patch the vendored `instantsol/Baileys` fork's `sendRetryRequest` (`Socket/messages-recv.js`) to emit an event at the `markRetryFailed` branch — patched `/usr/local/src/Baileys/lib/Socket/messages-recv.js` (working tree only, not committed — Pedro reviews/commits/pushes) and its `Types/Events.d.ts`. Confirmed via `Utils/event-buffer.js` that non-bufferable custom events pass straight through `ev.emit` to `sock.ev.process()`, so this reaches evolution-api.v2's `eventHandler()` the same way `connection.update`/`messaging-history.set` already do — no other Baileys-side wiring needed.
- [x] 1.3 Bump this repo's `baileys` dependency once the fork patch (1.2) is tagged/released — done: Pedro committed+pushed to `instantsol/Baileys@master` (`81c5edb`), reinstalled via `rm -rf node_modules/baileys && npm install baileys`. Verified the real event/type are present in the installed copy (not just the earlier local stopgap), lockfile now pins the exact commit SHA (previously unpinned), and `tsc`/`eslint`/`npm run build` all pass against it. `npm install` also normalized `package.json`'s dependency string from `git+https://...` to `github:instantsol/Baileys` (npm's own formatting, same target, harmless).
- [x] 1.4 Add `MESSAGING_HISTORY_SET` to the `webhookEvents` allowlist in `src/validate/instance.schema.ts` (currently defined in the `Events` enum but not selectable by instances) — added to all four transport allowlists (webhook/rabbitmq/nats/sqs) for consistency

## 2. Retry-stats observability (RF01–RF02)

- [x] 2.1 Add a defensive read of `sock.messageRetryManager.statistics` (five counters), returning an "unavailable" marker when the manager is `null` — `getRetryManagerStats()`
- [x] 2.2 Attach the statistics snapshot to the `CONNECTION_UPDATE` webhook payload on `connection: 'close'`, alongside existing `statusCode`/`reason`/`errorMessage`/`disconnectDate` fields — added as `retryStats` in `disconnectDetails`, covers both the reconnecting and permanent-disconnect branches
- [x] 2.3 Confirm the disconnect payload still degrades cleanly (statistics omitted/marked unavailable, rest of payload unaffected) when `messageRetryManager` is null — `getRetryManagerStats()` returns `{ available: false }` instead of throwing/omitting

## 3. Periodic stats webhook (RF03)

- [x] 3.1 Add `SCOUT_RETRY_STATS_INTERVAL` env var (default 600s) to the config system, following the existing env-config pattern — `ScoutRetryStats`/`SCOUT_RETRY_STATS` in `env.config.ts`
- [x] 3.2 Implement a per-instance timer that emits a `CONNECTION_UPDATE` webhook carrying the live statistics snapshot + current connection state, independent of `connection.update` events — `startRetryStatsTimer()`, started once in `createClient`, survives reconnects
- [x] 3.3 Ensure the timer's emission is non-blocking with respect to socket event/message processing — fire-and-forget `sendDataWebhook(...).catch(...)` inside the interval callback
- [x] 3.4 Verify the periodic payload is discriminable from a real connection-state-change payload by downstream consumers (document the discriminator field/value used) — discriminator is `snapshotType: 'periodic'` on the `CONNECTION_UPDATE` payload; absent on real state-change payloads

## 4. Connection open/duration enrichment (RF04)

- [x] 4.1 Record the timestamp on `connection.update` with `connection: 'open'`, per instance — `this.lastOpenAt`
- [x] 4.2 Forward the `open` state via `CONNECTION_UPDATE` — already implemented prior to this change (the `open` branch already calls `sendDataWebhook(Events.CONNECTION_UPDATE, ...)`); the original spec's "not currently propagated" premise, inherited from the PRD, was about scout-events not *recording* it, not evolution-api not *emitting* it. No code change needed here.
- [x] 4.3 Include the prior session's recorded `open` timestamp in the subsequent `close` payload — `lastOpenAt` added to `disconnectDetails`

## 5. Manual recovery endpoint (RF05)

- [x] 5.1 Add a `/kwik/` endpoint (controller/service/route, following the existing `kwik.controller.ts`/`kwik.service.ts`/`kwik.router.ts` pattern) accepting instance + `remoteJid` + `count` — `POST /kwik/fetchMessageHistory`. Note: `kwik.service.ts` turned out to be dead/commented-out legacy code, not used by any live `/kwik/` route (router calls the controller directly) — followed the actual pattern, not the file name.
- [x] 5.2 Resolve the recovery anchor (oldest known message key + timestamp) reusing the existing `findMessages` pattern — same `key: { path: ['remoteJid'], equals }` filter shape, ordered by `messageTimestamp asc`, `take: 1`
- [x] 5.3 Call `sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)` and return the `peerDataRequestSessionId`
- [x] 5.4 Handle and surface errors for unauthenticated instance / unresolvable anchor with appropriate status codes — missing `remoteJid`, instance not found, non-Baileys integration, not connected, no known messages, and the `fetchMessageHistory` call itself all return `{status:'error', message}`, mapped to 400 by the router

## 6. History-sync propagation (RF06)

- [x] 6.1 Listen for Baileys' `messaging-history.set` event — already wired to `messageHandle['messaging-history.set']`; extended it rather than adding a new listener
- [x] 6.2 Build and emit a `MESSAGING_HISTORY_SET` webhook with `syncType`, `peerDataRequestSessionId`, message count, `isLatest`, `progress` (depends on 1.4 for subscribability)

## 7. Automatic reconciliation on failed retries (RF07)

- [x] 7.1 Listen for the new fork event from task 1.2 (`message-retry.failed`) and extract `remoteJid` from `msgKey` — `handleMessageRetryFailed()`, wired in `eventHandler()`
- [x] 7.2 When `remoteJid` is available, trigger a single `fetchMessageHistory` reconciliation for that conversation (reusing the anchor-resolution logic from 5.2 where applicable) — same oldest-message anchor query as the manual endpoint, default count 50
- [x] 7.3 Emit a Scout-facing event correlating the failure, `remoteJid`, and the reconciliation's `peerDataRequestSessionId` — new `MESSAGE_RETRY_FAILED` event (`Events` enum + all four transport allowlists), payload includes `failedMessageId`/`remoteJid`/`reconciliation.peerDataRequestSessionId`
- [x] 7.4 When `remoteJid` cannot be determined, emit only the failure signal — do not attempt reconciliation — early-return branch emits with `remoteJid: null, reconciliation: null`
- [x] 7.5 Confirm reconciliation is single-shot: no automatic retry/loop if the same conversation fails again — the handler makes exactly one `fetchMessageHistory` call per invocation with no retry logic around it; `markRetryFailed` itself only fires once per message exhaustion

## 8. Validation

- [x] 8.1 Manually verify against a test instance: disconnect payload carries stats snapshot + open timestamp
- [x] 8.2 Manually verify periodic webhook fires at the configured interval and is env-configurable
- [x] 8.3 Manually verify the `/kwik/` recovery endpoint end-to-end (trigger → `messaging-history.set` → correlation) — verified against the same live instance. `POST /kwik/fetchMessageHistory {remoteJid, count:20}` returned `peerDataRequestSessionId: "3EB08F952632698ED9A29F"`; a temporary capture on the `messaging-history.set` handler (reverted after) recorded the resulting `MESSAGING_HISTORY_SET` payload ~10s later with the **exact same** `peerDataRequestSessionId`, `syncType: 6` (= `ON_DEMAND` in Baileys' proto enum — confirms it was our triggered request, not a background sync), and `messageCount: 20` matching the requested count exactly.
- [x] 8.4 Manually verify RF07 end-to-end once the fork patch (1.2/1.3) is deployed: induce a retry-exhaustion path and confirm the reconciliation event fires with correct `remoteJid` — verified against the live `npm run dev:server` process (not a container), instance `isacr00002_5521975669305`, via a temporary debug route that synthetically emitted `message-retry.failed` (avoided genuinely corrupting a real session, which risks real message loss). All three paths confirmed for real: (1) `remoteJid` with known history → real `sock.fetchMessageHistory` call → real `peerDataRequestSessionId` (`3EB0E4696C29864DE25183`) back from WhatsApp; (2) `remoteJid` with no known messages → `reconciliation: null`, no crash; (3) no `remoteJid` at all → `remoteJid: null, reconciliation: null` alert-only fallback. Debug route + temporary return values fully reverted afterward (confirmed 404 post-revert, `tsc`/`eslint` clean, server unaffected).
- [x] 8.5 Confirm no regression in existing `CONNECTION_UPDATE` consumers (scout-events) given the periodic-webhook reuse decision
