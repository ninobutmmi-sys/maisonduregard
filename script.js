/* ========================================================
   MAISON DU REGARD — Site Logic
   Animations, interactions, lightbox, map
   ======================================================== */

(function () {
    'use strict';

    // --- State ---
    let lightboxImages = [];
    let lightboxIndex = 0;

    // --- DOM Refs ---
    const preloader = document.getElementById('preloader');
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
    // TABS (Prestations)
    // ========================================

    var tabButtons = document.querySelectorAll('.tabs__tab');
    var tabPanels = document.querySelectorAll('.tab-panel');
    var tabIndicator = document.querySelector('.tabs__indicator');

    if (tabButtons.length) {
        function setActiveTab(tabName) {
            tabButtons.forEach(function (btn) {
                var isActive = btn.getAttribute('data-tab') === tabName;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            tabPanels.forEach(function (panel) {
                var isActive = panel.getAttribute('data-panel') === tabName;
                panel.classList.toggle('active', isActive);

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

        setTimeout(updateTabIndicator, 100);
        window.addEventListener('resize', updateTabIndicator);
    }

    // ========================================
    // LIGHTBOX
    // ========================================

    if (lightbox && lightboxImg) {
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

        lightbox.addEventListener('click', function (e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox__content')) {
                closeLightbox();
            }
        });

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
    }

    // ========================================
    // COUNTER ANIMATIONS
    // ========================================

    function animateCounters() {
        var counters = document.querySelectorAll('[data-count]');
        counters.forEach(function (el) {
            var target = parseFloat(el.getAttribute('data-count'));
            var prefix = el.getAttribute('data-prefix') || '';
            var isFloat = target % 1 !== 0;
            var duration = 1500;
            var startTime = null;

            function step(timestamp) {
                if (!startTime) startTime = timestamp;
                var progress = Math.min((timestamp - startTime) / duration, 1);
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

    // Trigger counters on load
    setTimeout(animateCounters, 500);

    // ========================================
    // GSAP ANIMATIONS
    // ========================================

    function setupGSAPAnimations() {
        if (typeof gsap === 'undefined') return;

        var cards = document.querySelectorAll('.presta-card, .review-card, .gallery__item, .cabinet__photo, .contact-card, .contact-section');

        if (cards.length) {
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
        }

        var galleryImgs = document.querySelectorAll('.about__gallery img');
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

    // Trigger GSAP on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupGSAPAnimations);
    } else {
        setTimeout(setupGSAPAnimations, 100);
    }

    // ========================================
    // TOUCH FEEDBACK
    // ========================================

    document.querySelectorAll('.bottom-nav__item, .btn').forEach(function (el) {
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
    // LEAFLET MAP
    // ========================================

    var leafletLoaded = false;
    var mapEl = document.getElementById('contact-map');

    if (mapEl) {
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
            if (typeof L === 'undefined') {
                loadLeaflet(initContactMap);
                return;
            }
            if (mapEl._leaflet_id) return;

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

            setTimeout(function () { map.invalidateSize(); }, 600);
        }

        // Init map on load
        setTimeout(initContactMap, 300);
    }

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
                window.location.href = '/mentions-legales/';
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
        var day = now.getDay();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var currentTime = hours * 60 + minutes;

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
    // VIDEO HANDLING
    // ========================================

    (function () {
        var photo = document.querySelector('.hero__photo');
        if (photo) photo.style.display = 'none';
    })();

})();
