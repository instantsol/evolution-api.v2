## Why

During end-to-end validation of the manual message-recovery endpoint (from the sibling `kwikapi-scout-observability` change, kwik repo), triggering `fetchMessageHistory` repeatedly returned `success` with a real `peerDataRequestSessionId`, and Baileys/WhatsApp genuinely responded with real recovered messages — confirmed directly in live logs: a `messaging-history.set` webhook correlated by `peerDataRequestSessionId` to the exact test trigger, `messageCount: 50`, `syncType: 6` (`ON_DEMAND`), real message content dated back to `2026-06-25` for a conversation the account owner independently confirmed has genuine history that far back on their phone. But none of those 50 messages were ever persisted to evolution-api's own message store, so they never appeared via `findMessages` (and therefore never in kwikweb's chat UI either).

Root cause, traced directly: the `messaging-history.set` handler in `whatsapp.baileys.service.ts` computes an import floor as

```js
const timestampLimit = instanceObject.disconnectionAt
  ? instanceObject.disconnectionAt
  : settings.initialConnection;
let timestampLimitToImport = Math.floor(timestampLimit.getTime() / 1000);
...
if (m.messageTimestamp <= timestampLimitToImport) {
  continue; // discarded, never persisted
}
```

and this floor is applied unconditionally to every `syncType`, including `ON_DEMAND`. `disconnectionAt` is set on every disconnect and is never cleared on reconnect, so it is very often more recent than `initialConnection` — and, critically, it will almost always be more recent than anything a recovery request is trying to recover, since a recovery request is by definition asking for messages *older* than what's already locally known. Confirmed directly against the test instance's own Postgres row: `disconnectionAt = 2026-09-02 19:27:02` (`disconnectionReasonCode: 401`), meaning recovered messages from June were compared against a same-day timestamp and discarded.

Net effect: as currently implemented, on-demand message recovery (manual recovery and the automatic `failedRetries` reconciliation) can successfully dispatch a request and get a real response from WhatsApp, but the response is silently thrown away before ever being saved, for any account that has disconnected even once since its `initialConnection`. Per this same PRD's own investigation (65,989 disconnects analyzed across the fleet), that describes essentially every real account — the recovery feature, as shipped, cannot recover anything in practice.

## What Changes

- Exempt `ON_DEMAND` syncType from the `disconnectionAt`/`initialConnection` import floor in the `messaging-history.set` handler. On-demand recovery is an explicit, bounded request (anchor + count supplied by the caller), not an automatic reconnect-triggered backfill-avoidance sync, so the floor's purpose — don't reimport messages already known from before a disconnect — doesn't apply to it.
- No change to the floor's behavior for non-`ON_DEMAND` syncTypes (`INITIAL`, `RECENT`, etc.) — automatic reconnect-sync behavior is untouched.

## Capabilities

### Modified Capabilities
- `message-recovery`: recovered on-demand messages are now actually persisted, regardless of the instance's disconnection history — closing the gap between "the endpoint reports success" and "the messages are actually recoverable."

## Impact

- **Code**: `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`, the `messaging-history.set` handler's `timestampLimitToImport` computation.
- **No schema changes.**
- **No webhook contract changes** — the `MESSAGING_HISTORY_SET` payload shape is unchanged; this only affects whether the underlying recovered messages get saved to the instance's message store.
- **Downstream**: kwikapi's manual-recovery endpoint and future automatic-reconciliation consumer (`kwikapi-scout-observability`, kwik repo) become actually useful once this lands — today they can dispatch and track requests correctly, but the recovered content itself never arrives.
