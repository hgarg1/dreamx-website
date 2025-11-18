# Payment Services

This directory contains payment processor integrations for Dream X.

## Structure

```
payments/
├── index.js           # Payment service manager (unified interface)
├── stripe.js          # Stripe integration
├── lemonsqueezy.js    # Lemon Squeezy integration
└── square.js          # Square integration
```

## Overview

### Payment Service Manager (`index.js`)

The main entry point that provides a unified interface for all payment processors. It automatically initializes configured providers and routes requests to the appropriate service.

**Key Features:**
- Auto-initialization of all configured providers
- Unified API across different processors
- Default provider selection
- Provider availability checking

### Stripe Service (`stripe.js`)

Integration with Stripe payment processor.

**Capabilities:**
- Customer management
- Payment intents
- Subscriptions
- Payment methods
- Refunds
- Webhook verification

**Key Methods:**
- `createCustomer(params)` - Create a Stripe customer
- `createPaymentIntent(params)` - Create a payment intent
- `createSubscription(params)` - Create a subscription
- `cancelSubscription(subscriptionId)` - Cancel a subscription
- `constructWebhookEvent(rawBody, signature)` - Verify and parse webhook
- `createRefund(paymentIntentId, amount)` - Process refund

### Lemon Squeezy Service (`lemonsqueezy.js`)

Integration with Lemon Squeezy (Merchant of Record).

**Capabilities:**
- Checkout creation
- Subscription management
- Order tracking
- Automatic tax/VAT handling
- Webhook verification

**Key Methods:**
- `createCheckout(params)` - Create checkout URL
- `getSubscription(subscriptionId)` - Get subscription details
- `cancelSubscription(subscriptionId)` - Cancel subscription
- `updateSubscription(subscriptionId, params)` - Update subscription
- `verifyWebhook(payload, signature)` - Verify webhook signature
- `getProducts(storeId)` - List products
- `getVariants(productId)` - List product variants

### Square Service (`square.js`)

Integration with Square payment processor.

**Capabilities:**
- Customer management
- Payments (online and in-person)
- Subscriptions
- Cards on file
- Locations
- Refunds
- Webhook verification

**Key Methods:**
- `createPayment(params)` - Process a payment
- `createCustomer(params)` - Create a customer
- `createSubscription(params)` - Create a subscription
- `cancelSubscription(subscriptionId)` - Cancel subscription
- `createCard(params)` - Save card on file
- `verifyWebhook(body, signature, url)` - Verify webhook
- `listLocations()` - Get Square locations
- `createRefund(params)` - Process refund

## Usage

### Basic Usage

```javascript
const paymentService = require('./services/payments');

// Initialize all providers (called automatically on app start)
paymentService.initializeAll();

// Get configured providers
const providers = paymentService.getConfiguredProviders();
console.log('Available providers:', providers);

// Use default provider
const customer = await paymentService.createCustomer(null, {
    email: 'user@example.com',
    name: 'John Doe'
});

// Use specific provider
const payment = await paymentService.createPayment('stripe', {
    amount: 29.99,
    currency: 'usd',
    customerId: customer.id
});
```

### Direct Provider Access

```javascript
const stripeService = require('./services/payments/stripe');
const lemonSqueezyService = require('./services/payments/lemonsqueezy');
const squareService = require('./services/payments/square');

// Stripe-specific features
const paymentIntent = await stripeService.createPaymentIntent({
    amount: 29.99,
    currency: 'usd',
    customerId: 'cus_xxx',
    metadata: { orderId: '123' }
});

// Lemon Squeezy checkout
const checkout = await lemonSqueezyService.createCheckout({
    storeId: 'store_xxx',
    variantId: 'variant_xxx',
    customData: { userId: '123' }
});

// Square payment with location
const locations = await squareService.listLocations();
const payment = await squareService.createPayment({
    sourceId: 'card_nonce_xxx',
    amount: 29.99,
    locationId: locations[0].id
});
```

## Configuration

All payment services require environment variables to be configured. See `.env.example` for the complete list.

### Required Variables by Provider

**Stripe:**
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

**Lemon Squeezy:**
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`

**Square:**
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT` (sandbox or production)
- `SQUARE_APPLICATION_ID`
- `SQUARE_LOCATION_ID`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`

**Global:**
- `DEFAULT_PAYMENT_PROVIDER` (stripe, lemonsqueezy, or square)

## Error Handling

All services throw errors when:
- Provider is not configured
- API calls fail
- Invalid parameters provided

Always wrap payment operations in try-catch blocks:

```javascript
try {
    const payment = await paymentService.createPayment('stripe', params);
    // Handle success
} catch (error) {
    console.error('Payment failed:', error);
    // Handle error
}
```

## Webhook Verification

Each service provides webhook verification:

**Stripe:**
```javascript
const event = stripeService.constructWebhookEvent(
    req.body,  // Raw body buffer
    req.headers['stripe-signature']
);
```

**Lemon Squeezy:**
```javascript
const isValid = lemonSqueezyService.verifyWebhook(
    JSON.stringify(req.body),
    req.headers['x-signature']
);
```

**Square:**
```javascript
const isValid = squareService.verifyWebhook(
    JSON.stringify(req.body),
    req.headers['x-square-signature'],
    webhookUrl
);
```

## Testing

### Test Mode

Each provider supports test/sandbox mode:

- **Stripe**: Use test API keys (sk_test_*, pk_test_*)
- **Lemon Squeezy**: Use test store and small amounts
- **Square**: Set SQUARE_ENVIRONMENT=sandbox

### Test Cards

**Stripe:**
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002

**Square:**
- Success: 4111 1111 1111 1111
- CVV required: 4003 0500 0000 0519

### Local Webhook Testing

Use ngrok to test webhooks locally:

```bash
ngrok http 3000
```

Configure webhook URLs in provider dashboards with ngrok URL.

## Best Practices

1. **Always use environment variables** for credentials
2. **Never commit API keys** to version control
3. **Use test mode in development** with test keys
4. **Verify webhooks** before processing events
5. **Handle errors gracefully** with user-friendly messages
6. **Log all transactions** for audit trail
7. **Keep SDKs updated** for security patches
8. **Use idempotency keys** for retryable operations
9. **Store minimal PII** (use provider's vault)
10. **Comply with PCI DSS** when handling cards

## Security Considerations

- All sensitive data is handled by payment processors
- Only customer IDs and payment references are stored locally
- Webhook signatures are verified before processing
- API keys are never exposed to client-side code
- All communications use HTTPS in production

## Support

For issues with payment processors:
- Stripe: https://support.stripe.com/
- Lemon Squeezy: https://www.lemonsqueezy.com/help
- Square: https://squareup.com/help

For integration issues, check application logs and webhook delivery logs.
