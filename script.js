/* ========================================================
   MAISON DU REGARD — Site Logic
   Animations, interactions, lightbox, map, desktop effects
   ======================================================== */

(function () {
    'use strict';

    // --- State ---
    let lightboxItems = [];
    let lightboxIndex = 0;
    var isDesktop = window.innerWidth >= 1024;

    // --- DOM Refs ---
    const preloader = document.getElementById('preloader');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxVideo = document.getElementById('lightbox-video');
    const desktopNav = document.getElementById('desktop-nav');
    const cursor = document.getElementById('cursor');
    const cursorFollower = document.getElementById('cursor-follower');

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

    setTimeout(hidePreloader, 4000);

    // ========================================
    // DESKTOP NAVBAR — scroll state
    // ========================================

    if (desktopNav) {
        // On subpages, nav is always solid (class set in HTML)
        var isHomePage = document.body.getAttribute('data-page') === 'home';
        if (isHomePage) {
            window.addEventListener('scroll', function () {
                var scrollY = window.scrollY || window.pageYOffset;
                if (scrollY > 80) {
                    desktopNav.classList.add('desktop-nav--solid');
                } else {
                    desktopNav.classList.remove('desktop-nav--solid');
                }
            }, { passive: true });
        }
    }

    // ========================================
    // CUSTOM CURSOR (desktop only)
    // ========================================

    if (isDesktop && cursor && cursorFollower) {
        var mouseX = 0, mouseY = 0;
        var followerX = 0, followerY = 0;

        document.addEventListener('mousemove', function (e) {
            mouseX = e.clientX;
            mouseY = e.clientY;
            cursor.style.left = mouseX + 'px';
            cursor.style.top = mouseY + 'px';
        });

        function animateFollower() {
            followerX += (mouseX - followerX) * 0.12;
            followerY += (mouseY - followerY) * 0.12;
            cursorFollower.style.left = followerX + 'px';
            cursorFollower.style.top = followerY + 'px';
            requestAnimationFrame(animateFollower);
        }
        animateFollower();

        // Hover effect on interactive elements
        document.querySelectorAll('a, button, [role="button"], .service-card, .review-card-home, .gallery__item, .gallery-strip__item').forEach(function (el) {
            el.addEventListener('mouseenter', function () {
                cursorFollower.classList.add('cursor-follower--hover');
            });
            el.addEventListener('mouseleave', function () {
                cursorFollower.classList.remove('cursor-follower--hover');
            });
        });
    }

    // ========================================
    // HERO SCROLL INDICATOR
    // ========================================

    var scrollIndicator = document.getElementById('scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', function () {
            var intro = document.getElementById('section-intro');
            if (intro) intro.scrollIntoView({ behavior: 'smooth' });
        });
    }

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
        function showLightboxItem(index) {
            var item = lightboxItems[index];
            if (item.type === 'video') {
                lightboxImg.style.display = 'none';
                if (lightboxVideo) {
                    lightboxVideo.src = item.src;
                    lightboxVideo.style.display = 'block';
                    lightboxVideo.play();
                }
            } else {
                if (lightboxVideo) {
                    lightboxVideo.pause();
                    lightboxVideo.style.display = 'none';
                }
                lightboxImg.style.display = '';
                lightboxImg.src = item.src;
                lightboxImg.alt = item.alt;
            }
        }

        function openLightbox(index) {
            lightboxIndex = index;
            showLightboxItem(index);
            void lightbox.offsetHeight;
            lightbox.classList.add('open');
        }

        function closeLightbox() {
            lightbox.classList.remove('open');
            if (lightboxVideo) {
                lightboxVideo.pause();
                lightboxVideo.removeAttribute('src');
                lightboxVideo.style.display = 'none';
            }
        }

        function nextLightbox() {
            lightboxIndex = (lightboxIndex + 1) % lightboxItems.length;
            showLightboxItem(lightboxIndex);
        }

        function prevLightbox() {
            lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length;
            showLightboxItem(lightboxIndex);
        }

        // Collect all lightbox items in DOM order
        document.querySelectorAll('[data-lightbox], [data-lightbox-video]').forEach(function (el) {
            var idx = lightboxItems.length;
            if (el.hasAttribute('data-lightbox-video')) {
                lightboxItems.push({ type: 'video', src: el.getAttribute('data-lightbox-video'), alt: 'Vidéo' });
            } else {
                lightboxItems.push({ type: 'image', src: el.src, alt: el.alt });
            }
            el.addEventListener('click', function () {
                openLightbox(idx);
            });
        });

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
    // GALLERY VIDEO HOVER PREVIEW
    // ========================================

    document.querySelectorAll('.gallery__item--video').forEach(function (item) {
        var video = item.querySelector('video');
        if (!video) return;
        item.addEventListener('mouseenter', function () {
            video.play();
        });
        item.addEventListener('mouseleave', function () {
            video.pause();
            video.currentTime = 0;
        });
    });

    // ========================================
    // COUNTER ANIMATIONS (scroll-triggered)
    // ========================================

    function animateCounters() {
        var counters = document.querySelectorAll('[data-count]');
        counters.forEach(function (el) {
            if (el.dataset.counted) return;
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
                    el.textContent = isFloat ? prefix + target.toFixed(1) : prefix + target;
                    el.dataset.counted = '1';
                }
            }

            requestAnimationFrame(step);
        });
    }

    // ========================================
    // SCROLL REVEAL (IntersectionObserver)
    // ========================================

    var revealElements = document.querySelectorAll('[data-reveal]');
    if (revealElements.length) {
        var revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');

                    // Trigger counters inside revealed element
                    var counters = entry.target.querySelectorAll('[data-count]');
                    if (counters.length) animateCounters();

                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -60px 0px'
        });

        revealElements.forEach(function (el) {
            revealObserver.observe(el);
        });
    }

    // Also trigger counters that are not inside [data-reveal]
    var standaloneCounters = document.querySelectorAll('[data-count]');
    if (standaloneCounters.length) {
        var counterObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    animateCounters();
                    counterObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        standaloneCounters.forEach(function (el) {
            counterObserver.observe(el);
        });
    }

    // ========================================
    // GSAP SCROLLTRIGGER ANIMATIONS
    // ========================================

    function setupGSAPAnimations() {
        if (typeof gsap === 'undefined') return;

        // Register ScrollTrigger if available
        if (typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        }

        // Basic stagger for cards on subpages
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

        // Homepage hero text stagger
        var heroLines = document.querySelectorAll('.hero__headline-line');
        if (heroLines.length) {
            gsap.fromTo(heroLines,
                { opacity: 0, y: 30 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.9,
                    stagger: 0.15,
                    ease: 'power3.out',
                    delay: 1.4
                }
            );
        }

        // ScrollTrigger parallax on desktop
        if (typeof ScrollTrigger !== 'undefined' && isDesktop) {

            // Parallax on service card images
            document.querySelectorAll('.service-card__image img').forEach(function (img) {
                gsap.to(img, {
                    y: -40,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: img.closest('.service-card'),
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: true
                    }
                });
            });

            // Parallax on CTA banner bg
            var ctaBg = document.querySelector('.cta-banner__bg img');
            if (ctaBg) {
                gsap.to(ctaBg, {
                    y: -60,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: '.cta-banner',
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: true
                    }
                });
            }

            // Gallery strip horizontal scroll on vertical scroll
            var galleryTrack = document.getElementById('gallery-track');
            if (galleryTrack) {
                gsap.to(galleryTrack, {
                    x: function () { return -(galleryTrack.scrollWidth - window.innerWidth) * 0.3; },
                    ease: 'none',
                    scrollTrigger: {
                        trigger: '.section--gallery-strip',
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: 1
                    }
                });
            }

            // Stagger reveal for review cards
            var reviewCards = document.querySelectorAll('.review-card-home');
            if (reviewCards.length) {
                gsap.fromTo(reviewCards,
                    { opacity: 0, y: 40 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.6,
                        stagger: 0.12,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: '.reviews-grid',
                            start: 'top 80%',
                            once: true
                        }
                    }
                );
            }
        }
    }

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
    // HERO VIDEO PLAYLIST
    // ========================================

    (function () {
        var photo = document.querySelector('.hero__photo');
        if (photo) photo.style.display = 'none';

        var heroVideo = document.getElementById('hero-video');
        if (!heroVideo) return;

        var playlist = [
            '/assets/video/galerie-1.mp4',
            '/assets/video/galerie-2.mp4',
            '/assets/video/celia-travail.mp4'
        ];
        var currentIndex = 0;

        heroVideo.addEventListener('ended', function () {
            // Trailer finished, start cycling through other videos
            heroVideo.src = playlist[currentIndex];
            heroVideo.play();
            currentIndex = (currentIndex + 1) % playlist.length;
        });
    })();

    // ========================================
    // MAGNETIC BUTTONS (desktop)
    // ========================================

    if (isDesktop) {
        document.querySelectorAll('.btn--cta, .desktop-nav__cta').forEach(function (btn) {
            btn.addEventListener('mousemove', function (e) {
                var rect = this.getBoundingClientRect();
                var x = e.clientX - rect.left - rect.width / 2;
                var y = e.clientY - rect.top - rect.height / 2;
                this.style.transform = 'translate(' + (x * 0.15) + 'px, ' + (y * 0.15) + 'px)';
            });
            btn.addEventListener('mouseleave', function () {
                this.style.transform = '';
            });
        });
    }

    // ========================================
    // SMOOTH SECTION SCROLL (desktop nav links)
    // ========================================

    if (isDesktop) {
        document.querySelectorAll('.desktop-nav__link').forEach(function (link) {
            link.addEventListener('mouseenter', function () {
                this.style.transition = 'color 0.3s, transform 0.3s';
            });
        });
    }

    // ========================================
    // RESIZE HANDLER
    // ========================================

    window.addEventListener('resize', function () {
        isDesktop = window.innerWidth >= 1024;
    });

})();
