-- ============================================================
-- VendorTrack — DevOps Infrastructure Migration
-- ============================================================
-- Creates tables and infrastructure for:
--   - Feature flags (runtime configuration)
--   - Backup tracking
--   - Incident tracking
--   - Deployment history
-- ============================================================

-- ---- Feature Flags Table ----
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  environments TEXT[] DEFAULT ARRAY['development', 'staging', 'production'],
  is_kill_switch BOOLEAN DEFAULT false,
  allowed_roles TEXT[],
  allowed_user_ids TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Enable RLS on feature flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Only admins can manage feature flags
CREATE POLICY "Admins can manage feature flags"
  ON feature_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Anyone can read feature flags (needed for client-side evaluation)
CREATE POLICY "Anyone can read feature flags"
  ON feature_flags FOR SELECT
  USING (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_updated_at();

-- ---- Backup Tracking Table ----
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'database', 'redis', 'env')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  size_bytes BIGINT,
  storage_path TEXT,
  manifest JSONB,
  error_message TEXT,
  created_by UUID REFERENCES profiles(id)
);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backups"
  ON backups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- ---- Deployment History Table ----
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'preview')),
  deploy_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'completed', 'failed', 'rolled_back')),
  deploy_url TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  deployed_by UUID REFERENCES profiles(id),
  metadata JSONB
);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage deployments"
  ON deployments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Authenticated users can read deployments"
  ON deployments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---- Incident Tracking Table ----
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 4),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'mitigated', 'resolved', 'postmortem')),
  affected_services TEXT[],
  started_at TIMESTAMPTZ DEFAULT NOW(),
  detected_at TIMESTAMPTZ,
  mitigated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  postmortem_url TEXT,
  created_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id)
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incidents"
  ON incidents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Authenticated users can read incidents"
  ON incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---- Indexes ----
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_started_at ON deployments(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at DESC);

-- ---- Seed Default Feature Flags ----
INSERT INTO feature_flags (key, description, enabled, rollout_percentage, environments) VALUES
  ('stripe_connect', 'Enable Stripe Connect for multi-vendor payments', true, 100, ARRAY['development', 'staging', 'production']),
  ('auto_refund_on_failure', 'Automatically refund payments when order processing fails', true, 100, ARRAY['development', 'staging', 'production']),
  ('ai_product_descriptions', 'Enable AI-generated product descriptions', true, 100, ARRAY['development', 'staging', 'production']),
  ('full_text_search', 'Enable PostgreSQL full-text search', true, 100, ARRAY['development', 'staging', 'production']),
  ('search_suggestions', 'Enable search autocomplete suggestions', true, 50, ARRAY['development', 'staging', 'production']),
  ('redis_caching', 'Use Redis for distributed caching', true, 100, ARRAY['production']),
  ('sentry_error_tracking', 'Enable Sentry error tracking', true, 100, ARRAY['staging', 'production']),
  ('opentelemetry_tracing', 'Enable OpenTelemetry distributed tracing', false, 10, ARRAY['staging', 'production'])
ON CONFLICT (key) DO NOTHING;

-- ---- Grant Permissions ----
-- These are for the service role to manage the infrastructure tables
GRANT SELECT, INSERT, UPDATE ON feature_flags TO service_role;
GRANT SELECT ON feature_flags TO anon;
GRANT SELECT, INSERT, UPDATE ON backups TO service_role;
GRANT SELECT, INSERT, UPDATE ON deployments TO service_role;
GRANT SELECT, INSERT, UPDATE ON incidents TO service_role;
