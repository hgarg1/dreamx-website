/**
 * Livestream Service Index
 * 
 * Central export for all livestreaming services:
 * - WebRTC for peer connections
 * - Signaling for WebRTC communication
 * - Media server for recording and transcoding
 * 
 * @module services/livestream
 */

const webrtc = require('./webrtc');
const signaling = require('./signaling');
const mediaServer = require('./media-server');

module.exports = {
    webrtc,
    signaling,
    mediaServer
};
