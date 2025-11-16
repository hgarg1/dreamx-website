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
})();
