-- DreamX Database Schema for PostgreSQL
-- Converted from Azure SQL Server syntax to PostgreSQL

-- Users table - Core account and onboarding data
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  categories TEXT,
  goals TEXT,
  experience TEXT,
  bio TEXT,
  location VARCHAR(255),
  skills TEXT,
  profile_picture VARCHAR(500),
  banner_image VARCHAR(500),
  provider VARCHAR(50),
  provider_id VARCHAR(255),
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  message_notifications BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  verification_code VARCHAR(50),
  verification_code_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  account_status VARCHAR(50) DEFAULT 'active',
  admin_permissions TEXT DEFAULT '[]',
  admin_scopes TEXT DEFAULT '[]',
  suspension_until TIMESTAMP,
  suspension_reason TEXT,
  seller_privileges_frozen BOOLEAN DEFAULT false,
  bank_account_country VARCHAR(100),
  bank_account_number VARCHAR(100),
  bank_routing_number VARCHAR(100),
  profile_visibility VARCHAR(50) DEFAULT 'public',
  allow_messages_from VARCHAR(50) DEFAULT 'everyone',
  discoverable_by_email BOOLEAN DEFAULT true,
  show_online_status BOOLEAN DEFAULT true,
  read_receipts BOOLEAN DEFAULT true,
  chat_privileges_frozen BOOLEAN DEFAULT false,
  handle VARCHAR(100),
  daily_time_commitment VARCHAR(50),
  best_time VARCHAR(50),
  reminder_frequency VARCHAR(50),
  accountability_style VARCHAR(50),
  progress_visibility VARCHAR(50) DEFAULT 'public',
  content_preferences TEXT,
  content_format_preference VARCHAR(50),
  open_to_mentoring VARCHAR(50),
  first_goal TEXT,
  first_goal_date VARCHAR(50),
  first_goal_metric VARCHAR(50),
  first_goal_public BOOLEAN DEFAULT false,
  notify_followers BOOLEAN DEFAULT true,
  notify_likes_comments BOOLEAN DEFAULT true,
  notify_milestones BOOLEAN DEFAULT true,
  notify_inspiration BOOLEAN DEFAULT true,
  notify_community BOOLEAN DEFAULT true,
  notify_weekly_summary BOOLEAN DEFAULT true,
  notify_method VARCHAR(50) DEFAULT 'both',
  phone_number VARCHAR(20),
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMP,
  onboarding_completed BOOLEAN DEFAULT false,
  needs_onboarding BOOLEAN DEFAULT true
);

CREATE UNIQUE INDEX idx_users_handle ON users(handle) WHERE handle IS NOT NULL;
CREATE INDEX idx_users_email ON users(email);

-- Email verification codes
CREATE TABLE email_verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Phone verification codes
CREATE TABLE phone_verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT false,
  attempt_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_phone_verification_user ON phone_verification_codes(user_id);
CREATE INDEX idx_phone_verification_phone ON phone_verification_codes(phone_number);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_password_reset_token_hash ON password_reset_tokens(token_hash);

-- Device fingerprints for alt account detection
CREATE TABLE device_fingerprints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  fingerprint_hash VARCHAR(255) NOT NULL,
  user_agent TEXT,
  ip_address VARCHAR(50),
  country VARCHAR(50),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(fingerprint_hash)
);

CREATE INDEX idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_fingerprint ON device_fingerprints(fingerprint_hash);
CREATE INDEX idx_device_fingerprints_ip ON device_fingerprints(ip_address);

-- Alt account detection logs
CREATE TABLE alt_account_detections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  detection_type VARCHAR(50) NOT NULL,  -- 'phone_match', 'device_match', 'ip_cluster', 'email_pattern', 'name_pattern'
  confidence_score REAL DEFAULT 0.5,     -- 0.0 to 1.0
  matched_user_ids TEXT,         -- JSON array of matched user IDs
  details TEXT,                  -- JSON object with detection details
  action VARCHAR(50),                    -- 'flagged', 'suspended', 'reviewed'
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_alt_detection_user ON alt_account_detections(user_id);
CREATE INDEX idx_alt_detection_type ON alt_account_detections(detection_type);
CREATE INDEX idx_alt_detection_resolved ON alt_account_detections(resolved);

