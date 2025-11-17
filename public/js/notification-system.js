/**
 * Global Toast and Modal Notification System for Dream X
 * Replaces all alert() calls with modern, user-friendly notifications
 */

// Create toast container if it doesn't exist
function createToastContainer() {
  if (!document.getElementById('toast-container')) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 4000)
 * @param {string} title - Optional title
 */
function showToast(message, type = 'info', duration = 4000, title = '') {
  createToastContainer();
  
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const titles = {
    success: title || 'Success',
    error: title || 'Error',
    warning: title || 'Warning',
    info: title || 'Info'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  const container = document.getElementById('toast-container');
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show a modal dialog
 * @param {Object} options - Modal configuration
 * @param {string} options.title - Modal title
 * @param {string} options.message - Modal message/body
 * @param {string} options.type - Type: 'success', 'error', 'warning', 'info'
 * @param {Array} options.buttons - Array of button objects {text, className, onClick}
 * @param {boolean} options.dismissible - Can be closed by clicking outside (default: true)
 */
function showModal(options) {
  const {
    title = 'Notice',
    message = '',
    type = 'info',
    buttons = [{text: 'OK', className: 'modal-btn-primary', onClick: null}],
    dismissible = true
  } = options;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'notification-modal';
  
  // Create modal dialog
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  
  // Modal header
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <div class="modal-title">
      <span class="modal-icon ${type}">${icons[type]}</span>
      ${title}
    </div>
    ${dismissible ? '<button class="modal-close" onclick="closeModal(\'notification-modal\')">×</button>' : ''}
  `;
  
  // Modal body
  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML = message;
  
  // Modal footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = `modal-btn ${btn.className || 'modal-btn-secondary'}`;
    button.textContent = btn.text;
    button.onclick = () => {
      if (btn.onClick) btn.onClick();
      closeModal('notification-modal');
    };
    footer.appendChild(button);
  });
  
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Show with animation
  setTimeout(() => overlay.classList.add('show'), 10);
  
  // Close on overlay click if dismissible
  if (dismissible) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal('notification-modal');
    });
  }
}

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {function} onConfirm - Callback when confirmed
 * @param {function} onCancel - Callback when cancelled
 * @param {string} title - Dialog title (default: 'Confirm Action')
 */
function showConfirm(message, onConfirm, onCancel = null, title = 'Confirm Action') {
  showModal({
    title: title,
    message: message,
    type: 'warning',
    dismissible: true,
    buttons: [
      {
        text: 'Cancel',
        className: 'modal-btn-secondary',
        onClick: onCancel
      },
      {
        text: 'Confirm',
        className: 'modal-btn-primary',
        onClick: onConfirm
      }
    ]
  });
}

/**
 * Show a loading modal
 * @param {string} message - Loading message
 * @returns {string} Modal ID for later closure
 */
function showLoading(message = 'Processing...') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'loading-modal';
  
  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-body" style="text-align: center; padding: 2rem;">
        <div class="modal-loading" style="margin: 0 auto 1rem;"></div>
        <div>${message}</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  return 'loading-modal';
}

/**
 * Close a modal by ID
 * @param {string} modalId - Modal element ID
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
}

/**
 * Show success message
 * @param {string} message - Success message
 * @param {string} title - Optional title
 */
function showSuccess(message, title = '') {
  showToast(message, 'success', 4000, title);
}

/**
 * Show error message
 * @param {string} message - Error message
 * @param {string} title - Optional title
 */
function showError(message, title = '') {
  showToast(message, 'error', 5000, title);
}

/**
 * Show warning message
 * @param {string} message - Warning message
 * @param {string} title - Optional title
 */
function showWarning(message, title = '') {
  showToast(message, 'warning', 4500, title);
}

/**
 * Show info message
 * @param {string} message - Info message
 * @param {string} title - Optional title
 */
function showInfo(message, title = '') {
  showToast(message, 'info', 4000, title);
}

// Initialize toast container on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createToastContainer);
} else {
  createToastContainer();
}

// Export for use in modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showToast,
    showModal,
    showConfirm,
    showLoading,
    closeModal,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
}
