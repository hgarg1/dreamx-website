# Payment Integration Guide

This guide covers the integration of three payment processors in Dream X: Stripe, Lemon Squeezy, and Square.

## Overview

Dream X now supports multiple payment processors for handling subscriptions, one-time payments, and service bookings:

- **Stripe**: Industry-leading payment processor with extensive features
- **Lemon Squeezy**: Merchant of Record (MoR) that handles tax compliance and VAT automatically
- **Square**: Comprehensive payment solution for both online and in-person payments

## Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Configuration](#configuration)
3. [Usage](#usage)
4. [Webhook Configuration](#webhook-configuration)
5. [API Reference](#api-reference)
6. [Database Schema](#database-schema)
7. [Testing](#testing)
8. [Security Best Practices](#security-best-practices)

## Setup Instructions

### Prerequisites

The following npm packages are already installed:
- `stripe` - Stripe Node.js SDK
- `@lemonsqueezy/lemonsqueezy.js` - Lemon Squeezy SDK
- `square` - Square Node.js SDK

### 1. Stripe Setup

1. **Create a Stripe account** at https://dashboard.stripe.com/register
2. **Get your API keys**:
   - Go to https://dashboard.stripe.com/apikeys
   - Copy the **Secret key** and **Publishable key**
3. **Set up webhooks**:
   - Go to https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Enter your webhook URL: `https://yourdomain.com/webhooks/stripe`
   - Select events to listen to (recommended: all subscription and payment events)
   - Copy the **Webhook signing secret**
4. **Add to .env**:
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### 2. Lemon Squeezy Setup

1. **Create a Lemon Squeezy account** at https://www.lemonsqueezy.com/
2. **Get your API key**:
   - Go to https://app.lemonsqueezy.com/settings/api
   - Create a new API key
3. **Create a store**:
   - Go to https://app.lemonsqueezy.com/stores
   - Create a store and note the Store ID
4. **Set up webhooks**:
   - Go to https://app.lemonsqueezy.com/settings/webhooks
   - Add endpoint: `https://yourdomain.com/webhooks/lemonsqueezy`
   - Copy the **Webhook secret**
5. **Add to .env**:
   ```env
   LEMONSQUEEZY_API_KEY=...
   LEMONSQUEEZY_STORE_ID=...
   LEMONSQUEEZY_WEBHOOK_SECRET=...
   ```

### 3. Square Setup

1. **Create a Square Developer account** at https://developer.squareup.com/
2. **Create an application**:
   - Go to https://developer.squareup.com/apps
   - Create a new application
3. **Get credentials**:
   - Copy the **Access Token** (sandbox or production)
   - Copy the **Application ID**
   - Note the **Location ID** from your Square dashboard
4. **Set up webhooks**:
   - Go to Webhooks in your application settings
   - Add subscription URL: `https://yourdomain.com/webhooks/square`
   - Subscribe to payment, subscription, and invoice events
   - Copy the **Signature Key**
5. **Add to .env**:
   ```env
   SQUARE_ACCESS_TOKEN=...
   SQUARE_ENVIRONMENT=sandbox
   SQUARE_APPLICATION_ID=...
   SQUARE_LOCATION_ID=...
   SQUARE_WEBHOOK_SIGNATURE_KEY=...
   ```

### 4. Set Default Provider

Choose your default payment provider in `.env`:

```env
DEFAULT_PAYMENT_PROVIDER=stripe  # Options: stripe, lemonsqueezy, square
```

## Configuration

### Environment Variables

All payment processor configuration is done through environment variables. Copy `.env.example` to `.env` and fill in the values for the processors you want to use.

You can configure:
- All three processors (recommended for flexibility)
- One or two processors (based on your needs)
- None (the system will run in mock payment mode)

### Feature Flags

Payment processing is automatically enabled when credentials are provided. No additional feature flags are needed.

## Usage

### From Application Code

The payment service provides a unified interface for all processors:

```javascript
const paymentService = require('./services/payments');

// Create a customer
const customer = await paymentService.createCustomer('stripe', {
    email: 'user@example.com',
    name: 'John Doe',
    metadata: { userId: '123' }
});

// Create a subscription
const subscription = await paymentService.createSubscription('stripe', {
    customerId: customer.id,
    priceId: 'price_xxx',
    metadata: { userId: '123', tier: 'pro' }
});

// Create a one-time payment
const payment = await paymentService.createPayment('stripe', {
    amount: 29.99,
    currency: 'usd',
    customerId: customer.id,
});

// Cancel a subscription
await paymentService.cancelSubscription('stripe', subscriptionId);
```

### Provider-Specific Methods

Each provider service can also be accessed directly:

```javascript
const stripeService = require('./services/payments/stripe');
const lemonSqueezyService = require('./services/payments/lemonsqueezy');
const squareService = require('./services/payments/square');

// Stripe-specific
const paymentIntent = await stripeService.createPaymentIntent({...});

// Lemon Squeezy checkout
const checkout = await lemonSqueezyService.createCheckout({...});

// Square payment
const payment = await squareService.createPayment({...});
```

## Webhook Configuration

### Webhook Endpoints

The following webhook endpoints are available:

- **Stripe**: `POST /webhooks/stripe`
- **Lemon Squeezy**: `POST /webhooks/lemonsqueezy`
- **Square**: `POST /webhooks/square`

### Webhook Events Handled

**Stripe:**
- `payment_intent.succeeded` - Payment successful
- `payment_intent.payment_failed` - Payment failed
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Subscription updated
- `customer.subscription.deleted` - Subscription cancelled
- `invoice.paid` - Invoice paid
- `invoice.payment_failed` - Invoice payment failed

**Lemon Squeezy:**
- `order_created` - New order
- `subscription_created` - New subscription
- `subscription_updated` - Subscription updated
- `subscription_cancelled` - Subscription cancelled
- `subscription_payment_success` - Payment succeeded
- `subscription_payment_failed` - Payment failed

**Square:**
- `payment.created` / `payment.updated` - Payment events
- `subscription.created` / `subscription.updated` - Subscription events
- `subscription.canceled` - Subscription cancelled
- `invoice.published` / `invoice.payment_made` - Invoice events

### Webhook Security

All webhooks verify signatures to ensure they come from the legitimate payment processor:

- **Stripe**: Uses `stripe-signature` header with webhook secret
- **Lemon Squeezy**: Uses `x-signature` header with HMAC SHA-256
- **Square**: Uses `x-square-signature` header with webhook URL + body

## API Reference

### Payment Service Manager

#### `initializeAll()`
Initialize all configured payment processors.

```javascript
const initialized = paymentService.initializeAll();
// Returns: { stripe: true, lemonsqueezy: false, square: true }
```

#### `getProvider(provider)`
Get a specific payment provider service.

```javascript
const stripe = paymentService.getProvider('stripe');
```

#### `getConfiguredProviders()`
Get list of all configured providers.

```javascript
const providers = paymentService.getConfiguredProviders();
// Returns: ['stripe', 'square']
```

#### `isProviderConfigured(provider)`
Check if a specific provider is configured.

```javascript
const isConfigured = paymentService.isProviderConfigured('stripe');
// Returns: true/false
```

### Database Functions

#### `getPaymentCustomer({ userId, provider })`
Get stored customer ID for a provider.

#### `createPaymentCustomer({ userId, provider, providerCustomerId })`
Store customer ID for a provider.

#### `getAllPaymentCustomers(userId)`
Get all payment customer records for a user.

#### `createOrUpdateSubscription({ userId, tier, provider, providerSubscriptionId, ... })`
Create or update subscription with provider details.

#### `addPaymentMethod({ userId, provider, providerPaymentMethodId, ... })`
Add payment method with provider details.

#### `createInvoice({ userId, provider, providerPaymentId, ... })`
Create invoice with provider details.

## Database Schema

### Tables

#### `payment_customers`
Stores customer IDs for each payment provider:
- `id` - Primary key
- `user_id` - Foreign key to users
- `payment_provider` - Provider name (stripe, lemonsqueezy, square)
- `provider_customer_id` - Customer ID from the provider
- `created_at` / `updated_at` - Timestamps

#### `user_subscriptions` (updated)
Added fields:
- `payment_provider` - Which provider manages this subscription
- `provider_subscription_id` - Subscription ID from the provider
- `provider_customer_id` - Customer ID from the provider

#### `payment_methods` (updated)
Added fields:
- `payment_provider` - Which provider owns this payment method
- `provider_payment_method_id` - Payment method ID from the provider

#### `invoices` (updated)
Added fields:
- `payment_provider` - Which provider processed this payment
- `provider_payment_id` - Payment/transaction ID from the provider

## Testing

### Testing with Test/Sandbox Modes

Each provider has a test/sandbox mode:

**Stripe Test Mode:**
- Use test API keys (starting with `sk_test_` and `pk_test_`)
- Use test card: `4242 4242 4242 4242`
- Any future expiry date
- Any CVC

**Lemon Squeezy Test Mode:**
- Lemon Squeezy doesn't have a separate test mode
- Use a test store with small amounts

**Square Sandbox:**
- Set `SQUARE_ENVIRONMENT=sandbox`
- Use sandbox access token
- Test card: `4111 1111 1111 1111`

### Testing Webhooks Locally

Use a tool like ngrok to expose your local server:

```bash
ngrok http 3000
```

Then configure the webhook URL in each provider's dashboard with the ngrok URL:
- `https://your-ngrok-url.ngrok.io/webhooks/stripe`
- `https://your-ngrok-url.ngrok.io/webhooks/lemonsqueezy`
- `https://your-ngrok-url.ngrok.io/webhooks/square`

## Security Best Practices

1. **Never commit API keys**: Always use environment variables
2. **Use test mode in development**: Only use production keys in production
3. **Verify webhook signatures**: All webhooks verify signatures before processing
4. **Use HTTPS in production**: Payment processors require HTTPS for webhooks
5. **Rotate API keys periodically**: Update keys regularly for security
6. **Store customer IDs securely**: Never expose provider customer IDs to clients
7. **Log all payment events**: Maintain audit logs for all payment transactions
8. **Handle failures gracefully**: Always have fallback logic for payment failures
9. **Keep SDKs updated**: Regularly update payment processor SDKs

## Migration from Mock Payments

The existing mock payment system continues to work. To migrate to a real processor:

1. Configure one or more payment processors
2. Set `DEFAULT_PAYMENT_PROVIDER` in .env
3. The system will automatically use the configured provider
4. Existing subscriptions and payment methods will continue to work
5. New payments will use the configured provider

## Support

For issues specific to each payment processor:

- **Stripe**: https://support.stripe.com/
- **Lemon Squeezy**: https://www.lemonsqueezy.com/help
- **Square**: https://squareup.com/help/us/en

For Dream X integration issues, check the application logs and webhook delivery logs in each provider's dashboard.

## Advanced Features

### Multi-Provider Support

You can configure multiple providers and let users choose their preferred payment method:

```javascript
// Check which providers are available
const providers = paymentService.getConfiguredProviders();

// Create payment with user's choice
const payment = await paymentService.createPayment(userChoice, params);
```

### Refunds

All providers support refunds:

```javascript
// Stripe
await stripeService.createRefund(paymentIntentId, amount);

// Square
await squareService.createRefund({ paymentId, amount, currency, reason });
```

### Subscription Management

Update subscriptions across providers:

```javascript
// Stripe
await stripeService.updateSubscription(subscriptionId, { plan: 'new_plan' });

// Lemon Squeezy
await lemonSqueezyService.updateSubscription(subscriptionId, { pause: true });
```

## Troubleshooting

### Common Issues

**"Payment provider not configured"**
- Check that environment variables are set correctly
- Ensure the provider's `initialize()` method was called successfully
- Check application logs for initialization errors

**"Webhook signature verification failed"**
- Verify webhook secret matches the one in provider's dashboard
- Ensure webhook URL is correct
- Check that webhook body is not modified (use raw body for Stripe)

**"Customer already exists"**
- Use `getPaymentCustomer()` to check if customer already exists before creating
- Handle duplicate customer creation gracefully

**Payment declined**
- Check test card numbers in test mode
- Verify amount is valid (positive, correct currency)
- Check user's actual payment method in production

## Future Enhancements

Potential improvements for the payment system:

- [ ] Support for PayPal
- [ ] Support for cryptocurrency payments
- [ ] Automated invoice generation and email
- [ ] Subscription upgrade/downgrade flows
- [ ] Payment retry logic for failed payments
- [ ] Multi-currency support
- [ ] Payment analytics dashboard
- [ ] Automated tax calculation (beyond Lemon Squeezy)
- [ ] Split payments for marketplace features
- [ ] Recurring payment reminders

## License

This payment integration is part of Dream X and follows the same license.
