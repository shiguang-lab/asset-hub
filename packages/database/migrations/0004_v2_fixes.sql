-- V2.0 reliability and security fixes:
-- 1. Persist knowledge_sources.object_key so failed or pending sources can be retried reliably.
-- 2. Track api_tokens.created_by so personal access tokens retain owner access to the creator's assets.

ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS object_key TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS created_by TEXT;
