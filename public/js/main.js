// Dream X - Main JavaScript File
// Client-side interactivity and enhancements

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('✨ Dream X - Ready to inspire growth!');
    
    // Initialize all features
    initSmoothScrolling();
    initFormValidation();
    initMobileMenu();
    initDropdowns();
    initLogoutHandler();
});

/**
 * Smooth scrolling for anchor links
 */
function initSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only apply smooth scroll for on-page anchors, not navigation or empty anchors
            if (href !== '#' && href.length > 1 && !this.closest('.dropdown-toggle')) {
                const target = document.querySelector(href);
                
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

/**
 * Form validation for contact page
 */
function initFormValidation() {
    const contactForm = document.querySelector('.contact-form');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const subject = document.getElementById('subject').value.trim();
            const message = document.getElementById('message').value.trim();
            
            // Basic validation
            if (!name || !email || !subject || !message) {
                alert('Please fill in all fields.');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert('Please enter a valid email address.');
                return;
            }
            
            // If validation passes
            alert('Thank you for your message! We\'ll get back to you soon.');
            
            // Reset form
            contactForm.reset();
            
            // In a real application, you would send the form data to the server here
            // Example: fetch('/contact', { method: 'POST', body: formData })
        });
    }
}

/**
 * Mobile menu toggle
 */
function initMobileMenu() {
    const menuButton = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuButton && navLinks) {
        // Toggle menu on button click
        menuButton.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            menuButton.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const navItems = navLinks.querySelectorAll('a');
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                navLinks.classList.remove('active');
                menuButton.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            const isClickInsideNav = navLinks.contains(event.target);
            const isClickOnButton = menuButton.contains(event.target);
            
            if (!isClickInsideNav && !isClickOnButton && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                menuButton.classList.remove('active');
            }
        });
    }
}

/**
 * Simple dropdown toggles for navbar
 */
function initDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dd => {
        const toggle = dd.querySelector('.dropdown-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dd.classList.toggle('open');
            const expanded = dd.classList.contains('open');
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
        
        // Ensure dropdown menu links work properly
        const menuLinks = dd.querySelectorAll('.dropdown-menu a');
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                // Let the link navigate normally
            });
        });
    });
    // Close when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown.open').forEach(dd => {
            dd.classList.remove('open');
            const t = dd.querySelector('.dropdown-toggle');
            if (t) t.setAttribute('aria-expanded', 'false');
        });
    });
}

/**
 * Add active state to current page in navigation
 * (This is handled server-side in the EJS templates, but can be enhanced here)
 */
function highlightCurrentPage() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (currentPath === linkPath) {
            link.classList.add('active');
        }
    });
}

/**
 * Utility function: Add fade-in animation on scroll
 * (Optional enhancement for future use)
 */
function animateOnScroll() {
    const elements = document.querySelectorAll('.animate-on-scroll');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    }, {
        threshold: 0.1
    });
    
    elements.forEach(el => observer.observe(el));
}

/**
 * Handle logout to clear service worker cache
 */
function initLogoutHandler() {
    const logoutLink = document.getElementById('logout-link');
    
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Clear service worker cache before logging out
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CLEAR_CACHE'
                });
                console.log('🧹 Clearing service worker cache on logout');
            }
            
            // Small delay to allow cache clearing before redirect
            setTimeout(() => {
                window.location.href = '/logout';
            }, 100);
        });
    }
}

// Export functions for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSmoothScrolling,
        initFormValidation,
        initMobileMenu,
        initDropdowns,
        initLogoutHandler,
        highlightCurrentPage,
        animateOnScroll
    };
}
