/**
 * Lemon Squeezy Payment Service
 * Handles all Lemon Squeezy-related payment operations
 * Lemon Squeezy acts as a merchant of record, handling tax compliance and VAT
 */

const { lemonSqueezySetup } = require('@lemonsqueezy/lemonsqueezy.js');

class LemonSqueezyService {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize Lemon Squeezy with API key
     */
    initialize() {
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        
        if (!apiKey) {
            console.warn('Lemon Squeezy: API key not configured');
            return false;
        }

        try {
            lemonSqueezySetup({ apiKey });
            this.initialized = true;
            console.log('✅ Lemon Squeezy service initialized');
            return true;
        } catch (error) {
            console.error('Lemon Squeezy initialization error:', error);
            return false;
        }
    }

    /**
     * Check if Lemon Squeezy is properly configured
     */
    isConfigured() {
        return this.initialized;
    }

    /**
     * Create a checkout URL
     * @param {Object} params - Checkout details
     * @returns {Promise<Object>} Checkout object with URL
     */
    async createCheckout({ 
        storeId, 
        variantId, 
        customData = {},
        checkoutData = {}
    }) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { createCheckout } = require('@lemonsqueezy/lemonsqueezy.js');
            
            const checkout = await createCheckout(storeId, variantId, {
                checkoutData: {
                    email: checkoutData.email || undefined,
                    name: checkoutData.name || undefined,
                    custom: customData,
                    ...checkoutData
                }
            });

            return checkout;
        } catch (error) {
            console.error('Lemon Squeezy create checkout error:', error);
            throw error;
        }
    }

    /**
     * Get a subscription
     * @param {string} subscriptionId - Subscription ID
     * @returns {Promise<Object>} Subscription object
     */
    async getSubscription(subscriptionId) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { getSubscription } = require('@lemonsqueezy/lemonsqueezy.js');
            const subscription = await getSubscription(subscriptionId);
            return subscription;
        } catch (error) {
            console.error('Lemon Squeezy get subscription error:', error);
            throw error;
        }
    }

    /**
     * Cancel a subscription
     * @param {string} subscriptionId - Subscription ID
     * @returns {Promise<Object>} Updated subscription object
     */
    async cancelSubscription(subscriptionId) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { updateSubscription } = require('@lemonsqueezy/lemonsqueezy.js');
            const subscription = await updateSubscription(subscriptionId, {
                cancelled: true
            });
            return subscription;
        } catch (error) {
            console.error('Lemon Squeezy cancel subscription error:', error);
            throw error;
        }
    }

    /**
     * Update a subscription
     * @param {string} subscriptionId - Subscription ID
     * @param {Object} params - Update parameters
     * @returns {Promise<Object>} Updated subscription object
     */
    async updateSubscription(subscriptionId, params) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { updateSubscription } = require('@lemonsqueezy/lemonsqueezy.js');
            const subscription = await updateSubscription(subscriptionId, params);
            return subscription;
        } catch (error) {
            console.error('Lemon Squeezy update subscription error:', error);
            throw error;
        }
    }

    /**
     * Get an order
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Order object
     */
    async getOrder(orderId) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { getOrder } = require('@lemonsqueezy/lemonsqueezy.js');
            const order = await getOrder(orderId);
            return order;
        } catch (error) {
            console.error('Lemon Squeezy get order error:', error);
            throw error;
        }
    }

    /**
     * Verify webhook signature
     * @param {string} payload - Raw webhook payload
     * @param {string} signature - Webhook signature from header
     * @returns {boolean} True if valid
     */
    verifyWebhook(payload, signature) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
            throw new Error('Lemon Squeezy webhook secret not configured');
        }

        try {
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(payload).digest('hex');
            return digest === signature;
        } catch (error) {
            console.error('Lemon Squeezy webhook verification error:', error);
            return false;
        }
    }

    /**
     * Get all products for a store
     * @param {string} storeId - Store ID
     * @returns {Promise<Array>} Array of products
     */
    async getProducts(storeId) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { listProducts } = require('@lemonsqueezy/lemonsqueezy.js');
            const products = await listProducts({ filter: { storeId } });
            return products;
        } catch (error) {
            console.error('Lemon Squeezy get products error:', error);
            throw error;
        }
    }

    /**
     * Get variants for a product
     * @param {string} productId - Product ID
     * @returns {Promise<Array>} Array of variants
     */
    async getVariants(productId) {
        if (!this.isConfigured()) {
            throw new Error('Lemon Squeezy not configured');
        }

        try {
            const { listVariants } = require('@lemonsqueezy/lemonsqueezy.js');
            const variants = await listVariants({ filter: { productId } });
            return variants;
        } catch (error) {
            console.error('Lemon Squeezy get variants error:', error);
            throw error;
        }
    }
}

// Export singleton instance
const lemonSqueezyService = new LemonSqueezyService();
module.exports = lemonSqueezyService;
