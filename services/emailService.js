// Email Service using Gmail OAuth2
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const OAuth2 = google.auth.OAuth2;

// Utility to safely log sensitive values without exposing full secrets
const maskValue = (value, visible = 4) => {
    if (!value) return 'undefined';
    const stringValue = String(value);
    if (stringValue.length <= visible * 2) return `${stringValue[0]}***${stringValue[stringValue.length - 1]}`;
    return `${stringValue.slice(0, visible)}***${stringValue.slice(-visible)}`;
};

// Dynamically resolve the redirect URI for Gmail OAuth based on the incoming request
const redirectUriOptions = {
    fallback: 'https://developers.google.com/oauthplayground',
    local: 'https://localhost',
    production: 'https://dream-x.app'
};

function getGmailRedirectUri(req) {
    const configured = process.env.GMAIL_REDIRECT_URI && process.env.GMAIL_REDIRECT_URI.trim();
    if (configured) {
        return configured;
    }

    const hostHeader = (req?.get ? req.get('host') : req?.headers?.host || '').toLowerCase();
    const isLocalHost = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1');
    const resolvedRedirect = isLocalHost ? redirectUriOptions.local : redirectUriOptions.production;
    console.log('[EmailService] Resolved Gmail redirect URI based on request host', {
        hostHeader,
        isLocalHost,
        resolvedRedirect
    });
    return resolvedRedirect || redirectUriOptions.fallback;
}

// Create OAuth2 client (uses request host to resolve redirect URI)
const createTransporter = async (req) => {
    const redirectUri = getGmailRedirectUri(req);
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        redirectUri
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    console.log('[EmailService] Creating Gmail OAuth2 transporter', {
        redirectUri,
        env: process.env.NODE_ENV || 'development',
        gmailUser: process.env.GMAIL_USER,
        clientId: maskValue(process.env.GMAIL_CLIENT_ID),
        clientSecret: maskValue(process.env.GMAIL_CLIENT_SECRET),
        refreshToken: maskValue(process.env.GMAIL_REFRESH_TOKEN)
    });

    try {
        const accessToken = await oauth2Client.getAccessToken();
        console.log('[EmailService] Obtained Gmail access token', {
            tokenType: accessToken?.token ? 'present' : 'missing',
            expiryDate: accessToken?.res?.data?.expiry_date || accessToken?.token?.expiry_date || 'unknown'
        });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.GMAIL_USER,
                clientId: process.env.GMAIL_CLIENT_ID,
                clientSecret: process.env.GMAIL_CLIENT_SECRET,
                refreshToken: process.env.GMAIL_REFRESH_TOKEN,
                accessToken: accessToken.token
            }
        });

        transporter.on('token', (token) => {
            console.log('[EmailService] Nodemailer refreshed access token', {
                user: token.user,
                accessToken: maskValue(token.accessToken),
                expires: token.expires
            });
        });

        transporter.on('error', (error) => {
            console.error('[EmailService] Transporter error', error);
        });

        return transporter;
    } catch (error) {
        console.error('Error creating email transporter:', error);
        throw error;
    }
};

