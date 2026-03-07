/**
 * FlowCredit | Revenue-Based Lending
 * Architect-grade Production Script
 *
 * DESIGN PRINCIPLES:
 * - Module-based architecture with cached DOM references.
 * - Unified event delegation (one click, one keydown listener).
 * - Performance optimized: cached layout metrics, rAF ticking.
 * - Zero JS timing: CSS-driven UI lifecycle.
 * - Memory leak prevention: No duplicated global listeners.
 */
(function () {
  'use strict';

  // --- Internal State & Registry ---
  const state = {
    isAnimationsDisabled: false,
    activeSection: null,
    navOffsets: new Map(), // sectionId -> { top, height }
    isScrolling: false,
    isInitialized: false
  };

  const modules = {};

  // --- Utilities ---
  const rAF = (fn) => window.requestAnimationFrame(fn);

  // --- Preferences Module ---
  modules.Preferences = {
    keys: {
      theme: 'flow_theme',
      animations: 'flow_animations',
      bg: 'flow_bg'
    },

    init() {
      this.apply();
    },

    apply() {
      const theme = localStorage.getItem(this.keys.theme) || 'dark';
      const animations = localStorage.getItem(this.keys.animations);
      const bg = localStorage.getItem(this.keys.bg);

      document.documentElement.setAttribute('data-theme', theme);
      this.updateIcon(theme);

      if (animations === 'disabled') {
        document.documentElement.classList.add('animations-disabled');
        state.isAnimationsDisabled = true;
      }

      if (bg === 'disabled') {
        document.documentElement.classList.add('bg-disabled');
      }
    },

    toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';

      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(this.keys.theme, next);
      this.updateIcon(next);
      this.animateToggle();
    },

    updateIcon(theme) {
      const btn = document.getElementById('themeToggle');
      if (btn) {
        btn.textContent = theme === 'dark' ? '🌙' : '☀️';
      }
    },

    animateToggle() {
      const btn = document.getElementById('themeToggle');
      if (btn) {
        btn.classList.add('rotate-icon');
        setTimeout(() => {
          btn.classList.remove('rotate-icon');
        }, 400);
      }
    },

    toggleAnimations() {
      state.isAnimationsDisabled = document.documentElement.classList.toggle('animations-disabled');
      localStorage.setItem(this.keys.animations, state.isAnimationsDisabled ? 'disabled' : 'enabled');
    },

    toggleBg() {
      const isBgDisabled = document.documentElement.classList.toggle('bg-disabled');
      localStorage.setItem(this.keys.bg, isBgDisabled ? 'disabled' : 'enabled');
    },

    reset() {
      document.documentElement.removeAttribute('data-theme');
      state.isAnimationsDisabled = false;
      localStorage.removeItem(this.keys.theme);
      localStorage.removeItem(this.keys.animations);
      localStorage.removeItem(this.keys.bg);
    }
  };

  // --- Toast Module ---
  modules.Toast = {
    container: null,

    init() {
      this.container = document.getElementById('toastContainer');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        document.body.appendChild(this.container);
      }

      // Single listener for all toast lifecycle ends
      this.container.addEventListener('animationend', (e) => {
        const toast = e.target;

        if (toast.classList.contains('toast-show')) {
          toast.classList.remove('toast-show');
          toast.classList.add('toast-exit');
          return;
        }

        if (toast.classList.contains('toast-exit')) {
          toast.remove();
        }
      });
    },

    show(message, type = 'info') {
      if (!this.container) this.init();

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;

      this.container.appendChild(toast);

      rAF(() => {
        toast.classList.add('toast-show');
      });
    }
  };

  // --- Navigation Module ---
  modules.Navigation = {
    links: [],
    sections: [],
    navbarHeight: 72,

    init() {
      this.links = Array.from(document.querySelectorAll('[data-section]'));
      this.sections = this.links.reduce((acc, link) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          const el = document.getElementById(href.substring(1));
          if (el) acc.push(el);
        }
        return acc;
      }, []);

      this.cacheMetrics();
      this.initScrollTracking();
    },

    cacheMetrics() {
      state.navOffsets.clear();
      this.sections.forEach(section => {
        state.navOffsets.set(section.id, {
          top: section.offsetTop,
          height: section.offsetHeight
        });
      });
    },

    initScrollTracking() {
      window.addEventListener('scroll', () => {
        if (!state.isScrolling) {
          rAF(() => {
            this.updateActive();
            state.isScrolling = false;
          });
          state.isScrolling = true;
        }
      }, { passive: true });
    },

    updateActive() {
      const scrollY = window.scrollY + this.navbarHeight + 15;
      let currentId = null;

      // Use cached Map for O(1) retrieval per section iteration
      for (const [id, metrics] of state.navOffsets) {
        if (scrollY >= metrics.top && scrollY < metrics.top + metrics.height) {
          currentId = id;
          break;
        }
      }

      if (currentId !== state.activeSection) {
        state.activeSection = currentId;
        this.links.forEach(link => {
          const target = link.getAttribute('href').substring(1);
          link.classList.toggle('active', target === currentId);
        });
      }
    },

    scrollTo(id) {
      // Re-cache metrics in case DOM has shifted (e.g. after cards loaded)
      this.cacheMetrics();
      const metrics = state.navOffsets.get(id);
      if (!metrics) {
        // Fallback: direct getElementById scroll
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: state.isAnimationsDisabled ? 'auto' : 'smooth', block: 'start' });
        }
        return;
      }

      window.scrollTo({
        top: Math.max(0, metrics.top - this.navbarHeight),
        behavior: state.isAnimationsDisabled ? 'auto' : 'smooth'
      });
    }
  };

  // --- Stats Module ---
  modules.Stats = {
    animated: new WeakSet(),

    init() {
      const elements = Array.from(document.querySelectorAll('.stat-value'));
      if (!elements.length) return;

      // Trigger counter only when stat section is visible
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const statCards = entry.target.querySelectorAll('.stat-value');
            statCards.forEach(el => {
              if (!this.animated.has(el)) {
                this.animated.add(el);
                this.animate(el);
              }
            });
          }
        });
      }, { threshold: 0.3 });

      const statsSection = document.getElementById('stats') || document.getElementById('dashboard');
      if (statsSection) observer.observe(statsSection);
    },

    animate(el) {
      const originalText = el.textContent;
      let numericPart = '';
      let prefix = '';
      let suffix = '';
      let charFound = false;
      let precision = 0;
      let isDecimal = false;

      // Rule: No Regex. Manual character iteration.
      for (let i = 0; i < originalText.length; i++) {
        const c = originalText[i];
        if ((c >= '0' && c <= '9') || c === '.') {
          charFound = true;
          numericPart += c;
          if (c === '.') isDecimal = true;
          else if (isDecimal) precision++;
        } else if (c === ',') {
          // Manual comma removal
        } else {
          if (!charFound) prefix += c;
          else suffix += c;
        }
      }

      const val = parseFloat(numericPart) || 0;
      if (val === 0 || state.isAnimationsDisabled) {
        el.textContent = originalText;
        return;
      }

      let start = null;
      const duration = 1600;

      const step = (now) => {
        if (!start) start = now;
        const progress = Math.min((now - start) / duration, 1);
        // Ease-out quad
        const eased = 1 - (1 - progress) * (1 - progress);
        const current = val * eased;

        // Build numeric string manually (toFixed for precision)
        el.textContent = `${prefix}${current.toFixed(precision)}${suffix}`;

        if (progress < 1) {
          rAF(step);
        } else {
          // Restore EXACT original text
          el.textContent = originalText;
        }
      };

      rAF(step);
    },

    /**
     * Update dashboard stat cards after fetching live data from contract.
     * @param {object} data - { activeLoans, totalFunded, totalRepaid, yourPosition }
     */
    updateDashboard(data) {
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      set('activeLoansApp', data.activeLoans !== undefined ? String(data.activeLoans) : '—');
      set('totalFundedApp', data.totalFunded !== undefined ? data.totalFunded : '—');
      set('totalRepaidApp', data.totalRepaid !== undefined ? data.totalRepaid : '—');
      set('yourPositionApp', data.yourPosition !== undefined ? data.yourPosition : '$0');
    }
  };

  // --- Loan Marketplace Module ---
  modules.LoanSystem = {
    container: null,
    // Stores current loans: [{ id, borrower, principal, revenueSharePercent, repaymentCapPercent, totalRepaid, funded, active, duration }]
    loans: [],
    localLoans: [], // To fallback/store locally created loans

    init() {
      // Prefer the specific ID; fall back to class selector
      this.container = document.getElementById('loanContainer') || document.querySelector('.loan-container');
      if (!this.container) return;
      // Attempt to load live loans from chain on init
      this.load(false);
    },

    /**
     * Load loans from the smart contract and re-render.
     * Falls back to static placeholder data if contract is unavailable.
     * @param {boolean} notify - Show toast on completion
     */
    async load(notify = false) {
      if (!this.container) return;

      try {
        if (window.contractReady) await window.contractReady;

        const contract = window.contract;
        if (!contract) throw new Error("Contract not initialized");

        const countBig = await contract.loanCount();
        const count = Number(countBig);
        console.log("Loan count:", count);

        this.loans = [];
        for (let i = 0; i < count; i++) {
          try {
            const loan = await window.getLoan(i);

            // Only display active unfunded loans
            if (loan.active && !loan.funded) {
              this.loans.push({
                id: loan.id,
                borrower: loan.borrower,
                principal: loan.principal,
                revenueSharePercent: loan.revenueSharePercent,
                duration: loan.duration,
                funded: loan.funded,
                active: loan.active
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch loan ${i}:`, err);
          }
        }

        // Dashboard stats update
        const allLoans = [...this.loans, ...this.localLoans];
        modules.Stats.updateDashboard({
          activeLoans: allLoans.length
        });

        this.render(allLoans, notify);

      } catch (err) {
        console.warn('Could not load loans from chain:', err.message || err);
        const allLoans = [...this.loans, ...this.localLoans];
        modules.Stats.updateDashboard({
          activeLoans: allLoans.length
        });
        this.render(allLoans, notify);
      }
    },

    /**
     * Render loan cards from live contract data.
     */
    render(loans, notify = false) {
      this.container.innerHTML = '';

      if (!loans || loans.length === 0) {
        this.container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:2rem 0;">No active loan listings found on-chain.</p>';
        if (notify) modules.Toast.show('No loans found on chain', 'info');
        return;
      }

      const frag = document.createDocumentFragment();

      loans.forEach((loan, idx) => {
        const card = document.createElement('article');
        card.className = 'loan-card';
        card.style.animationDelay = `${idx * 0.09}s`;
        card.setAttribute('data-loan-id', loan.id);

        const h3 = document.createElement('h3');
        const borrowerShort = loan.borrower
          ? loan.borrower.slice(0, 6) + '…' + loan.borrower.slice(-4)
          : 'Unknown';
        h3.textContent = `Borrower: ${borrowerShort}`;
        card.appendChild(h3);

        const meta = document.createElement('div');
        meta.className = 'loan-meta';

        const durationMonths = Math.round(Number(loan.duration) / 2592000) || 0;

        const details = [
          `Amount: ${parseFloat(loan.principal).toFixed(4)} CTC`,
          `Share: ${loan.revenueSharePercent}%`,
          `Duration: ${durationMonths} mo`
        ];

        details.forEach(txt => {
          const s = document.createElement('span');
          s.textContent = txt;
          meta.appendChild(s);
        });

        card.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'fund-btn';
        btn.textContent = 'Fund Loan';
        btn.setAttribute('type', 'button');
        btn.setAttribute('data-loan-id', loan.id);
        btn.setAttribute('data-principal', loan.principal);
        btn.setAttribute('data-borrower', loan.borrower);
        card.appendChild(btn);

        frag.appendChild(card);
      });

      this.container.appendChild(frag);

      if (notify) {
        modules.Toast.show('Loan marketplace refreshed from chain', 'info');
      }
    }
  };

  // --- Form Module (BorrowForm) ---
  modules.BorrowForm = {
    form: null,
    inputs: {},

    init() {
      // Uses the REAL HTML IDs from app.html
      this.form = document.getElementById('loanCreateForm');
      if (!this.form) return;

      this.inputs = {
        amount: document.getElementById('requestAmount'),
        share: document.getElementById('revenueSharePct'),
        cap: document.getElementById('repaymentCap'),
        duration: document.getElementById('durationMonths')
      };

      // Intercept native form submit
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    },

    validate() {
      if (!this.form) return false;

      const missing = Object.values(this.inputs).some(el => !el);
      if (missing) {
        modules.Toast.show('Form inputs are missing. Check your HTML.', 'error');
        return false;
      }

      // Remove existing .form-error elements before validation
      const existing = this.form.querySelectorAll('.form-error');
      existing.forEach(e => e.remove());

      let valid = true;

      const amtVal = parseFloat(this.inputs.amount.value);
      if (isNaN(amtVal) || amtVal < 1000) {
        this.setError(this.inputs.amount, 'Min funding: $1,000');
        valid = false;
      }

      const shareVal = parseFloat(this.inputs.share.value);
      if (isNaN(shareVal) || shareVal < 1 || shareVal > 30) {
        this.setError(this.inputs.share, 'Range: 1% - 30%');
        valid = false;
      }

      const durVal = parseInt(this.inputs.duration.value, 10);
      if (isNaN(durVal) || durVal < 3 || durVal > 60) {
        this.setError(this.inputs.duration, 'Range: 3 - 60 mo');
        valid = false;
      }

      return valid;
    },

    setError(input, msg) {
      const group = input && input.closest('.form-group');
      if (!group) return;

      const err = document.createElement('span');
      err.className = 'form-error';
      err.textContent = msg;
      group.appendChild(err);
    },

    async handleSubmit() {
      if (!this.validate()) return;

      const amountVal = this.inputs.amount.value.trim();
      const shareVal = this.inputs.share.value.trim();
      const capVal = this.inputs.cap.value.trim();
      const durationVal = this.inputs.duration.value.trim();

      // Guard: wallet must be connected for on-chain submission
      if (!window.isWalletConnected || !window.isWalletConnected()) {
        modules.Toast.show('Please connect your wallet first.', 'error');
        return;
      }

      // Disable submit button to prevent double-submission
      const submitBtn = this.form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
      }

      try {
        modules.Toast.show('Submitting loan to chain…', 'info');

        // Convert duration months -> seconds for the contract (_duration is in seconds on-chain)
        const durationSeconds = parseInt(durationVal, 10) * 30 * 24 * 60 * 60;

        // Convert dollar amount to ETH representation (1 USD unit = 1 ETH unit for demo)
        // In production you would use an oracle or fixed rate conversion.
        const principalEth = amountVal;

        const txHash = await window.createLoan({
          principalEth: principalEth,
          revenueSharePercent: parseInt(shareVal, 10),
          repaymentCapPercent: parseInt(capVal, 10),
          durationSeconds: durationSeconds,
          collateralEth: '0'
        });

        // Add the newly created loan optimistically to the UI
        modules.LoanSystem.localLoans.push({
          id: 9999 + modules.LoanSystem.localLoans.length, // Fake ID
          borrower: await window.getCurrentAddress() || 'Unknown',
          principal: principalEth,
          revenueSharePercent: shareVal,
          duration: durationSeconds.toString(),
          funded: false,
          active: true
        });

        modules.Toast.show('✅ Loan created! Tx: ' + txHash.slice(0, 10) + '…', 'success');
        this.form.reset();

        // Re-load marketplace so the new loan appears
        await modules.LoanSystem.load(false);

      } catch (err) {
        modules.Toast.show('❌ ' + (err.message || 'Transaction failed'), 'error');
        console.error('createLoan error', err);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Loan';
        }
      }
    }
  };

  // --- Scroll Reveal Module ---
  modules.ScrollReveal = {
    observer: null,

    init() {
      if (!('IntersectionObserver' in window)) {
        // Fallback: reveal everything immediately
        document.querySelectorAll('.scroll-reveal, .scroll-reveal-stagger').forEach(el => {
          el.classList.add('revealed');
        });
        return;
      }

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer.unobserve(entry.target); // fire once
          }
        });
      }, { threshold: 0.12 });

      document.querySelectorAll('.scroll-reveal, .scroll-reveal-stagger').forEach(el => {
        this.observer.observe(el);
      });
    }
  };

  // --- UI Orchestrator (Unified Event Handling) ---
  modules.UIController = {
    els: {},

    init() {
      this.els = {
        mobileMenu: document.getElementById('mobileMenu'),
        settings: document.getElementById('settingsPanel')
      };

      this.bindGlobalEvents();
    },

    bindGlobalEvents() {
      // Unified Click Handler
      document.addEventListener('click', (e) => {
        const id = e.target.id;
        const classes = e.target.classList;

        // ── Hero CTA buttons ──────────────────────────────────────────────

        // 1️⃣ Create Loan Button → scroll to #borrow section
        if (id === 'createLoanBtn') {
          e.preventDefault();
          modules.Navigation.scrollTo('borrow');
          return;
        }

        // 2️⃣ Browse Loans Button → scroll to #lend section
        if (id === 'browseLoansBtn') {
          e.preventDefault();
          modules.Navigation.scrollTo('lend');
          return;
        }

        // ── Panel Toggles ─────────────────────────────────────────────────
        if (id === 'mobileMenuToggle') { if (this.els.mobileMenu) this.els.mobileMenu.classList.add('open'); return; }
        if (id === 'closeMobileMenu') { if (this.els.mobileMenu) this.els.mobileMenu.classList.remove('open'); return; }
        if (id === 'settingsToggle') { if (this.els.settings) this.els.settings.classList.add('open'); return; }
        if (id === 'closeSettings') { if (this.els.settings) this.els.settings.classList.remove('open'); return; }

        // ── Core Actions ──────────────────────────────────────────────────

        // Refresh loan marketplace
        if (id === 'refreshLoans') {
          modules.LoanSystem.load(true);
          return;
        }

        // 7️⃣ Fund Loan Button — delegate from loan cards
        if (classes.contains('fund-btn')) {
          const btn = e.target;
          const loanId = btn.getAttribute('data-loan-id');
          const principalEth = btn.getAttribute('data-principal') || '0';
          const borrowerAddress = btn.getAttribute('data-borrower');

          if (!loanId) {
            // Demo loan — wallet not connected / placeholder
            modules.Toast.show('Connect wallet to fund real loans on-chain.', 'info');
            return;
          }

          if (!window.isWalletConnected || !window.isWalletConnected()) {
            modules.Toast.show('Please connect your wallet first.', 'error');
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Funding…';

          window.fundLoan(Number(loanId), principalEth, borrowerAddress)
            .then(txHash => {
              // Update local loan array if it was stored locally
              const localLoan = modules.LoanSystem.localLoans.find(l => Number(l.id) === Number(loanId));
              if (localLoan) localLoan.funded = true;

              modules.Toast.show('✅ Loan funded! Tx: ' + txHash.slice(0, 10) + '…', 'success');
              modules.LoanSystem.load(false);
            })
            .catch(err => {
              modules.Toast.show('❌ ' + (err.message || 'Funding failed'), 'error');
              console.error('fundLoan error', err);
              btn.disabled = false;
              btn.textContent = 'Fund Loan';
            });

          return;
        }

        // ── Navigation (Delegation) ──────────────────────────────────────
        const navLink = e.target.closest('[data-section]');
        if (navLink) {
          e.preventDefault();
          const targetSection = navLink.getAttribute('href').substring(1);
          modules.Navigation.scrollTo(targetSection);
          if (this.els.mobileMenu) this.els.mobileMenu.classList.remove('open');
          return;
        }

        // ── Theme / Preferences ───────────────────────────────────────────
        if (id === 'themeToggle') { modules.Preferences.toggleTheme(); return; }
        if (id === 'toggleAnimations') { modules.Preferences.toggleAnimations(); return; }
        if (id === 'toggleBackgroundEffects') { modules.Preferences.toggleBg(); return; }
        if (id === 'resetPreferences') { modules.Preferences.reset(); return; }

        // ── Secondary Nav / Buttons ───────────────────────────────────────
        if (id === 'launchApp') { modules.Navigation.scrollTo('borrow'); return; }
        if (id === 'learnMore') { window.location.href = 'learn.html'; return; }

        // 9️⃣ MetaMask Wallet Connection
        if (id === 'connectWallet' || id === 'mobileConnectWallet') {
          modules.Toast.show('Connecting wallet…', 'info');

          window.connectWallet()
            .then(async address => {
              modules.Toast.show('✅ Wallet connected: ' + address.slice(0, 6) + '…' + address.slice(-4), 'success');

              // Update Connect Wallet buttons text
              const btn = document.getElementById('connectWallet');
              if (btn) btn.textContent = address.slice(0, 6) + '...' + address.slice(-4);
              const mobileBtn = document.getElementById('mobileConnectWallet');
              if (mobileBtn) mobileBtn.textContent = address.slice(0, 6) + '...' + address.slice(-4);

              // Reload loans (now with write access available) and update dashboard position
              await modules.LoanSystem.load(false);
            })
            .catch(err => {
              modules.Toast.show('❌ Failed to connect wallet: ' + (err.message || err), 'error');
              console.error('connectWallet error', err);
            });

          return;
        }

        // ── Outside Click Handling ─────────────────────────────────────────
        if (this.els.mobileMenu && this.els.mobileMenu.classList.contains('open') &&
          !this.els.mobileMenu.contains(e.target) && id !== 'mobileMenuToggle') {
          this.els.mobileMenu.classList.remove('open');
        }

        if (this.els.settings && this.els.settings.classList.contains('open') &&
          !this.els.settings.contains(e.target) && id !== 'settingsToggle') {
          this.els.settings.classList.remove('open');
        }
      });

      // Unified Keydown Handler
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.els.mobileMenu) this.els.mobileMenu.classList.remove('open');
          if (this.els.settings) this.els.settings.classList.remove('open');
        }
      });

      // Window Events
      window.addEventListener('resize', () => {
        rAF(() => modules.Navigation.cacheMetrics());
      }, { passive: true });
    }
  };

  // --- Bootstrap ---
  document.addEventListener('DOMContentLoaded', () => {
    if (state.isInitialized) return;

    // Add scroll-reveal classes to key sections
    const platform = document.querySelector('.platform-section');
    if (platform) {
      const title = platform.querySelector('.section-title');
      const grid = platform.querySelector('.card-grid');
      if (title) title.classList.add('scroll-reveal');
      if (grid) grid.classList.add('scroll-reveal-stagger');
    }

    const stats = document.querySelector('.stats-section');
    if (stats) {
      const grid = stats.querySelector('.stats-grid');
      if (grid) grid.classList.add('scroll-reveal-stagger');
    }

    const borrow = document.querySelector('.borrow-section');
    if (borrow) {
      const h2 = borrow.querySelector('h2');
      const desc = borrow.querySelector('.section-description');
      const form = borrow.querySelector('.form-card');
      if (h2) h2.classList.add('scroll-reveal');
      if (desc) desc.classList.add('scroll-reveal');
      if (form) form.classList.add('scroll-reveal');
    }

    const analytics = document.querySelector('.analytics-section');
    if (analytics) {
      const h2 = analytics.querySelector('h2');
      const chart = analytics.querySelector('.chart-placeholder');
      const desc = analytics.querySelector('.analytics-description');
      if (h2) h2.classList.add('scroll-reveal');
      if (chart) chart.classList.add('scroll-reveal');
      if (desc) desc.classList.add('scroll-reveal');
    }

    // Ordered Init
    modules.Preferences.init();
    modules.Toast.init();
    modules.Navigation.init();
    modules.Stats.init();
    modules.BorrowForm.init();
    modules.LoanSystem.init();
    modules.UIController.init();
    modules.ScrollReveal.init();

    // Auto-refresh loans every 10 seconds (spec requirement §8)
    setInterval(() => {
      modules.LoanSystem.load(false);
    }, 10000);

    state.isInitialized = true;
  });

})();
