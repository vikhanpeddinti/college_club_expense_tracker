-- ==============================================================================
-- Blockchain-Based College Club Expense Tracker
-- Supabase PostgreSQL Database Schema
--
-- PURPOSE:
-- Serves as a fast, searchable read-mirror for confirmed on-chain expenses.
-- NOTE: The Ethereum Sepolia smart contract remains the sole authoritative source
-- of truth for balances, expenses, and states.
-- ==============================================================================

-- 1. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id BIGINT PRIMARY KEY,                      -- On-chain expense ID (1, 2, 3...)
    submitter TEXT NOT NULL,                    -- Ethereum address of submitter (lowercase)
    amount_paise BIGINT NOT NULL,               -- Exact on-chain integer paise
    amount_inr NUMERIC(12, 2) GENERATED ALWAYS AS (amount_paise::numeric / 100.0) STORED, -- INR calculation
    purpose TEXT NOT NULL,                      -- Short demo description
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    tx_hash TEXT,                               -- Latest confirmed transaction hash
    submitted_tx_hash TEXT,                     -- Transaction hash of initial submission
    decided_tx_hash TEXT,                       -- Transaction hash of approve/reject
    submitted_at TIMESTAMPTZ NOT NULL,          -- On-chain block timestamp
    decided_at TIMESTAMPTZ,                     -- On-chain block timestamp of decision
    chain_id BIGINT DEFAULT 11155111,           -- Sepolia chain ID
    synced_at TIMESTAMPTZ DEFAULT NOW(),        -- Database sync timestamp
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for fast UI querying and filtering
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_submitter ON public.expenses (submitter);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_at ON public.expenses (submitted_at DESC);

-- 3. Sync Audit Log (for tracking synchronization calls and retries)
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tx_hash TEXT,
    expense_id BIGINT,
    action TEXT NOT NULL,                       -- 'SUBMIT', 'APPROVE', 'REJECT', 'SYNC'
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_tx ON public.sync_logs (tx_hash);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
--
-- Security rule:
-- - Anonymous public clients have SELECT-only permission (read-only mirror).
-- - Anonymous clients CANNOT insert, update, or delete records.
-- - Only the backend Vercel serverless function using the SUPABASE_SERVICE_ROLE_KEY
--   can write verified on-chain data.
-- ==============================================================================

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Public can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Public can view sync logs" ON public.sync_logs;

-- Allow read access to anyone (anon or authenticated)
CREATE POLICY "Public can view expenses"
    ON public.expenses
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Public can view sync logs"
    ON public.sync_logs
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- No INSERT/UPDATE/DELETE policies are created for anon/authenticated roles.
-- Writes are exclusively permitted via the Supabase Service Role key inside /api/sync.

