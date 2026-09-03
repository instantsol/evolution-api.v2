## 1. Fix

- [x] 1.1 In the `messaging-history.set` handler (`whatsapp.baileys.service.ts`), skip the `disconnectionAt`/`initialConnection` import floor when `syncType === proto.HistorySync.HistorySyncType.ON_DEMAND` (sets `timestampLimitToImport = 0` for that path)
- [x] 1.2 Confirm non-`ON_DEMAND` syncTypes (`INITIAL`, `RECENT`, etc.) keep byte-for-byte the same floor computation — verified directly in the diff: the non-`ON_DEMAND` branch is unchanged (`Math.floor(timestampLimit.getTime() / 1000)`), only a new conditional was added around it

## 2. Validation

- [x] 2.1 Re-triggered against account 145. First attempt reused a conversation (`5521996603656@s.whatsapp.net`) that had been triggered ~8 times earlier today while diagnosing this bug — that accumulated stale edit-detection state (`createEditedMessageFromChangedSnapshot` false-positiving on repeat deliveries of the same keys) and produced a false negative (0 persisted). Re-tested against a conversation never triggered before (`145144175173754@lid`) for a clean read.
- [x] 2.2 Confirmed via direct query against evolution-api's own Postgres (`Message` table): count for `145144175173754@lid` went from 77 → 127 (exactly +50, matching the on-demand sync's `messageCount: 50`), with temporary debug instrumentation showing all 50 messages reached `messagesRaw` with zero drops at any gate. Also confirmed via `EvoApi.messages()` on the kwikapi side.
- [x] 2.3 Confirmed by construction (see 1.2) rather than a separate live test — the non-`ON_DEMAND` code path is textually identical to before the change, so no separate regression run was needed.
