// Services Index
// Central export point for all application services

const emailService = require('./email');
const storageServices = require('./storage');
const livestreamServices = require('./livestream');

module.exports = {
    email: emailService,
    storage: storageServices,
    livestream: livestreamServices
};
