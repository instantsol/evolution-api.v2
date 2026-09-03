## Context

Discovered during live, end-to-end validation of the sibling `kwikapi-scout-observability` change's manual-recovery endpoint (kwik repo). The investigation traced through several layers before landing on this one:

1. Missing `MESSAGING_HISTORY_SET`/`MESSAGE_RETRY_FAILED` webhook subscription (kwikapi's `EvoApi._webhook_events()`, plus a matching gap in this repo's `EventController.events`) — fixed separately, unrelated to this change.
2. A hypothesis that kwikapi's `EnterpriseScoutAccounts.initial_connection` and this repo's `Setting.initialConnection` needed to be manually kept in sync — true, and fixed, but ultimately a red herring for *this* bug once `disconnectionAt` was found to take precedence.
3. This filter — confirmed via the instance's own Postgres row (`disconnectionAt = 2026-09-02 19:27:02`, `disconnectionReasonCode: 401`) and via live `pm2 logs` correlating a specific `peerDataRequestSessionId` to a `messaging-history.set` webhook carrying `messageCount: 50` and real, older message content that never made it into the database.

## Goals / Non-Goals

**Goals:**
- Recovered `ON_DEMAND` messages get persisted regardless of `disconnectionAt`/`initialConnection`.
- No change to automatic (non-`ON_DEMAND`) history-sync import behavior — `INITIAL`/`RECENT` syncs on reconnect keep exactly their current behavior.

**Non-Goals:**
- Clearing/resetting `disconnectionAt` on reconnect. That's a separate concern, and changing it could affect other logic that reads the same field (e.g. connection-duration reporting added by `evolution-scout-observability`). Not touched here.
- Any additional bound on how far back `ON_DEMAND` recovery can reach. It's already naturally bounded by the anchor + count the caller supplies, and by whatever history WhatsApp itself is willing to share for that conversation.

## Decisions

**Exempt by `syncType`, not by removing the filter.** The floor is legitimate — and presumably intentional — for automatic reconnect-triggered syncs (`INITIAL`/`RECENT`): it avoids re-importing a message the instance already has from before a disconnect, which could otherwise happen on every reconnect. `ON_DEMAND` is fundamentally different: it only ever returns messages in direct response to an explicit `fetchMessageHistory` call, never automatically, so there is no reimport-avoidance need for it in the first place. Scoping the fix to `syncType === proto.HistorySync.HistorySyncType.ON_DEMAND` is the minimal change that fixes the reported bug without touching working behavior anywhere else.

**Leave the Chatwoot-specific override block alone.** There's a second, separate import-limit override further down the same handler, gated behind `CHATWOOT.ENABLED` (confirmed `false` in this deployment's `.env`). It's dead code for this deployment and out of scope for this fix; revisit only if Chatwoot integration is ever turned on here.

## Risks / Trade-offs

- **None identified for non-`ON_DEMAND` paths** — they are untouched by this change.
- **`ON_DEMAND` recovery can now import arbitrarily old messages**, bounded only by the anchor/count parameters and whatever WhatsApp itself shares. This is the intended behavior of the feature as originally specified (manual recovery, automatic reconciliation) — not a new risk introduced by this fix, just the first time the feature actually behaves as specified.

## Migration Plan

Code-only change, no data migration, no schema change. Deploy and restart (or let watch-mode pick it up, as configured via `pm2`/`dev:server`). Rollback is a plain code revert.

## Open Questions

None for this fix. One adjacent observation from validation, not addressed here: repeatedly triggering `fetchMessageHistory` against the *same* conversation/anchor causes `createEditedMessageFromChangedSnapshot` to false-positive on repeat deliveries of the same message keys (treating an unchanged historical message as if it were an edit of something already known), silently dropping it via a different path than the one this change fixes. Zero drops were observed testing a fresh, never-before-triggered conversation, so this didn't need to be fixed here — flagging it in case repeated/idempotent recovery requests against the same conversation become a real usage pattern later (e.g. a retry-on-timeout policy) and cause confusion the same way this bug did.
