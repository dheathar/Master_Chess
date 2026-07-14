-- Phase 6: Session token security — hash tokens at rest
-- This migration invalidates all existing sessions (acceptable — users re-log-in).
-- Token is already text and primary key; we just clear old plaintext tokens
-- and the app will insert new hashes going forward.

DELETE FROM sessions;