// Generic email sender (optionally uses the request to resolve redirect URI)
async function sendEmail(to, subject, htmlContent, textContent = null, req) {
    try {
   
        // Normalize HTML/text to ensure the HTML part always renders
        const html = typeof htmlContent === 'string' ? htmlContent : (htmlContent ? String(htmlContent) : '');
        const text = typeof textContent === 'string'
            ? textContent
            : (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

        if (!html) {
            console.warn('[EmailService] Warning: htmlContent was empty for subject', subject);
        }

        const transporter = await createTransporter(req);

        // Ensure we have proper text fallback if HTML is provided
        const finalText = text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
        
        const mailOptions = {
            from: `Dream X <${process.env.GMAIL_USER}>`,
            to: to,
            subject: subject,
            html: html || '', // Always use HTML when provided, don't fallback to text
            encoding: 'utf-8',
            headers: html ? {
                'Content-Type': 'text/html',
                'X-Mailer': 'Dream X Email Service',
                'MIME-Version': '1.0'
            } : {
                'X-Mailer': 'Dream X Email Service'
            }
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to}: ${subject}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error(`❌ Error sending email to ${to}:`, error);
        return { success: false, error: error.message };
    }
}

// Email Templates
const templates = {
    // Appeal notifications
    contentApproved: (appeal) => ({
        subject: 'Your Content Appeal Has Been Approved - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(16, 185, 129, 0.2); }
                    .header { background: linear-gradient(135deg, #10b981, #059669); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .info-box { background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1)); border: 1px solid rgba(16, 185, 129, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .info-item { margin: 12px 0; color: #e2e8f0; }
                    .info-label { color: #10b981; font-weight: 700; }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Content Appeal Approved</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Great news! 🎉</p>
                        <p class="message">Your appeal for <strong>${appeal.content_type}</strong> content has been approved. The content has been restored.</p>
                        <div class="info-box">
                            <div class="info-item"><span class="info-label">Content Type:</span> ${appeal.content_type}</div>
                            <div class="info-item"><span class="info-label">Content URL:</span> ${appeal.content_url || 'N/A'}</div>
                        </div>
                        <p class="message">Thank you for your patience. Your content is now visible again on Dream X.</p>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    contentDenied: (appeal) => ({
        subject: 'Your Content Appeal Status - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(239, 68, 68, 0.2); }
                    .header { background: linear-gradient(135deg, #ef4444, #dc2626); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .info-box { background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1)); border: 1px solid rgba(239, 68, 68, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .info-item { margin: 12px 0; color: #e2e8f0; }
                    .info-label { color: #fca5a5; font-weight: 700; }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>❌ Content Appeal Denied</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Dear User,</p>
                        <p class="message">Your appeal for <strong>${appeal.content_type}</strong> content has been denied after careful review.</p>
                        <div class="info-box">
                            <div class="info-item"><span class="info-label">Content Type:</span> ${appeal.content_type}</div>
                            <div class="info-item"><span class="info-label">Reason:</span> ${appeal.removal_reason || 'Violation of community guidelines'}</div>
                        </div>
                        <p class="message">If you have further questions, please contact support at support@dream-x.app</p>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    accountApproved: (appeal) => ({
        subject: 'Your Account Appeal Has Been Approved - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(16, 185, 129, 0.2); }
                    .header { background: linear-gradient(135deg, #10b981, #059669); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .info-box { background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1)); border: 1px solid rgba(16, 185, 129, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .info-label { color: #10b981; font-weight: 700; }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(16, 185, 129, 0.4); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Account Appeal Approved</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Dear ${appeal.username || 'User'},</p>
                        <p class="message">Great news! Your account appeal has been approved. Your account restrictions have been lifted.</p>
                        <div class="info-box">
                            <p class="message" style="margin: 0;"><span class="info-label">Account Action:</span> ${appeal.account_action}</p>
                        </div>
                        <p class="message">You can now access your account normally. Thank you for your patience.</p>
                        <div class="cta">
                            <a class="button" href="https://dream-x.app">Access Your Account</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    accountDenied: (appeal) => ({
        subject: 'Your Account Appeal Status - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(239, 68, 68, 0.2); }
                    .header { background: linear-gradient(135deg, #ef4444, #dc2626); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .info-box { background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1)); border: 1px solid rgba(239, 68, 68, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .info-item { margin: 12px 0; color: #e2e8f0; }
                    .info-label { color: #fca5a5; font-weight: 700; }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>❌ Account Appeal Denied</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Dear ${appeal.username || 'User'},</p>
                        <p class="message">Your account appeal has been denied after careful review.</p>
                        <div class="info-box">
                            <div class="info-item"><span class="info-label">Account Action:</span> ${appeal.account_action}</div>
                            <div class="info-item"><span class="info-label">Reason:</span> ${appeal.violation_reason || 'Violation of community guidelines'}</div>
                        </div>
                        <p class="message">The original decision stands. If you have further questions, please contact support at support@dream-x.app</p>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Post interaction notifications
    postReaction: (author, reactor, type, postId, baseUrl) => ({
        subject: 'New reaction on your post - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                    .header { background: linear-gradient(135deg, #FF4DFF, #A53CFF); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .reactor-name { color: #FF4DFF; font-weight: 700; }
                    .reaction-type { display: inline-block; background: linear-gradient(135deg, rgba(255, 77, 255, 0.2), rgba(165, 60, 255, 0.2)); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255, 77, 255, 0.3); font-weight: 600; margin: 0 4px; }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF4DFF, #A53CFF); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(255, 77, 255, 0.4); transition: transform 0.2s; }
                    .button:hover { transform: translateY(-2px); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✨ New Reaction!</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Hi ${author.full_name}! 👋</p>
                        <p class="message">
                            <span class="reactor-name">${reactor.full_name}</span> reacted <span class="reaction-type">${type}</span> to your post.
                        </p>
                        <div class="cta">
                            <a class="button" href="${baseUrl}/post/${postId}">View Post</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    postComment: (author, commenter, content, postId, baseUrl) => ({
        subject: 'New comment on your post - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                    .header { background: linear-gradient(135deg, #FF4DFF, #A53CFF); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .commenter-name { color: #FF4DFF; font-weight: 700; }
                    .comment-box { background: linear-gradient(135deg, rgba(255, 77, 255, 0.1), rgba(165, 60, 255, 0.1)); border-left: 4px solid #FF4DFF; padding: 20px; border-radius: 12px; margin: 24px 0; color: #e2e8f0; font-style: italic; line-height: 1.6; box-shadow: 0 4px 12px rgba(255, 77, 255, 0.1); }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF4DFF, #A53CFF); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(255, 77, 255, 0.4); transition: transform 0.2s; }
                    .button:hover { transform: translateY(-2px); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>💬 New Comment!</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Hi ${author.full_name}! 👋</p>
                        <p class="message">
                            <span class="commenter-name">${commenter.full_name}</span> commented on your post:
                        </p>
                        <div class="comment-box">
                            ${content}
                        </div>
                        <div class="cta">
                            <a class="button" href="${baseUrl}/post/${postId}">View Post & Reply</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    commentReply: (parentAuthor, commenter, content, postId, baseUrl) => ({
        subject: 'New reply to your comment - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                    .header { background: linear-gradient(135deg, #3FD6FF, #2BB6FF); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .commenter-name { color: #3FD6FF; font-weight: 700; }
                    .reply-box { background: linear-gradient(135deg, rgba(63, 214, 255, 0.1), rgba(43, 182, 255, 0.1)); border-left: 4px solid #3FD6FF; padding: 20px; border-radius: 12px; margin: 24px 0; color: #e2e8f0; font-style: italic; line-height: 1.6; box-shadow: 0 4px 12px rgba(63, 214, 255, 0.1); }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3FD6FF, #2BB6FF); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(63, 214, 255, 0.4); transition: transform 0.2s; }
                    .button:hover { transform: translateY(-2px); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>↩️ New Reply!</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Hi ${parentAuthor.full_name}! 👋</p>
                        <p class="message">
                            <span class="commenter-name">${commenter.full_name}</span> replied to your comment:
                        </p>
                        <div class="reply-box">
                            ${content}
                        </div>
                        <div class="cta">
                            <a class="button" href="${baseUrl}/post/${postId}">View Conversation</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    commentLike: (author, liker, postId, baseUrl) => ({
        subject: 'Your comment was liked - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                    .header { background: linear-gradient(135deg, #FF4DFF, #D845FF); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .liker-name { color: #FF4DFF; font-weight: 700; }
                    .heart-icon { display: inline-block; font-size: 32px; margin: 16px 0; animation: pulse 2s infinite; }
                    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF4DFF, #D845FF); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(255, 77, 255, 0.4); transition: transform 0.2s; }
                    .button:hover { transform: translateY(-2px); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>❤️ Comment Liked!</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Hi ${author.full_name}! 👋</p>
                        <p class="message" style="text-align: center;">
                            <span class="heart-icon">❤️</span>
                        </p>
                        <p class="message" style="text-align: center;">
                            <span class="liker-name">${liker.full_name}</span> liked your comment!
                        </p>
                        <div class="cta">
                            <a class="button" href="${baseUrl}/post/${postId}">View Post</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Account moderation notifications
    accountBanned: (user, reason) => ({
        subject: 'Account Banned - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(239, 68, 68, 0.3); }
                    .header { background: linear-gradient(135deg, #ef4444, #dc2626); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .warning-box { background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.15)); border: 2px solid rgba(239, 68, 68, 0.4); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .reason-label { color: #fca5a5; font-weight: 700; }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(239, 68, 68, 0.4); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚫 Account Banned</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Dear ${user.full_name},</p>
                        <p class="message">Your Dream X account has been permanently banned.</p>
                        <div class="warning-box">
                            <p class="message" style="margin: 0;"><span class="reason-label">Reason:</span> ${reason}</p>
                        </div>
                        <p class="message">If you believe this is a mistake, you can submit an appeal.</p>
                        <div class="cta">
                            <a class="button" href="https://dream-x.app/account-appeal">Submit Appeal</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    accountSuspended: (user, reason, until, durationText) => ({
        subject: 'Account Suspended - Dream X',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(251, 191, 36, 0.3); }
                    .header { background: linear-gradient(135deg, #fbbf24, #f59e0b); padding: 36px 32px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .content { padding: 32px; color: #e2e8f0; }
                    .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                    .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                    .info-box { background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1)); border: 1px solid rgba(251, 191, 36, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                    .info-item { margin: 12px 0; color: #e2e8f0; }
                    .info-label { color: #fcd34d; font-weight: 700; }
                    .cta { text-align: center; margin: 32px 0; }
                    .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(251, 191, 36, 0.4); }
                    .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                    .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⏸️ Account Suspended</h1>
                    </div>
                    <div class="content">
                        <p class="greeting">Dear ${user.full_name},</p>
                        <p class="message">Your Dream X account has been temporarily suspended for <strong>${durationText}</strong>.</p>
                        <div class="info-box">
                            <div class="info-item"><span class="info-label">Reason:</span> ${reason}</div>
                            <div class="info-item"><span class="info-label">Suspension ends:</span> ${until.toLocaleString()}</div>
                        </div>
                        <p class="message">Your suspension will be automatically lifted on the date shown above.</p>
                        <p class="message">If you believe this is a mistake, you can submit an appeal.</p>
                        <div class="cta">
                            <a class="button" href="https://dream-x.app/account-appeal">Submit Appeal</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Dream X · Addicted to growth.</p>
                        <hr />
                        <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

// Helper functions for specific email types
const emailService = {
    // Send generic email
    send: sendEmail,

    // Appeal emails
    sendContentApprovalEmail: async (email, appeal, req) => {
        const template = templates.contentApproved(appeal);
        return await sendEmail(email, template.subject, template.html, null, req);
    },

    sendContentDenialEmail: async (email, appeal, req) => {
        const template = templates.contentDenied(appeal);
        return await sendEmail(email, template.subject, template.html, null, req);
    },

    sendAccountApprovalEmail: async (email, appeal, req) => {
        const template = templates.accountApproved(appeal);
        return await sendEmail(email, template.subject, template.html, null, req);
    },

    sendAccountDenialEmail: async (email, appeal, req) => {
        const template = templates.accountDenied(appeal);
        return await sendEmail(email, template.subject, template.html, null, req);
    },

    // Post interaction emails
    sendPostReactionEmail: async (author, reactor, type, postId, baseUrl = 'https://localhost', req) => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.postReaction(author, reactor, type, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html, null, req);
    },

    sendPostCommentEmail: async (author, commenter, content, postId, baseUrl = 'https://localhost', req) => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.postComment(author, commenter, content, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html, null, req);
    },

    sendCommentReplyEmail: async (parentAuthor, commenter, content, postId, baseUrl = 'https://localhost', req) => {
        if (!parentAuthor.email) return { success: false, error: 'No email address' };
        const template = templates.commentReply(parentAuthor, commenter, content, postId, baseUrl);
        return await sendEmail(parentAuthor.email, template.subject, template.html, null, req);
    },

    sendCommentLikeEmail: async (author, liker, postId, baseUrl = 'https://localhost', req) => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.commentLike(author, liker, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html, null, req);
    },

    // Account moderation emails
    sendAccountBannedEmail: async (user, reason, req) => {
        if (!user.email) return { success: false, error: 'No email address' };
        const template = templates.accountBanned(user, reason);
        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    sendAccountSuspendedEmail: async (user, reason, until, durationText, req) => {
        if (!user.email) return { success: false, error: 'No email address' };
        const template = templates.accountSuspended(user, reason, until, durationText);
        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    sendAccountDeletionEmail: async (email, userName, req) => {
        const template = {
            subject: 'Your Account Has Been Deleted - Dream X',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(148, 163, 184, 0.2); }
                        .header { background: linear-gradient(135deg, #64748b, #475569); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .warning-box { background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1)); border: 1px solid rgba(239, 68, 68, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🗑️ Account Deletion Confirmation</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${userName},</p>
                            <p class="message">This email confirms that your Dream X account has been permanently deleted as requested.</p>
                            <p class="message">All your data, including posts, messages, and services, has been removed from our platform.</p>
                            <div class="warning-box">
                                <p class="message" style="margin: 0; color: #fca5a5;">If you did not request this deletion, please contact us immediately at support@dream-x.app</p>
                            </div>
                            <p class="message">We're sorry to see you go. If you change your mind in the future, you're always welcome to create a new account.</p>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(email, template.subject, template.html, null, req);
    },

    // Career application emails
    sendCareerApplicationEmail: async (applicantEmail, applicantName, position, req) => {
        const template = {
            subject: `Application Received: ${position} - Dream X`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                        .header { background: linear-gradient(135deg, #FF4DFF, #A53CFF); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .position-box { background: linear-gradient(135deg, rgba(255, 77, 255, 0.1), rgba(165, 60, 255, 0.1)); border: 1px solid rgba(255, 77, 255, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center; }
                        .position-name { color: #FF4DFF; font-weight: 700; font-size: 20px; }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📧 Application Received</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${applicantName},</p>
                            <p class="message">Thank you for applying to join the Dream X team!</p>
                            <div class="position-box">
                                <p class="message" style="margin: 0 0 8px; color: #cbd5e1;">Position Applied For:</p>
                                <p class="position-name">${position}</p>
                            </div>
                            <p class="message">We have received your application and our HR team will review it carefully.</p>
                            <p class="message">You can expect to hear from us within <strong>5-7 business days</strong> regarding the next steps.</p>
                            <p class="message">We're excited about the possibility of working together!</p>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html, null, req);
    },

    sendCareerStatusUpdateEmail: async (applicantEmail, applicantName, position, status, req) => {
        const statusMessages = {
            'under_review': 'Your application is currently under review by our team.',
            'accepted': 'Congratulations! We would like to move forward with your application. Our HR team will contact you soon to schedule an interview.',
            'rejected': 'After careful consideration, we have decided to move forward with other candidates at this time. We appreciate your interest in Dream X and encourage you to apply for future positions.'
        };
        
        const statusColors = {
            'under_review': { bg: 'linear-gradient(135deg, #3FD6FF, #2BB6FF)', border: 'rgba(63, 214, 255, 0.3)' },
            'accepted': { bg: 'linear-gradient(135deg, #10b981, #059669)', border: 'rgba(16, 185, 129, 0.3)' },
            'rejected': { bg: 'linear-gradient(135deg, #64748b, #475569)', border: 'rgba(148, 163, 184, 0.3)' }
        };
        
        const statusIcons = {
            'under_review': '⏳',
            'accepted': '🎉',
            'rejected': '📋'
        };
        
        const colors = statusColors[status] || statusColors['under_review'];
        const icon = statusIcons[status] || '📧';
        
        const template = {
            subject: `Application Update: ${position} - Dream X`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid ${colors.border}; }
                        .header { background: ${colors.bg}; padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .status-box { background: linear-gradient(135deg, rgba(255, 77, 255, 0.1), rgba(165, 60, 255, 0.1)); border: 1px solid rgba(255, 77, 255, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center; }
                        .status-label { color: #FF4DFF; font-weight: 700; font-size: 18px; text-transform: uppercase; letter-spacing: 1px; }
                        .position-name { color: #FF4DFF; font-weight: 700; }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>${icon} Application Status Update</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${applicantName},</p>
                            <p class="message">We wanted to update you on your application for the <span class="position-name">${position}</span> position.</p>
                            <div class="status-box">
                                <p class="status-label">${status.replace('_', ' ').toUpperCase()}</p>
                            </div>
                            <p class="message">${statusMessages[status] || 'Your application status has been updated.'}</p>
                            ${status === 'rejected' ? '<p class="message">We wish you the best in your job search and future endeavors.</p>' : ''}
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html, null, req);
    },

    // HR contact email
    sendHRContactEmail: async (applicantEmail, applicantName, subject, message, fromHR = 'Dream X HR Team', req) => {
        const template = {
            subject: subject,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 77, 255, 0.15); }
                        .header { background: linear-gradient(135deg, #FF4DFF, #A53CFF); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .message-box { background: linear-gradient(135deg, rgba(255, 77, 255, 0.1), rgba(165, 60, 255, 0.1)); border-left: 4px solid #FF4DFF; padding: 20px; border-radius: 12px; margin: 24px 0; color: #e2e8f0; line-height: 1.6; }
                        .signature { margin-top: 32px; color: #cbd5e1; }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📬 ${subject}</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${applicantName},</p>
                            <div class="message-box">
                                ${message.split('\n').map(line => `<p style="margin: 0 0 12px 0;">${line}</p>`).join('')}
                            </div>
                            <p class="signature">Best regards,<br><strong>${fromHR}</strong></p>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html, null, req);
    },

    // Seller privilege freeze notification
    sendSellerFreezeEmail: async (user, reason = 'Policy violation', req) => {
        const template = {
            subject: 'Seller Privileges Frozen - Dream X',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(251, 191, 36, 0.3); }
                        .header { background: linear-gradient(135deg, #fbbf24, #f59e0b); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .warning-box { background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1)); border: 1px solid rgba(251, 191, 36, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; }
                        .reason-label { color: #fcd34d; font-weight: 700; }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>❄️ Seller Privileges Frozen</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${user.full_name},</p>
                            <p class="message">Your seller privileges on Dream X have been temporarily frozen.</p>
                            <div class="warning-box">
                                <p class="message" style="margin: 0;"><span class="reason-label">Reason:</span> ${reason}</p>
                            </div>
                            <p class="message">While your privileges are frozen, your services will not be visible to other users and you cannot create new services.</p>
                            <p class="message">If you believe this is a mistake, please contact support at support@dream-x.app</p>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    sendSellerUnfreezeEmail: async (user, req) => {
        const template = {
            subject: 'Seller Privileges Restored - Dream X',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0B0A14 0%, #141022 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(16, 185, 129, 0.2); }
                        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                        .content { padding: 32px; color: #e2e8f0; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; color: #fff; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; font-size: 16px; }
                        .success-box { background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1)); border: 1px solid rgba(16, 185, 129, 0.3); padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center; }
                        .cta { text-align: center; margin: 32px 0; }
                        .button { display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(16, 185, 129, 0.4); }
                        .footer { background: #0b1223; padding: 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>✅ Seller Privileges Restored</h1>
                        </div>
                        <div class="content">
                            <p class="greeting">Dear ${user.full_name},</p>
                            <p class="message">Good news! Your seller privileges on Dream X have been restored.</p>
                            <div class="success-box">
                                <p class="message" style="margin: 0; color: #10b981; font-weight: 600;">Your services are now visible again and you can create new services.</p>
                            </div>
                            <p class="message">Thank you for your patience.</p>
                            <div class="cta">
                                <a class="button" href="https://dream-x.app/services">Manage Your Services</a>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because you have notifications enabled.<br>Dream X © 2025</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    // Password reset
    sendPasswordReset: async (user, resetLink, req) => {
        const template = {
            subject: 'Reset Your Password - Dream X',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0b1020 0%, #1a1f3a 100%); }
                        .container { max-width: 640px; margin: 40px auto; background: #0f172a; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid rgba(255, 255, 255, 0.08); color: #e2e8f0; }
                        .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 36px 32px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; }
                        .header p { margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px; }
                        .content { padding: 32px; }
                        .greeting { font-size: 18px; margin: 0 0 16px; font-weight: 700; }
                        .message { line-height: 1.7; margin: 0 0 24px; color: #cbd5e1; }
                        .cta { text-align: center; margin: 32px 0; }
                        .button { display: inline-block; padding: 16px 28px; background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; border-radius: 14px; font-weight: 800; letter-spacing: 0.3px; text-decoration: none; box-shadow: 0 12px 30px rgba(102,126,234,0.45); }
                        .meta { background: rgba(102,126,234,0.1); padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05); color: #a5b4fc; font-weight: 600; text-align: center; }
                        .footer { background: #0b1223; padding: 20px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 13px; }
                        .footer hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 20px 0; }
                        .warning { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #fecdd3; padding: 16px; border-radius: 12px; margin-bottom: 24px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Reset your password</h1>
                            <p>Let's secure your Dream X account</p>
                        </div>
                        <div class="content">
                            <p class="greeting">Hi ${user.full_name},</p>
                            <p class="message">We received a request to reset the password for your Dream X account. Click the button below to choose a new password.</p>
                            <div class="cta">
                                <a class="button" href="${resetLink}">Create a new password</a>
                            </div>
                            <p class="meta">This link expires in 60 minutes for security.</p>
                            <div class="warning">
                                <p style="margin:0;">If you didn't request this, you can ignore this email—your password will stay the same.</p>
                            </div>
                            <p class="message" style="font-size:14px; color:#94a3b8;">If the button doesn't work, copy and paste this URL into your browser:<br><span style="color:#a5b4fc;">${resetLink}</span></p>
                        </div>
                        <div class="footer">
                            <p>Dream X · Addicted to growth.</p>
                            <hr />
                            <p>You're receiving this email because a password reset was requested for your account.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    // Email Verification
    sendVerificationCode: async (user, code, req) => {
        const template = {
            subject: 'Verify Your Email - Dream X',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0b1020 0%, #1a1f3a 100%); }
                        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
                        .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 40px 30px; text-align: center; }
                        .header h1 { color: white; margin: 0; font-size: 32px; font-weight: 900; }
                        .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; }
                        .content { padding: 40px 30px; }
                        .greeting { font-size: 18px; color: #1e293b; margin: 0 0 20px; }
                        .message { color: #475569; line-height: 1.6; margin: 0 0 30px; font-size: 16px; }
                        .code-container { background: linear-gradient(135deg, rgba(102,126,234,0.08), rgba(118,75,162,0.08)); border: 2px dashed #667eea; border-radius: 16px; padding: 30px; text-align: center; margin: 30px 0; }
                        .code-label { color: #64748b; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px; }
                        .code { font-size: 48px; font-weight: 900; color: #667eea; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace; }
                        .expiry { color: #94a3b8; font-size: 14px; margin: 16px 0 0; }
                        .warning { background: rgba(239,68,68,0.1); border-left: 4px solid #ef4444; padding: 16px; border-radius: 8px; margin: 20px 0; }
                        .warning p { margin: 0; color: #991b1b; font-size: 14px; }
                        .footer { background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
                        .footer p { margin: 0; color: #64748b; font-size: 14px; line-height: 1.6; }
                        .footer-brand { color: #667eea; font-weight: 700; font-size: 16px; margin: 16px 0 8px; }
                        .footer-tagline { font-style: italic; color: #94a3b8; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>✨ Welcome to Dream X!</h1>
                            <p>Let's verify your email and get started</p>
                        </div>
                        <div class="content">
                            <p class="greeting">Hey ${user.full_name}! 👋</p>
                            <p class="message">
                                We're excited to have you join Dream X! Before you dive into building your profile and connecting with amazing people, 
                                we need to verify your email address.
                            </p>
                            <p class="message">
                                Enter this verification code on the next screen:
                            </p>
                            <div class="code-container">
                                <p class="code-label">Your Verification Code</p>
                                <p class="code">${code}</p>
                                <p class="expiry">⏰ Expires in 15 minutes</p>
                            </div>
                            <div class="warning">
                                <p><strong>⚠️ Security Notice:</strong> Never share this code with anyone. Dream X staff will never ask for your verification code.</p>
                            </div>
                            <p class="message">
                                Once verified, you'll complete your onboarding and start your journey toward growth! 🚀
                            </p>
                        </div>
                        <div class="footer">
                            <p class="footer-brand">Dream X</p>
                            <p class="footer-tagline">"Addicted to growth."</p>
                            <p>If you didn't create an account, you can safely ignore this email.</p>
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                                You're receiving this email because you have notifications enabled.<br>
                                Dream X © 2025
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        return await sendEmail(user.email, template.subject, template.html, null, req);
    },

    // Expose redirect resolver for diagnostics
    getGmailRedirectUri
};

module.exports = emailService;
