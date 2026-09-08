## Why

The Evolution/Baileys layer behind Kwik Scout has been operated as a black box: connection drops and message-recovery signals that Baileys already emits internally are never captured, correlated, or exposed. A recent incident (71% of 65,989 analyzed disconnects were `440 connectionReplaced`, caused by two instances sharing one auth DB) was only diagnosable because `statusCode`/`reason`/timestamp had been logged for months — a proper panel and alerts would have turned it into a first-day incident instead of a months-long blind spot. This change gives the evolution-api side of that layer first-class observability and recovery signals so the downstream Scout stack (scout-events, kwikapi — separate changes) can build the aggregation, alerting, and recovery tracking on top.

## What Changes

- Expose the Baileys `MessageRetryManager` statistics (`totalRetries`, `successfulRetries`, `failedRetries`, `sessionRecreations`, `phoneRequests`) via a defensive read, degrading gracefully when the manager is unavailable.
- Attach a stats snapshot to the existing `CONNECTION_UPDATE` webhook payload on disconnect (`close`).
- Emit a periodic `CONNECTION_UPDATE` webhook (default 600s, env-configurable) carrying a live stats snapshot, independent of connection state changes — reuses the existing event type with a discriminator rather than introducing a new one (internal fork, no external consumer contract to protect).
- Propagate `open`/`connecting` connection state, and carry the prior session's `open` timestamp on the `close` payload, so session duration is computable downstream.
- Add a new `/kwik/` endpoint that triggers `sock.fetchMessageHistory` for a single conversation (instance + `remoteJid` + count + anchor) and returns the resulting `peerDataRequestSessionId`; does not return messages itself.
- Propagate the Baileys `messaging-history.set` event (already defined in the `Events` enum but not yet wired into the webhook subscription schema) to the Scout webhook layer, with `syncType`, `peerDataRequestSessionId`, message count, `isLatest`, `progress`.
- On `failedRetries` exhaustion, capture the failing conversation's `remoteJid` and fire a single automatic `fetchMessageHistory` reconciliation, emitting a Scout-facing event correlating the failure to the reconciliation's `peerDataRequestSessionId`. **BREAKING (to the vendored dependency, not to API consumers)**: this requires a patch to the vendored `instantsol/Baileys` fork itself — Baileys today emits no event at the point `markRetryFailed` fires, so there is nothing for evolution-api to listen to. This is a hard prerequisite, tracked as fork work separate from this repo's own changes.
- All new/changed webhook fields are additive; existing consumers are unaffected except where this proposal explicitly documents an accepted behavior change (the `CONNECTION_UPDATE` reuse above).

## Capabilities

### New Capabilities
- `retry-stats-observability`: exposing Baileys' `MessageRetryManager` counters, both as a disconnect-time snapshot and a periodic live webhook.
- `message-recovery`: the `/kwik/` per-conversation history-recovery endpoint, `messaging-history.set` propagation, and the automatic single-shot reconciliation on `failedRetries`.

### Modified Capabilities
(none — `openspec/specs/` is currently empty; connection-event enrichment is folded into `retry-stats-observability` below rather than treated as a separate pre-existing capability, since no `connection-update` capability spec exists yet to modify.)

## Impact

- **Code**: `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts` (socket config, `connectionUpdate` handler, new periodic timer, new decrypt-failure/reconciliation handling), `src/api/controllers/kwik.controller.ts` / `src/api/routes/kwik.router.ts` / `src/api/services/kwik.service.ts` (new endpoint), `src/api/types/wa.types.ts` (no new `Events` entry needed for stats — reuses `CONNECTION_UPDATE`; `MESSAGING_HISTORY_SET` already exists), `src/validate/instance.schema.ts` (add `MESSAGING_HISTORY_SET` to the `webhookEvents` allowlist).
- **Vendored dependency**: `instantsol/Baileys` fork — socket config must set `enableRecentMessageCache: true` (not currently set, so `messageRetryManager` is `null` today); `sendRetryRequest` in `Socket/messages-recv.js` needs a new event emission at the `markRetryFailed` branch. Tracked as fork-repo work, blocking RF07 only.
- **Downstream consumers**: scout-events (webhook consumption, new DB writes) and kwikapi (migrations, endpoints) are out of scope for this change — separate proposals in their own repos, referencing the same umbrella PRD (`00_PRD_Observabilidade_Scout.md`).
- **Explicitly out of scope**: the `440 connectionReplaced` reconnect-loop behavior (root cause already fixed via infra on 2026-08-21; changing the reconnect decision itself is a deliberate future call, not part of this change), frontend/dashboard, account-wide recovery sweeps, active alert delivery.
