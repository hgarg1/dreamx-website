const path = require('path');
const Database = require('better-sqlite3');

// Create / open persistent database file
const db = new Database(path.join(__dirname, 'dreamx.db'));

// Initialize schema if not exists
// Users table stores core account and onboarding data as JSON strings
// For simplicity passions/categories/goals stored as JSON text columns
// Passwords stored as bcrypt hash
// experience is a single string
// Additional columns can be added later via migrations

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  categories TEXT,
  goals TEXT,
  experience TEXT,
  bio TEXT,
  location TEXT,
  skills TEXT,
  profile_picture TEXT,
  banner_image TEXT,
  provider TEXT,
  provider_id TEXT,
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1,
  message_notifications INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  transports TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  is_group INTEGER DEFAULT 0,
  group_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user1_id) REFERENCES users(id),
  FOREIGN KEY (user2_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Migration: Add new columns if they don't exist
try {
  db.exec(`ALTER TABLE users ADD COLUMN profile_picture TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bio TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN location TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN skills TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN provider TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN provider_id TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
// Ensure oauth_accounts table exists (idempotent)
db.exec(`CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);
try {
  db.exec(`ALTER TABLE users ADD COLUMN push_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN message_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN banner_image TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
// Messages attachments migration (idempotent)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN attachment_url TEXT;`);
} catch (e) {
  // Column exists
}
try {
  db.exec(`ALTER TABLE messages ADD COLUMN attachment_mime TEXT;`);
} catch (e) {
  // Column exists
}
// Group conversations migration
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN is_group INTEGER DEFAULT 0;`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN group_name TEXT;`);
} catch (e) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS conversation_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(conversation_id, user_id)
  );`);
} catch (e) {}

// Ensure audit logs table exists
try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`);
} catch (e) {}

// Posts table for rich feed content
db.exec(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content_type TEXT DEFAULT 'text',
  text_content TEXT,
  media_url TEXT,
  activity_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);

