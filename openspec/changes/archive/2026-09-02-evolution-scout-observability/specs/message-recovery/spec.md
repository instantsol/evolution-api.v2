## ADDED Requirements

### Requirement: Manual per-conversation history recovery endpoint
The system SHALL expose an endpoint under the `/kwik/` route that triggers `sock.fetchMessageHistory` for a single conversation, given an instance identifier, `remoteJid`, a message count, and an anchor (oldest known message key + timestamp for that conversation, resolved the same way as the existing `findMessages` flow). The endpoint SHALL return the resulting `peerDataRequestSessionId` and SHALL NOT return the recovered messages directly.

#### Scenario: Successful trigger returns peerDataRequestSessionId
- **WHEN** a valid, authenticated instance and a resolvable anchor for the given `remoteJid` are provided
- **THEN** the system calls `sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)` and returns the `peerDataRequestSessionId` along with confirmation that the request was dispatched

#### Scenario: Invalid instance or anchor returns an error
- **WHEN** the instance is not authenticated, or no anchor can be resolved for the given `remoteJid`
- **THEN** the endpoint returns an appropriate error status and message instead of attempting the call

### Requirement: Propagate history-sync results
The system SHALL propagate Baileys' `messaging-history.set` event to the Scout webhook layer, including `syncType`, `peerDataRequestSessionId`, the number of messages in the batch, `isLatest`, and `progress`, and SHALL make this event selectable in the per-instance webhook subscription configuration.

#### Scenario: History-sync event propagated
- **WHEN** Baileys emits `messaging-history.set`
- **THEN** the system forwards a `MESSAGING_HISTORY_SET` webhook with `syncType`, `peerDataRequestSessionId`, message count, `isLatest`, and `progress`

#### Scenario: Event is subscribable
- **WHEN** an instance configures its `webhookEvents` list
- **THEN** `MESSAGING_HISTORY_SET` is a valid, selectable value

### Requirement: Automatic single-shot reconciliation on failed retries
When a message's decrypt retries are exhausted (`failedRetries` increments), the system SHALL attempt to capture the failing conversation's `remoteJid` and, if available, SHALL trigger exactly one `fetchMessageHistory` reconciliation for that conversation, emitting a Scout-facing event correlating the failure to the reconciliation's `peerDataRequestSessionId`. If `remoteJid` cannot be determined, the system SHALL emit only the failure signal without attempting reconciliation.

#### Scenario: Reconciliation triggered when remoteJid is available
- **WHEN** a message's retries are exhausted and its `remoteJid` is present in the failure context
- **THEN** the system triggers one `fetchMessageHistory` call for that conversation and emits an event containing the failure, the `remoteJid`, and the reconciliation's `peerDataRequestSessionId`

#### Scenario: Alert-only fallback when remoteJid is unavailable
- **WHEN** a message's retries are exhausted and no `remoteJid` can be determined from the failure context
- **THEN** the system emits only the failure signal, without dispatching a reconciliation request

#### Scenario: No repeated automatic reconciliation for the same failure
- **WHEN** a reconciliation has already been dispatched for a given failure
- **THEN** the system SHALL NOT retry or loop that reconciliation automatically
