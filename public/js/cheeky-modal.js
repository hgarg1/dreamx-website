// Cheeky Modal System - Because alerts are so 2005 💅
(function() {
  let modalContainer;
  const cheekySayings = {
    error: [
      "Oops! That didn't work. Let's try that again, shall we?",
      "Well, that's embarrassing... 😅",
      "Houston, we have a problem...",
      "Not today, Satan! 🚫",
      "Error 404: Success not found"
    ],
    success: [
      "Boom! Nailed it! 🎯",
      "You're on fire! 🔥",
      "Smooth like butter 😎",
      "Victory is yours! 🏆",
      "That's what I'm talking about! ✨"
    ],
    warning: [
      "Hold up there, partner! 🤠",
      "Whoa! Slow down a sec...",
      "Let's think about this... 🤔",
      "Not so fast! ⚠️",
      "Easy there, tiger! 🐯"
    ],
    info: [
      "Pro tip incoming! 💡",
      "Just so you know... ℹ️",
      "Here's the tea ☕",
      "FYI, fam 📢",
      "Real quick..."
    ]
  };

  function initModal() {
    if (modalContainer) return;
    
    // Create modal container
    modalContainer = document.createElement('div');
    modalContainer.id = 'cheekyModalContainer';
    modalContainer.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      animation: fadeIn 0.2s ease;
    `;
    
    document.body.appendChild(modalContainer);
    
    // Click outside to close
    modalContainer.addEventListener('click', function(e) {
      if (e.target === modalContainer) {
        closeModal();
      }
    });
  }

  function getRandomSaying(type) {
    const sayings = cheekySayings[type] || cheekySayings.info;
    return sayings[Math.floor(Math.random() * sayings.length)];
  }

  function getIcon(type) {
    const icons = {
      success: '✨',
      error: '😅',
      warning: '⚠️',
      info: '💡'
    };
    return icons[type] || icons.info;
  }

  function getGradient(type) {
    const gradients = {
      success: 'linear-gradient(135deg, #10b981, #059669)',
      error: 'linear-gradient(135deg, #ef4444, #dc2626)',
      warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
      info: 'linear-gradient(135deg, #667eea, #764ba2)'
    };
    return gradients[type] || gradients.info;
  }

  window.showCheekyModal = function(message, type = 'info', options = {}) {
    initModal();
    
    const {
      title = getRandomSaying(type),
      confirmText = 'Got it!',
      cancelText = null,
      onConfirm = null,
      onCancel = null,
      customHTML = null
    } = options;

    const modal = document.createElement('div');
    modal.className = 'cheeky-modal';
    modal.style.cssText = `
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(11, 16, 32, 0.98));
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 0;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow: hidden;
    `;

    const headerBg = getGradient(type);
    const icon = getIcon(type);

    modal.innerHTML = `
      <div style="background: ${headerBg}; padding: 24px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 8px;">${icon}</div>
        <h3 style="margin: 0; color: white; font-size: 20px; font-weight: 700;">${title}</h3>
      </div>
      <div style="padding: 24px;">
        ${customHTML || `<p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 20px; text-align: center;">${message}</p>`}
        <div style="display: flex; gap: 12px; justify-content: ${cancelText ? 'space-between' : 'center'};">
          ${cancelText ? `<button class="cheeky-btn cheeky-btn-cancel" style="flex: 1;">${cancelText}</button>` : ''}
          <button class="cheeky-btn cheeky-btn-confirm" style="flex: 1; background: ${headerBg};">${confirmText}</button>
        </div>
      </div>
    `;

    // Add button styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from { 
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
        }
        to { 
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .cheeky-btn {
        padding: 14px 24px;
        border: none;
        border-radius: 12px;
        font-weight: 700;
        font-size: 15px;
        cursor: pointer;
        transition: all 0.2s ease;
        color: white;
      }
      .cheeky-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      }
      .cheeky-btn:active {
        transform: translateY(0);
      }
      .cheeky-btn-cancel {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
    `;
    document.head.appendChild(style);

    // Event handlers
    const confirmBtn = modal.querySelector('.cheeky-btn-confirm');
    const cancelBtn = modal.querySelector('.cheeky-btn-cancel');

    confirmBtn.addEventListener('click', () => {
      if (onConfirm) onConfirm();
      closeModal();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (onCancel) onCancel();
        closeModal();
      });
    }

    // Show modal
    modalContainer.innerHTML = '';
    modalContainer.appendChild(modal);
    modalContainer.style.display = 'flex';
    
    // Focus confirm button
    setTimeout(() => confirmBtn.focus(), 100);

    // ESC key to close
    function handleEsc(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    }
    document.addEventListener('keydown', handleEsc);
  };

  window.closeModal = function() {
    if (modalContainer) {
      modalContainer.style.display = 'none';
    }
  };

  // Convenience methods
  window.showSuccess = (msg, opts) => showCheekyModal(msg, 'success', opts);
  window.showError = (msg, opts) => showCheekyModal(msg, 'error', opts);
  window.showWarning = (msg, opts) => showCheekyModal(msg, 'warning', opts);
  window.showInfo = (msg, opts) => showCheekyModal(msg, 'info', opts);

  // Confirm dialog
  window.showConfirm = (message, onConfirm, onCancel) => {
    showCheekyModal(message, 'warning', {
      title: 'Are you sure? 🤔',
      confirmText: 'Yes, do it!',
      cancelText: 'Nope, cancel',
      onConfirm,
      onCancel
    });
  };
})();
