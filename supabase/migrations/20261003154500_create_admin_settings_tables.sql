CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role TEXT PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Seed initial admin users if empty
INSERT INTO admin_users (id, name, email, role, avatar_url, created_at, last_login_at, is_active)
VALUES 
  ('adm_001', 'Meriem Boussaïd', 'meriem@nayha.fr', 'super_admin', NULL, NOW(), NOW(), TRUE),
  ('adm_002', 'Abderraouf Zouaid', 'abderraouf@progix.dev', 'admin', NULL, NOW(), NOW(), TRUE),
  ('adm_003', 'Sarah Benali', 'sarah@nayha.fr', 'moderator', NULL, NOW(), NOW(), TRUE),
  ('adm_004', 'Nadia Khelifi', 'nadia@nayha.fr', 'viewer', NULL, NOW(), NOW(), TRUE),
  ('adm_005', 'Leila Mansour', 'leila@nayha.fr', 'moderator', NULL, NOW(), NOW(), FALSE)
ON CONFLICT (email) DO NOTHING;

-- Seed default role permissions
INSERT INTO admin_role_permissions (role, permissions)
VALUES 
  ('super_admin', '{"dashboard": true, "users_view": true, "users_edit": true, "candidatures_view": true, "ai_view": true, "ai_config": true, "ateliers_view": true, "ateliers_edit": true, "community_view": true, "community_moderate": true, "subscriptions_view": true, "subscriptions_edit": true, "settings_view": true, "settings_edit": true}'::jsonb),
  ('admin', '{"dashboard": true, "users_view": true, "users_edit": true, "candidatures_view": true, "ai_view": true, "ai_config": true, "ateliers_view": true, "ateliers_edit": true, "community_view": true, "community_moderate": true, "subscriptions_view": true, "subscriptions_edit": true, "settings_view": true, "settings_edit": false}'::jsonb),
  ('moderator', '{"dashboard": true, "users_view": true, "users_edit": false, "candidatures_view": false, "ai_view": false, "ai_config": false, "ateliers_view": true, "ateliers_edit": false, "community_view": true, "community_moderate": true, "subscriptions_view": false, "subscriptions_edit": false, "settings_view": false, "settings_edit": false}'::jsonb),
  ('viewer', '{"dashboard": true, "users_view": true, "users_edit": false, "candidatures_view": true, "ai_view": true, "ai_config": false, "ateliers_view": true, "ateliers_edit": false, "community_view": true, "community_moderate": false, "subscriptions_view": true, "subscriptions_edit": false, "settings_view": true, "settings_edit": false}'::jsonb)
ON CONFLICT (role) DO NOTHING;
