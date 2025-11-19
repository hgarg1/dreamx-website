/**
 * Dream X - Feed Advanced Animations & Interactions
 * Premium micro-interactions and visual effects
 */

(function() {
    'use strict';

    // ===================================
    // PARALLAX SCROLLING EFFECT
    // ===================================
    function initParallax() {
        const sidebars = document.querySelectorAll('.feed-sidebar');
        let ticking = false;
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrolled = window.pageYOffset;
                    sidebars.forEach(sidebar => {
                        const speed = 0.5;
                        const yPos = -(scrolled * speed);
                        sidebar.style.transform = `translateY(${yPos}px)`;
                    });
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ===================================
    // STAGGERED FADE-IN ANIMATION
    // ===================================
    function initStaggeredAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.post-card').forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
            observer.observe(card);
        });
    }

    // ===================================
    // ENHANCED HOVER EFFECTS
    // ===================================
    function initHoverEffects() {
        // Disabled 3D hover; keep cards static for accessibility & subtle UX.
        const cards = document.querySelectorAll('.post-card, .trending-post-card, .creator-card');
        cards.forEach(card => {
            card.addEventListener('mousemove', function() { /* no-op */ });
            card.addEventListener('mouseenter', function() { /* no-op */ });
            card.addEventListener('mouseleave', function() { this.style.transform = ''; });
        });
    }

    // ===================================
    // REACTION BUTTON ANIMATIONS
    // ===================================
    function initReactionAnimations() {
        document.querySelectorAll('.rx-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                // Ripple effect
                const ripple = document.createElement('span');
                ripple.style.cssText = `
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    border-radius: 50px;
                    background: radial-gradient(circle, rgba(255,79,163,0.4) 0%, transparent 70%);
                    transform: scale(0);
                    animation: ripple 0.6s ease-out;
                    pointer-events: none;
                `;
                
                this.style.position = 'relative';
                this.appendChild(ripple);
                
                setTimeout(() => ripple.remove(), 600);
                
                // Emoji bounce
                const emoji = this.querySelector('span:first-child');
                emoji.style.animation = 'none';
                setTimeout(() => {
                    emoji.style.animation = 'emojiPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
                }, 10);
            });
        });

        // Add keyframes for animations
        if (!document.getElementById('feed-animations-keyframes')) {
            const style = document.createElement('style');
            style.id = 'feed-animations-keyframes';
            style.textContent = `
                @keyframes ripple {
                    to {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
                @keyframes emojiPop {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.5) rotate(15deg); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ===================================
    // SMOOTH SCROLL FOR NAVIGATION
    // ===================================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // ===================================
    // IMAGE LAZY LOADING WITH BLUR EFFECT
    // ===================================
    function initLazyLoading() {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    
                    // Add blur-up effect
                    img.style.filter = 'blur(10px)';
                    img.style.transition = 'filter 0.5s ease';
                    
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                    }
                    
                    img.onload = () => {
                        img.style.filter = 'blur(0)';
                    };
                    
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px'
        });

        document.querySelectorAll('img[loading="lazy"]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // ===================================
    // FLOATING ANIMATION FOR AVATARS
    // ===================================
    function initFloatingAvatars() {
        const avatars = document.querySelectorAll('.avatar, .reel-bubble-avatar');
        
        avatars.forEach((avatar, index) => {
            avatar.style.animation = `float 3s ease-in-out ${index * 0.2}s infinite`;
        });
    }

    // ===================================
    // CONFETTI EFFECT ON REACTIONS
    // ===================================
    function createConfetti(x, y) {
        const colors = ['#ff4fa3', '#764ba2', '#667eea', '#f093fb'];
        const confettiCount = 15;
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            const size = Math.random() * 6 + 4;
            
            confetti.style.cssText = `
                position: fixed;
                width: ${size}px;
                height: ${size}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                left: ${x}px;
                top: ${y}px;
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999;
                animation: confettiFall ${Math.random() * 2 + 1}s ease-out forwards;
            `;
            
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 3000);
        }
        
        // Add confetti animation if not exists
        if (!document.getElementById('confetti-animation')) {
            const style = document.createElement('style');
            style.id = 'confetti-animation';
            style.textContent = `
                @keyframes confettiFall {
                    to {
                        transform: translateY(100vh) translateX(${Math.random() * 200 - 100}px) rotate(${Math.random() * 360}deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ===================================
    // ENHANCED COMMENT TOGGLE - Removed (handled in post-card.ejs)
    // ===================================
    
    // ===================================
    // TYPING INDICATOR
    // ===================================
    function initTypingIndicator() {
        document.querySelectorAll('.comment-input').forEach(input => {
            let typingTimer;
            
            input.addEventListener('input', function() {
                clearTimeout(typingTimer);
                
                // Show typing indicator
                const indicator = this.parentElement.querySelector('.typing-indicator');
                if (indicator) {
                    indicator.style.display = 'flex';
                }
                
                // Hide after 1 second of no typing
                typingTimer = setTimeout(() => {
                    if (indicator) {
                        indicator.style.display = 'none';
                    }
                }, 1000);
            });
        });
    }

    // ===================================
    // PARTICLE BACKGROUND EFFECT
    // ===================================
    function initParticleBackground() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            opacity: 0.3;
        `;
        document.body.prepend(canvas);
        
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const particles = [];
        const particleCount = 50;
        
        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 3 + 1;
                this.speedX = Math.random() * 0.5 - 0.25;
                this.speedY = Math.random() * 0.5 - 0.25;
                this.opacity = Math.random() * 0.5 + 0.2;
            }
            
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                
                if (this.x > canvas.width) this.x = 0;
                if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                if (this.y < 0) this.y = canvas.height;
            }
            
            draw() {
                ctx.fillStyle = `rgba(255, 79, 163, ${this.opacity})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
        
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(particle => {
                particle.update();
                particle.draw();
            });
            requestAnimationFrame(animate);
        }
        
        animate();
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    }

    // ===================================
    // INITIALIZE ALL FEATURES
    // ===================================
    function init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        const isMobile = window.innerWidth <= 768;
        
        // Always initialize essential features
        initStaggeredAnimations();
        initHoverEffects();
        initReactionAnimations();
        initSmoothScroll();
        initLazyLoading();
        
        // Desktop-only heavy animations
        if (!isMobile) {
            initFloatingAvatars();
            initTypingIndicator();
            initParallax();
            
            // Only on large screens
            if (window.innerWidth > 1024) {
                initParticleBackground();
            }
            
            // Add confetti on celebrate reaction (desktop only)
            document.addEventListener('click', (e) => {
                if (e.target.closest('.rx-btn[data-type="celebrate"]')) {
                    const btn = e.target.closest('.rx-btn');
                    const rect = btn.getBoundingClientRect();
                    createConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            });
        }

        console.log(isMobile ? '📱 Dream X Feed (mobile mode)' : '✨ Dream X Feed animations initialized!');
    }

    // Auto-initialize
    init();
})();
