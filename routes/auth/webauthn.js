const express = require('express');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const {
    getUserById,
    getUserByEmail,
    getCredentialsForUser,
    getCredentialById,
    addWebAuthnCredential,
    updateCredentialCounter
} = require('../../db');

const router = express.Router();

// Normalize hostname to apex domain (remove www prefix for consistency)
const normalizeRpID = (hostname) => {
    if (!hostname) return null;
    const normalized = hostname.toLowerCase().trim();
    if (normalized.startsWith('www.')) {
        return normalized.substring(4);
    }
    return normalized;
};

const getEnvRpHost = () => {
    if (process.env.WEBAUTHN_RP_ID) return normalizeRpID(process.env.WEBAUTHN_RP_ID);
    if (process.env.BASE_URL) {
        try {
            const hostname = new URL(process.env.BASE_URL).hostname;
            return normalizeRpID(hostname);
        } catch (_) { /* ignore */ }
    }
    return null;
};

function rpIDFromReq(req) {
    try {
        const envHost = getEnvRpHost();
        if (envHost) return envHost;
        const xfHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
        const rawHost = xfHost || req.headers.host || '';
        const hostname = rawHost.split(':')[0].trim();
        if (hostname) {
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'localhost';
            }
            const normalized = normalizeRpID(hostname);
            if (normalized) return normalized;
        }
        return 'localhost';
    } catch { return 'localhost'; }
}

const webauthnExpectedOrigins = (req, rpID) => {
    const origins = new Set();
    const envOrigin = process.env.WEBAUTHN_ORIGIN || process.env.BASE_URL;
    if (envOrigin) {
        try {
            origins.add(new URL(envOrigin).origin);
        } catch (_) { /* ignore */ }
    }
    const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    if (forwardedHost) {
        const proto = forwardedProto || 'https';
        origins.add(`${proto}://${forwardedHost}`);
    }
    if (req.headers.host) {
        origins.add(`${req.protocol}://${req.headers.host}`);
    }
    const normalizedRpID = rpID?.trim();
    if (normalizedRpID) {
        origins.add(`https://${normalizedRpID}`);
        origins.add(`http://${normalizedRpID}`);
    }
    origins.add('https://dream-x.app');
    origins.add('https://www.dream-x.app');
    origins.add('http://dream-x.app');
    origins.add('http://www.dream-x.app');
    origins.add('http://localhost');
    origins.add('https://localhost');
    origins.add('http://127.0.0.1');
    origins.add('https://127.0.0.1');
    if (normalizedRpID === 'localhost' || normalizedRpID === '127.0.0.1') {
        const commonPorts = ['3000', '3001', '8080', '5000', '8000', '4000', '443', '80'];
        commonPorts.forEach(port => {
            origins.add(`http://localhost:${port}`);
            origins.add(`https://localhost:${port}`);
            origins.add(`http://127.0.0.1:${port}`);
            origins.add(`https://127.0.0.1:${port}`);
        });
    }
    origins.add('https://dreamx-website.onrender.com');
    return Array.from(origins);
};

// Begin Registration
router.get('/registration/options', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required to create a passkey' });
    const user = await getUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const rpID = rpIDFromReq(req);
    const existingCreds = getCredentialsForUser(user.id, rpID);
    try {
        const options = await generateRegistrationOptions({
            rpName: 'Dream X',
            rpID,
            userID: Buffer.from(String(user.id)),
            userName: user.email,
            userDisplayName: user.full_name,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
                requireResidentKey: true,
            },
            excludeCredentials: existingCreds.map(c => ({
                id: c.credential_id.toString('base64url'),
                type: 'public-key',
            })),
        });
        req.session.webauthnChallenge = options.challenge;
        req.session.webauthnUserId = user.id;
        res.json(options);
    } catch (err) {
        console.error('WebAuthn registration options error:', err);
        res.status(400).json({ error: 'Passkey setup is currently unavailable. Please try again later.' });
    }
});

