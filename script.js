/* ========================================================
   MAISON DU REGARD — App Logic
   Page navigation, animations, interactions
   ======================================================== */

(function () {
    'use strict';

    // --- State ---
    let currentPage = 'page-home';
    let pageHistory = ['page-home'];
    let lightboxImages = [];
    let lightboxIndex = 0;

    // --- DOM Refs ---
    const app = document.getElementById('app');
    const preloader = document.getElementById('preloader');
    const pages = document.querySelectorAll('.page');
    const bottomNavItems = document.querySelectorAll('.bottom-nav__item[data-target]');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');

    // ========================================
    // PRELOADER
    // ========================================

    function hidePreloader() {
        if (!preloader) return;
        preloader.classList.add('hidden');
        setTimeout(function () {
            preloader.style.display = 'none';
        }, 800);
    }

    window.addEventListener('load', function () {
        setTimeout(hidePreloader, 1200);
    });

    // Fallback: hide preloader after 4s max
    setTimeout(hidePreloader, 4000);

    // ========================================
    // PAGE NAVIGATION
    // ========================================

    function navigateTo(pageId) {
        if (pageId === currentPage) return;

        var targetPage = document.getElementById(pageId);
        if (!targetPage) return;

        // Deactivate current sub-pages (but not home)
        pages.forEach(function (p) {
            if (p.id !== 'page-home' && p.id !== pageId) {
                p.classList.remove('active');
                // Delay visibility hidden until transition ends
                setTimeout(function () {
                    if (!p.classList.contains('active')) {
                        p.style.visibility = 'hidden';
                    }
                }, 600);
            }
        });

        // Activate target page
        targetPage.style.visibility = 'visible';
        // Force reflow before adding class for transition
        void targetPage.offsetHeight;
        targetPage.classList.add('active');
        targetPage.scrollTop = 0;

        // Update history
        if (pageId !== 'page-home') {
            pageHistory.push(pageId);
        } else {
            pageHistory = ['page-home'];
        }

        currentPage = pageId;
        updateBottomNav();
        animatePageContent(pageId);
    }

    function goBack() {
        if (pageHistory.length <= 1) {
            navigateTo('page-home');
            return;
        }

        var currentId = pageHistory.pop();
        var closingPage = document.getElementById(currentId);
        if (closingPage) {
            closingPage.classList.remove('active');
            setTimeout(function () {
                if (!closingPage.classList.contains('active')) {
                    closingPage.style.visibility = 'hidden';
                }
            }, 600);
        }

        currentPage = pageHistory[pageHistory.length - 1] || 'page-home';

        // Restore previous page visibility
        var prevPage = document.getElementById(currentPage);
        if (prevPage && prevPage.id !== 'page-home') {
            prevPage.style.visibility = 'visible';
            prevPage.classList.add('active');
        }

        updateBottomNav();
    }

    function updateBottomNav() {
        bottomNavItems.forEach(function (item) {
            var target = item.getAttribute('data-target');
            if (target === currentPage) {
                item.classList.add('active');
            } else if (currentPage === 'page-home' && target === 'page-home') {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // --- Event Listeners: Navigation ---

    // Bottom nav buttons
    bottomNavItems.forEach(function (item) {
        item.addEventListener('click', function () {
            navigateTo(this.getAttribute('data-target'));
        });
    });

    // Back buttons
    document.querySelectorAll('.page__back').forEach(function (btn) {
        btn.addEventListener('click', goBack);
    });

    // In-page navigation buttons (e.g., "Découvrir mes prestations")
    document.querySelectorAll('.page-scroll-btn[data-target]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            navigateTo(this.getAttribute('data-target'));
        });
    });

    // ========================================
    // TABS (Prestations)
    // ========================================

    var tabButtons = document.querySelectorAll('.tabs__tab');
    var tabPanels = document.querySelectorAll('.tab-panel');
    var tabIndicator = document.querySelector('.tabs__indicator');

    function setActiveTab(tabName) {
        tabButtons.forEach(function (btn) {
            var isActive = btn.getAttribute('data-tab') === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        tabPanels.forEach(function (panel) {
            var isActive = panel.getAttribute('data-panel') === tabName;
            panel.classList.toggle('active', isActive);

            // Re-trigger card animations
            if (isActive) {
                var cards = panel.querySelectorAll('.presta-card');
                cards.forEach(function (card) {
                    card.style.opacity = '0';
                    void card.offsetHeight;
                    card.style.opacity = '';
                });
            }
        });

        updateTabIndicator();
    }

    function updateTabIndicator() {
        if (!tabIndicator) return;
        var activeTab = document.querySelector('.tabs__tab.active');
        if (!activeTab) return;

        var tabsContainer = activeTab.parentElement;
        var containerRect = tabsContainer.getBoundingClientRect();
        var tabRect = activeTab.getBoundingClientRect();

        tabIndicator.style.left = (tabRect.left - containerRect.left) + 'px';
        tabIndicator.style.width = tabRect.width + 'px';
    }

    tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            setActiveTab(this.getAttribute('data-tab'));
        });
    });

    // Initial indicator position
    setTimeout(updateTabIndicator, 100);
    window.addEventListener('resize', updateTabIndicator);

    // ========================================
    // LIGHTBOX
    // ========================================

    function openLightbox(index) {
        lightboxIndex = index;
        lightboxImg.src = lightboxImages[index].src;
        lightboxImg.alt = lightboxImages[index].alt;
        void lightbox.offsetHeight;
        lightbox.classList.add('open');
    }

    function closeLightbox() {
        lightbox.classList.remove('open');
    }

    function nextLightbox() {
        lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
        lightboxImg.src = lightboxImages[lightboxIndex].src;
        lightboxImg.alt = lightboxImages[lightboxIndex].alt;
    }

    function prevLightbox() {
        lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
        lightboxImg.src = lightboxImages[lightboxIndex].src;
        lightboxImg.alt = lightboxImages[lightboxIndex].alt;
    }

    // Collect lightbox images
    document.querySelectorAll('[data-lightbox]').forEach(function (img, i) {
        lightboxImages.push({ src: img.src, alt: img.alt });
        img.addEventListener('click', function () {
            openLightbox(i);
        });
    });

    // Lightbox controls
    var closeBtn = document.querySelector('.lightbox__close');
    var prevBtn = document.querySelector('.lightbox__nav--prev');
    var nextBtn = document.querySelector('.lightbox__nav--next');

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', prevLightbox);
    if (nextBtn) nextBtn.addEventListener('click', nextLightbox);

    // Close on backdrop click
    if (lightbox) {
        lightbox.addEventListener('click', function (e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox__content')) {
                closeLightbox();
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
        if (!lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') nextLightbox();
        if (e.key === 'ArrowLeft') prevLightbox();
    });

    // Swipe for lightbox
    (function () {
        var startX = 0;
        var lightboxContent = document.querySelector('.lightbox__content');
        if (!lightboxContent) return;

        lightboxContent.addEventListener('touchstart', function (e) {
            startX = e.touches[0].clientX;
        }, { passive: true });

        lightboxContent.addEventListener('touchend', function (e) {
            var diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) nextLightbox();
                else prevLightbox();
            }
        }, { passive: true });
    })();

    // ========================================
    // COUNTER ANIMATIONS
    // ========================================

    function animateCounters(container) {
        var counters = container.querySelectorAll('[data-count]');
        counters.forEach(function (el) {
            var target = parseFloat(el.getAttribute('data-count'));
            var prefix = el.getAttribute('data-prefix') || '';
            var isFloat = target % 1 !== 0;
            var duration = 1500;
            var startTime = null;

            function step(timestamp) {
                if (!startTime) startTime = timestamp;
                var progress = Math.min((timestamp - startTime) / duration, 1);
                // Ease out quad
                var eased = 1 - (1 - progress) * (1 - progress);
                var current = eased * target;

                if (isFloat) {
                    el.textContent = prefix + current.toFixed(1);
                } else {
                    el.textContent = prefix + Math.floor(current);
                }

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    if (isFloat) {
                        el.textContent = prefix + target.toFixed(1);
                    } else {
                        el.textContent = prefix + target;
                    }
                }
            }

            requestAnimationFrame(step);
        });
    }

    // ========================================
    // PAGE CONTENT ANIMATIONS
    // ========================================

    function animatePageContent(pageId) {
        var page = document.getElementById(pageId);
        if (!page) return;

        if (pageId === 'page-salon') {
            setTimeout(function () { animateCounters(page); }, 500);
        }

        if (pageId === 'page-avis') {
            setTimeout(function () { animateCounters(page); }, 400);
        }

        if (pageId === 'page-salon') {
            setTimeout(initContactMap, 300);
        }


        if (typeof gsap !== 'undefined') {
            setupGSAPAnimations(page);
        }
    }

    function setupGSAPAnimations(page) {
        // Don't set up ScrollTrigger animations since pages use overflow scroll
        // Instead, use simple entrance animations

        var cards = page.querySelectorAll('.presta-card, .review-card, .gallery__item, .cabinet__photo, .contact-card, .contact-section');

        gsap.fromTo(cards,
            { opacity: 0, y: 20 },
            {
                opacity: 1,
                y: 0,
                duration: 0.5,
                stagger: 0.06,
                ease: 'power2.out',
                delay: 0.3
            }
        );

        // About gallery images
        var galleryImgs = page.querySelectorAll('.about__gallery img');
        if (galleryImgs.length) {
            gsap.fromTo(galleryImgs,
                { opacity: 0, scale: 0.92 },
                {
                    opacity: 1,
                    scale: 1,
                    duration: 0.6,
                    stagger: 0.1,
                    ease: 'power2.out',
                    delay: 0.5
                }
            );
        }
    }

    // ========================================
    // VIDEO HANDLING
    // ========================================

    // Video plays everywhere — vertical format works great on mobile
    (function () {
        var photo = document.querySelector('.hero__photo');
        if (photo) photo.style.display = 'none';
    })();

    // ========================================
    // TOUCH FEEDBACK
    // ========================================

    // Add ripple-like haptic feedback on touch
    document.querySelectorAll('.home-nav__btn, .bottom-nav__item, .btn').forEach(function (el) {
        el.addEventListener('touchstart', function () {
            this.style.transform = 'scale(0.96)';
        }, { passive: true });
        el.addEventListener('touchend', function () {
            this.style.transform = '';
        }, { passive: true });
    });

    // ========================================
    // PRESTA CARD TOGGLE (expand/collapse)
    // ========================================

    document.querySelectorAll('.presta-card__toggle').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var card = this.closest('.presta-card');
            card.classList.toggle('open');
        });
    });

    // Also toggle on card click + keyboard
    document.querySelectorAll('.presta-card').forEach(function (card) {
        card.style.cursor = 'pointer';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('click', function () {
            this.classList.toggle('open');
        });
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.classList.toggle('open');
            }
        });
    });

    // ========================================
    // LEAFLET MAP (Contact page)
    // ========================================

    var leafletLoaded = false;

    function loadLeaflet(callback) {
        if (leafletLoaded) { callback(); return; }
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        var script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = function () { leafletLoaded = true; callback(); };
        document.head.appendChild(script);
    }

    function initContactMap() {
        var mapEl = document.getElementById('contact-map');
        if (!mapEl) return;
        if (typeof L === 'undefined') {
            loadLeaflet(initContactMap);
            return;
        }
        if (mapEl._leaflet_id) return; // already init

        var lat = 45.2109;
        var lng = 5.7633;

        var map = L.map('contact-map', {
            center: [lat, lng],
            zoom: 16,
            zoomControl: false,
            scrollWheelZoom: false,
            attributionControl: false
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            className: 'dark-tiles'
        }).addTo(map);

        var goldIcon = L.divIcon({
            className: 'gold-marker',
            html: '<div class="marker-pin"></div><div class="marker-pulse"></div>',
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -36]
        });

        L.marker([lat, lng], { icon: goldIcon })
            .addTo(map)
            .bindPopup(
                '<div class="map-popup__title">Maison du Regard</div>' +
                '<div class="map-popup__addr">26 Av. du Gr\u00e9sivaudan<br>38700 Corenc</div>'
            );

        // Fix map size when page becomes visible
        setTimeout(function () { map.invalidateSize(); }, 600);
    }

    // Map init is now handled in animatePageContent

    // ========================================
    // COOKIE BANNER
    // ========================================

    (function () {
        var banner = document.getElementById('cookie-banner');
        var acceptBtn = document.getElementById('cookie-accept');
        var legalBtn = document.getElementById('cookie-legal');
        if (!banner) return;

        if (localStorage.getItem('cookies-accepted')) {
            banner.classList.add('hidden');
            return;
        }

        if (acceptBtn) {
            acceptBtn.addEventListener('click', function () {
                localStorage.setItem('cookies-accepted', '1');
                banner.classList.add('hidden');
            });
        }

        if (legalBtn) {
            legalBtn.addEventListener('click', function () {
                navigateTo('page-legal');
                banner.classList.add('hidden');
            });
        }
    })();

    // ========================================
    // DYNAMIC OPEN/CLOSED STATUS
    // ========================================

    function updateOpenStatus() {
        var dot = document.getElementById('hours-dot');
        var label = document.getElementById('hours-label');
        if (!dot || !label) return;

        var now = new Date();
        var day = now.getDay(); // 0=Sunday
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var currentTime = hours * 60 + minutes;

        // Mardi-Samedi (2-6): 09h-19h. Dimanche (0) et Lundi (1): Fermé
        var isOpen = day >= 2 && day <= 6 && currentTime >= 540 && currentTime < 1140;

        if (isOpen) {
            dot.style.background = '#4ade80';
            label.textContent = 'Ouvert';
        } else {
            dot.style.background = '#f87171';
            dot.style.animation = 'none';
            label.textContent = 'Ferm\u00e9';
        }
    }

    updateOpenStatus();
    setInterval(updateOpenStatus, 60000);

    // ========================================
    // INIT
    // ========================================

    // Set initial tab indicator
    setTimeout(updateTabIndicator, 200);

    // Mark home as initial active
    updateBottomNav();

    // Expose navigateTo globally (for onclick handlers in HTML)
    window.navigateTo = navigateTo;

})();
