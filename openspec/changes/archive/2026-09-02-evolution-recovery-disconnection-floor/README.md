# evolution-recovery-disconnection-floor

Fix: on-demand message recovery discards recovered messages because the import filter uses disconnectionAt (not initialConnection), which is set on every disconnect and never cleared
