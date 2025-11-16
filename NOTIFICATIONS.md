# Dream X Push Notifications System

## Overview
The Dream X platform includes a comprehensive real-time notification system that supports both in-app notifications and future web push notifications. This system is designed to be extensible for various notification types.

## Architecture

### Database Tables

#### `notifications`
Stores all in-app notifications for users.
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,              -- 'message', 'admin', 'account', 'system'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,                       -- Optional link to navigate to
  read INTEGER DEFAULT 0,          -- 0 = unread, 1 = read
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### `push_subscriptions`
Stores Web Push API subscriptions for browser push notifications.
```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## API Endpoints

### Get User Notifications
```
GET /api/notifications
Response: { notifications: [...], unreadCount: number }
```

### Mark Notification as Read
```
POST /api/notifications/:id/read
Response: { success: true }
```

### Mark All Notifications as Read
```
POST /api/notifications/read-all
Response: { success: true }
```

### Delete Notification
```
DELETE /api/notifications/:id
Response: { success: true }
```

### Save Push Subscription
```
POST /api/push/subscribe
Body: { endpoint: string, keys: { p256dh: string, auth: string } }
Response: { success: true }
```

### Unsubscribe from Push
```
POST /api/push/unsubscribe
Body: { endpoint: string }
Response: { success: true }
```

## Database Helper Functions

### `createNotification({ userId, type, title, message, link })`
Creates a new notification for a user.

**Parameters:**
- `userId`: ID of the user to notify
- `type`: Notification type ('message', 'admin', 'account', 'system')
- `title`: Notification title (shown in bold)
- `message`: Notification message content
- `link`: Optional URL to navigate to when clicked

**Returns:** Notification ID

**Example:**
```javascript
createNotification({
    userId: 123,
    type: 'message',
    title: 'New message from John',
    message: 'Hey, how are you doing?',
    link: '/messages?conversation=5'
});
```

### `getUserNotifications(userId, limit = 50)`
Retrieves all notifications for a user, ordered by most recent.

### `getUnreadNotificationCount(userId)`
Returns the count of unread notifications for a user.

### `markNotificationAsRead(notificationId)`
Marks a specific notification as read.

### `markAllNotificationsAsRead(userId)`
Marks all notifications for a user as read.

### `deleteNotification(notificationId)`
Deletes a specific notification.

### `savePushSubscription({ userId, endpoint, p256dh, auth })`
Saves or updates a Web Push subscription for a user.

### `getPushSubscriptions(userId)`
Retrieves all push subscriptions for a user.

### `deletePushSubscription(endpoint)`
Removes a push subscription.

## Socket.IO Real-Time Notifications

### User Rooms
Each user joins a personal notification room: `user-{userId}`

```javascript
socket.emit('join-user-room', userId);
```

### Emitting Notifications
```javascript
io.to(`user-${userId}`).emit('notification', {
    type: 'message',
    title: 'New Message',
    message: 'You have a new message',
    link: '/messages',
    timestamp: new Date().toISOString()
});
```

## Client-Side Integration

### Notification Bell
The header includes a notification bell icon with a badge showing unread count.

```html
<a href="#" id="notificationBell" style="position:relative;">
    🔔 
    <span id="notificationBadge" style="..."></span>
</a>
```

### Notification Panel
Clicking the bell opens a dropdown panel showing recent notifications.

### Toast Notifications
Real-time notifications appear as toast messages in the bottom-right corner.

## Notification Types

### Message Notifications
Automatically created when a new message is sent in a conversation.

```javascript
// In /api/messages/send route
createNotification({
    userId: recipientId,
    type: 'message',
    title: 'New message from ' + senderName,
    message: messageContent,
    link: `/messages?conversation=${conversationId}`
});
```

### Admin Notifications
For admin actions affecting user accounts.

```javascript
createNotification({
    userId: targetUserId,
    type: 'admin',
    title: 'Account Updated',
    message: 'Your role has been changed to Pro',
    link: '/settings'
});
```

### Account Notifications
For account-related events (password changes, email updates, etc.).

```javascript
createNotification({
    userId: userId,
    type: 'account',
    title: 'Password Changed',
    message: 'Your password was successfully updated',
    link: '/settings'
});
```

### System Notifications
For platform-wide announcements.

```javascript
createNotification({
    userId: userId,
    type: 'system',
    title: 'New Feature Available',
    message: 'Check out our new group messaging feature!',
    link: '/features'
});
```

## Future Development

### Web Push Notifications
To implement browser push notifications:

1. **Install web-push library:**
```bash
npm install web-push
```

2. **Generate VAPID keys:**
```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log(vapidKeys);
```

3. **Add to .env:**
```
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:admin@dreamx.com
```

4. **Client-side subscription:**
```javascript
// Request permission and subscribe
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
});

// Save to server
await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
});
```

5. **Server-side push:**
```javascript
const webpush = require('web-push');
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Send push notification
const subscriptions = getPushSubscriptions(userId);
subscriptions.forEach(sub => {
    webpush.sendNotification(
        {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        JSON.stringify({
            title: 'New Message',
            body: 'You have a new message',
            icon: '/img/icon.png',
            data: { url: '/messages' }
        })
    );
});
```

### Email Notifications
Integration with email services (SendGrid, AWS SES, etc.) for important notifications.

### Notification Preferences
Allow users to customize which notification types they receive via:
- In-app notifications
- Push notifications
- Email notifications

Settings are already stored in the `users` table:
- `email_notifications`
- `push_notifications`
- `message_notifications`

## Testing

### Manual Testing
1. Send a message to another user
2. Check that the recipient sees:
   - Red badge on notification bell
   - Notification in dropdown panel
   - Toast notification (if on the page)

### Notification Types to Test
- [ ] New message notification
- [ ] Group message notification
- [ ] Admin account change notification
- [ ] Password change notification
- [ ] System announcement

## Best Practices

1. **Always check notification preferences** before creating notifications
2. **Include meaningful links** to help users navigate to relevant content
3. **Keep messages concise** - notifications should be scannable
4. **Use appropriate notification types** for better organization
5. **Clean up old notifications** periodically to prevent database bloat
6. **Throttle notifications** to prevent spam (e.g., batch multiple messages)

## Integration Example

```javascript
// Example: Notify user when their account is upgraded
async function upgradeUserToPro(userId) {
    // Update user role
    updateUserRole({ userId, role: 'pro' });
    
    // Create notification
    createNotification({
        userId,
        type: 'admin',
        title: 'Account Upgraded! 🎉',
        message: 'Your account has been upgraded to Pro. Enjoy your new features!',
        link: '/pricing'
    });
    
    // Emit real-time notification
    io.to(`user-${userId}`).emit('notification', {
        type: 'admin',
        title: 'Account Upgraded! 🎉',
        message: 'Your account has been upgraded to Pro. Enjoy your new features!',
        link: '/pricing',
        timestamp: new Date().toISOString()
    });
}
```

## Troubleshooting

### Notifications not appearing
1. Check that Socket.IO is connected: `socket.connected`
2. Verify user has joined their room: Check server logs for "joined user room"
3. Check browser console for errors in notifications.js

### Badge count incorrect
1. Ensure `getUnreadNotificationCount()` is returning correct value
2. Check that notifications are being marked as read properly
3. Verify database integrity

### Toast notifications not showing
1. Check that animations are enabled in browser
2. Verify notifications.js is loaded after Socket.IO
3. Check z-index conflicts with other elements
