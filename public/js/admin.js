// ===================================
// DREAMX ADMIN DASHBOARD - INTERACTIVE FEATURES
// ===================================

document.addEventListener('DOMContentLoaded', function() {
  
  // ===================================
  // TAB NAVIGATION
  // ===================================
  const tabButtons = document.querySelectorAll('.admin-tabs .tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update active tab button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show target panel with animation
      tabPanels.forEach(panel => {
        if (panel.getAttribute('data-tab') === targetTab) {
          panel.style.display = '';
          panel.classList.add('show');
          // Trigger reflow for animation
          void panel.offsetWidth;
        } else {
          panel.style.display = 'none';
          panel.classList.remove('show');
        }
      });
    });
  });
  
  // ===================================
  // SEARCH FILTERS (CLIENT-SIDE)
  // ===================================
  function createFilter(inputId, rowSelector, fields) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.addEventListener('input', function() {
      const query = this.value.trim().toLowerCase();
      const rows = document.querySelectorAll(rowSelector);
      
      rows.forEach(row => {
        const searchText = fields.map(field => {
          return (row.getAttribute('data-' + field) || '').toLowerCase();
        }).join(' ');
        
        if (searchText.includes(query)) {
          row.style.display = '';
          row.style.animation = 'fadeIn 0.3s ease';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }
  
  // Attach filters for each table
  createFilter('filterUsers', '.row-user', ['name', 'email', 'role']);
  createFilter('filterCareers', '.row-career', ['position', 'name', 'email', 'status']);
  createFilter('filterContentAppeals', '.row-content-appeal', ['email', 'type', 'status']);
  createFilter('filterAccountAppeals', '.row-account-appeal', ['email', 'username', 'status']);
  
  // ===================================
  // CAREER APPLICATION DETAIL MODAL
  // ===================================
  const careerModal = document.createElement('div');
  careerModal.className = 'modal';
  careerModal.style.display = 'none';
  careerModal.innerHTML = 
    '<div class="modal-content">' +
      '<span class="modal-close" id="careerModalClose">&times;</span>' +
      '<h3>Application Details</h3>' +
      '<div id="careerModalBody" class="pre-wrap"></div>' +
    '</div>';
  document.body.appendChild(careerModal);
  
  // Close modal when clicking outside
  careerModal.addEventListener('click', (e) => {
    if (e.target === careerModal) {
      careerModal.style.display = 'none';
    }
  });
  
  // Handle career detail view clicks
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('career-view')) {
      e.preventDefault();
      
      try {
        const data = JSON.parse(e.target.getAttribute('data-json'));
        const modalBody = document.getElementById('careerModalBody');
        
        let html = '<div style="display: grid; gap: 1.5rem;">';
        
        html += '<div>';
        html += '<strong style="color: var(--accent);">Position:</strong>';
        html += '<div style="font-size: 1.25rem; margin-top: 0.25rem;">' + data.position + '</div>';
        html += '</div>';
        
        html += '<div>';
        html += '<strong style="color: var(--accent);">Applicant:</strong>';
        html += '<div style="margin-top: 0.25rem;">';
        html += data.name + '<br>';
        html += '<a href="mailto:' + data.email + '" style="color: var(--accent-2);">' + data.email + '</a><br>';
        html += (data.phone || 'No phone provided');
        html += '</div>';
        html += '</div>';
        
        html += '<div>';
        html += '<strong style="color: var(--accent);">Status:</strong>';
        html += '<span class="role-badge role-' + (data.status || 'new').replace('_', '-') + '" style="margin-left: 0.5rem;">';
        html += (data.status || 'new').replace('_', ' ');
        html += '</span>';
        html += '</div>';
        
        html += '<div>';
        html += '<strong style="color: var(--accent);">Submitted:</strong>';
        html += '<div style="margin-top: 0.25rem;">' + new Date(data.created_at).toLocaleString() + '</div>';
        html += '</div>';
        
        html += '<div>';
        html += '<strong style="color: var(--accent);">Cover Letter:</strong>';
        html += '<div style="margin-top: 0.75rem; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 12px; border: 1px solid var(--admin-border); line-height: 1.6;">';
        const coverLetter = (data.cover_letter || 'No cover letter provided');
        const escapedLetter = coverLetter.split('<').join('&lt;').split('\n').join('<br>');
        html += escapedLetter;
        html += '</div>';
        html += '</div>';
        
        html += '<div style="display: flex; gap: 1rem; flex-wrap: wrap;">';
        if (data.resume_file) {
          html += '<a href="' + data.resume_file + '" target="_blank" class="btn-update" style="text-decoration: none;">';
          html += 'View Resume';
          html += '</a>';
        }
        if (data.portfolio_file) {
          html += '<a href="' + data.portfolio_file + '" target="_blank" class="btn-update" style="text-decoration: none;">';
          html += 'View Portfolio';
          html += '</a>';
        }
        html += '</div>';
        
        html += '</div>';
        
        modalBody.innerHTML = html;
        
        const closeBtn = document.getElementById('careerModalClose');
        if (closeBtn) {
          closeBtn.onclick = () => {
            careerModal.style.display = 'none';
          };
        }
        
        careerModal.style.display = 'flex';
      } catch (error) {
        console.error('Error displaying career details:', error);
      }
    }
  });
  
  // ===================================
  // ANIMATED METRICS ON LOAD
  // ===================================
  const metricValues = document.querySelectorAll('.metric-value');
  metricValues.forEach(element => {
    const finalValue = parseInt(element.textContent) || 0;
    let currentValue = 0;
    const duration = 1500; // ms
    const increment = finalValue / (duration / 16);
    
    const counter = setInterval(() => {
      currentValue += increment;
      if (currentValue >= finalValue) {
        element.textContent = finalValue;
        clearInterval(counter);
      } else {
        element.textContent = Math.floor(currentValue);
      }
    }, 16);
  });
  
  // ===================================
  // PROGRESS BAR ANIMATION
  // ===================================
  const progressFills = document.querySelectorAll('.progress-fill');
  progressFills.forEach(fill => {
    const width = fill.style.width;
    fill.style.width = '0%';
    setTimeout(() => {
      fill.style.width = width;
    }, 300);
  });
  
  // ===================================
  // SMOOTH SCROLL TO TOP ON TAB CHANGE
  // ===================================
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  });
  
  // ===================================
  // ENHANCED FORM SUBMISSIONS
  // ===================================
  const updateForms = document.querySelectorAll('.role-update-form');
  updateForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const submitBtn = this.querySelector('.btn-update');
      if (submitBtn) {
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;
      }
    });
  });
  
  // ===================================
  // KEYBOARD SHORTCUTS
  // ===================================
  document.addEventListener('keydown', (e) => {
    // Alt + 1-6 to switch tabs
    if (e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      const tabs = Array.from(tabButtons);
      if (tabs[index]) {
        tabs[index].click();
      }
    }
    
    // ESC to close modal
    if (e.key === 'Escape') {
      careerModal.style.display = 'none';
    }
  });
  
  // ===================================
  // AUTO-REFRESH INDICATOR
  // ===================================
  const addRefreshIndicator = () => {
    const timestampFooter = document.querySelector('.timestamp-footer');
    if (timestampFooter) {
      const now = new Date();
      const timeAgo = Math.floor((Date.now() - now.getTime()) / 1000);
      
      setInterval(() => {
        const minutes = Math.floor((Date.now() - now.getTime()) / 60000);
        if (minutes > 0) {
          timestampFooter.innerHTML = 
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<circle cx="12" cy="12" r="10"></circle>' +
              '<polyline points="12 6 12 12 16 14"></polyline>' +
            '</svg>' +
            'Last updated ' + minutes + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
        }
      }, 30000); // Update every 30 seconds
    }
  };
  
  addRefreshIndicator();
  
  // ===================================
  // CONSOLE EASTER EGG
  // ===================================
  console.log('%c🌟 Dream X Admin Dashboard', 'font-size: 24px; font-weight: bold; background: linear-gradient(135deg, #ff4fa3, #7c5cff); color: white; padding: 10px 20px; border-radius: 8px;');
  console.log('%cPowered by modern web technologies ✨', 'font-size: 14px; color: #a7acd9;');
  
});