module.exports = {
  db,
  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  getUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
  getUserByProvider: (provider, providerId) => db.prepare(`
      SELECT u.* FROM oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = ? AND oa.provider_id = ?
  `).get(provider, providerId),
  getLinkedAccountsForUser: (userId) => db.prepare(
    `SELECT provider, provider_id FROM oauth_accounts WHERE user_id = ?`
  ).all(userId),
  createUser: ({ fullName, email, passwordHash }) => {
    const stmt = db.prepare(`INSERT INTO users (full_name, email, password_hash) VALUES (?,?,?)`);
    const info = stmt.run(fullName, email, passwordHash);
    return info.lastInsertRowid;
  },
  updateUserRole: ({ userId, role }) => {
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
  },
  getAllUsers: () => db.prepare(`SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC`).all(),
  // Paged users + total for admin
  getUsersPaged: ({ limit, offset, search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      return db.prepare(`
        SELECT id, full_name, email, role, created_at
        FROM users
        WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(s, s, limit, offset);
    }
    return db.prepare(`
      SELECT id, full_name, email, role, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },
  getUsersCount: ({ search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      return db.prepare(`SELECT COUNT(*) as c FROM users WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?`).get(s, s).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
  },
  searchUsers: ({ query, limit = 10, excludeUserId }) => {
    const s = `%${(query || '').toLowerCase()}%`;
    if (excludeUserId) {
      return db.prepare(`
        SELECT id, full_name, email, profile_picture, bio, location
        FROM users
        WHERE id != ? AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?)
        ORDER BY full_name ASC
        LIMIT ?
      `).all(excludeUserId, s, s, limit);
    }
    return db.prepare(`
      SELECT id, full_name, email, profile_picture, bio, location
      FROM users
      WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?
      ORDER BY full_name ASC
      LIMIT ?
    `).all(s, s, limit);
  },
  getStats: () => {
    const users = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
    const conv = db.prepare(`SELECT COUNT(*) as c FROM conversations`).get().c;
    const msgs = db.prepare(`SELECT COUNT(*) as c FROM messages`).get().c;
    return { users, conversations: conv, messages: msgs };
  },
  updateUserProvider: ({ userId, provider, providerId }) => {
    // Back-compat: also store on users table if columns exist
    try { db.prepare(`UPDATE users SET provider = ?, provider_id = ? WHERE id = ?`).run(provider, providerId, userId); } catch (e) {}
    // Preferred: link in oauth_accounts
    db.prepare(`INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_id) VALUES (?,?,?)`).run(userId, provider, providerId);
  },
  unlinkProvider: ({ userId, provider }) => {
    db.prepare(`DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?`).run(userId, provider);
  },
  updateOnboarding: ({ userId, categories, goals, experience }) => {
    db.prepare(`UPDATE users SET categories = ?, goals = ?, experience = ? WHERE id = ?`).run(
      JSON.stringify(categories),
      JSON.stringify(goals),
      experience,
      userId
    );
  },
  updateUserProfile: ({ userId, fullName, bio, location, skills }) => {
    db.prepare(`UPDATE users SET full_name = ?, bio = ?, location = ?, skills = ? WHERE id = ?`).run(
      fullName, bio, location, skills, userId
    );
  },
  updateProfilePicture: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET profile_picture = ? WHERE id = ?`).run(filename, userId);
  },
  updateBannerImage: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET banner_image = ? WHERE id = ?`).run(filename, userId);
  },
  updatePassword: ({ userId, passwordHash }) => {
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
  },
  updateNotificationSettings: ({ userId, emailNotifications, pushNotifications, messageNotifications }) => {
    db.prepare(`UPDATE users SET email_notifications = ?, push_notifications = ?, message_notifications = ? WHERE id = ?`).run(
      emailNotifications ? 1 : 0,
      pushNotifications ? 1 : 0,
      messageNotifications ? 1 : 0,
      userId
    );
  },
  // Messaging functions
  getOrCreateConversation: ({ user1Id, user2Id }) => {
    const existing = db.prepare(`
      SELECT * FROM conversations 
      WHERE is_group = 0 AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
    `).get(user1Id, user2Id, user2Id, user1Id);
    if (existing) return existing;
    const stmt = db.prepare(`INSERT INTO conversations (user1_id, user2_id, is_group) VALUES (?,?,0)`);
    const info = stmt.run(user1Id, user2Id);
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  },
  createGroupConversation: ({ creatorId, participantIds, groupName }) => {
    const stmt = db.prepare(`INSERT INTO conversations (user1_id, user2_id, is_group, group_name) VALUES (?,?,1,?)`);
    const info = stmt.run(creatorId, creatorId, groupName || 'Group Chat');
    const convId = info.lastInsertRowid;
    const addStmt = db.prepare(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?,?)`);
    addStmt.run(convId, creatorId);
    participantIds.forEach(uid => addStmt.run(convId, uid));
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  },
  getConversationParticipants: (conversationId) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
    `).all(conversationId);
  },
  isUserInConversation: ({ conversationId, userId }) => {
    const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(conversationId);
    if (!conv) return false;
    if (conv.is_group) {
      const part = db.prepare(`SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId);
      return !!part;
    }
    return conv.user1_id === userId || conv.user2_id === userId;
  },
  getUserConversations: (userId) => {
    const direct = db.prepare(`
      SELECT c.*, 
        CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
        u.full_name as other_user_name,
        u.profile_picture as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = 0) as unread_count
      FROM conversations c
      JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND c.is_group = 0
    `).all(userId, userId, userId, userId, userId);
    const groups = db.prepare(`
      SELECT c.*,
        c.group_name as other_user_name,
        NULL as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = 0) as unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ? AND c.is_group = 1
    `).all(userId, userId);
    return [...direct, ...groups].sort((a, b) => {
      const ta = new Date(a.last_message_time || 0).getTime();
      const tb = new Date(b.last_message_time || 0).getTime();
      return tb - ta;
    });
  },
  getConversationMessages: (conversationId) => {
    return db.prepare(`
      SELECT m.*, u.full_name as sender_name, u.profile_picture as sender_picture
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(conversationId);
  },
  createMessage: ({ conversationId, senderId, content, attachmentUrl, attachmentMime }) => {
    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, content, attachment_url, attachment_mime)
      VALUES (?,?,?,?,?)
    `);
    const info = stmt.run(conversationId, senderId, content || '', attachmentUrl || null, attachmentMime || null);
    return info.lastInsertRowid;
  },
  markMessagesAsRead: ({ conversationId, userId }) => {
    db.prepare(`UPDATE messages SET read = 1 WHERE conversation_id = ? AND sender_id != ?`).run(conversationId, userId);
  },
  getUnreadMessageCount: (userId) => {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.read = 0
    `).get(userId, userId, userId);
    return result.count;
  },
  // Audit logs
  addAuditLog: ({ userId, action, details }) => {
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(userId || null, action, details || null);
  },
  getAuditLogsPaged: ({ limit, offset }) => {
    return db.prepare(`SELECT id, user_id, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getAuditLogCount: () => {
    return db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c;
  },
  // Posts
  createPost: ({ userId, contentType, textContent, mediaUrl, activityLabel }) => {
    const stmt = db.prepare(`INSERT INTO posts (user_id, content_type, text_content, media_url, activity_label) VALUES (?,?,?,?,?)`);
    const info = stmt.run(userId, contentType || 'text', textContent || null, mediaUrl || null, activityLabel || null);
    return info.lastInsertRowid;
  },
  getFeedPosts: ({ limit, offset }) => {
    return db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture,
        (SELECT COUNT(*) FROM posts) as total_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },
  getUserPosts: (userId) => {
    return db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(userId);
  },
  // WebAuthn helpers
  addWebAuthnCredential: ({ userId, credentialId, publicKey, counter, transports }) => {
    db.prepare(`INSERT OR REPLACE INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports) VALUES (?,?,?,?,?)`)
      .run(userId, credentialId, publicKey, counter || 0, transports || null);
  },
  getCredentialsForUser: (userId) => {
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE user_id = ?`).all(userId);
  },
  getCredentialById: (credentialId) => {
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`).get(credentialId);
  },
  updateCredentialCounter: ({ credentialId, counter }) => {
    db.prepare(`UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?`).run(counter, credentialId);
  },
  // Notification helpers
  createNotification: ({ userId, type, title, message, link }) => {
    const stmt = db.prepare(`INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`);
    const result = stmt.run(userId, type, title, message, link || null);
    return result.lastInsertRowid;
  },
  getUserNotifications: (userId, limit = 50) => {
    const stmt = db.prepare(`
      SELECT id, type, title, message, link, read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  },
  getUnreadNotificationCount: (userId) => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`);
    const row = stmt.get(userId);
    return row ? row.count : 0;
  },
  markNotificationAsRead: (notificationId) => {
    const stmt = db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`);
    stmt.run(notificationId);
  },
  markAllNotificationsAsRead: (userId) => {
    const stmt = db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`);
    stmt.run(userId);
  },
  deleteNotification: (notificationId) => {
    const stmt = db.prepare(`DELETE FROM notifications WHERE id = ?`);
    stmt.run(notificationId);
  },
  savePushSubscription: ({ userId, endpoint, p256dh, auth }) => {
    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
    `);
    stmt.run(userId, endpoint, p256dh, auth);
  },
  getPushSubscriptions: (userId) => {
    const stmt = db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`);
    return stmt.all(userId);
  },
  deletePushSubscription: (endpoint) => {
    const stmt = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
    stmt.run(endpoint);
  }
};