router.post('/registration/verify', async (req, res) => {
    if (!req.session.userId || !req.session.webauthnChallenge) return res.status(400).json({ error: 'No registration in progress' });
    const expectedChallenge = req.session.webauthnChallenge;
    const rpID = rpIDFromReq(req);
    try {
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: webauthnExpectedOrigins(req, rpID),
            expectedRPID: rpID,
        });
        const { verified, registrationInfo } = verification;
        if (verified && registrationInfo) {
            const { credentialPublicKey, credentialID, counter } = registrationInfo;
            console.log(Buffer.from(credentialID).toString('base64url'), 'registered for user ID', req.session.webauthnUserId);
            addWebAuthnCredential({
                userId: req.session.webauthnUserId,
                credentialId: credentialID.toString('base64url'),
                publicKey: credentialPublicKey.toString('base64url'),
                counter: counter || 0,
                transports: (req.body.response && req.body.response.transports) ? JSON.stringify(req.body.response.transports) : null,
                rpId: rpID,
            });
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.json({ verified: true });
        }
        req.session.webauthnUserId = null;
        return res.status(400).json({ verified: false });
    } catch (e) {
        console.error('WebAuthn registration verify error', e);
        req.session.webauthnUserId = null;
        return res.status(400).json({ error: 'Verification failed' });
    }
});

// Begin Authentication
router.get('/authentication/options', async (req, res) => {
    const rpID = rpIDFromReq(req);
    const email = (req.query.email || '').trim().toLowerCase();
    let allowCredentials = [];
    let hintedUserId = null;
    try {
        if (email) {
            const user = await getUserByEmail(email);
            if (!user) {
                return res.status(404).json({ error: 'No passkeys found for that email. Please sign in with your password.' });
            }
            const creds = getCredentialsForUser(user.id, rpID);
            if (!creds || creds.length === 0) {
                return res.status(404).json({ error: 'No passkeys found for that email. Please sign in with your password.' });
            }
            allowCredentials = creds.map((c) => ({
                id: c.credential_id.toString('base64url'),
                type: 'public-key',
                transports: c.transports ? JSON.parse(c.transports) : undefined,
            }));
            hintedUserId = user.id;
        }
        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'preferred',
            allowCredentials,
        });
        req.session.webauthnChallenge = options.challenge;
        req.session.webauthnUserId = hintedUserId;
        res.json(options);
    } catch (err) {
        console.error('WebAuthn authentication options error:', err);
        res.status(400).json({ error: 'Passkey sign-in is currently unavailable. Please try again later.' });
    }
});

router.post('/authentication/verify', async (req, res) => {
    const expectedChallenge = req.session.webauthnChallenge;
    const hintedUserId = req.session.webauthnUserId;
    const rpID = rpIDFromReq(req);
    if (!expectedChallenge) return res.status(400).json({ error: 'No auth in progress' });
    try {
        const body = req.body;
        const credentialIdB64 = body.id;
        const stored = getCredentialById(credentialIdB64, rpID);
        if (!stored) {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(200).json({ verified: false, error: 'Passkey not found. Please sign in normally and re-register your passkey.' });
        }
        const normalizeForCompare = (id) => {
            if (!id) return null;
            const normalized = id.toLowerCase().trim();
            return normalized.startsWith('www.') ? normalized.substring(4) : normalized;
        };
        const storedRpIdNormalized = normalizeForCompare(stored.rp_id);
        const currentRpIdNormalized = normalizeForCompare(rpID);
        if (stored.rp_id && storedRpIdNormalized !== currentRpIdNormalized) {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false, error: `Passkey is registered for ${stored.rp_id}. Please sign in on that domain to use it.` });
        }
        if (hintedUserId && Number(stored.user_id) !== Number(hintedUserId)) {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false, error: 'Passkey does not belong to that account.' });
        }
        const authenticator = stored ? {
            credentialID: Buffer.from(stored.credential_id, 'base64url'),
            credentialPublicKey: Buffer.from(stored.public_key, 'base64url'),
            counter: stored.counter || 0,
        } : null;
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: webauthnExpectedOrigins(req, rpID),
            expectedRPID: rpID,
            authenticator,
        });
        const { verified, authenticationInfo } = verification;
        if (verified && stored) {
            updateCredentialCounter({ credentialId: stored.credential_id, counter: authenticationInfo.newCounter ?? stored.counter });
            const user = await getUserById(stored.user_id);
            if (user) {
                req.login(user, (err) => {
                    if (err) {
                        console.error('WebAuthn login error:', err);
                        return res.status(500).json({ error: 'Login failed' });
                    }
                    req.session.userId = stored.user_id;
                    req.session.webauthnChallenge = null;
                    req.session.webauthnUserId = null;
                    return res.json({ verified: true });
                });
            } else {
                return res.status(400).json({ verified: false, error: 'User not found' });
            }
        } else {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false });
        }
    } catch (e) {
        console.error('WebAuthn authentication verify error', e);
        req.session.webauthnChallenge = null;
        req.session.webauthnUserId = null;
        return res.status(400).json({ error: 'Verification failed' });
    }
});

module.exports = router;

