use [Dream X]
go

-- DreamX Database Schema for Azure SQL Server
-- Converted from SQLite (db.js) to Azure SQL Server syntax

-- Users table - Core account and onboarding data
CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  full_name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  role NVARCHAR(50) DEFAULT 'user',
  categories NVARCHAR(MAX),
  goals NVARCHAR(MAX),
  experience NVARCHAR(MAX),
  bio NVARCHAR(MAX),
  location NVARCHAR(255),
  skills NVARCHAR(MAX),
  profile_picture NVARCHAR(500),
  banner_image NVARCHAR(500),
  provider NVARCHAR(50),
  provider_id NVARCHAR(255),
  email_notifications BIT DEFAULT 1,
  push_notifications BIT DEFAULT 1,
  message_notifications BIT DEFAULT 1,
  email_verified BIT DEFAULT 0,
  verification_code NVARCHAR(50),
  verification_code_expires DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  account_status NVARCHAR(50) DEFAULT 'active',
  admin_permissions NVARCHAR(MAX) DEFAULT '[]',
  admin_scopes NVARCHAR(MAX) DEFAULT '[]',
  suspension_until DATETIME2,
  suspension_reason NVARCHAR(MAX),
  seller_privileges_frozen BIT DEFAULT 0,
  bank_account_country NVARCHAR(100),
  bank_account_number NVARCHAR(100),
  bank_routing_number NVARCHAR(100),
  profile_visibility NVARCHAR(50) DEFAULT 'public',
  allow_messages_from NVARCHAR(50) DEFAULT 'everyone',
  discoverable_by_email BIT DEFAULT 1,
  show_online_status BIT DEFAULT 1,
  read_receipts BIT DEFAULT 1,
  chat_privileges_frozen BIT DEFAULT 0,
  handle NVARCHAR(100),
  daily_time_commitment NVARCHAR(50),
  best_time NVARCHAR(50),
  reminder_frequency NVARCHAR(50),
  accountability_style NVARCHAR(50),
  progress_visibility NVARCHAR(50) DEFAULT 'public',
  content_preferences NVARCHAR(MAX),
  content_format_preference NVARCHAR(50),
  open_to_mentoring NVARCHAR(50),
  first_goal NVARCHAR(MAX),
  first_goal_date NVARCHAR(50),
  first_goal_metric NVARCHAR(50),
  first_goal_public BIT DEFAULT 0,
  notify_followers BIT DEFAULT 1,
  notify_likes_comments BIT DEFAULT 1,
  notify_milestones BIT DEFAULT 1,
  notify_inspiration BIT DEFAULT 1,
  notify_community BIT DEFAULT 1,
  notify_weekly_summary BIT DEFAULT 1,
  notify_method NVARCHAR(50) DEFAULT 'both',
  phone_number NVARCHAR(20),
  phone_verified BIT DEFAULT 0,
  phone_verified_at DATETIME2,
  onboarding_completed BIT DEFAULT 0,
  needs_onboarding BIT DEFAULT 1
);

CREATE UNIQUE INDEX idx_users_handle ON users(handle) WHERE handle IS NOT NULL;
CREATE INDEX idx_users_email ON users(email);

-- Email verification codes
CREATE TABLE email_verification_codes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  email NVARCHAR(255) NOT NULL,
  code NVARCHAR(50) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  verified BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Phone verification codes
CREATE TABLE phone_verification_codes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number NVARCHAR(20) NOT NULL,
  code NVARCHAR(6) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  verified BIT DEFAULT 0,
  attempt_count INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_phone_verification_user ON phone_verification_codes(user_id);
CREATE INDEX idx_phone_verification_phone ON phone_verification_codes(phone_number);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  email NVARCHAR(255) NOT NULL,
  token_hash NVARCHAR(255) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  used BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_password_reset_token_hash ON password_reset_tokens(token_hash);

