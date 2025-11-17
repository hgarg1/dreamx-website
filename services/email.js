// Email Service using Gmail OAuth2
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const OAuth2 = google.auth.OAuth2;

// Create OAuth2 client
const createTransporter = async () => {
    // Check if OAuth credentials are configured
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
        console.warn('⚠️ Gmail OAuth not configured, using basic SMTP');
        return createBasicTransporter();
    }

    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
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
        console.error('⚠️ OAuth2 authentication failed, falling back to basic SMTP:', error.message);
        return createBasicTransporter();
    }
};

// Fallback to basic SMTP
const createBasicTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD // App-specific password
        }
    });
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

// -----------------------------
// Branded Email Template Builder
// -----------------------------
const buildEmail = ({
        preheader = '',
        title = 'Dream X',
        subtitle = '',
        body = '',
        cta = null, // { label, url }
        footerNote = 'You received this email because you have a Dream X account.',
}) => {
        const buttonHtml = cta ? `
                <tr>
                        <td align="center" style="padding: 24px 0 0 0;">
                                <a href="${cta.url}" target="_blank" style="display:inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:999px; font-weight:700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                                        ${cta.label}
                                </a>
                        </td>
                </tr>
        ` : '';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <title>${title}</title>
            <style>
                /* Reset */
                body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
                table,td{ mso-table-rspace:0pt; mso-table-lspace:0pt; }
                img{ -ms-interpolation-mode:bicubic; }
                img{ border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
                table{ border-collapse:collapse !important; }
                body{ margin:0 !important; padding:0 !important; width:100% !important; background:#f4f5f7; }
                @media screen and (max-width:600px){
                    .container{ width:100% !important; }
                    .px{ padding-left:16px !important; padding-right:16px !important; }
                    .py{ padding-top:16px !important; padding-bottom:16px !important; }
                    h1{ font-size:24px !important; }
                }
            </style>
        </head>
        <body style="background:#f4f5f7;">
            <!-- Preheader (invisible) -->
            <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${preheader}</div>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td align="center" style="padding: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px;">
                            <tr>
                                <td align="center" style="padding: 16px 24px;">
                                    <a href="https://dreamx.app" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:20px; font-weight:800; color:#ffffff; text-decoration:none; letter-spacing:0.4px;">
                                        ✨ Dream X
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 0 16px 40px; background:#f4f5f7;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
                            <tr>
                                <td class="px" style="padding: 32px 32px 8px; text-align:center;">
                                    <h1 style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:28px; line-height:1.3; color:#111827;">${title}</h1>
                                    ${subtitle ? `<p style=\"margin:8px 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; color:#6b7280;\">${subtitle}</p>` : ''}
                                </td>
                            </tr>
                            <tr>
                                <td class="px py" style="padding: 8px 32px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:1.7; color:#374151;">
                                    ${body}
                                </td>
                            </tr>
                            ${buttonHtml}
                            <tr>
                                <td style="height:24px;">&nbsp;</td>
                            </tr>
                        </table>
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px;">
                            <tr>
                                <td align="center" style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:12px; color:#6b7280;">
                                    <p style="margin: 8px 0;">${footerNote}</p>
                                    <p style="margin: 0;">© ${new Date().getFullYear()} Dream X</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>`;
};

// Email Templates
const templates = {
    // Appeal notifications
        contentApproved: (appeal) => ({
        subject: 'Your Content Appeal Has Been Approved - Dream X',
                html: buildEmail({
                        preheader: 'Good news — your content has been restored.',
                        title: 'Content Appeal Approved',
                        subtitle: 'Thanks for your patience while we reviewed your appeal.',
                        body: `
                                <p>Hi there,</p>
                                <p>Your appeal for <strong>${appeal.content_type}</strong> has been <strong style="color:#10b981;">approved</strong>. The content is now visible again.</p>
                                <table role="presentation" width="100%" style="margin-top:12px; background:#f9fafb; border-radius:12px;">
                                    <tr><td style="padding:12px 16px; font-size:14px; color:#4b5563;">
                                        <div><strong>Content Type:</strong> ${appeal.content_type}</div>
                                        <div><strong>Content URL:</strong> ${appeal.content_url || 'N/A'}</div>
                                    </td></tr>
                                </table>
                                <p style="margin-top:16px;">If you believe anything is still off, reply to this email and our team will help.</p>
                        `,
                        cta: appeal.content_url ? { label: 'View Content', url: appeal.content_url } : null,
                })
    }),

    contentDenied: (appeal) => ({
        subject: 'Your Content Appeal Status - Dream X',
                html: buildEmail({
                        preheader: 'Update on your content appeal.',
                        title: 'Content Appeal Decision',
                        subtitle: 'We carefully reviewed your request.',
                        body: `
                                <p>Hi there,</p>
                                <p>After review, your appeal for <strong>${appeal.content_type}</strong> was <strong style="color:#ef4444;">denied</strong>.</p>
                                <table role="presentation" width="100%" style="margin-top:12px; background:#f9fafb; border-radius:12px;">
                                    <tr><td style="padding:12px 16px; font-size:14px; color:#4b5563;">
                                        <div><strong>Reason:</strong> ${appeal.removal_reason || 'Violation of community guidelines'}</div>
                                    </td></tr>
                                </table>
                                <p style="margin-top:16px;">If you believe this was a mistake, you can reply to this email and our team will take another look.</p>
                        `,
                })
    }),

    accountApproved: (appeal) => ({
        subject: 'Your Account Appeal Has Been Approved - Dream X',
                html: buildEmail({
                        preheader: 'Your access has been restored.',
                        title: 'Account Appeal Approved',
                        subtitle: `Welcome back, ${appeal.username || 'Dreamer'}!`,
                        body: `
                            <p>Your appeal has been approved and your account restrictions have been lifted.</p>
                            <p><strong>Action:</strong> ${appeal.account_action}</p>
                        `,
                        cta: { label: 'Go to Dream X', url: 'http://localhost:3000' },
                })
    }),

    accountDenied: (appeal) => ({
        subject: 'Your Account Appeal Status - Dream X',
                html: buildEmail({
                        preheader: 'Update on your account appeal.',
                        title: 'Account Appeal Decision',
                        subtitle: 'We carefully reviewed your case.',
                        body: `
                                <p>Dear ${appeal.username || 'Dreamer'},</p>
                                <p>After review, your appeal was <strong style="color:#ef4444;">denied</strong>.</p>
                                <table role="presentation" width="100%" style="margin-top:12px; background:#f9fafb; border-radius:12px;">
                                    <tr><td style="padding:12px 16px; font-size:14px; color:#4b5563;">
                                        <div><strong>Action:</strong> ${appeal.account_action}</div>
                                        <div><strong>Reason:</strong> ${appeal.violation_reason || 'Violation of community guidelines'}</div>
                                    </td></tr>
                                </table>
                                <p style="margin-top:16px;">You can reply to this email if you have additional context you’d like us to consider.</p>
                        `,
                })
    }),

    // Post interaction notifications
    postReaction: (author, reactor, type, postId, baseUrl) => ({
        subject: 'New reaction on your post - Dream X',
        html: buildEmail({
            preheader: `${reactor.full_name} reacted to your post`,
            title: 'You have a new reaction',
            subtitle: `${reactor.full_name} reacted ${type}.`,
            body: `<p>Keep up the momentum! Your work is inspiring others.</p>`,
            cta: { label: 'View Post', url: `${baseUrl}/post/${postId}` },
        })
    }),

    postComment: (author, commenter, content, postId, baseUrl) => ({
        subject: 'New comment on your post - Dream X',
        html: buildEmail({
            preheader: `${commenter.full_name} commented on your post`,
            title: 'New comment on your post',
            body: `
              <p>Hi ${author.full_name},</p>
              <p><strong>${commenter.full_name}</strong> wrote:</p>
              <div style="margin:12px 0; padding:12px 16px; background:#f9fafb; border-radius:12px; color:#374151;">${content}</div>
            `,
            cta: { label: 'Reply now', url: `${baseUrl}/post/${postId}#comments` },
        })
    }),

    commentReply: (parentAuthor, commenter, content, postId, baseUrl) => ({
        subject: 'New reply to your comment - Dream X',
        html: buildEmail({
            preheader: `${commenter.full_name} replied to your comment`,
            title: 'You have a new reply',
            body: `
              <p>Hi ${parentAuthor.full_name},</p>
              <p><strong>${commenter.full_name}</strong> replied:</p>
              <div style="margin:12px 0; padding:12px 16px; background:#f9fafb; border-radius:12px; color:#374151;">${content}</div>
            `,
            cta: { label: 'Join the conversation', url: `${baseUrl}/post/${postId}#comments` },
        })
    }),

    commentLike: (author, liker, postId, baseUrl) => ({
        subject: 'Your comment was liked - Dream X',
        html: buildEmail({
            preheader: `${liker.full_name} liked your comment`,
            title: 'Your comment got some love',
            body: `<p>Nice! <strong>${liker.full_name}</strong> liked your comment. Keep the streak going.</p>`,
            cta: { label: 'See the post', url: `${baseUrl}/post/${postId}` },
        })
    }),

    // Services: reviews and moderation
    serviceReview: (owner, reviewer, service, rating, comment, baseUrl) => ({
        subject: 'New review on your service - Dream X',
        html: buildEmail({
            preheader: `${reviewer.full_name} rated your service ${rating}★`,
            title: 'You received a new service review',
            subtitle: service.title,
            body: `
              <p>Hi ${owner.full_name},</p>
              <p><strong>${reviewer.full_name}</strong> rated your service <strong>${rating}★</strong>.</p>
              ${comment ? `<div style="margin:12px 0; padding:12px 16px; background:#f9fafb; border-radius:12px; color:#374151;">${comment}</div>` : ''}
            `,
            cta: { label: 'View service', url: `${baseUrl}/services/${service.id}` },
        })
    }),
    serviceModeration: (owner, service, action, reason, baseUrl) => ({
        subject: `Your service was ${action} - Dream X`,
        html: buildEmail({
            preheader: `Service ${action}`,
            title: `Service ${action}`,
            subtitle: service.title,
            body: `
              <p>Hi ${owner.full_name},</p>
              <p>Your service <strong>${service.title}</strong> was <strong>${action}</strong> by our moderation team.</p>
              ${reason ? `<div style="margin-top:12px; padding:12px 16px; background:#fff7ed; border-radius:12px; color:#7c2d12;"><strong>Reason:</strong> ${reason}</div>` : ''}
              <p style="margin-top:12px;">If you have questions, please reach out to support.</p>
            `,
            cta: action === 'deleted' ? null : { label: 'View service', url: `${baseUrl}/services/${service.id}` },
        })
    }),
    serviceEditedByAdmin: (owner, service, baseUrl) => ({
        subject: 'Your service was edited by admin - Dream X',
        html: buildEmail({
            preheader: 'Admin compliance edit applied',
            title: 'Admin Edit Applied',
            subtitle: service.title,
            body: `
              <p>Hi ${owner.full_name},</p>
              <p>To keep Dream X safe and high-quality, we made minor edits to your service for policy compliance or clarity.</p>
              <p>If anything looks off, reply to this email and our team will help.</p>
            `,
            cta: { label: 'Review changes', url: `${baseUrl}/services/${service.id}` },
        })
    }),

    // Account moderation notifications
    accountBanned: (user, reason) => ({
        subject: 'Account Banned - Dream X',
        html: buildEmail({
            preheader: 'Important account status update.',
            title: 'Account Banned',
            subtitle: 'This action is permanent.',
            body: `
              <p>Dear ${user.full_name},</p>
              <p>Your Dream X account has been permanently banned.</p>
              <div style="margin-top:12px; padding:12px 16px; background:#fef2f2; border-radius:12px; color:#991b1b;">
                <strong>Reason:</strong> ${reason}
              </div>
              <p style="margin-top:16px;">If you believe this is a mistake, you can submit an appeal.</p>
            `,
            cta: { label: 'Submit an appeal', url: 'http://localhost:3000/account-appeal' },
        })
    }),

        accountSuspended: (user, reason, until, durationText) => ({
        subject: 'Account Suspended - Dream X',
                html: buildEmail({
                        preheader: 'Temporary suspension notice.',
                        title: 'Account Suspended',
                        subtitle: `Duration: ${durationText}`,
                        body: `
                            <p>Dear ${user.full_name},</p>
                            <p>Your account has been temporarily suspended.</p>
                            <table role="presentation" width="100%" style="margin-top:12px; background:#fff7ed; border-radius:12px;">
                                <tr><td style="padding:12px 16px; font-size:14px; color:#7c2d12;">
                                    <div><strong>Reason:</strong> ${reason}</div>
                                    <div><strong>Suspension ends:</strong> ${until.toLocaleString()}</div>
                                </td></tr>
                            </table>
                            <p style="margin-top:16px;">Your access will be restored automatically once the suspension ends.</p>
                        `,
                        cta: { label: 'Appeal decision', url: 'http://localhost:3000/account-appeal' },
                })
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

    // Service review email
    sendServiceReviewEmail: async (owner, reviewer, service, rating, comment, baseUrl = 'http://localhost:3000') => {
        if (!owner || !owner.email) return { success: false, error: 'No email address' };
        const template = templates.serviceReview(owner, reviewer, service, rating, comment, baseUrl);
        return await sendEmail(owner.email, template.subject, template.html);
    },

    // Service moderation emails
    sendServiceModerationEmail: async (owner, service, action, reason = null, baseUrl = 'http://localhost:3000') => {
        if (!owner || !owner.email) return { success: false, error: 'No email address' };
        const template = templates.serviceModeration(owner, service, action, reason, baseUrl);
        return await sendEmail(owner.email, template.subject, template.html);
    },

    sendServiceEditedByAdminEmail: async (owner, service, baseUrl = 'http://localhost:3000') => {
        if (!owner || !owner.email) return { success: false, error: 'No email address' };
        const template = templates.serviceEditedByAdmin(owner, service, baseUrl);
        return await sendEmail(owner.email, template.subject, template.html);
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
        const subject = 'Your Account Has Been Deleted - Dream X';
        const html = buildEmail({
            preheader: 'Your Dream X account has been deleted.',
            title: 'Account Deletion Confirmation',
            body: `
              <p>Dear ${userName},</p>
              <p>This email confirms your Dream X account has been permanently deleted as requested. All associated data (posts, messages, services) has been removed.</p>
              <p>If you didn’t request this, contact us immediately.</p>
              <p>We’re sorry to see you go — and you are always welcome back.</p>
            `,
            cta: { label: 'Visit Dream X', url: 'http://localhost:3000' },
        });
        return await sendEmail(email, subject, html);
    },

    // Career application emails
    sendCareerApplicationEmail: async (applicantEmail, applicantName, position) => {
        const subject = `Application Received: ${position} - Dream X`;
        const html = buildEmail({
            preheader: 'We received your application.',
            title: 'Application Received',
            subtitle: position,
            body: `
              <p>Dear ${applicantName},</p>
              <p>Thanks for applying for <strong>${position}</strong> at Dream X. Our team will carefully review your application.</p>
              <p>You can expect to hear back within 5–7 business days.</p>
            `,
        });
        return await sendEmail(applicantEmail, subject, html);
    },

    sendCareerStatusUpdateEmail: async (applicantEmail, applicantName, position, status) => {
        const statusMessages = {
            'under_review': 'Your application is currently under review by our team.',
            'accepted': 'Congratulations! We would like to move forward with your application. Our HR team will contact you soon to schedule an interview.',
            'rejected': 'After careful consideration, we have decided to move forward with other candidates at this time. We appreciate your interest in Dream X and encourage you to apply for future positions.'
        };
        
        const subject = `Application Update: ${position} - Dream X`;
        const html = buildEmail({
            preheader: 'Your application status has been updated.',
            title: 'Application Status Update',
            subtitle: position,
            body: `
              <p>Dear ${applicantName},</p>
              <p><strong>Status:</strong> ${status.replace('_', ' ').toUpperCase()}</p>
              <p>${statusMessages[status] || 'Your application status has been updated.'}</p>
              ${status === 'rejected' ? '<p>We wish you the best in your job search and future endeavors.</p>' : ''}
            `,
        });
        return await sendEmail(applicantEmail, subject, html);
    },

    // HR contact email
    sendHRContactEmail: async (applicantEmail, applicantName, subject, message, fromHR = 'Dream X HR Team') => {
        const html = buildEmail({
            preheader: subject,
            title: subject,
            body: `
              <p>Dear ${applicantName},</p>
              ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
              <p>Best regards,<br>${fromHR}</p>
            `,
        });
        return await sendEmail(applicantEmail, subject, html);
    },

    // Seller privilege freeze notification
    sendSellerFreezeEmail: async (user, reason = 'Policy violation') => {
                const subject = 'Seller Privileges Frozen - Dream X';
                const html = buildEmail({
                        preheader: 'Your seller privileges were frozen.',
                        title: 'Seller Privileges Frozen',
                        body: `
                            <p>Dear ${user.full_name},</p>
                            <p>Your seller privileges on Dream X have been temporarily frozen.</p>
                            <div style="margin-top:12px; padding:12px 16px; background:#fff7ed; border-radius:12px; color:#7c2d12;">
                                <strong>Reason:</strong> ${reason}
                            </div>
                            <p style="margin-top:16px;">While frozen, your services are hidden and new services cannot be created.</p>
                        `,
                });
                return await sendEmail(user.email, subject, html);
    },

    sendSellerUnfreezeEmail: async (user) => {
        const subject = 'Seller Privileges Restored - Dream X';
        const html = buildEmail({
            preheader: 'Your seller privileges are active again.',
            title: 'Seller Privileges Restored',
            body: `
              <p>Dear ${user.full_name},</p>
              <p>Good news! Your seller privileges on Dream X have been restored.</p>
              <p>Your services are visible again and you can create new ones.</p>
            `,
            cta: { label: 'Manage Services', url: 'http://localhost:3000/services' },
        });
        return await sendEmail(user.email, subject, html);
    }
};

module.exports = emailService;
