// Email configuration
module.exports = {
  gmail: {
    user: process.env.GMAIL_USER,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    appPassword: process.env.GMAIL_APP_PASSWORD,
    enabled: !!(process.env.GMAIL_USER && process.env.GMAIL_REFRESH_TOKEN)
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
    enabled: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  },

  defaults: {
    from: process.env.GMAIL_USER || 'noreply@dreamx.app',
    timeout: 30000
  }
};
