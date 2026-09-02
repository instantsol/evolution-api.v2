## ADDED Requirements

### Requirement: Expose MessageRetryManager statistics defensively
The system SHALL read `sock.messageRetryManager.statistics` (`totalRetries`, `successfulRetries`, `failedRetries`, `sessionRecreations`, `phoneRequests`) when needed for a webhook payload, and SHALL NOT throw or interrupt event processing when `messageRetryManager` is unavailable.

#### Scenario: Statistics available
- **WHEN** the socket was created with `enableRecentMessageCache: true` and `messageRetryManager` is present
- **THEN** the system reads the five counters as an instantaneous snapshot and includes them in the relevant payload

#### Scenario: Statistics unavailable
- **WHEN** `messageRetryManager` is `null` (cache disabled)
- **THEN** the system marks the statistics block as unavailable in the payload instead of omitting the payload or throwing an error

### Requirement: Attach stats snapshot to the disconnect webhook
When a Baileys `connection.update` event reports `connection: 'close'`, the `CONNECTION_UPDATE` webhook payload SHALL include a snapshot of the retry-manager statistics for the session that just ended, in addition to the existing `statusCode`, `reason`, `errorMessage`, and `disconnectDate` fields.

#### Scenario: Disconnect with available stats
- **WHEN** a session closes and `messageRetryManager` was available during that session
- **THEN** the `CONNECTION_UPDATE` disconnect payload includes the five counters as they stood at the moment of disconnect

#### Scenario: Disconnect with unavailable stats
- **WHEN** a session closes and `messageRetryManager` was unavailable during that session
- **THEN** the `CONNECTION_UPDATE` disconnect payload omits or marks the statistics block as unavailable, without affecting the rest of the payload

### Requirement: Emit a periodic stats webhook independent of connection state
The system SHALL emit a `CONNECTION_UPDATE` webhook, discriminated from a connection-state-change payload, carrying a live snapshot of the retry-manager statistics per instance on a fixed interval, regardless of whether the connection state changed.

#### Scenario: Periodic snapshot emitted at configured interval
- **WHEN** an instance's connection has been established
- **THEN** the system emits a `CONNECTION_UPDATE` webhook with the current statistics snapshot and current connection state every `SCOUT_RETRY_STATS_INTERVAL` seconds (default 600), independent of any `connection.update` events from Baileys

#### Scenario: Interval configurable via environment variable
- **WHEN** `SCOUT_RETRY_STATS_INTERVAL` is set to a different value
- **THEN** the periodic emission cadence changes accordingly without a code change or redeploy

#### Scenario: Periodic emission does not block message processing
- **WHEN** the periodic snapshot timer fires
- **THEN** the emission SHALL NOT block or delay processing of incoming socket events or messages

### Requirement: Track and propagate connection open/duration signals
The system SHALL record the timestamp of each `open` connection state and SHALL include the prior session's open timestamp in the subsequent `close` payload, so session duration is computable by downstream consumers.

#### Scenario: Open event recorded
- **WHEN** Baileys reports `connection.update` with `connection: 'open'`
- **THEN** the system records the timestamp and forwards the `open` state via `CONNECTION_UPDATE`, which was not previously propagated

#### Scenario: Close payload carries prior open timestamp
- **WHEN** a session closes after having been open
- **THEN** the `CONNECTION_UPDATE` disconnect payload includes the timestamp of that session's `open` event, when known