-- Rate Limit Logs
CREATE TABLE rate_limit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'phone_verification', 'email_verification', 'password_reset'
  metadata TEXT,         -- JSON object with additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_rate_limit_user_action ON rate_limit_logs(user_id, action, created_at);
CREATE INDEX idx_rate_limit_created ON rate_limit_logs(created_at);

-- Auth tokens
CREATE TABLE auth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  token_type VARCHAR(50) NOT NULL DEFAULT 'refresh',
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT false,
  device_info TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);

-- Express session store
CREATE TABLE sessions (
  sid VARCHAR(255) NOT NULL PRIMARY KEY,
  session TEXT NOT NULL,
  expires TIMESTAMP NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires);

-- WebAuthn credentials
CREATE TABLE webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  credential_id VARCHAR(255) NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter INTEGER DEFAULT 0,
  transports VARCHAR(255),
  rp_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_webauthn_credentials_user_rp ON webauthn_credentials(user_id, rp_id);

-- OAuth accounts
CREATE TABLE oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_id)
);

-- Conversations
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  is_group BOOLEAN DEFAULT false,
  group_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE NO ACTION
);

-- Conversation participants
CREATE TABLE conversation_participants (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(conversation_id, user_id)
);

-- Messages
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  attachment_url VARCHAR(500),
  attachment_mime VARCHAR(100),
  reply_to_message_id INTEGER,
  "read" BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE NO ACTION
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Message reactions
CREATE TABLE message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type VARCHAR(50) NOT NULL DEFAULT 'like',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_type ON message_reactions(reaction_type);

-- Notifications
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  "read" BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications("read");

-- Push subscriptions
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint VARCHAR(500) NOT NULL UNIQUE,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  payment_provider VARCHAR(50),
  provider_subscription_id VARCHAR(255),
  provider_customer_id VARCHAR(255),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP,
  auto_renew BOOLEAN DEFAULT true,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payment methods
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  payment_provider VARCHAR(50) DEFAULT 'mock',
  provider_payment_method_id VARCHAR(255),
  card_type VARCHAR(50) NOT NULL,
  last_four VARCHAR(4) NOT NULL,
  expiry_month INTEGER NOT NULL,
  expiry_year INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Invoices
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  payment_provider VARCHAR(50),
  provider_payment_id VARCHAR(255),
  amount REAL NOT NULL,
  tier VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'paid',
  invoice_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payment customers
CREATE TABLE payment_customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  payment_provider VARCHAR(50) NOT NULL,
  provider_customer_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, payment_provider)
);

-- Services
CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  price_per_hour REAL NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  experience_level VARCHAR(50),
  format VARCHAR(50),
  availability TEXT,
  location VARCHAR(255),
  tags TEXT,
  image_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_status ON services(status);

