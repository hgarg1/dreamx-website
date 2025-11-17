// Email Service using Gmail OAuth2
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const OAuth2 = google.auth.OAuth2;

// Create OAuth2 client
const createTransporter = async () => {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
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
            `
        };
        return await sendEmail(user.email, template.subject, template.html);
    }
};

module.exports = emailService;
