// Refund Request Wizard JavaScript

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('refundForm');
  const steps = document.querySelectorAll('.wizard-step');
  const stepIndicators = document.querySelectorAll('.step');
  const nextButtons = document.querySelectorAll('.btn-next');
  const prevButtons = document.querySelectorAll('.btn-prev');
  
  let currentStep = 1;
  const totalSteps = steps.length;

  // Get recent refunds data from page (passed from server)
  const recentRefundsData = window.recentRefunds || [];

  // Check for duplicate refund attempts
  function checkForDuplicateRefund() {
    const chargeId = document.querySelector('select[name="chargeId"]')?.value;
    const transactionId = document.querySelector('input[name="transactionId"]')?.value;

    if (!chargeId && !transactionId) return null;

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const duplicateRefund = recentRefundsData.find(refund => {
      const refundDate = new Date(refund.created_at);
      const isRecent = refundDate > fiveDaysAgo;
      
      if (isRecent) {
        if (chargeId && refund.charge_id == chargeId) return true;
        if (transactionId && refund.transaction_id === transactionId) return true;
      }
      return false;
    });

    if (duplicateRefund) {
      const daysSince = Math.ceil((new Date() - new Date(duplicateRefund.created_at)) / (1000 * 60 * 60 * 24));
      const daysRemaining = 5 - daysSince;
      return daysRemaining;
    }

    return null;
  }

  // Show duplicate warning
  function showDuplicateWarning(daysRemaining) {
    const warningHtml = `
      <div class="duplicate-warning" style="background: linear-gradient(135deg, #fef3c7, #fde68a); border: 2px solid #fcd34d; border-radius: 12px; padding: 16px 20px; margin: 20px 0; display: flex; align-items: start; gap: 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <div>
          <div style="font-weight: 700; color: #92400e; margin-bottom: 4px;">Duplicate Request Detected</div>
          <div style="color: #78350f; font-size: 0.9rem;">You have already submitted a refund request for this transaction. Please wait <strong>${daysRemaining} more day(s)</strong> before submitting another request.</div>
        </div>
      </div>
    `;
    
    const firstStep = document.querySelector('.wizard-step[data-step="1"]');
    let existingWarning = firstStep.querySelector('.duplicate-warning');
    if (existingWarning) {
      existingWarning.remove();
    }
    firstStep.insertAdjacentHTML('afterbegin', warningHtml);
  }

  // Monitor charge and transaction ID changes
  const chargeSelect = document.querySelector('select[name="chargeId"]');
  const transactionInput = document.querySelector('input[name="transactionId"]');

  function checkAndWarn() {
    const daysRemaining = checkForDuplicateRefund();
    if (daysRemaining !== null) {
      showDuplicateWarning(daysRemaining);
    } else {
      const existingWarning = document.querySelector('.duplicate-warning');
      if (existingWarning) existingWarning.remove();
    }
  }

  if (chargeSelect) {
    chargeSelect.addEventListener('change', checkAndWarn);
  }
  if (transactionInput) {
    transactionInput.addEventListener('input', checkAndWarn);
  }

  // File upload handling
  const uploadArea = document.getElementById('screenshotUploadArea');
  const fileInput = document.getElementById('screenshotInput');
  const filePreview = document.getElementById('screenshotPreview');

  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert('File size must be less than 5MB');
          fileInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          filePreview.innerHTML = `
            <img src="${e.target.result}" alt="Screenshot preview" />
            <div class="file-preview-info">
              <div class="file-preview-name">${file.name}</div>
              <div class="file-preview-size">${(file.size / 1024).toFixed(2)} KB</div>
            </div>
            <button type="button" class="btn-remove-file" onclick="removeScreenshot()">Remove</button>
          `;
          filePreview.classList.add('active');
        };
        reader.readAsDataURL(file);
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#ec4899';
      uploadArea.style.background = '#fff5f7';
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#d1d5db';
      uploadArea.style.background = '#fafafa';
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#d1d5db';
      uploadArea.style.background = '#fafafa';
      
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }

  // Refund method selection handlers
  const methodRadios = document.querySelectorAll('input[name="preferredMethod"]');
  const accountEmailGroup = document.getElementById('accountEmailGroup');
  const accountDetailsGroup = document.getElementById('accountDetailsGroup');
  const accountEmailInput = document.querySelector('input[name="accountEmail"]');
  const accountLastFourInput = document.querySelector('input[name="accountLastFour"]');

  methodRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      const method = this.value;
      
      // Reset required states
      if (accountEmailInput) accountEmailInput.removeAttribute('required');
      if (accountLastFourInput) accountLastFourInput.removeAttribute('required');
      
      // Hide all conditional fields
      if (accountEmailGroup) accountEmailGroup.style.display = 'none';
      if (accountDetailsGroup) accountDetailsGroup.style.display = 'none';
      
      // Show relevant fields based on selection
      if (method === 'paypal') {
        if (accountEmailGroup) accountEmailGroup.style.display = 'block';
        if (accountEmailInput) accountEmailInput.setAttribute('required', 'required');
      } else if (method === 'original_payment') {
        if (accountDetailsGroup) accountDetailsGroup.style.display = 'block';
      }
    });
  });

  // Navigation functions
  function showStep(stepNumber) {
    steps.forEach((step, index) => {
      step.classList.remove('active');
      if (index + 1 === stepNumber) {
        step.classList.add('active');
      }
    });

    stepIndicators.forEach((indicator, index) => {
      indicator.classList.remove('active', 'completed');
      if (index + 1 === stepNumber) {
        indicator.classList.add('active');
      } else if (index + 1 < stepNumber) {
        indicator.classList.add('completed');
      }
    });

    currentStep = stepNumber;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateCurrentStep() {
    const currentStepElement = document.querySelector(`.wizard-step[data-step="${currentStep}"]`);
    const inputs = currentStepElement.querySelectorAll('input[required], select[required], textarea[required]');
    
    for (let input of inputs) {
      if (!input.value.trim()) {
        input.focus();
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 2000);
        
        // Show validation message
        if (typeof showError === 'function') {
          showError('Please fill in all required fields');
        } else {
          alert('Please fill in all required fields');
        }
        return false;
      }

      // Specific validations
      if (input.type === 'email' && !isValidEmail(input.value)) {
        input.focus();
        if (typeof showError === 'function') {
          showError('Please enter a valid email address');
        } else {
          alert('Please enter a valid email address');
        }
        return false;
      }

      if (input.type === 'number' && parseFloat(input.value) <= 0) {
        input.focus();
        if (typeof showError === 'function') {
          showError('Please enter a valid amount');
        } else {
          alert('Please enter a valid amount');
        }
        return false;
      }
    }

    return true;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateReview() {
    // Order details
    const orderDate = document.querySelector('input[name="orderDate"]').value;
    const amount = document.querySelector('input[name="amount"]').value;
    const transactionId = document.querySelector('input[name="transactionId"]').value;

    document.getElementById('review-orderDate').textContent = orderDate ? new Date(orderDate).toLocaleDateString() : '-';
    document.getElementById('review-amount').textContent = amount ? `$${parseFloat(amount).toFixed(2)}` : '-';
    document.getElementById('review-transactionId').textContent = transactionId || 'Not provided';

    // Refund details
    const reasonSelect = document.querySelector('select[name="reason"]');
    const reason = reasonSelect.options[reasonSelect.selectedIndex].text;
    const description = document.querySelector('textarea[name="description"]').value;

    document.getElementById('review-reason').textContent = reason !== 'Please select a reason' ? reason : '-';
    document.getElementById('review-description').textContent = description || 'Not provided';

    // Refund method
    const selectedMethod = document.querySelector('input[name="preferredMethod"]:checked');
    let methodText = '-';
    if (selectedMethod) {
      const methodCard = selectedMethod.closest('.radio-card').querySelector('.radio-title');
      methodText = methodCard.textContent;
      
      const accountEmail = document.querySelector('input[name="accountEmail"]')?.value;
      if (accountEmail) {
        methodText += ` (${accountEmail})`;
      }
    }
    document.getElementById('review-method').textContent = methodText;
  }

  // Next button handlers
  nextButtons.forEach(button => {
    button.addEventListener('click', function() {
      if (validateCurrentStep()) {
        if (currentStep < totalSteps) {
          showStep(currentStep + 1);
          
          // Update review if moving to final step
          if (currentStep === totalSteps) {
            updateReview();
          }
        }
      }
    });
  });

  // Previous button handlers
  prevButtons.forEach(button => {
    button.addEventListener('click', function() {
      if (currentStep > 1) {
        showStep(currentStep - 1);
      }
    });
  });

  // Form submission
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!validateCurrentStep()) {
      return;
    }

    // Check for duplicate before submitting
    const daysRemaining = checkForDuplicateRefund();
    if (daysRemaining !== null) {
      if (typeof showError === 'function') {
        showError(`You have already submitted a refund request for this transaction. Please wait ${daysRemaining} more day(s).`);
      } else {
        alert(`You have already submitted a refund request for this transaction. Please wait ${daysRemaining} more day(s).`);
      }
      return;
    }

    // Show loading state
    const submitBtn = document.querySelector('.btn-submit');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;

    // Submit the form
    const formData = new FormData(form);
    
    fetch('/refund-request', {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || 'Failed to submit refund request');
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        if (typeof showSuccess === 'function') {
          showSuccess('Refund request submitted successfully! You will receive a confirmation email shortly.');
        } else {
          alert('Refund request submitted successfully! You will receive a confirmation email shortly.');
        }
        setTimeout(() => {
          window.location.href = '/settings';
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to submit refund request');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      if (typeof showError === 'function') {
        showError(error.message || 'An error occurred. Please try again.');
      } else {
        alert(error.message || 'An error occurred. Please try again.');
      }
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    });
  });

  // Add CSS for error state
  const style = document.createElement('style');
  style.textContent = `
    .form-input.error,
    .form-textarea.error {
      border-color: #ef4444;
      animation: shake 0.3s;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    .btn-remove-file {
      padding: 8px 16px;
      background: #fee2e2;
      color: #991b1b;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .btn-remove-file:hover {
      background: #fecaca;
    }
  `;
  document.head.appendChild(style);
});

// Global function to remove screenshot
function removeScreenshot() {
  const fileInput = document.getElementById('screenshotInput');
  const filePreview = document.getElementById('screenshotPreview');
  
  fileInput.value = '';
  filePreview.innerHTML = '';
  filePreview.classList.remove('active');
}
