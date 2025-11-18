/**
 * Global Modal Alert System for Dream X
 * Replaces browser alerts with beautiful modal dialogs
 */

(function() {
  'use strict';

  // Create modal container if it doesn't exist
  function ensureModalContainer() {
    let container = document.getElementById('globalModalContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'globalModalContainer';
      container.innerHTML = `
        <style>
          .global-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(8px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          
          .global-modal-content {
            background: white;
            border-radius: 20px;
            padding: 0;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            animation: slideUp 0.3s ease;
            border: 2px solid rgba(255, 79, 163, 0.2);
            overflow: hidden;
          }
          
          .global-modal-header {
            padding: 25px 30px;
            border-bottom: 2px solid rgba(255, 79, 163, 0.15);
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .global-modal-icon {
            font-size: 2rem;
            line-height: 1;
          }
          
          .global-modal-title {
            margin: 0;
            font-size: 1.4rem;
            font-weight: 700;
            background: linear-gradient(135deg, #ff4fa3, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          
          .global-modal-body {
            padding: 30px;
            color: #374151;
            font-size: 1rem;
            line-height: 1.6;
          }
          
          .global-modal-footer {
            padding: 20px 30px;
            border-top: 2px solid rgba(255, 79, 163, 0.1);
            display: flex;
            gap: 12px;
            justify-content: flex-end;
          }
          
          .global-modal-btn {
            padding: 12px 24px;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
          }
          
          .global-modal-btn:hover {
            transform: translateY(-2px);
          }
          
          .global-modal-btn.primary {
            background: linear-gradient(135deg, #ff4fa3, #764ba2);
            color: white;
            box-shadow: 0 4px 16px rgba(255, 79, 163, 0.3);
          }
          
          .global-modal-btn.primary:hover {
            box-shadow: 0 6px 20px rgba(255, 79, 163, 0.4);
          }
          
          .global-modal-btn.secondary {
            background: linear-gradient(135deg, #6c757d, #5a6268);
            color: white;
            box-shadow: 0 4px 16px rgba(108, 117, 125, 0.3);
          }
          
          .global-modal-btn.success {
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
          }
          
          .global-modal-btn.danger {
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: white;
            box-shadow: 0 4px 16px rgba(220, 53, 69, 0.3);
          }
          
          .global-modal-btn.warning {
            background: linear-gradient(135deg, #ffc107, #ff9800);
            color: #000;
            box-shadow: 0 4px 16px rgba(255, 193, 7, 0.3);
          }
        </style>
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  // Show alert modal
  window.showAlert = function(message, title = 'Notice', icon = '💬', type = 'info') {
    const container = ensureModalContainer();
    
    const modal = document.createElement('div');
    modal.className = 'global-modal-overlay';
    modal.innerHTML = `
      <div class="global-modal-content">
        <div class="global-modal-header">
          <span class="global-modal-icon">${icon}</span>
          <h3 class="global-modal-title">${title}</h3>
        </div>
        <div class="global-modal-body">${message}</div>
        <div class="global-modal-footer">
          <button class="global-modal-btn primary" onclick="this.closest('.global-modal-overlay').remove()">OK</button>
        </div>
      </div>
    `;
    
    container.appendChild(modal);
    
    // Close on overlay click
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Auto-remove after 30s
    setTimeout(() => modal.remove(), 30000);
  };

  // Show success modal
  window.showSuccess = function(message, title = 'Success') {
    showAlert(message, title, '✅', 'success');
  };

  // Show error modal
  window.showError = function(message, title = 'Error') {
    showAlert(message, title, '❌', 'error');
  };

  // Show warning modal
  window.showWarning = function(message, title = 'Warning') {
    showAlert(message, title, '⚠️', 'warning');
  };

  // Show info modal
  window.showInfo = function(message, title = 'Information') {
    showAlert(message, title, 'ℹ️', 'info');
  };

  // Show confirm dialog
  window.showConfirm = function(message, onConfirm, onCancel, title = 'Confirm', icon = '❓') {
    const container = ensureModalContainer();
    
    const modal = document.createElement('div');
    modal.className = 'global-modal-overlay';
    modal.innerHTML = `
      <div class="global-modal-content">
        <div class="global-modal-header">
          <span class="global-modal-icon">${icon}</span>
          <h3 class="global-modal-title">${title}</h3>
        </div>
        <div class="global-modal-body">${message}</div>
        <div class="global-modal-footer">
          <button class="global-modal-btn secondary" id="cancelBtn">Cancel</button>
          <button class="global-modal-btn primary" id="confirmBtn">Confirm</button>
        </div>
      </div>
    `;
    
    container.appendChild(modal);
    
    modal.querySelector('#confirmBtn').addEventListener('click', function() {
      modal.remove();
      if (onConfirm) onConfirm();
    });
    
    modal.querySelector('#cancelBtn').addEventListener('click', function() {
      modal.remove();
      if (onCancel) onCancel();
    });
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.remove();
        if (onCancel) onCancel();
      }
    });
  };

  // Override native alert (optional)
  window.nativeAlert = window.alert;
  window.alert = function(message) {
    showAlert(message);
  };

  console.log('✅ Modal Alert System loaded');
})();