-- Service orders
CREATE TABLE service_orders (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_service_orders_service ON service_orders(service_id);
CREATE INDEX idx_service_orders_buyer ON service_orders(buyer_id);
CREATE INDEX idx_service_orders_status ON service_orders(status);

-- Service reviews
CREATE TABLE service_reviews (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_hidden BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(service_id, user_id)
);

CREATE INDEX idx_service_reviews_service ON service_reviews(service_id);
CREATE INDEX idx_service_reviews_user ON service_reviews(user_id);

-- User locations
CREATE TABLE user_locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  city VARCHAR(255),
  latitude REAL,
  longitude REAL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_locations_user ON user_locations(user_id);

-- Audit logs
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Follows
CREATE TABLE follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Posts
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(255),
  content_type VARCHAR(50) DEFAULT 'text',
  text_content TEXT,
  media_url VARCHAR(500),
  audio_url VARCHAR(500),
  image_url VARCHAR(500),
  video_url VARCHAR(500),
  external_video_url VARCHAR(500),
  is_reel BOOLEAN DEFAULT false,
  activity_label VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_is_reel ON posts(is_reel);

-- Hashtags
CREATE TABLE hashtags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hashtags_name ON hashtags(name);

-- Post hashtags
CREATE TABLE post_hashtags (
  post_id INTEGER NOT NULL,
  hashtag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, hashtag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (hashtag_id) REFERENCES hashtags(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_hashtags_post ON post_hashtags(post_id);

-- Tags
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_name ON tags(name);

-- Post tags
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_tags_post ON post_tags(post_id);

-- Post reactions
CREATE TABLE post_reactions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_reactions_type ON post_reactions(reaction_type);

-- Post comments
CREATE TABLE post_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_hidden BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE NO ACTION
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_comments_parent ON post_comments(parent_id);

-- Post reposts
CREATE TABLE post_reposts (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  original_post_id INTEGER NOT NULL,
  repost_depth INTEGER DEFAULT 1,
  is_quote_repost BOOLEAN DEFAULT false,
  quote_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (original_post_id) REFERENCES posts(id) ON DELETE NO ACTION,
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_reposts_post ON post_reposts(post_id);
CREATE INDEX idx_post_reposts_original ON post_reposts(original_post_id);
CREATE INDEX idx_post_reposts_user ON post_reposts(user_id);

-- Comment likes
CREATE TABLE comment_likes (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(comment_id, user_id)
);

-- Career jobs
CREATE TABLE career_jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  team VARCHAR(255),
  employment_type VARCHAR(100),
  seniority VARCHAR(100),
  headline VARCHAR(500),
  description TEXT,
  responsibilities TEXT,
  requirements TEXT,
  perks TEXT,
  tags TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency VARCHAR(10),
  apply_url VARCHAR(500),
  workplace_type VARCHAR(50),
  visibility VARCHAR(50) DEFAULT 'public',
  priority VARCHAR(50),
  status VARCHAR(50) DEFAULT 'draft',
  go_live_at TIMESTAMP,
  freeze_until TIMESTAMP,
  is_frozen BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_career_jobs_status ON career_jobs(status);
CREATE INDEX idx_career_jobs_live ON career_jobs(go_live_at);

-- Career job assets
CREATE TABLE career_job_assets (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL,
  label VARCHAR(255),
  file_name VARCHAR(255),
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_career_job_assets_job ON career_job_assets(job_id);

-- Career applications
CREATE TABLE career_applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER,
  user_id INTEGER,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  position VARCHAR(255),
  resume_url VARCHAR(500),
  cover_letter TEXT,
  resume_file VARCHAR(500),
  portfolio_file VARCHAR(500),
  status VARCHAR(50) DEFAULT 'new',
  reviewer_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE NO ACTION
);

-- User blocks
CREATE TABLE user_blocks (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

-- User reports
CREATE TABLE user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL,
  reported_id INTEGER NOT NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_reporter ON user_reports(reporter_id);
CREATE INDEX idx_reports_reported ON user_reports(reported_id);
CREATE INDEX idx_reports_status ON user_reports(status);

-- User moderation
CREATE TABLE user_moderation (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  block_functionality_locked BOOLEAN DEFAULT false,
  lock_reason TEXT,
  locked_by INTEGER,
  locked_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_moderation_locked ON user_moderation(block_functionality_locked);

-- Content appeals
CREATE TABLE content_appeals (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  content_url VARCHAR(500),
  removal_reason TEXT,
  description TEXT,
  appeal_reason TEXT NOT NULL,
  additional_info TEXT,
  status VARCHAR(50) DEFAULT 'open',
  reviewer_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Account appeals
CREATE TABLE account_appeals (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  account_action VARCHAR(100) NOT NULL,
  action_date VARCHAR(50),
  violation_reason TEXT,
  appeal_reason TEXT NOT NULL,
  prevention_plan TEXT,
  additional_info TEXT,
  contact_email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'open',
  reviewer_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Livestreams
CREATE TABLE livestreams (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  stream_key VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'scheduled',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  viewer_count_peak INTEGER DEFAULT 0,
  recording_enabled BOOLEAN DEFAULT true,
  recording_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_livestreams_user ON livestreams(user_id);
CREATE INDEX idx_livestreams_status ON livestreams(status);
CREATE INDEX idx_livestreams_stream_key ON livestreams(stream_key);

-- Billing charges
CREATE TABLE billing_charges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  description VARCHAR(255) NOT NULL,
  charge_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'completed',
  tier VARCHAR(50),
  invoice_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE NO ACTION
);

CREATE INDEX idx_billing_charges_user ON billing_charges(user_id);
CREATE INDEX idx_billing_charges_status ON billing_charges(status);

-- Refund requests
CREATE TABLE refund_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  charge_id INTEGER,
  amount REAL NOT NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  order_date VARCHAR(50),
  transaction_id VARCHAR(255),
  preferred_method VARCHAR(50) NOT NULL,
  account_email VARCHAR(255),
  account_last_four VARCHAR(4),
  screenshot VARCHAR(500),
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by INTEGER,
  admin_notes TEXT,
  refund_amount REAL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (charge_id) REFERENCES billing_charges(id) ON DELETE NO ACTION,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_refund_requests_user ON refund_requests(user_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);

-- Livestream viewers
CREATE TABLE livestream_viewers (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER NOT NULL,
  user_id INTEGER,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  FOREIGN KEY (stream_id) REFERENCES livestreams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_livestream_viewers_stream ON livestream_viewers(stream_id);
CREATE INDEX idx_livestream_viewers_user ON livestream_viewers(user_id);

-- Livestream chat
CREATE TABLE livestream_chat (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stream_id) REFERENCES livestreams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_livestream_chat_stream ON livestream_chat(stream_id);

-- User admin notes
CREATE TABLE user_admin_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_user_admin_notes_user ON user_admin_notes(user_id);
CREATE INDEX idx_user_admin_notes_admin ON user_admin_notes(admin_id);

-- Projects table
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image VARCHAR(500),
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'planning',       -- 'planning', 'in-progress', 'completed', 'paused', 'archived'
  visibility VARCHAR(50) DEFAULT 'public',     -- 'public', 'private', 'unlisted'
  progress_percent INTEGER DEFAULT 0,                -- 0-100
  start_date TIMESTAMP,
  target_end_date TIMESTAMP,
  actual_end_date TIMESTAMP,
  tags TEXT,                           -- JSON array
  gallery_images TEXT,                 -- JSON array of image URLs
  goals TEXT,                          -- JSON array of goal objects
  team_members TEXT,                   -- JSON array of {user_id, role}
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_visibility ON projects(visibility);

-- Project milestones
CREATE TABLE project_milestones (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',        -- 'pending', 'in-progress', 'completed'
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_milestones_project ON project_milestones(project_id);
CREATE INDEX idx_milestones_status ON project_milestones(status);

-- Project tasks
CREATE TABLE project_tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  milestone_id INTEGER,
  assigned_to INTEGER,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',           -- 'todo', 'in-progress', 'review', 'done'
  priority VARCHAR(50) DEFAULT 'medium',       -- 'low', 'medium', 'high', 'critical'
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_tasks_project ON project_tasks(project_id);
CREATE INDEX idx_tasks_milestone ON project_tasks(milestone_id);
CREATE INDEX idx_tasks_assigned ON project_tasks(assigned_to);
CREATE INDEX idx_tasks_status ON project_tasks(status);

-- Project updates (posts about the project)
CREATE TABLE project_updates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title VARCHAR(255),
  content_type VARCHAR(50) DEFAULT 'text',     -- 'text', 'image', 'video', 'milestone'
  text_content TEXT,
  media_url VARCHAR(500),
  audio_url VARCHAR(500),
  image_url VARCHAR(500),
  video_url VARCHAR(500),
  external_video_url VARCHAR(500),
  milestone_id INTEGER,
  status_update VARCHAR(50),                   -- 'progress', 'blocker', 'completed', 'decision'
  metrics TEXT,                        -- JSON: {progress: 0-100, before: x, after: y}
  attachment_urls TEXT,                -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);

CREATE INDEX idx_updates_project ON project_updates(project_id);
CREATE INDEX idx_updates_user ON project_updates(user_id);
CREATE INDEX idx_updates_created_at ON project_updates(created_at);

-- Project reactions (likes on updates)
CREATE TABLE project_reactions (
  id SERIAL PRIMARY KEY,
  update_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type VARCHAR(50) DEFAULT 'like',   -- 'like', 'love', 'celebration'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(update_id, user_id)
);

CREATE INDEX idx_reactions_update ON project_reactions(update_id);
CREATE INDEX idx_reactions_type ON project_reactions(reaction_type);

-- Project comments
CREATE TABLE project_comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  update_id INTEGER,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,                                -- For threaded replies
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,                      -- Admin/owner can pin comments
  is_hidden BOOLEAN DEFAULT false,                      -- Admin/owner can hide comments
  edited_at TIMESTAMP,                          -- Track if comment was edited
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (parent_id) REFERENCES project_comments(id) ON DELETE NO ACTION
);

CREATE INDEX idx_comments_update ON project_comments(update_id);
CREATE INDEX idx_comments_project ON project_comments(project_id);
CREATE INDEX idx_comments_parent ON project_comments(parent_id);
CREATE INDEX idx_comments_pinned ON project_comments(is_pinned, created_at);

-- Project comment files (attachments)
CREATE TABLE project_comment_files (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES project_comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comment_files_comment ON project_comment_files(comment_id);

-- Project comment reactions (stars)
CREATE TABLE project_comment_reactions (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type VARCHAR(50) DEFAULT 'star',    -- 'star', 'helpful', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES project_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(comment_id, user_id, reaction_type)
);

CREATE INDEX idx_comment_reactions_comment ON project_comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_user ON project_comment_reactions(user_id);

-- Pricing tiers
CREATE TABLE pricing_tiers (
  id SERIAL PRIMARY KEY,
  tier_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  price_display VARCHAR(50) NOT NULL,
  tagline VARCHAR(255),
  features TEXT,                       -- JSON array of feature strings
  is_highlighted BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_tiers_tier_id ON pricing_tiers(tier_id);
CREATE INDEX idx_pricing_tiers_display_order ON pricing_tiers(display_order);
CREATE INDEX idx_pricing_tiers_is_active ON pricing_tiers(is_active);

-- Sales inquiries
CREATE TABLE sales_inquiries (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  company_size VARCHAR(50),
  company_website VARCHAR(500),
  company_address VARCHAR(500),
  company_city VARCHAR(100),
  company_country VARCHAR(100),
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  contact_job_title VARCHAR(100),
  contact_department VARCHAR(100),
  use_case TEXT NOT NULL,
  expected_users VARCHAR(50),
  timeline VARCHAR(50),
  budget_range VARCHAR(50),
  current_solution TEXT,
  integration_needs TEXT,
  additional_info TEXT,
  how_heard_about_us VARCHAR(100),
  preferred_contact_method VARCHAR(50) DEFAULT 'email',
  preferred_contact_time VARCHAR(100),
  status VARCHAR(50) DEFAULT 'new',
  priority VARCHAR(50) DEFAULT 'normal',
  assigned_to INTEGER,
  assigned_at TIMESTAMP,
  last_contacted_at TIMESTAMP,
  last_contacted_by INTEGER,
  follow_up_notes TEXT,
  next_follow_up_date TIMESTAMP,
  outcome VARCHAR(50),
  outcome_notes TEXT,
  closed_at TIMESTAMP,
  closed_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (last_contacted_by) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_sales_inquiries_status ON sales_inquiries(status);
CREATE INDEX idx_sales_inquiries_priority ON sales_inquiries(priority);
CREATE INDEX idx_sales_inquiries_assigned_to ON sales_inquiries(assigned_to);
CREATE INDEX idx_sales_inquiries_created_at ON sales_inquiries(created_at);

-- Sales inquiry communications
CREATE TABLE sales_inquiry_communications (
  id SERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  communication_type VARCHAR(50) NOT NULL,     -- 'email', 'phone', 'meeting', 'note'
  subject VARCHAR(255),
  content TEXT NOT NULL,
  recipient_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES sales_inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_sales_comms_inquiry ON sales_inquiry_communications(inquiry_id);
CREATE INDEX idx_sales_comms_sender ON sales_inquiry_communications(sender_id);

-- Business admin assignments
CREATE TABLE business_admin_assignments (
  id SERIAL PRIMARY KEY,
  parent_admin_id INTEGER NOT NULL,
  assigned_admin_id INTEGER NOT NULL,
  permissions TEXT DEFAULT '[]',
  scopes TEXT DEFAULT '[]',
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_admin_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(parent_admin_id, assigned_admin_id)
);

CREATE INDEX idx_baa_parent ON business_admin_assignments(parent_admin_id);
CREATE INDEX idx_baa_assigned ON business_admin_assignments(assigned_admin_id);
CREATE INDEX idx_baa_status ON business_admin_assignments(status);

-- Theme settings
CREATE TABLE theme_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value TEXT,
  custom_theme_data TEXT,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_theme_settings_key ON theme_settings(setting_key);
CREATE INDEX idx_theme_settings_enabled ON theme_settings(is_enabled);

-- Theme change log
CREATE TABLE theme_change_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(255) NOT NULL,
  theme_id VARCHAR(255),
  theme_data TEXT,
  changed_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_theme_log_created ON theme_change_log(created_at);
CREATE INDEX idx_theme_log_action ON theme_change_log(action);
