# Email Service Configuration

## Overview
The DreamX application now uses Gmail OAuth2 for sending emails through a dedicated email service module. All email functionality has been abstracted to `emailService.js` for better organization and maintainability.

## Setup

### Environment Variables
Add these variables to your `.env` file:

```env
# Gmail account you are sending from
GMAIL_USER=hgarg1@terpmail.umd.edu

# OAuth client credentials (from your Google Cloud OAuth client)
GMAIL_CLIENT_ID=899638086071-0osqjhi911b9sa83tkq77dgu2u08c.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=G0CSPX-WTcdAr4GkJOIis-_oi_poP_yySse

# Redirect URI used in OAuth Playground
GMAIL_REDIRECT_URI=https://developers.google.com/oauthplayground

# Refresh token (from OAuth Playground)
GMAIL_REFRESH_TOKEN=1//04hCK4fbVwbPsCgYIARAAGAQSNgF-L9IrVU3a7ZAUExINeaA-VSIf3v1NG-VwH1lIednIfSLGmQkWOhx10MFYBcoeiMyrMDZIRw

# Base URL for email links (optional, defaults to localhost:3000)
BASE_URL=https://dreamx.local
```

### Dependencies
The following packages are required and have been installed:
- `nodemailer` - Email sending library
- `googleapis` - Google APIs client for OAuth2

## Email Service Module (`emailService.js`)

### Available Email Functions

#### Generic Email
```javascript
emailService.send(to, subject, htmlContent, textContent)
```

#### Appeal Notifications
```javascript
emailService.sendContentApprovalEmail(email, appeal)
emailService.sendContentDenialEmail(email, appeal)
emailService.sendAccountApprovalEmail(email, appeal)
emailService.sendAccountDenialEmail(email, appeal)
```

#### Post Interaction Notifications
```javascript
emailService.sendPostReactionEmail(author, reactor, type, postId, baseUrl)
emailService.sendPostCommentEmail(author, commenter, content, postId, baseUrl)
emailService.sendCommentReplyEmail(parentAuthor, commenter, content, postId, baseUrl)
emailService.sendCommentLikeEmail(author, liker, postId, baseUrl)
```

#### Account Moderation Notifications
```javascript
emailService.sendAccountBannedEmail(user, reason)
emailService.sendAccountSuspendedEmail(user, reason, until, durationText)
```

## Email Templates

All emails use HTML templates with proper styling:
- Professional header with subject
- Clear, formatted message content
- Call-to-action buttons with styling
- Consistent footer with "Dream X Team" signature
- Blockquotes for user-generated content (comments)
- Color coding for different notification types

### Template Features
- ✅ HTML and plain text versions (auto-generated fallback)
- ✅ Responsive design-friendly markup
- ✅ Professional styling with inline CSS
- ✅ Clickable links and buttons
- ✅ User personalization (names, specific details)

## Usage Examples

### Sending a Post Reaction Email
```javascript
const author = getUserById(post.user_id);
if (author && author.email_notifications === 1) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    await emailService.sendPostReactionEmail(author, reactor, type, postId, baseUrl);
}
```

### Sending an Account Ban Email
```javascript
if (notifyUser && targetUser && targetUser.email) {
    await emailService.sendAccountBannedEmail(targetUser, banReason);
}
```

## Integration Points

The email service is integrated at the following locations in `app.js`:

1. **Content Appeal Status** (Line ~943)
   - Sends approval/denial emails when content appeals are reviewed

2. **Account Appeal Status** (Line ~966)
   - Sends approval/denial emails when account appeals are reviewed

3. **Post Reactions** (Line ~1472)
   - Notifies post authors when someone reacts to their post

4. **Post Comments** (Line ~1561)
   - Notifies post authors when someone comments on their post

5. **Comment Replies** (Line ~1590)
   - Notifies comment authors when someone replies to their comment

6. **Comment Likes** (Line ~1638)
   - Notifies comment authors when someone likes their comment

7. **Account Bans** (Line ~3111)
   - Notifies users when their account is banned

8. **Account Suspensions** (Line ~3229)
   - Notifies users when their account is suspended

## Error Handling

All email functions return an object with:
```javascript
{
    success: true/false,
    messageId: "...",  // on success
    error: "..."       // on failure
}
```

Errors are logged to console but do not interrupt the application flow.

## Testing

### Test Email Sending
You can test the email service by triggering any of the integrated actions:
1. React to a post
2. Comment on a post
3. Like a comment
4. Submit an appeal (admin can approve/deny)

### Console Output
Successful emails will log:
```
✅ Email sent to user@example.com: Subject Line
```

Failed emails will log:
```
❌ Error sending email to user@example.com: Error message
```

## Security Notes

- OAuth2 tokens are securely managed by Google's authentication system
- Refresh tokens are stored in environment variables (never commit to git)
- Access tokens are automatically refreshed by the Google APIs client
- Email content is sanitized through template functions

## Future Enhancements

Potential improvements:
- [ ] Email queue system for high-volume sending
- [ ] Email templates stored in database for easy editing
- [ ] User preferences for email frequency (digest vs immediate)
- [ ] Unsubscribe links and preference management
- [ ] Email analytics (open rates, click rates)
- [ ] Localization support for multilingual emails
- [ ] Rich media attachments
- [ ] Custom email domains (not just Gmail)

## Troubleshooting

### Emails Not Sending
1. Check `.env` file has all required credentials
2. Verify Gmail account has OAuth2 enabled
3. Check refresh token is still valid
4. Review console logs for specific error messages

### OAuth Token Expired
If you see authentication errors:
1. Visit [Google OAuth Playground](https://developers.google.com/oauthplayground)
2. Generate a new refresh token
3. Update `GMAIL_REFRESH_TOKEN` in `.env`
4. Restart the application

### Rate Limiting
Gmail has sending limits:
- Free accounts: ~500 emails/day
- Workspace accounts: ~2000 emails/day

Consider implementing a queue system if you exceed these limits.
