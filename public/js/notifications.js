// Notification System for Dream X
(function() {
    // Check if user is authenticated (authUser should be set globally)
    if (typeof authUser === 'undefined' || !authUser) return;
    
    const socket = io();
    const userId = authUser.id;
    const notificationBell = document.getElementById('notificationBell');
    const notificationBadge = document.getElementById('notificationBadge');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationList = document.getElementById('notificationList');
    const markAllReadBtn = document.getElementById('markAllRead');
    
    // Join user's notification room
    socket.emit('join-user-room', userId);
    
    // Load initial notifications
    loadNotifications();
    
    // Listen for real-time notifications
    socket.on('notification', (notification) => {
        showToast(notification.title, notification.message);
        updateBadge();
        loadNotifications();
    });
    
    // Toggle notification panel
    notificationBell?.addEventListener('click', (e) => {
        e.preventDefault();
        const isVisible = notificationPanel.style.display !== 'none';
        notificationPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) loadNotifications();
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!notificationBell?.contains(e.target) && !notificationPanel?.contains(e.target)) {
            notificationPanel.style.display = 'none';
        }
    });
    
    // Mark all as read
    markAllReadBtn?.addEventListener('click', async () => {
        try {
            await fetch('/api/notifications/read-all', { method: 'POST' });
            loadNotifications();
            updateBadge();
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    });
    
    async function loadNotifications() {
        try {
            const response = await fetch('/api/notifications');
            const data = await response.json();
            renderNotifications(data.notifications);
            updateBadge(data.unreadCount);
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }
    
    function renderNotifications(notifications) {
        if (!notifications || notifications.length === 0) {
            notificationList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;">No notifications</div>';
            return;
        }
        
        notificationList.innerHTML = notifications.map(notif => `
            <div class="notification-item" style="padding:12px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;${notif.read ? 'opacity:0.6;' : 'background:#fef3f9;'}" data-id="${notif.id}" data-link="${notif.link || ''}">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px;">
                    <strong style="font-size:0.9rem;color:#1f2937;">${notif.title}</strong>
                    <span style="font-size:0.75rem;color:#9ca3af;">${formatTime(notif.created_at)}</span>
                </div>
                <p style="margin:0;font-size:0.85rem;color:#6b7280;">${notif.message}</p>
            </div>
        `).join('');
        
        // Add click handlers
        document.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                const link = item.dataset.link;
                await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
                if (link) window.location.href = link;
                loadNotifications();
            });
        });
    }
    
    function updateBadge(count) {
        if (count === undefined) {
            fetch('/api/notifications').then(r => r.json()).then(data => {
                updateBadge(data.unreadCount);
            });
            return;
        }
        if (count > 0) {
            notificationBadge.textContent = count > 99 ? '99+' : count;
            notificationBadge.style.display = 'block';
        } else {
            notificationBadge.style.display = 'none';
        }
    }
    
    function showToast(title, message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1f2937;color:white;padding:16px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;max-width:320px;animation:slideIn 0.3s ease;';
        toast.innerHTML = `<strong style="display:block;margin-bottom:4px;">${title}</strong><span style="font-size:0.9rem;opacity:0.9;">${message}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }
    
    // Initial badge update
    updateBadge();

    // Attempt push subscription if permitted and enabled
    (async function ensurePushSubscription(){
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
            if (!authUser.push_notifications) return; // user preference off
            const perm = Notification?.permission;
            if (perm !== 'granted') return; // do not prompt automatically here
            const reg = await navigator.serviceWorker.ready;
            // Check if already subscribed
            const existing = await reg.pushManager.getSubscription();
            if (existing) return;
            // Get public key
            const keyRes = await fetch('/api/push/public-key');
            const { key } = await keyRes.json();
            if (!key) return;
            const applicationServerKey = urlBase64ToUint8Array(key);
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
            await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        } catch (e) {
            console.warn('Push subscription skipped:', e.message);
        }
    })();

    // Wire up settings toggle (if present) to request permission/subscribe
    (function bindPushToggle(){
        try {
            const toggle = document.querySelector('input[name="push_notifications"]');
            if (!toggle) return;
            toggle.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    const result = await Notification.requestPermission();
                    if (result !== 'granted') {
                        e.target.checked = false;
                        if (window.showError) window.showError('Push notifications were blocked by the browser.');
                        else if (window.showToast) window.showToast({ type: 'error', message: 'Push notifications were blocked by the browser.' });
                        return;
                    }
                    await subscribeForPush();
                } else {
                    await unsubscribeFromPush();
                }
            });
            const btn = document.getElementById('enablePushNowBtn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    const result = await Notification.requestPermission();
                    if (result !== 'granted') {
                        if (window.showError) window.showError('Push notifications are blocked by the browser.');
                        else if (window.showToast) window.showToast({ type: 'error', message: 'Push notifications are blocked by the browser.' });
                        return;
                    }
                    await subscribeForPush();
                    // Optionally reflect checkbox state
                    if (toggle && !toggle.checked) toggle.checked = true;
                });
            }
        } catch {}
    })();

    async function subscribeForPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // already subscribed
        const res = await fetch('/api/push/public-key');
        const { key } = await res.json();
        if (!key) return;
        const applicationServerKey = urlBase64ToUint8Array(key);
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        if (!r.ok) throw new Error('Failed to save subscription');
        if (window.showSuccess) window.showSuccess('Push notifications enabled! 🎉');
        else if (window.showToast) window.showToast({ type: 'success', message: 'Push notifications enabled! 🎉' });
    }

    async function unsubscribeFromPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!existing) return;
        try {
            const r = await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: existing.endpoint }) });
            if (!r.ok) throw new Error('Failed to remove subscription');
        } catch {}
        try { await existing.unsubscribe(); } catch {}
        if (window.showInfo) window.showInfo('Push notifications disabled');
        else if (window.showToast) window.showToast({ type: 'success', message: 'Push notifications disabled' });
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
})();