// ===================================
// USER MODERATION ACTIONS (Outside DOMContentLoaded for global access)
// ===================================

// Store current user being moderated
let currentModerationUserId = null;
let currentModerationUserName = null;

// Toggle user actions menu
function toggleUserActions(userId) {
  const menu = document.getElementById('user-actions-' + userId);
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

// Close menus when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.admin-user-actions')) {
    document.querySelectorAll('.admin-actions-menu').forEach(menu => {
      menu.style.display = 'none';
    });
  }
});

// Open ban modal
function banUserAction(userId, userName) {
  currentModerationUserId = userId;
  currentModerationUserName = userName;
  document.getElementById('banUserName').textContent = userName;
  document.getElementById('banReason').value = '';
  document.getElementById('banUserModal').style.display = 'flex';
}

// Close ban modal
function closeBanModal() {
  document.getElementById('banUserModal').style.display = 'none';
  currentModerationUserId = null;
  currentModerationUserName = null;
}

// Confirm ban
function confirmBan() {
  const reason = document.getElementById('banReason').value.trim();
  const notifyUser = document.getElementById('banNotifyUser')?.checked || false;
  if (!reason) {
    alert('Please provide a ban reason.');
    return;
  }
  
  fetch(`/admin/users/${currentModerationUserId}/ban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason, notifyUser })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(`${currentModerationUserName} has been permanently banned.`);
      closeBanModal();
      location.reload();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Ban error:', err);
    alert('Failed to ban user. Please try again.');
  });
}

// Open suspend modal
function suspendUserModal(userId, userName) {
  currentModerationUserId = userId;
  currentModerationUserName = userName;
  document.getElementById('suspendUserName').textContent = userName;
  document.getElementById('suspendDays').value = '7';
  document.getElementById('suspendUnit').value = 'days';
  document.getElementById('suspendReason').value = '';
  document.getElementById('suspendUserModal').style.display = 'flex';
}

// Close suspend modal
function closeSuspendModal() {
  document.getElementById('suspendUserModal').style.display = 'none';
  currentModerationUserId = null;
  currentModerationUserName = null;
}

// Confirm suspend
function confirmSuspend() {
  const duration = parseInt(document.getElementById('suspendDays').value);
  const notifyUser = document.getElementById('suspendNotifyUser')?.checked || false;
  const unit = document.getElementById('suspendUnit').value;
  const reason = document.getElementById('suspendReason').value.trim();
  
  if (!duration || duration < 1) {
    alert('Please provide a valid suspension duration.');
    return;
  }
  
  if (!reason) {
    alert('Please provide a suspension reason.');
    return;
  }
  
  // Convert to days
  const days = unit === 'hours' ? Math.ceil(duration / 24) : duration;
  
  fetch(`/admin/users/${currentModerationUserId}/suspend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ days, reason, notifyUser })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const displayDuration = unit === 'hours' ? `${duration} hours` : `${duration} days`;
      alert(`${currentModerationUserName} has been suspended for ${displayDuration}.`);
      closeSuspendModal();
      location.reload();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Suspend error:', err);
    alert('Failed to suspend user. Please try again.');
  });
}

// Unban/restore user account
function unbanUserAction(userId, userName) {
  if (!confirm(`Restore ${userName}'s account?\n\nThis will remove any ban or suspension and allow them to access the platform again.`)) {
    return;
  }
  
  fetch(`/admin/users/${userId}/unban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(`${userName}'s account has been restored.`);
      location.reload();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Unban error:', err);
    alert('Failed to restore account. Please try again.');
  });
}

// Remove suspension from a user (restore to active)
function removeSuspensionAction(userId, userName) {
  if (!confirm(`Remove suspension from ${userName}?\n\nThis will restore their account to active status immediately.`)) {
    return;
  }
  
  fetch(`/admin/users/${userId}/unban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(`Suspension removed from ${userName}.`);
      location.reload();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Remove suspension error:', err);
    alert('Failed to remove suspension. Please try again.');
  });
}

// Remove ban from a user (restore to active)
function removeBanAction(userId, userName) {
  if (!confirm(`Remove ban from ${userName}?\n\nThis will restore their account to active status immediately.`)) {
    return;
  }
  
  fetch(`/admin/users/${userId}/unban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(`Ban removed from ${userName}.`);
      location.reload();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Remove ban error:', err);
    alert('Failed to remove ban. Please try again.');
  });
}
