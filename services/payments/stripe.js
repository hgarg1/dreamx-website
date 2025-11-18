/**
 * Stripe Payment Service
 * Handles all Stripe-related payment operations
 */

const Stripe = require('stripe');

class StripeService {
    constructor() {
        this.stripe = null;
        this.initialized = false;
    }

    /**
     * Initialize Stripe with API key
     */
    initialize() {
        const apiKey = process.env.STRIPE_SECRET_KEY;
        
        if (!apiKey) {
            console.warn('Stripe: Secret key not configured');
            return false;
        }

        try {
            this.stripe = new Stripe(apiKey, {
                apiVersion: '2023-10-16', // Use latest stable API version
            });
            this.initialized = true;
            console.log('✅ Stripe service initialized');
            return true;
        } catch (error) {
            console.error('Stripe initialization error:', error);
            return false;
        }
    }

    /**
     * Check if Stripe is properly configured
     */
    isConfigured() {
        return this.initialized && this.stripe !== null;
    }

    /**
     * Create a Stripe customer
     * @param {Object} params - Customer details
     * @returns {Promise<Object>} Stripe customer object
     */
    async createCustomer({ email, name, metadata = {} }) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const customer = await this.stripe.customers.create({
                email,
                name,
                metadata,
            });
            return customer;
        } catch (error) {
            console.error('Stripe create customer error:', error);
            throw error;
        }
    }

    /**
     * Create a payment intent
     * @param {Object} params - Payment details
     * @returns {Promise<Object>} Payment intent object
     */
    async createPaymentIntent({ amount, currency = 'usd', customerId, metadata = {} }) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to cents
                currency,
                customer: customerId,
                metadata,
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            return paymentIntent;
        } catch (error) {
            console.error('Stripe create payment intent error:', error);
            throw error;
        }
    }

    /**
     * Create a subscription
     * @param {Object} params - Subscription details
     * @returns {Promise<Object>} Subscription object
     */
    async createSubscription({ customerId, priceId, metadata = {} }) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const subscription = await this.stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                metadata,
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent'],
            });
            return subscription;
        } catch (error) {
            console.error('Stripe create subscription error:', error);
            throw error;
        }
    }

    /**
     * Cancel a subscription
     * @param {string} subscriptionId - Stripe subscription ID
     * @returns {Promise<Object>} Cancelled subscription object
     */
    async cancelSubscription(subscriptionId) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
            return subscription;
        } catch (error) {
            console.error('Stripe cancel subscription error:', error);
            throw error;
        }
    }

    /**
     * Retrieve a payment intent
     * @param {string} paymentIntentId - Payment intent ID
     * @returns {Promise<Object>} Payment intent object
     */
    async retrievePaymentIntent(paymentIntentId) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
            return paymentIntent;
        } catch (error) {
            console.error('Stripe retrieve payment intent error:', error);
            throw error;
        }
    }

    /**
     * Construct webhook event from raw body and signature
     * @param {Buffer} rawBody - Raw request body
     * @param {string} signature - Stripe signature header
     * @returns {Object} Verified webhook event
     */
    constructWebhookEvent(rawBody, signature) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error('Stripe webhook secret not configured');
        }

        try {
            const event = this.stripe.webhooks.constructEvent(
                rawBody,
                signature,
                webhookSecret
            );
            return event;
        } catch (error) {
            console.error('Stripe webhook verification error:', error);
            throw error;
        }
    }

    /**
     * Create a payment method
     * @param {Object} params - Payment method details
     * @returns {Promise<Object>} Payment method object
     */
    async createPaymentMethod({ type, card, customerId }) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const paymentMethod = await this.stripe.paymentMethods.create({
                type,
                card,
            });

            // Attach to customer if provided
            if (customerId) {
                await this.stripe.paymentMethods.attach(paymentMethod.id, {
                    customer: customerId,
                });
            }

            return paymentMethod;
        } catch (error) {
            console.error('Stripe create payment method error:', error);
            throw error;
        }
    }

    /**
     * Retrieve customer
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Customer object
     */
    async retrieveCustomer(customerId) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const customer = await this.stripe.customers.retrieve(customerId);
            return customer;
        } catch (error) {
            console.error('Stripe retrieve customer error:', error);
            throw error;
        }
    }

    /**
     * Create a refund
     * @param {string} paymentIntentId - Payment intent ID to refund
     * @param {number} amount - Amount to refund (optional, full refund if not provided)
     * @returns {Promise<Object>} Refund object
     */
    async createRefund(paymentIntentId, amount = null) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }

        try {
            const params = { payment_intent: paymentIntentId };
            if (amount !== null) {
                params.amount = Math.round(amount * 100); // Convert to cents
            }
            const refund = await this.stripe.refunds.create(params);
            return refund;
        } catch (error) {
            console.error('Stripe create refund error:', error);
            throw error;
        }
    }
}

// Export singleton instance
const stripeService = new StripeService();
module.exports = stripeService;
