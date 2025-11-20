// Email Service using Gmail OAuth2
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const OAuth2 = google.auth.OAuth2;

// Dynamically resolve the redirect URI for Gmail OAuth depending on environment
const isProduction = process.env.NODE_ENV === 'production';
const inferredBaseUrl = process.env.BASE_URL || (isProduction
    ? 'https://dreamx-website.onrender.com'
    : 'http://localhost:3000');

function getGmailRedirectUri() {
    if (process.env.GMAIL_REDIRECT_URI && process.env.GMAIL_REDIRECT_URI.trim()) {
        return process.env.GMAIL_REDIRECT_URI.trim();
    }

    return isProduction
        ? `${inferredBaseUrl.replace(/\/$/, '')}/auth/google/callback`
        : 'https://developers.google.com/oauthplayground';
}

// Create OAuth2 client
const createTransporter = async () => {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        getGmailRedirectUri()
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    try {
        const accessToken = await oauth2Client.getAccessToken();

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

        return transporter;
    } catch (error) {
        console.error('Error creating email transporter:', error);
        throw error;
    }
};

// Generic email sender
async function sendEmail(to, subject, htmlContent, textContent = null) {
    try {
        const transporter = await createTransporter();
        
        const mailOptions = {
            from: `Dream X <${process.env.GMAIL_USER}>`,
            to: to,
            subject: subject,
            text: textContent || htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
            html: htmlContent
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
            <h2>Content Appeal Approved</h2>
            <p>Dear User,</p>
            <p>Your appeal for <strong>${appeal.content_type}</strong> content has been approved. The content has been restored.</p>
            <ul>
                <li><strong>Content Type:</strong> ${appeal.content_type}</li>
                <li><strong>Content URL:</strong> ${appeal.content_url || 'N/A'}</li>
            </ul>
            <p>Thank you for your patience.</p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    contentDenied: (appeal) => ({
        subject: 'Your Content Appeal Status - Dream X',
        html: `
            <h2>Content Appeal Denied</h2>
            <p>Dear User,</p>
            <p>Your appeal for <strong>${appeal.content_type}</strong> content has been denied after careful review.</p>
            <ul>
                <li><strong>Content Type:</strong> ${appeal.content_type}</li>
                <li><strong>Reason:</strong> ${appeal.removal_reason || 'Violation of community guidelines'}</li>
            </ul>
            <p>If you have further questions, please contact support.</p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    accountApproved: (appeal) => ({
        subject: 'Your Account Appeal Has Been Approved - Dream X',
        html: `
            <h2>Account Appeal Approved</h2>
            <p>Dear ${appeal.username || 'User'},</p>
            <p>Your account appeal has been approved. Your account restrictions have been lifted.</p>
            <p><strong>Account Action:</strong> ${appeal.account_action}</p>
            <p>You can now access your account normally.</p>
            <p>Thank you for your patience.</p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    accountDenied: (appeal) => ({
        subject: 'Your Account Appeal Status - Dream X',
        html: `
            <h2>Account Appeal Denied</h2>
            <p>Dear ${appeal.username || 'User'},</p>
            <p>Your account appeal has been denied after careful review.</p>
            <ul>
                <li><strong>Account Action:</strong> ${appeal.account_action}</li>
                <li><strong>Reason:</strong> ${appeal.violation_reason || 'Violation of community guidelines'}</li>
            </ul>
            <p>The original decision stands. If you have further questions, please contact support.</p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    // Post interaction notifications
    postReaction: (author, reactor, type, postId, baseUrl) => ({
        subject: 'New reaction on your post - Dream X',
        html: `
            <h2>New Reaction!</h2>
            <p>Hi ${author.full_name},</p>
            <p><strong>${reactor.full_name}</strong> reacted ${type} to your post.</p>
            <p><a href="${baseUrl}/post/${postId}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Post</a></p>
            <p>Best regards,<br>Dream X Team</p>
        `
    }),

    postComment: (author, commenter, content, postId, baseUrl) => ({
        subject: 'New comment on your post - Dream X',
        html: `
            <h2>New Comment!</h2>
            <p>Hi ${author.full_name},</p>
            <p><strong>${commenter.full_name}</strong> commented on your post:</p>
            <blockquote style="border-left: 3px solid #007bff; padding-left: 15px; color: #555;">${content}</blockquote>
            <p><a href="${baseUrl}/post/${postId}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Post</a></p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    commentReply: (parentAuthor, commenter, content, postId, baseUrl) => ({
        subject: 'New reply to your comment - Dream X',
        html: `
            <h2>New Reply!</h2>
            <p>Hi ${parentAuthor.full_name},</p>
            <p><strong>${commenter.full_name}</strong> replied to your comment:</p>
            <blockquote style="border-left: 3px solid #007bff; padding-left: 15px; color: #555;">${content}</blockquote>
            <p><a href="${baseUrl}/post/${postId}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Post</a></p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    commentLike: (author, liker, postId, baseUrl) => ({
        subject: 'Your comment was liked - Dream X',
        html: `
            <h2>Comment Liked!</h2>
            <p>Hi ${author.full_name},</p>
            <p><strong>${liker.full_name}</strong> liked your comment.</p>
            <p><a href="${baseUrl}/post/${postId}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Post</a></p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    // Account moderation notifications
    accountBanned: (user, reason) => ({
        subject: 'Account Banned - Dream X',
        html: `
            <h2 style="color: #dc3545;">Account Banned</h2>
            <p>Dear ${user.full_name},</p>
            <p>Your Dream X account has been permanently banned.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>If you believe this is a mistake, you can submit an appeal at <a href="https://dreamx.local/account-appeal">https://dreamx.local/account-appeal</a></p>
            <p>Best regards,<br>Dream X Team</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                You're receiving this email because you have notifications enabled.<br>
                Dream X © 2025
            </p>
        `
    }),

    accountSuspended: (user, reason, until, durationText) => ({
        subject: 'Account Suspended - Dream X',
        html: `
            <h2 style="color: #ffc107;">Account Suspended</h2>
            <p>Dear ${user.full_name},</p>
            <p>Your Dream X account has been temporarily suspended for <strong>${durationText}</strong>.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p><strong>Suspension ends:</strong> ${until.toLocaleString()}</p>
            <p>Your suspension will be automatically lifted on the date shown above.</p>
            <p>If you believe this is a mistake, you can submit an appeal at <a href="https://dreamx.local/account-appeal">https://dreamx.local/account-appeal</a></p>
            <p>Best regards,<br>Dream X Team</p>
        `
    })
};

// Helper functions for specific email types
const emailService = {
    // Send generic email
    send: sendEmail,

    // Appeal emails
    sendContentApprovalEmail: async (email, appeal) => {
        const template = templates.contentApproved(appeal);
        return await sendEmail(email, template.subject, template.html);
    },

    sendContentDenialEmail: async (email, appeal) => {
        const template = templates.contentDenied(appeal);
        return await sendEmail(email, template.subject, template.html);
    },

    sendAccountApprovalEmail: async (email, appeal) => {
        const template = templates.accountApproved(appeal);
        return await sendEmail(email, template.subject, template.html);
    },

    sendAccountDenialEmail: async (email, appeal) => {
        const template = templates.accountDenied(appeal);
        return await sendEmail(email, template.subject, template.html);
    },

    // Post interaction emails
    sendPostReactionEmail: async (author, reactor, type, postId, baseUrl = 'http://localhost:3000') => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.postReaction(author, reactor, type, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html);
    },

    sendPostCommentEmail: async (author, commenter, content, postId, baseUrl = 'http://localhost:3000') => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.postComment(author, commenter, content, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html);
    },

    sendCommentReplyEmail: async (parentAuthor, commenter, content, postId, baseUrl = 'http://localhost:3000') => {
        if (!parentAuthor.email) return { success: false, error: 'No email address' };
        const template = templates.commentReply(parentAuthor, commenter, content, postId, baseUrl);
        return await sendEmail(parentAuthor.email, template.subject, template.html);
    },

    sendCommentLikeEmail: async (author, liker, postId, baseUrl = 'http://localhost:3000') => {
        if (!author.email) return { success: false, error: 'No email address' };
        const template = templates.commentLike(author, liker, postId, baseUrl);
        return await sendEmail(author.email, template.subject, template.html);
    },

    // Account moderation emails
    sendAccountBannedEmail: async (user, reason) => {
        if (!user.email) return { success: false, error: 'No email address' };
        const template = templates.accountBanned(user, reason);
        return await sendEmail(user.email, template.subject, template.html);
    },

    sendAccountSuspendedEmail: async (user, reason, until, durationText) => {
        if (!user.email) return { success: false, error: 'No email address' };
        const template = templates.accountSuspended(user, reason, until, durationText);
        return await sendEmail(user.email, template.subject, template.html);
    },

    sendAccountDeletionEmail: async (email, userName) => {
        const template = {
            subject: 'Your Account Has Been Deleted - Dream X',
            html: `
                <h2>Account Deletion Confirmation</h2>
                <p>Dear ${userName},</p>
                <p>This email confirms that your Dream X account has been permanently deleted as requested.</p>
                <p>All your data, including posts, messages, and services, has been removed from our platform.</p>
                <p>If you did not request this deletion, please contact us immediately at support@dreamx.com</p>
                <p>We're sorry to see you go. If you change your mind in the future, you're always welcome to create a new account.</p>
                <p>Best regards,<br>Dream X Team</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(email, template.subject, template.html);
    },

    // Career application emails
    sendCareerApplicationEmail: async (applicantEmail, applicantName, position) => {
        const template = {
            subject: `Application Received: ${position} - Dream X`,
            html: `
                <h2>Application Received</h2>
                <p>Dear ${applicantName},</p>
                <p>Thank you for applying for the <strong>${position}</strong> position at Dream X.</p>
                <p>We have received your application and our HR team will review it carefully.</p>
                <p>You can expect to hear from us within 5-7 business days regarding the next steps.</p>
                <p>Best regards,<br>Dream X Recruitment Team</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html);
    },

    sendCareerStatusUpdateEmail: async (applicantEmail, applicantName, position, status) => {
        const statusMessages = {
            'under_review': 'Your application is currently under review by our team.',
            'accepted': 'Congratulations! We would like to move forward with your application. Our HR team will contact you soon to schedule an interview.',
            'rejected': 'After careful consideration, we have decided to move forward with other candidates at this time. We appreciate your interest in Dream X and encourage you to apply for future positions.'
        };
        
        const template = {
            subject: `Application Update: ${position} - Dream X`,
            html: `
                <h2>Application Status Update</h2>
                <p>Dear ${applicantName},</p>
                <p>We wanted to update you on your application for the <strong>${position}</strong> position.</p>
                <p><strong>Status:</strong> ${status.replace('_', ' ').toUpperCase()}</p>
                <p>${statusMessages[status] || 'Your application status has been updated.'}</p>
                ${status === 'rejected' ? '<p>We wish you the best in your job search and future endeavors.</p>' : ''}
                <p>Best regards,<br>Dream X Recruitment Team</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html);
    },

    // HR contact email
    sendHRContactEmail: async (applicantEmail, applicantName, subject, message, fromHR = 'Dream X HR Team') => {
        const template = {
            subject: subject,
            html: `
                <h2>${subject}</h2>
                <p>Dear ${applicantName},</p>
                ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
                <p>Best regards,<br>${fromHR}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(applicantEmail, template.subject, template.html);
    },

    // Seller privilege freeze notification
    sendSellerFreezeEmail: async (user, reason = 'Policy violation') => {
        const template = {
            subject: 'Seller Privileges Frozen - Dream X',
            html: `
                <h2 style="color: #ffc107;">Seller Privileges Frozen</h2>
                <p>Dear ${user.full_name},</p>
                <p>Your seller privileges on Dream X have been temporarily frozen.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>While your privileges are frozen, your services will not be visible to other users and you cannot create new services.</p>
                <p>If you believe this is a mistake, please contact support at support@dreamx.com</p>
                <p>Best regards,<br>Dream X Team</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(user.email, template.subject, template.html);
    },

    sendSellerUnfreezeEmail: async (user) => {
        const template = {
            subject: 'Seller Privileges Restored - Dream X',
            html: `
                <h2 style="color: #10b981;">Seller Privileges Restored</h2>
                <p>Dear ${user.full_name},</p>
                <p>Good news! Your seller privileges on Dream X have been restored.</p>
                <p>Your services are now visible again and you can create new services.</p>
                <p>Thank you for your patience.</p>
                <p>Best regards,<br>Dream X Team</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                    You're receiving this email because you have notifications enabled.<br>
                    Dream X © 2025
                </p>
            `
        };
        return await sendEmail(user.email, template.subject, template.html);
    },

    // Password reset
    sendPasswordReset: async (user, resetLink) => {
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

        return await sendEmail(user.email, template.subject, template.html);
    },

    // Email Verification
    sendVerificationCode: async (user, code) => {
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
        return await sendEmail(user.email, template.subject, template.html);
    }
};

module.exports = emailService;
