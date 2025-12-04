/**
 * Test fixture data for unit and integration tests
 */

const fixtures = {
  // Mock user data
  users: {
    standard: {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'hashed_password',
      profile_picture: '/uploads/profiles/test.jpg',
      bio: 'Test bio',
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString()
    },
    admin: {
      id: 2,
      username: 'adminuser',
      email: 'admin@example.com',
      password_hash: 'hashed_password',
      profile_picture: '/uploads/profiles/admin.jpg',
      bio: 'Admin bio',
      role: 'admin',
      is_active: 1,
      created_at: new Date().toISOString()
    },
    moderator: {
      id: 3,
      username: 'moderator',
      email: 'mod@example.com',
      password_hash: 'hashed_password',
      profile_picture: '/uploads/profiles/mod.jpg',
      bio: 'Moderator bio',
      role: 'moderator',
      is_active: 1,
      created_at: new Date().toISOString()
    }
  },

  // Mock posts/content
  posts: {
    text: {
      id: 1,
      user_id: 1,
      content: 'This is a test post',
      type: 'text',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    media: {
      id: 2,
      user_id: 1,
      content: 'Check out this media',
      type: 'media',
      media_url: '/uploads/posts/test-media.jpg',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  },

  // Mock authentication tokens
  tokens: {
    validJWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNjM2OTQ1MDAwfQ.signature',
    expiredJWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNjM2ODU4NjAwLCJleHAiOjE2MzY5NDUwMDB9.signature',
    invalidJWT: 'invalid.token.signature'
  },

  // Mock services
  services: {
    standard: {
      id: 1,
      user_id: 1,
      title: 'Test Service',
      description: 'A test service',
      category: 'technology',
      image_url: '/uploads/services/test.jpg',
      created_at: new Date().toISOString()
    }
  },

  // Mock messages
  messages: {
    text: {
      id: 1,
      sender_id: 1,
      recipient_id: 2,
      content: 'Hello, this is a test message',
      attachment_url: null,
      created_at: new Date().toISOString()
    },
    withAttachment: {
      id: 2,
      sender_id: 1,
      recipient_id: 2,
      content: 'Check this file',
      attachment_url: '/uploads/chat/test-file.pdf',
      created_at: new Date().toISOString()
    }
  },

  // Mock HTTP requests
  requests: {
    validLogin: {
      email: 'test@example.com',
      password: 'TestPassword123!'
    },
    validRegistration: {
      username: 'newuser',
      email: 'new@example.com',
      password: 'SecurePass123!',
      confirmPassword: 'SecurePass123!'
    },
    invalidEmail: {
      email: 'invalid-email',
      password: 'TestPassword123!'
    }
  }
};

module.exports = fixtures;
