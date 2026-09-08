## ADDED Requirements

### Requirement: Persist on-demand recovered messages regardless of disconnection history
The system SHALL persist messages recovered via an `ON_DEMAND` `messaging-history.set` sync to the instance's message store regardless of the instance's `disconnectionAt` or `initialConnection` timestamps. The disconnection/initial-connection import floor SHALL continue to apply, unchanged, to non-`ON_DEMAND` syncTypes.

#### Scenario: Recovered message older than the last disconnect is persisted
- **WHEN** an `ON_DEMAND` `messaging-history.set` arrives with messages whose timestamp is at or before the instance's `disconnectionAt` (or `initialConnection`, if `disconnectionAt` is unset)
- **THEN** those messages are persisted to the message store, subject to the same existing per-message validity checks (message/key/timestamp present, not already known)

#### Scenario: Automatic reconnect sync is unaffected
- **WHEN** a non-`ON_DEMAND` `messaging-history.set` arrives (e.g. `INITIAL` or `RECENT`, as happens automatically on reconnect)
- **THEN** messages at or before `disconnectionAt`/`initialConnection` continue to be discarded, exactly as before this change