-- Device fingerprints for alt account detection
CREATE TABLE device_fingerprints (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  fingerprint_hash NVARCHAR(255) NOT NULL,
  user_agent NVARCHAR(MAX),
  ip_address NVARCHAR(50),
  country NVARCHAR(50),
  device_type NVARCHAR(50),
  browser NVARCHAR(100),
  os NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETDATE(),
  last_used_at DATETIME2,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(fingerprint_hash)
);

CREATE INDEX idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_fingerprint ON device_fingerprints(fingerprint_hash);
CREATE INDEX idx_device_fingerprints_ip ON device_fingerprints(ip_address);

-- Alt account detection logs
CREATE TABLE alt_account_detections (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT,
  detection_type NVARCHAR(50) NOT NULL,  -- 'phone_match', 'device_match', 'ip_cluster', 'email_pattern', 'name_pattern'
  confidence_score FLOAT DEFAULT 0.5,     -- 0.0 to 1.0
  matched_user_ids NVARCHAR(MAX),         -- JSON array of matched user IDs
  details NVARCHAR(MAX),                  -- JSON object with detection details
  action NVARCHAR(50),                    -- 'flagged', 'suspended', 'reviewed'
  resolved BIT DEFAULT 0,
  resolved_at DATETIME2,
  resolution_notes NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_alt_detection_user ON alt_account_detections(user_id);
CREATE INDEX idx_alt_detection_type ON alt_account_detections(detection_type);
CREATE INDEX idx_alt_detection_resolved ON alt_account_detections(resolved);

-- Rate Limit Logs
CREATE TABLE rate_limit_logs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  action NVARCHAR(50) NOT NULL,  -- 'phone_verification', 'email_verification', 'password_reset'
  metadata NVARCHAR(MAX),         -- JSON object with additional context
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_rate_limit_user_action ON rate_limit_logs(user_id, action, created_at);
CREATE INDEX idx_rate_limit_created ON rate_limit_logs(created_at);

-- Auth tokens
CREATE TABLE auth_tokens (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash NVARCHAR(255) NOT NULL,
  token_type NVARCHAR(50) NOT NULL DEFAULT 'refresh',
  expires_at DATETIME2 NOT NULL,
  revoked BIT DEFAULT 0,
  device_info NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);

-- WebAuthn credentials
CREATE TABLE webauthn_credentials (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  credential_id NVARCHAR(255) NOT NULL UNIQUE,
  public_key VARBINARY(MAX) NOT NULL,
  counter INT DEFAULT 0,
  transports NVARCHAR(255),
  rp_id NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_webauthn_credentials_user_rp ON webauthn_credentials(user_id, rp_id);

-- OAuth accounts
CREATE TABLE oauth_accounts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  provider NVARCHAR(50) NOT NULL,
  provider_id NVARCHAR(255) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_id)
);

-- Conversations
CREATE TABLE conversations (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user1_id INT NOT NULL,
  user2_id INT NOT NULL,
  is_group BIT DEFAULT 0,
  group_name NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE NO ACTION
);

-- Conversation participants
CREATE TABLE conversation_participants (
  id INT IDENTITY(1,1) PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(conversation_id, user_id)
);

