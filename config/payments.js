// Payment providers configuration
module.exports = {
  default: process.env.DEFAULT_PAYMENT_PROVIDER || 'stripe',

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    enabled: !!process.env.STRIPE_SECRET_KEY
  },

  lemonsqueezy: {
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    storeId: process.env.LEMONSQUEEZY_STORE_ID,
    webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
    enabled: !!process.env.LEMONSQUEEZY_API_KEY
  },

  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    applicationId: process.env.SQUARE_APPLICATION_ID,
    locationId: process.env.SQUARE_LOCATION_ID,
    environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    enabled: !!process.env.SQUARE_ACCESS_TOKEN
  }
};
