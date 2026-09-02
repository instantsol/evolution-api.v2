## Context

evolution-api wraps Baileys (WhatsApp Web protocol) with REST + webhooks and multi-instance session management. Baileys already emits rich internal signals — connection state transitions, per-message retry statistics, history-sync results — but today only the `disconnect` transition is captured and forwarded, via the `CONNECTION_UPDATE` webhook, to the downstream Scout stack (scout-events → kwikapi). Everything else is discarded.

This repo is Kwik's internal fork of evolution-api, built on a vendored, internally-patched fork of Baileys (`instantsol/Baileys`, pinned via `git+https://` dependency in `package.json`, currently `7.0.0-rc.9`-based). Neither fork is intended to go upstream to the respective open-source projects — there is no external, unknown consumer ecosystem whose contract needs protecting, only Kwik's own downstream services. This materially changes some trade-offs versus a typical OSS library (see Decisions below).

Constraints:
- No DB schema lives in this repo; all new persistence is owned by kwikapi (separate change). This repo only reads Baileys internals and shapes/emits webhook payloads.
- Webhook payload changes must not break scout-events' current parsing of `CONNECTION_UPDATE` on disconnect (additive fields only, except the one accepted reuse below).
- Message/event processing on the socket must never be blocked by observability work (periodic webhook emission, reconciliation dispatch).
- `sock.messageRetryManager` is `null` unless the socket is created with `enableRecentMessageCache: true` — not currently set in `whatsapp.baileys.service.ts`.

## Goals / Non-Goals

**Goals:**
- Make Baileys' retry-manager statistics and connection-duration signals observable via webhook, with graceful degradation when a signal is unavailable.
- Provide a per-conversation manual message-recovery trigger (`fetchMessageHistory`) and propagate its async result.
- Automatically attempt one reconciliation when a message's decrypt retries are exhausted, and surface enough correlation data (`remoteJid`, `peerDataRequestSessionId`) for the Scout stack to close the loop or alert.

**Non-Goals:**
- Changing the `440 connectionReplaced` auto-reconnect behavior (root cause of the original incident already fixed at the infra level on 2026-08-21; this is a deliberate, separate future decision).
- Any DB schema, aggregation, alerting, or dashboard work (kwikapi/scout-events changes).
- Account-wide recovery sweeps or looped/backoff reconciliation — WhatsApp's history-sync mechanism has rate limits; this phase is single-shot and per-conversation only.
- Active alert delivery (WhatsApp/email) — out of scope until the dashboard phase.

## Decisions

**Reuse `CONNECTION_UPDATE` for the periodic stats webhook, with a discriminator, instead of a new `RETRY_STATS` event type.**
Normally, overloading an existing webhook event's meaning is risky: any instance already subscribed to `CONNECTION_UPDATE` would start receiving an unrelated periodic payload it never opted into, since evolution-api's webhook model treats event *type* as the unit of subscription (`webhookEvents` allowlist in `instance.schema.ts`, checked against the `Events` enum in `wa.types.ts`). For a generic multi-tenant OSS-adjacent product this would be a real regression. Here it isn't: this fork never goes upstream, and the only consumers of `CONNECTION_UPDATE` are Kwik's own downstream services, which this same initiative is updating in lockstep. The alternative (a new `RETRY_STATS` entry in `Events` + `webhookEvents` schema) was considered and rejected purely to avoid the extra wiring for a benefit (isolation from unknown consumers) that doesn't apply here.

**Report retry-manager stats as an instantaneous read, not an accumulated series.** Baileys' counters live on the socket and reset to zero on every reconnect (`makeWASocket` call). evolution-api reports whatever the counters say at read time; turning that into a proper cumulative time series (handling the resets) is scout-events' job, not this repo's.

**Single-shot reconciliation, no loop/backoff.** `fetchMessageHistory` triggers a real request against WhatsApp's servers and is subject to their own rate limits. Retrying automatically on failure risks amplifying exactly the kind of duplicate/thrash pattern that caused the original `440` incident. One attempt, then defer to the alert path.

**RF07 requires a fork patch, tracked as its own prerequisite, not app-level defensiveness.** Investigation during design confirmed `remoteJid` is available in-scope wherever `markRetryFailed` is called (`msgKey.remoteJid` in `sendRetryRequest`, `Socket/messages-recv.js`) — this was originally flagged as a data-availability risk in the source spec, but isn't one. The actual blocker is that Baileys emits no event at that call site at all today. Fixing that lives in the vendored `instantsol/Baileys` repo, not here, and gates RF07 specifically (RF01–RF06 don't depend on it).

**Anchor resolution for `fetchMessageHistory` reuses the existing `findMessages` pattern** (oldest known message + its key/timestamp for a conversation) rather than introducing new logic, keeping the recovery endpoint consistent with how message history is already queried elsewhere in this codebase.

## Risks / Trade-offs

- **`messageRetryManager` is `null` today** (`enableRecentMessageCache` unset) → all of RF01–RF03 and RF07 degrade to "unavailable" until the socket config is updated. Mitigation: flip the flag as an explicit task in this change, not an assumption.
- **Baileys emits nothing at the `markRetryFailed` call site** → RF07 cannot be implemented until the vendored fork is patched. Mitigation: track as a blocking prerequisite task against the `instantsol/Baileys` repo; sequence RF07 after that patch lands and is picked up here via `npm install`.
- **Reusing `CONNECTION_UPDATE` changes its payload shape for every existing subscriber**, even though no field is removed. Accepted risk given the closed, internal consumer set (see Decisions). If this fork is ever partially opened to external integrators, this decision should be revisited.
- **`messaging-history.set` isn't in the `webhookEvents` allowlist** (`instance.schema.ts`) even though the `Events` enum already defines it → RF06 payloads would be built but undeliverable without this schema addition. Mitigation: explicit task to add it.
- **Non-blocking requirement for the periodic webhook and reconciliation dispatch** — both must not stall socket event processing. Mitigation: implement the periodic snapshot as a `setInterval`/timer that fires independently of the event loop's message-processing path, and fire-and-forget (with error logging) the reconciliation's `fetchMessageHistory` call.
- **`enterprise_scout_logs.details` is a `varchar(512)` column downstream** (kwikapi) — not this repo's concern directly, but a reminder that payloads this repo emits shouldn't assume unlimited downstream storage if they're logged verbatim.

## Migration Plan

No database migrations in this repo. Deployment is a standard code + config release:
1. Land the `instantsol/Baileys` fork patch (RF07's event emission) and cut a new fork version/tag.
2. Bump the `baileys` dependency in this repo's `package.json` to pick up the patch.
3. Set `enableRecentMessageCache: true` in the socket config.
4. Deploy RF01–RF06 (independent of the fork patch) and RF07 together once the bumped dependency is in place.
5. Rollback is a plain code revert — no data migration to unwind, since all new state lives in kwikapi (separate change) and webhook payload changes are additive or explicitly-accepted reuse.

## Open Questions

- Exact event/field naming for the fork's new emission point (`message-retry.failed` suggested, not finalized) — decide during fork-patch implementation.
- Whether to also give the WhatsApp `ack` stream-error tag its own `DisconnectReason` mapping in the fork (currently falls into the generic `badSession` bucket — confirmed harmless but mislabeled during PRD investigation). Cosmetic, not blocking; can ride along with the RF07 fork patch or be deferred indefinitely.
