/* ============================================
   HAVØRRED LOGBOG — Interactions & Animations
   ============================================ */

// ===== LANGUAGE SWITCHER =====
(function initLang() {
  const saved = localStorage.getItem('hl-lang') || 'da';
  setLanguage(saved);

  const btn = document.getElementById('langToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-lang');
      const next = current === 'da' ? 'en' : 'da';
      setLanguage(next);
      localStorage.setItem('hl-lang', next);
    });
  }

  function setLanguage(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);

    // Update toggle button
    const flag = document.getElementById('langFlag');
    const label = document.getElementById('langLabel');
    if (flag) flag.textContent = lang === 'da' ? '🇩🇰' : '🇬🇧';
    if (label) label.textContent = lang.toUpperCase();

    // Update all [data-da] / [data-en] elements
    document.querySelectorAll('[data-da][data-en]').forEach(el => {
      el.innerHTML = el.getAttribute('data-' + lang);
    });

    // Show/hide lang-content blocks
    document.querySelectorAll('[data-show-lang]').forEach(el => {
      el.style.display = el.getAttribute('data-show-lang') === lang ? '' : 'none';
    });
  }
})();


// ===== PARTICLE BACKGROUND =====
(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouse = { x: null, y: null };
  let raf;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 1.8 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      this.alpha = Math.random() * 0.4 + 0.1;
      this.isAccent = Math.random() > 0.75;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (mouse.x !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          const force = (100 - dist) / 100;
          this.x -= dx * force * 0.008;
          this.y -= dy * force * 0.008;
        }
      }

      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.isAccent ? '#F59E0B' : '#A0A0A8';
      ctx.globalAlpha = this.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = '#F59E0B';
          ctx.globalAlpha = (90 - dist) / 90 * 0.06;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    drawLines();
    raf = requestAnimationFrame(animate);
  }

  function init() {
    resize();
    particles = [];
    const count = Math.min(50, Math.floor(canvas.width * canvas.height / 20000));
    for (let i = 0; i < count; i++) particles.push(new Particle());
    if (raf) cancelAnimationFrame(raf);
    animate();
  }

  window.addEventListener('resize', init);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseleave', () => { mouse.x = null; mouse.y = null; });
  init();
})();


// ===== SCROLL REVEAL =====
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => observer.observe(el));
})();


// ===== COUNTER ANIMATION =====
(function initCounters() {
  const counters = document.querySelectorAll('.counter');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.target);
      const isFloat = target % 1 !== 0;
      const duration = 2200;
      const start = performance.now();

      function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const val = eased * target;
        el.textContent = isFloat ? val.toFixed(1) : Math.floor(val).toLocaleString('da-DK');
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(el => observer.observe(el));
})();


// ===== NAVBAR =====
(function initNav() {
  const nav = document.getElementById('nav');
  if (!nav || nav.classList.contains('scrolled')) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  });
})();


// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});


// ===== CARD TILT =====
(function initTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.bento-card, .step-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `translateY(-4px) perspective(800px) rotateX(${y * -4}deg) rotateY(${x * 4}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
})();


// ===== MAGNETIC BUTTONS =====
(function initMagnetic() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.store-btn, .nav-cta').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translateY(-3px) translate(${x * 0.08}px, ${y * 0.08}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();


// ===== SCREENSHOT SLIDER =====
(function initSlider() {
  const track = document.querySelector('.slider-track');
  const slides = document.querySelectorAll('.slider-slide');
  const dotsContainer = document.querySelector('.slider-dots');
  const arrowLeft = document.querySelector('.slider-arrow-left');
  const arrowRight = document.querySelector('.slider-arrow-right');
  const viewport = document.querySelector('.slider-viewport');

  if (!track || slides.length === 0) return;

  let current = 0;
  let autoplayInterval;
  const totalSlides = slides.length;

  // Create dots
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Screenshot ' + (i + 1));
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.slider-dot');

  function getSlideWidth() {
    if (!slides[0]) return 264;
    const style = window.getComputedStyle(track);
    const gap = parseInt(style.gap) || 24;
    return slides[0].offsetWidth + gap;
  }

  function updateClasses() {
    slides.forEach((slide, i) => {
      slide.classList.remove('active', 'adjacent');
      if (i === current) {
        slide.classList.add('active');
      } else if (i === current - 1 || i === current + 1) {
        slide.classList.add('adjacent');
      }
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });
  }

  function goTo(index) {
    current = Math.max(0, Math.min(index, totalSlides - 1));
    const slideWidth = getSlideWidth();
    const viewportWidth = viewport.offsetWidth;
    const offset = current * slideWidth - (viewportWidth / 2) + (slides[0].offsetWidth / 2);
    const maxOffset = track.scrollWidth - viewportWidth;
    track.style.transform = 'translateX(' + (-Math.max(0, Math.min(offset, maxOffset))) + 'px)';
    updateClasses();
    resetAutoplay();
  }

  function next() { goTo(current >= totalSlides - 1 ? 0 : current + 1); }
  function prev() { goTo(current <= 0 ? totalSlides - 1 : current - 1); }

  // Arrow buttons
  if (arrowLeft) arrowLeft.addEventListener('click', prev);
  if (arrowRight) arrowRight.addEventListener('click', next);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const rect = viewport.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inView) return;
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });

  // Touch/swipe support
  let startX = 0;
  let isDragging = false;

  viewport.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  }, { passive: true });

  // Mouse drag support
  let mouseStartX = 0;
  let isMouseDrag = false;

  viewport.addEventListener('mousedown', (e) => {
    mouseStartX = e.clientX;
    isMouseDrag = true;
    viewport.classList.add('grabbing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDrag) return;
  });

  window.addEventListener('mouseup', (e) => {
    if (!isMouseDrag) return;
    isMouseDrag = false;
    viewport.classList.remove('grabbing');
    const diff = mouseStartX - e.clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  });

  // Autoplay
  function startAutoplay() {
    autoplayInterval = setInterval(next, 4000);
  }

  function resetAutoplay() {
    clearInterval(autoplayInterval);
    startAutoplay();
  }

  // Pause on hover
  viewport.addEventListener('mouseenter', () => clearInterval(autoplayInterval));
  viewport.addEventListener('mouseleave', startAutoplay);

  // Init
  updateClasses();
  goTo(0);
  startAutoplay();
})();