-- Messages
CREATE TABLE messages (
  id INT IDENTITY(1,1) PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content NVARCHAR(MAX) NOT NULL,
  attachment_url NVARCHAR(500),
  attachment_mime NVARCHAR(100),
  reply_to_message_id INT,
  [read] BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE NO ACTION
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Message reactions
CREATE TABLE message_reactions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  reaction_type NVARCHAR(50) NOT NULL DEFAULT 'like',
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_type ON message_reactions(reaction_type);

-- Notifications
CREATE TABLE notifications (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  type NVARCHAR(50) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  message NVARCHAR(MAX) NOT NULL,
  link NVARCHAR(500),
  [read] BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications([read]);

-- Push subscriptions
CREATE TABLE push_subscriptions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint NVARCHAR(500) NOT NULL UNIQUE,
  p256dh NVARCHAR(255) NOT NULL,
  auth NVARCHAR(255) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  tier NVARCHAR(50) NOT NULL DEFAULT 'free',
  status NVARCHAR(50) NOT NULL DEFAULT 'active',
  payment_provider NVARCHAR(50),
  provider_subscription_id NVARCHAR(255),
  provider_customer_id NVARCHAR(255),
  started_at DATETIME2 DEFAULT GETDATE(),
  ends_at DATETIME2,
  auto_renew BIT DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payment methods
CREATE TABLE payment_methods (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  payment_provider NVARCHAR(50) DEFAULT 'mock',
  provider_payment_method_id NVARCHAR(255),
  card_type NVARCHAR(50) NOT NULL,
  last_four NVARCHAR(4) NOT NULL,
  expiry_month INT NOT NULL,
  expiry_year INT NOT NULL,
  is_default BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Invoices
CREATE TABLE invoices (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  payment_provider NVARCHAR(50),
  provider_payment_id NVARCHAR(255),
  amount FLOAT NOT NULL,
  tier NVARCHAR(50) NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'paid',
  invoice_date DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payment customers
CREATE TABLE payment_customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  payment_provider NVARCHAR(50) NOT NULL,
  provider_customer_id NVARCHAR(255) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, payment_provider)
);

-- Services
CREATE TABLE services (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX) NOT NULL,
  category NVARCHAR(100) NOT NULL,
  price_per_hour FLOAT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  experience_level NVARCHAR(50),
  format NVARCHAR(50),
  availability NVARCHAR(MAX),
  location NVARCHAR(255),
  tags NVARCHAR(MAX),
  image_url NVARCHAR(500),
  status NVARCHAR(50) DEFAULT 'active',
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_status ON services(status);

-- Service orders
CREATE TABLE service_orders (
  id INT IDENTITY(1,1) PRIMARY KEY,
  service_id INT NOT NULL,
  buyer_id INT NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_service_orders_service ON service_orders(service_id);
CREATE INDEX idx_service_orders_buyer ON service_orders(buyer_id);
CREATE INDEX idx_service_orders_status ON service_orders(status);

-- Service reviews
CREATE TABLE service_reviews (
  id INT IDENTITY(1,1) PRIMARY KEY,
  service_id INT NOT NULL,
  user_id INT NOT NULL,
  rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  is_hidden BIT DEFAULT 0,
  is_deleted BIT DEFAULT 0,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(service_id, user_id)
);

CREATE INDEX idx_service_reviews_service ON service_reviews(service_id);
CREATE INDEX idx_service_reviews_user ON service_reviews(user_id);

-- User locations
CREATE TABLE user_locations (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  city NVARCHAR(255),
  latitude FLOAT,
  longitude FLOAT,
  last_updated DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_locations_user ON user_locations(user_id);

-- Audit logs
CREATE TABLE audit_logs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT,
  action NVARCHAR(100) NOT NULL,
  details NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Follows
CREATE TABLE follows (
  id INT IDENTITY(1,1) PRIMARY KEY,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Posts
CREATE TABLE posts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  title NVARCHAR(255),
  content_type NVARCHAR(50) DEFAULT 'text',
  text_content NVARCHAR(MAX),
  media_url NVARCHAR(500),
  audio_url NVARCHAR(500),
  image_url NVARCHAR(500),
  video_url NVARCHAR(500),
  external_video_url NVARCHAR(500),
  is_reel BIT DEFAULT 0,
  activity_label NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_is_reel ON posts(is_reel);

-- Hashtags
CREATE TABLE hashtags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL UNIQUE,
  usage_count INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX idx_hashtags_name ON hashtags(name);

-- Post hashtags
CREATE TABLE post_hashtags (
  post_id INT NOT NULL,
  hashtag_id INT NOT NULL,
  PRIMARY KEY (post_id, hashtag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (hashtag_id) REFERENCES hashtags(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_hashtags_post ON post_hashtags(post_id);

-- Tags
CREATE TABLE tags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL UNIQUE,
  usage_count INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX idx_tags_name ON tags(name);

-- Post tags
CREATE TABLE post_tags (
  post_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_tags_post ON post_tags(post_id);

-- Post reactions
CREATE TABLE post_reactions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  reaction_type NVARCHAR(50) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_reactions_type ON post_reactions(reaction_type);

-- Post comments
CREATE TABLE post_comments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_id INT,
  content NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  is_hidden BIT DEFAULT 0,
  is_deleted BIT DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE NO ACTION
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_comments_parent ON post_comments(parent_id);

-- Post reposts
CREATE TABLE post_reposts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  original_post_id INT NOT NULL,
  repost_depth INT DEFAULT 1,
  is_quote_repost BIT DEFAULT 0,
  quote_text NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
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
  id INT IDENTITY(1,1) PRIMARY KEY,
  comment_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(comment_id, user_id)
);

-- Career jobs
CREATE TABLE career_jobs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  title NVARCHAR(255) NOT NULL,
  location NVARCHAR(255),
  team NVARCHAR(255),
  employment_type NVARCHAR(100),
  seniority NVARCHAR(100),
  headline NVARCHAR(500),
  description NVARCHAR(MAX),
  responsibilities NVARCHAR(MAX),
  requirements NVARCHAR(MAX),
  perks NVARCHAR(MAX),
  tags NVARCHAR(MAX),
  salary_min FLOAT,
  salary_max FLOAT,
  salary_currency NVARCHAR(10),
  apply_url NVARCHAR(500),
  workplace_type NVARCHAR(50),
  visibility NVARCHAR(50) DEFAULT 'public',
  priority NVARCHAR(50),
  status NVARCHAR(50) DEFAULT 'draft',
  go_live_at DATETIME2,
  freeze_until DATETIME2,
  is_frozen BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX idx_career_jobs_status ON career_jobs(status);
CREATE INDEX idx_career_jobs_live ON career_jobs(go_live_at);

-- Career job assets
CREATE TABLE career_job_assets (
  id INT IDENTITY(1,1) PRIMARY KEY,
  job_id INT NOT NULL,
  label NVARCHAR(255),
  file_name NVARCHAR(255),
  file_path NVARCHAR(500) NOT NULL,
  file_size INT,
  mime_type NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_career_job_assets_job ON career_job_assets(job_id);

-- Career applications
CREATE TABLE career_applications (
  id INT IDENTITY(1,1) PRIMARY KEY,
  job_id INT,
  user_id INT,
  name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL,
  phone NVARCHAR(50),
  position NVARCHAR(255),
  resume_url NVARCHAR(500),
  cover_letter NVARCHAR(MAX),
  resume_file NVARCHAR(500),
  portfolio_file NVARCHAR(500),
  status NVARCHAR(50) DEFAULT 'new',
  reviewer_id INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE NO ACTION
);

-- User blocks
CREATE TABLE user_blocks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  reason NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

-- User reports
CREATE TABLE user_reports (
  id INT IDENTITY(1,1) PRIMARY KEY,
  reporter_id INT NOT NULL,
  reported_id INT NOT NULL,
  reason NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  status NVARCHAR(50) DEFAULT 'pending',
  admin_notes NVARCHAR(MAX),
  reviewed_by INT,
  reviewed_at DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_reporter ON user_reports(reporter_id);
CREATE INDEX idx_reports_reported ON user_reports(reported_id);
CREATE INDEX idx_reports_status ON user_reports(status);

-- User moderation
CREATE TABLE user_moderation (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  block_functionality_locked BIT DEFAULT 0,
  lock_reason NVARCHAR(MAX),
  locked_by INT,
  locked_at DATETIME2,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_moderation_locked ON user_moderation(block_functionality_locked);

-- Content appeals
CREATE TABLE content_appeals (
  id INT IDENTITY(1,1) PRIMARY KEY,
  email NVARCHAR(255) NOT NULL,
  content_type NVARCHAR(100) NOT NULL,
  content_url NVARCHAR(500),
  removal_reason NVARCHAR(MAX),
  description NVARCHAR(MAX),
  appeal_reason NVARCHAR(MAX) NOT NULL,
  additional_info NVARCHAR(MAX),
  status NVARCHAR(50) DEFAULT 'open',
  reviewer_id INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Account appeals
CREATE TABLE account_appeals (
  id INT IDENTITY(1,1) PRIMARY KEY,
  email NVARCHAR(255) NOT NULL,
  username NVARCHAR(255) NOT NULL,
  account_action NVARCHAR(100) NOT NULL,
  action_date NVARCHAR(50),
  violation_reason NVARCHAR(MAX),
  appeal_reason NVARCHAR(MAX) NOT NULL,
  prevention_plan NVARCHAR(MAX),
  additional_info NVARCHAR(MAX),
  contact_email NVARCHAR(255),
  status NVARCHAR(50) DEFAULT 'open',
  reviewer_id INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Livestreams
CREATE TABLE livestreams (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  stream_key NVARCHAR(255) NOT NULL UNIQUE,
  status NVARCHAR(50) DEFAULT 'scheduled',
  started_at DATETIME2,
  ended_at DATETIME2,
  viewer_count_peak INT DEFAULT 0,
  recording_enabled BIT DEFAULT 1,
  recording_url NVARCHAR(500),
  thumbnail_url NVARCHAR(500),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_livestreams_user ON livestreams(user_id);
CREATE INDEX idx_livestreams_status ON livestreams(status);
CREATE INDEX idx_livestreams_stream_key ON livestreams(stream_key);

-- Billing charges
CREATE TABLE billing_charges (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  amount FLOAT NOT NULL,
  description NVARCHAR(255) NOT NULL,
  charge_date DATETIME2 DEFAULT GETDATE(),
  status NVARCHAR(50) DEFAULT 'completed',
  tier NVARCHAR(50),
  invoice_id INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE NO ACTION
);

CREATE INDEX idx_billing_charges_user ON billing_charges(user_id);
CREATE INDEX idx_billing_charges_status ON billing_charges(status);

-- Refund requests
CREATE TABLE refund_requests (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  charge_id INT,
  amount FLOAT NOT NULL,
  reason NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  order_date NVARCHAR(50),
  transaction_id NVARCHAR(255),
  preferred_method NVARCHAR(50) NOT NULL,
  account_email NVARCHAR(255),
  account_last_four NVARCHAR(4),
  screenshot NVARCHAR(500),
  status NVARCHAR(50) DEFAULT 'pending',
  reviewed_by INT,
  admin_notes NVARCHAR(MAX),
  refund_amount FLOAT,
  reviewed_at DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (charge_id) REFERENCES billing_charges(id) ON DELETE NO ACTION,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_refund_requests_user ON refund_requests(user_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);

-- Livestream viewers
CREATE TABLE livestream_viewers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  stream_id INT NOT NULL,
  user_id INT,
  joined_at DATETIME2 DEFAULT GETDATE(),
  left_at DATETIME2,
  FOREIGN KEY (stream_id) REFERENCES livestreams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_livestream_viewers_stream ON livestream_viewers(stream_id);
CREATE INDEX idx_livestream_viewers_user ON livestream_viewers(user_id);

-- Livestream chat
CREATE TABLE livestream_chat (
  id INT IDENTITY(1,1) PRIMARY KEY,
  stream_id INT NOT NULL,
  user_id INT NOT NULL,
  message NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (stream_id) REFERENCES livestreams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_livestream_chat_stream ON livestream_chat(stream_id);

-- User admin notes
CREATE TABLE user_admin_notes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  admin_id INT NOT NULL,
  note NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_user_admin_notes_user ON user_admin_notes(user_id);
CREATE INDEX idx_user_admin_notes_admin ON user_admin_notes(admin_id);

-- Projects table
CREATE TABLE projects (
  id INT IDENTITY(1,1) PRIMARY KEY,
  owner_id INT NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  cover_image NVARCHAR(500),
  category NVARCHAR(100),
  status NVARCHAR(50) DEFAULT 'planning',       -- 'planning', 'in-progress', 'completed', 'paused', 'archived'
  visibility NVARCHAR(50) DEFAULT 'public',     -- 'public', 'private', 'unlisted'
  progress_percent INT DEFAULT 0,                -- 0-100
  start_date DATETIME2,
  target_end_date DATETIME2,
  actual_end_date DATETIME2,
  tags NVARCHAR(MAX),                           -- JSON array
  gallery_images NVARCHAR(MAX),                 -- JSON array of image URLs
  goals NVARCHAR(MAX),                          -- JSON array of goal objects
  team_members NVARCHAR(MAX),                   -- JSON array of {user_id, role}
  view_count INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_visibility ON projects(visibility);

-- Project milestones
CREATE TABLE project_milestones (
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  target_date DATETIME2,
  status NVARCHAR(50) DEFAULT 'pending',        -- 'pending', 'in-progress', 'completed'
  progress_percent INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_milestones_project ON project_milestones(project_id);
CREATE INDEX idx_milestones_status ON project_milestones(status);

-- Project tasks
CREATE TABLE project_tasks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL,
  milestone_id INT,
  assigned_to INT,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  status NVARCHAR(50) DEFAULT 'todo',           -- 'todo', 'in-progress', 'review', 'done'
  priority NVARCHAR(50) DEFAULT 'medium',       -- 'low', 'medium', 'high', 'critical'
  due_date DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
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
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  title NVARCHAR(255),
  content_type NVARCHAR(50) DEFAULT 'text',     -- 'text', 'image', 'video', 'milestone'
  text_content NVARCHAR(MAX),
  media_url NVARCHAR(500),
  audio_url NVARCHAR(500),
  image_url NVARCHAR(500),
  video_url NVARCHAR(500),
  external_video_url NVARCHAR(500),
  milestone_id INT,
  status_update NVARCHAR(50),                   -- 'progress', 'blocker', 'completed', 'decision'
  metrics NVARCHAR(MAX),                        -- JSON: {progress: 0-100, before: x, after: y}
  attachment_urls NVARCHAR(MAX),                -- JSON array
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);

CREATE INDEX idx_updates_project ON project_updates(project_id);
CREATE INDEX idx_updates_user ON project_updates(user_id);
CREATE INDEX idx_updates_created_at ON project_updates(created_at);

-- Project reactions (likes on updates)
CREATE TABLE project_reactions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  update_id INT NOT NULL,
  user_id INT NOT NULL,
  reaction_type NVARCHAR(50) DEFAULT 'like',   -- 'like', 'love', 'celebration'
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(update_id, user_id)
);

CREATE INDEX idx_reactions_update ON project_reactions(update_id);
CREATE INDEX idx_reactions_type ON project_reactions(reaction_type);

-- Project comments
CREATE TABLE project_comments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL,
  update_id INT,
  user_id INT NOT NULL,
  parent_id INT,                                -- For threaded replies
  content NVARCHAR(MAX) NOT NULL,
  is_pinned BIT DEFAULT 0,                      -- Admin/owner can pin comments
  is_hidden BIT DEFAULT 0,                      -- Admin/owner can hide comments
  edited_at DATETIME2,                          -- Track if comment was edited
  created_at DATETIME2 DEFAULT GETDATE(),
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
  id INT IDENTITY(1,1) PRIMARY KEY,
  comment_id INT NOT NULL,
  file_url NVARCHAR(500) NOT NULL,
  file_name NVARCHAR(255) NOT NULL,
  file_type NVARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (comment_id) REFERENCES project_comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comment_files_comment ON project_comment_files(comment_id);

-- Project comment reactions (stars)
CREATE TABLE project_comment_reactions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  comment_id INT NOT NULL,
  user_id INT NOT NULL,
  reaction_type NVARCHAR(50) DEFAULT 'star',    -- 'star', 'helpful', etc.
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (comment_id) REFERENCES project_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  UNIQUE(comment_id, user_id, reaction_type)
);

CREATE INDEX idx_comment_reactions_comment ON project_comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_user ON project_comment_reactions(user_id);

-- Pricing tiers
CREATE TABLE pricing_tiers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  tier_id NVARCHAR(50) NOT NULL UNIQUE,
  name NVARCHAR(100) NOT NULL,
  price FLOAT NOT NULL DEFAULT 0,
  price_display NVARCHAR(50) NOT NULL,
  tagline NVARCHAR(255),
  features NVARCHAR(MAX),                       -- JSON array of feature strings
  is_highlighted BIT DEFAULT 0,
  display_order INT DEFAULT 0,
  is_active BIT DEFAULT 1,
  note NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX idx_pricing_tiers_tier_id ON pricing_tiers(tier_id);
CREATE INDEX idx_pricing_tiers_display_order ON pricing_tiers(display_order);
CREATE INDEX idx_pricing_tiers_is_active ON pricing_tiers(is_active);

-- Sales inquiries
CREATE TABLE sales_inquiries (
  id INT IDENTITY(1,1) PRIMARY KEY,
  company_name NVARCHAR(255) NOT NULL,
  industry NVARCHAR(100),
  company_size NVARCHAR(50),
  company_website NVARCHAR(500),
  company_address NVARCHAR(500),
  company_city NVARCHAR(100),
  company_country NVARCHAR(100),
  contact_name NVARCHAR(255) NOT NULL,
  contact_email NVARCHAR(255) NOT NULL,
  contact_phone NVARCHAR(50),
  contact_job_title NVARCHAR(100),
  contact_department NVARCHAR(100),
  use_case NVARCHAR(MAX) NOT NULL,
  expected_users NVARCHAR(50),
  timeline NVARCHAR(50),
  budget_range NVARCHAR(50),
  current_solution NVARCHAR(MAX),
  integration_needs NVARCHAR(MAX),
  additional_info NVARCHAR(MAX),
  how_heard_about_us NVARCHAR(100),
  preferred_contact_method NVARCHAR(50) DEFAULT 'email',
  preferred_contact_time NVARCHAR(100),
  status NVARCHAR(50) DEFAULT 'new',
  priority NVARCHAR(50) DEFAULT 'normal',
  assigned_to INT,
  assigned_at DATETIME2,
  last_contacted_at DATETIME2,
  last_contacted_by INT,
  follow_up_notes NVARCHAR(MAX),
  next_follow_up_date DATETIME2,
  outcome NVARCHAR(50),
  outcome_notes NVARCHAR(MAX),
  closed_at DATETIME2,
  closed_by INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
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
  id INT IDENTITY(1,1) PRIMARY KEY,
  inquiry_id INT NOT NULL,
  sender_id INT NOT NULL,
  communication_type NVARCHAR(50) NOT NULL,     -- 'email', 'phone', 'meeting', 'note'
  subject NVARCHAR(255),
  content NVARCHAR(MAX) NOT NULL,
  recipient_email NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (inquiry_id) REFERENCES sales_inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_sales_comms_inquiry ON sales_inquiry_communications(inquiry_id);
CREATE INDEX idx_sales_comms_sender ON sales_inquiry_communications(sender_id);

-- Business admin assignments
CREATE TABLE business_admin_assignments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  parent_admin_id INT NOT NULL,
  assigned_admin_id INT NOT NULL,
  permissions NVARCHAR(MAX) DEFAULT '[]',
  scopes NVARCHAR(MAX) DEFAULT '[]',
  notes NVARCHAR(MAX),
  status NVARCHAR(50) DEFAULT 'active',
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (parent_admin_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(parent_admin_id, assigned_admin_id)
);

CREATE INDEX idx_baa_parent ON business_admin_assignments(parent_admin_id);
CREATE INDEX idx_baa_assigned ON business_admin_assignments(assigned_admin_id);
CREATE INDEX idx_baa_status ON business_admin_assignments(status);

