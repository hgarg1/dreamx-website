/**
 * Square Payment Service
 * Handles all Square-related payment operations
 */

const { Client, Environment } = require('square');
const crypto = require('crypto');

class SquareService {
    constructor() {
        this.client = null;
        this.initialized = false;
    }

    /**
     * Initialize Square with access token
     */
    initialize() {
        const accessToken = process.env.SQUARE_ACCESS_TOKEN;
        const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
        
        if (!accessToken) {
            console.warn('Square: Access token not configured');
            return false;
        }

        try {
            this.client = new Client({
                accessToken,
                environment: environment === 'production' ? Environment.Production : Environment.Sandbox,
            });
            this.initialized = true;
            console.log(`✅ Square service initialized (${environment})`);
            return true;
        } catch (error) {
            console.error('Square initialization error:', error);
            return false;
        }
    }

    /**
     * Check if Square is properly configured
     */
    isConfigured() {
        return this.initialized && this.client !== null;
    }

    /**
     * Create a payment
     * @param {Object} params - Payment details
     * @returns {Promise<Object>} Payment result
     */
    async createPayment({ 
        sourceId, 
        amount, 
        currency = 'USD', 
        customerId = null,
        locationId = null,
        note = null,
        referenceId = null
    }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const idempotencyKey = crypto.randomUUID();
            const requestBody = {
                sourceId,
                idempotencyKey,
                amountMoney: {
                    amount: Math.round(amount * 100), // Convert to cents
                    currency,
                },
            };

            if (customerId) requestBody.customerId = customerId;
            if (locationId) requestBody.locationId = locationId;
            if (note) requestBody.note = note;
            if (referenceId) requestBody.referenceId = referenceId;

            const response = await this.client.paymentsApi.createPayment(requestBody);
            return response.result;
        } catch (error) {
            console.error('Square create payment error:', error);
            throw error;
        }
    }

    /**
     * Create a customer
     * @param {Object} params - Customer details
     * @returns {Promise<Object>} Customer object
     */
    async createCustomer({ emailAddress, givenName, familyName, phoneNumber, referenceId }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const requestBody = {};
            if (emailAddress) requestBody.emailAddress = emailAddress;
            if (givenName) requestBody.givenName = givenName;
            if (familyName) requestBody.familyName = familyName;
            if (phoneNumber) requestBody.phoneNumber = phoneNumber;
            if (referenceId) requestBody.referenceId = referenceId;

            const response = await this.client.customersApi.createCustomer(requestBody);
            return response.result.customer;
        } catch (error) {
            console.error('Square create customer error:', error);
            throw error;
        }
    }

    /**
     * Create a subscription
     * @param {Object} params - Subscription details
     * @returns {Promise<Object>} Subscription object
     */
    async createSubscription({ 
        customerId, 
        planId, 
        locationId,
        priceOverride = null,
        startDate = null
    }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const idempotencyKey = crypto.randomUUID();
            const requestBody = {
                idempotencyKey,
                customerId,
                planId,
                locationId,
            };

            if (priceOverride) requestBody.priceOverrideMoney = priceOverride;
            if (startDate) requestBody.startDate = startDate;

            const response = await this.client.subscriptionsApi.createSubscription(requestBody);
            return response.result.subscription;
        } catch (error) {
            console.error('Square create subscription error:', error);
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
            throw new Error('Square not configured');
        }

        try {
            const response = await this.client.subscriptionsApi.cancelSubscription(subscriptionId);
            return response.result.subscription;
        } catch (error) {
            console.error('Square cancel subscription error:', error);
            throw error;
        }
    }

    /**
     * Retrieve a subscription
     * @param {string} subscriptionId - Subscription ID
     * @returns {Promise<Object>} Subscription object
     */
    async retrieveSubscription(subscriptionId) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const response = await this.client.subscriptionsApi.retrieveSubscription(subscriptionId);
            return response.result.subscription;
        } catch (error) {
            console.error('Square retrieve subscription error:', error);
            throw error;
        }
    }

    /**
     * Create a card on file
     * @param {Object} params - Card details
     * @returns {Promise<Object>} Card object
     */
    async createCard({ customerId, cardNonce, billingAddress, cardholderName }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const idempotencyKey = crypto.randomUUID();
            const requestBody = {
                idempotencyKey,
                sourceId: cardNonce,
                card: {
                    customerId,
                },
            };

            if (billingAddress) requestBody.card.billingAddress = billingAddress;
            if (cardholderName) requestBody.card.cardholderName = cardholderName;

            const response = await this.client.cardsApi.createCard(requestBody);
            return response.result.card;
        } catch (error) {
            console.error('Square create card error:', error);
            throw error;
        }
    }

    /**
     * Retrieve a customer
     * @param {string} customerId - Customer ID
     * @returns {Promise<Object>} Customer object
     */
    async retrieveCustomer(customerId) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const response = await this.client.customersApi.retrieveCustomer(customerId);
            return response.result.customer;
        } catch (error) {
            console.error('Square retrieve customer error:', error);
            throw error;
        }
    }

    /**
     * Create a refund
     * @param {Object} params - Refund details
     * @returns {Promise<Object>} Refund object
     */
    async createRefund({ paymentId, amount, currency = 'USD', reason }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const idempotencyKey = crypto.randomUUID();
            const requestBody = {
                idempotencyKey,
                paymentId,
                amountMoney: {
                    amount: Math.round(amount * 100), // Convert to cents
                    currency,
                },
            };

            if (reason) requestBody.reason = reason;

            const response = await this.client.refundsApi.refundPayment(requestBody);
            return response.result.refund;
        } catch (error) {
            console.error('Square create refund error:', error);
            throw error;
        }
    }

    /**
     * Verify webhook signature
     * @param {string} body - Raw webhook body
     * @param {string} signature - Signature from header
     * @param {string} url - Webhook URL
     * @returns {boolean} True if valid
     */
    verifyWebhook(body, signature, url) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        const webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
        if (!webhookSignatureKey) {
            throw new Error('Square webhook signature key not configured');
        }

        try {
            const hmac = crypto.createHmac('sha256', webhookSignatureKey);
            const payload = url + body;
            const hash = hmac.update(payload).digest('base64');
            return hash === signature;
        } catch (error) {
            console.error('Square webhook verification error:', error);
            return false;
        }
    }

    /**
     * List locations
     * @returns {Promise<Array>} Array of locations
     */
    async listLocations() {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const response = await this.client.locationsApi.listLocations();
            return response.result.locations || [];
        } catch (error) {
            console.error('Square list locations error:', error);
            throw error;
        }
    }

    /**
     * Create a catalog subscription plan
     * @param {Object} params - Plan details
     * @returns {Promise<Object>} Catalog object
     */
    async createSubscriptionPlan({ 
        name, 
        phases,
        idempotencyKey = crypto.randomUUID()
    }) {
        if (!this.isConfigured()) {
            throw new Error('Square not configured');
        }

        try {
            const requestBody = {
                idempotencyKey,
                object: {
                    type: 'SUBSCRIPTION_PLAN',
                    id: `#${name.replace(/\s+/g, '_').toUpperCase()}`,
                    subscriptionPlanData: {
                        name,
                        phases,
                    },
                },
            };

            const response = await this.client.catalogApi.upsertCatalogObject(requestBody);
            return response.result.catalogObject;
        } catch (error) {
            console.error('Square create subscription plan error:', error);
            throw error;
        }
    }
}

// Export singleton instance
const squareService = new SquareService();
module.exports = squareService;
