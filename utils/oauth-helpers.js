/**
 * Unified OAuth Helper Functions
 * Shared between Passport.js (local dev) and Azure Easy Auth (production)
 */

const bcrypt = require('bcrypt');
const {
    getUserByEmail,
    getUserByProvider,
    getUserByHandle,
    createUser,
    updateUserProvider,
    getUserById,
    markEmailAsVerified
} = require('../db');

/**
 * Generate base handle from name or email
 */
function generateBaseHandle(name, email) {
    if (name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    if (email) {
        return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    return 'user' + Date.now().toString().slice(-6);
}

/**
 * Generate unique handle with collision detection
 */
async function generateUniqueHandle(baseHandle, excludeUserId = null) {
    let handle = baseHandle;
    let counter = 1;
    while (true) {
        const existing = await getUserByHandle(handle);
        if (!existing || (excludeUserId && existing.id === excludeUserId)) {
            return handle;
        }
        handle = `${baseHandle}${counter}`;
        counter++;
        if (counter > 1000) {
            handle = `${baseHandle}${Date.now().toString().slice(-6)}`;
            break;
        }
    }
    return handle;
}

/**
 * Find or create OAuth user (unified for both Passport and Easy Auth)
 */
async function findOrCreateOAuthUser({ provider, providerId, displayName, email, photoUrl = null }) {
    // Try to find by provider
    let user = await getUserByProvider(provider, providerId);
    if (user) {
        return user;
    }

    // Try to find by email
    if (email) {
        const byEmail = await getUserByEmail(email);
        if (byEmail) {
            // Link provider to existing account
            updateUserProvider({ userId: byEmail.id, provider, providerId });
            return await getUserById(byEmail.id);
        }
    }

    // Create new user
    const dummyHash = await bcrypt.hash(`oauth-${provider}-${providerId}-${Date.now()}`, 10);
    const baseHandle = generateBaseHandle(displayName, email);
    const uniqueHandle = await generateUniqueHandle(baseHandle);

    // Create placeholder email if no real email provided (e.g., Twitter/X may not provide email)
    const userEmail = email || `${providerId}@${provider}.oauth.local`;
    const isPlaceholderEmail = userEmail.endsWith('.oauth.local');

    const userId = await createUser({
        fullName: displayName || (email || 'User'),
        email: userEmail,
        passwordHash: dummyHash,
        handle: uniqueHandle
    });

    if (!userId) {
        throw new Error('Failed to create user: no user ID returned');
    }

    // Link provider
    updateUserProvider({ userId, provider, providerId });

    // Auto-verify email for OAuth users
    // For placeholder emails (Twitter/X without email permission), we still verify since they authenticated via OAuth
    // For real emails, verify normally
    try {
        markEmailAsVerified({ userId });
        if (isPlaceholderEmail) {
            console.log(`✅ Auto-verified placeholder email for OAuth user (${provider}): ${userEmail} - User authenticated via OAuth, skipping email verification requirement`);
        } else {
            console.log(`✅ Auto-verified email for new OAuth user (${provider}): ${userEmail}`);
        }
    } catch (e) {
        console.warn('Failed to auto-verify email for OAuth user:', e.message);
    }

    // Fetch fresh user data to ensure email_verified is set
    const newUser = await getUserById(userId);
    if (newUser) {
        // Ensure email_verified is set (normalize boolean to integer for consistency)
        newUser.email_verified = newUser.email_verified === true ? 1 : (newUser.email_verified || 1);
    }

    return newUser;
}

/**
 * Import profile photo from URL if needed
 */
async function importProfilePhotoIfNeeded(user, photoUrl) {
    if (!photoUrl || !user || user.profile_picture) return;

    try {
        const fetch = require('node-fetch');
        const path = require('path');
        const fs = require('fs');

        const res = await fetch(photoUrl);
        if (!res || !res.ok) return;

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
        
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = (photoUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ext.length <= 5 ? ext : 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        
        const { updateProfilePicture } = require('../db');
        updateProfilePicture({ userId: user.id, filename: `profiles/${filename}` });
    } catch (e) {
        console.warn('Profile photo import failed:', e.message);
    }
}

module.exports = {
    generateBaseHandle,
    generateUniqueHandle,
    findOrCreateOAuthUser,
    importProfilePhotoIfNeeded
};
