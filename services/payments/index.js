/**
 * Payment Service Manager
 * Unified interface for managing multiple payment processors
 */

const stripeService = require('./stripe');
const lemonSqueezyService = require('./lemonsqueezy');
const squareService = require('./square');

class PaymentService {
    constructor() {
        this.providers = {
            stripe: stripeService,
            lemonsqueezy: lemonSqueezyService,
            square: squareService,
        };
        this.defaultProvider = null;
    }

    /**
     * Initialize all configured payment providers
     */
    initializeAll() {
        const initialized = {};
        
        // Initialize each provider
        initialized.stripe = stripeService.initialize();
        initialized.lemonsqueezy = lemonSqueezyService.initialize();
        initialized.square = squareService.initialize();

        // Set default provider based on configuration
        const preferredProvider = process.env.DEFAULT_PAYMENT_PROVIDER || 'stripe';
        if (initialized[preferredProvider]) {
            this.defaultProvider = preferredProvider;
            console.log(`✅ Default payment provider set to: ${preferredProvider}`);
        } else {
            // Fall back to first available provider
            for (const [provider, isInit] of Object.entries(initialized)) {
                if (isInit) {
                    this.defaultProvider = provider;
                    console.log(`✅ Default payment provider set to: ${provider} (fallback)`);
                    break;
                }
            }
        }

        return initialized;
    }

    /**
     * Get a specific payment provider
     * @param {string} provider - Provider name (stripe, lemonsqueezy, square)
     * @returns {Object} Provider service instance
     */
    getProvider(provider = null) {
        const providerName = provider || this.defaultProvider;
        
        if (!providerName) {
            throw new Error('No payment provider configured');
        }

        const providerService = this.providers[providerName];
        
        if (!providerService) {
            throw new Error(`Unknown payment provider: ${providerName}`);
        }

        if (!providerService.isConfigured()) {
            throw new Error(`Payment provider not configured: ${providerName}`);
        }

        return providerService;
    }

    /**
     * Get list of configured providers
     * @returns {Array} Array of configured provider names
     */
    getConfiguredProviders() {
        return Object.entries(this.providers)
            .filter(([_, service]) => service.isConfigured())
            .map(([name, _]) => name);
    }

    /**
     * Check if a specific provider is configured
     * @param {string} provider - Provider name
     * @returns {boolean} True if configured
     */
    isProviderConfigured(provider) {
        return this.providers[provider]?.isConfigured() || false;
    }

    /**
     * Get default provider name
     * @returns {string|null} Default provider name or null
     */
    getDefaultProvider() {
        return this.defaultProvider;
    }

    /**
     * Create a payment with the specified or default provider
     * @param {string} provider - Provider name (optional)
     * @param {Object} params - Payment parameters
     * @returns {Promise<Object>} Payment result
     */
    async createPayment(provider, params) {
        const service = this.getProvider(provider);
        
        // Route to appropriate provider method
        switch (provider || this.defaultProvider) {
            case 'stripe':
                return await service.createPaymentIntent(params);
            case 'square':
                return await service.createPayment(params);
            case 'lemonsqueezy':
                return await service.createCheckout(params);
            default:
                throw new Error('Unsupported payment operation for provider');
        }
    }

    /**
     * Create a subscription with the specified or default provider
     * @param {string} provider - Provider name (optional)
     * @param {Object} params - Subscription parameters
     * @returns {Promise<Object>} Subscription result
     */
    async createSubscription(provider, params) {
        const service = this.getProvider(provider);
        return await service.createSubscription(params);
    }

    /**
     * Cancel a subscription with the specified or default provider
     * @param {string} provider - Provider name (optional)
     * @param {string} subscriptionId - Subscription ID
     * @returns {Promise<Object>} Cancellation result
     */
    async cancelSubscription(provider, subscriptionId) {
        const service = this.getProvider(provider);
        return await service.cancelSubscription(subscriptionId);
    }

    /**
     * Create a customer with the specified or default provider
     * @param {string} provider - Provider name (optional)
     * @param {Object} params - Customer parameters
     * @returns {Promise<Object>} Customer object
     */
    async createCustomer(provider, params) {
        const service = this.getProvider(provider);
        return await service.createCustomer(params);
    }

    /**
     * Verify webhook signature for a provider
     * @param {string} provider - Provider name
     * @param {Object} params - Verification parameters (provider-specific)
     * @returns {boolean|Object} Verification result
     */
    verifyWebhook(provider, params) {
        const service = this.getProvider(provider);
        
        switch (provider) {
            case 'stripe':
                return service.constructWebhookEvent(params.rawBody, params.signature);
            case 'square':
                return service.verifyWebhook(params.body, params.signature, params.url);
            case 'lemonsqueezy':
                return service.verifyWebhook(params.payload, params.signature);
            default:
                throw new Error('Unsupported webhook verification for provider');
        }
    }
}

// Export singleton instance
const paymentService = new PaymentService();
module.exports = paymentService;
