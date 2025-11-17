// Services Index
// Central export point for all application services

const emailService = require('./email');
const storageServices = require('./storage');

module.exports = {
    email: emailService,
    storage: storageServices
};
