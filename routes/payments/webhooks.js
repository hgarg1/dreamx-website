const express = require('express');
const router = express.Router();
const paymentService = require('../../services/payments');
const { csrfExempt } = require('../../middleware/security');

// Stripe webhook endpoint - Exempt from CSRF protection (uses signature verification)
router.post('/webhooks/stripe', csrfExempt, express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        const event = paymentService.verifyWebhook('stripe', {
            body: req.body,
            signature: sig
        });

        if (!event) {
            return res.status(400).send('Webhook signature verification failed');
        }

        console.log('✅ Stripe webhook verified:', event.type);

        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed':
                console.log('💰 Checkout completed:', event.data.object.id);
                // Update user_subscriptions table
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                console.log('📦 Subscription event:', event.data.object.id);
                // Update subscription status
                break;

            case 'customer.subscription.deleted':
                console.log('🚫 Subscription cancelled:', event.data.object.id);
                // Mark subscription as cancelled
                break;

            case 'invoice.payment_succeeded':
                console.log('💵 Invoice paid:', event.data.object.id);
                // Create invoice record
                break;

            case 'invoice.payment_failed':
                console.log('❌ Invoice payment failed:', event.data.object.id);
                // Notify user
                break;

            default:
                console.log(`Unhandled Stripe event: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Lemon Squeezy webhook endpoint - Exempt from CSRF protection (uses signature verification)
router.post('/webhooks/lemonsqueezy', csrfExempt, express.json(), async (req, res) => {
    const signature = req.headers['x-signature'];

    try {
        const isValid = paymentService.verifyWebhook('lemonsqueezy', {
            body: JSON.stringify(req.body),
            signature: signature
        });

        if (!isValid) {
            return res.status(401).send('Invalid signature');
        }

        console.log('✅ Lemon Squeezy webhook verified:', req.body.meta?.event_name);

        const eventName = req.body.meta?.event_name;
        const data = req.body.data?.attributes;

        switch (eventName) {
            case 'order_created':
                console.log('💰 Order created:', data?.identifier);
                // Process order
                break;

            case 'subscription_created':
                console.log('📦 Subscription created:', data?.id);
                // Update user_subscriptions table
                break;

            case 'subscription_updated':
                console.log('📦 Subscription updated:', data?.id);
                // Update user_subscriptions table
                break;

            case 'subscription_cancelled':
                console.log('🚫 Subscription cancelled:', data?.id);
                // Mark subscription as cancelled
                break;

            case 'subscription_payment_success':
                console.log('💰 Subscription payment succeeded:', data?.id);
                // Create invoice, send receipt
                break;

            case 'subscription_payment_failed':
                console.log('❌ Subscription payment failed:', data?.id);
                // Notify user
                break;

            default:
                console.log(`Unhandled Lemon Squeezy event: ${eventName}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Lemon Squeezy webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Square webhook endpoint - Exempt from CSRF protection (uses signature verification)
router.post('/webhooks/square', csrfExempt, express.json(), async (req, res) => {
    const signature = req.headers['x-square-signature'];
    const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    try {
        const isValid = paymentService.verifyWebhook('square', {
            body: JSON.stringify(req.body),
            signature: signature,
            url: webhookUrl
        });

        if (!isValid) {
            return res.status(401).send('Invalid signature');
        }

        console.log('✅ Square webhook verified:', req.body.type);

        const eventType = req.body.type;
        const data = req.body.data?.object;

        switch (eventType) {
            case 'payment.created':
            case 'payment.updated':
                console.log('💰 Payment event:', data?.payment?.id);
                // Update payment status
                break;

            case 'subscription.created':
            case 'subscription.updated':
                console.log('📦 Subscription event:', data?.subscription?.id);
                // Update user_subscriptions table
                break;

            case 'subscription.canceled':
                console.log('🚫 Subscription cancelled:', data?.subscription?.id);
                // Mark subscription as cancelled
                break;

            case 'invoice.published':
            case 'invoice.payment_made':
                console.log('📄 Invoice event:', data?.invoice?.id);
                // Create invoice record
                break;

            default:
                console.log(`Unhandled Square event: ${eventType}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Square webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

module.exports = router;
