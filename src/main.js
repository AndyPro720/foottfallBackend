import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { auth } from './backend/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { syncUserProfile, getCurrentUserProfile } from './backend/userRoleService';
import { renderConnectivityBanner } from './components/ConnectivityBanner';
import { showToast } from './utils/ui';

// Static imports: critical-path pages that must load instantly (Home, Login, Detail)
import { renderHome } from './pages/Home.js';
import { renderPropertyDetail } from './pages/PropertyDetail.js';
import { renderLoginPage } from './pages/Login.js';

// Lazy imports: heavy pages that pull in heic-to (~2.7MB). Loaded on-demand.
const lazyIntakeForm = () => import('./pages/IntakeForm.js').then(m => m.renderIntakeForm);
const lazyEditProperty = () => import('./pages/EditProperty.js').then(m => m.renderEditProperty);
const lazyAdminPage = () => import('./pages/Admin.js').then(m => m.renderAdminPage);

const app = document.getElementById('app');
let topBarDocClickHandler = null;
let lastHash = window.location.hash || '#';
let authResolved = false;

function applyPlatformClasses() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  document.body.classList.toggle('ios-pwa', Boolean(isIOS && isStandalone));
}

// ─── Initialize Service Worker ───
const updateSW = registerSW({
  onNeedRefresh() {
    showToast('New update available', 'info', {
      text: 'Update Now',
      onClick: () => updateSW(true)
    });
  },
  onOfflineReady() {
    showToast('App ready for offline use', 'success');
  },
});

// ─── PWA Install Prompt Logic ───
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

// ─── Top Bar with Logo ───
function renderTopBar() {
  const user = auth.currentUser;
  const userDisplay = user ? (user.displayName || user.email.split('@')[0]) : '';
  const initial = userDisplay ? userDisplay.charAt(0).toUpperCase() : '?';

  return `
    <header class="top-bar">
      <div class="top-bar-inner">
        <a href="#" class="brand-logo" aria-label="Foottfall Home">
          <span class="brand-wordmark">FOOTTFALL</span>
        </a>
        <div class="top-bar-actions">
          <span class="top-bar-tag">Inventory</span>
          ${user ? `
            <div class="user-profile" id="user-profile-trigger">
              <div class="user-avatar">${initial}</div>
              <div class="user-dropdown" id="user-dropdown">
                <div class="user-dropdown-header">
                  <div style="display:flex; justify-content:space-between; align-items:center">
                    <p class="text-label" style="color: var(--text-primary)">${userDisplay}</p>
                    <span class="text-caption" style="font-size: 10px; opacity: 0.5">v${__APP_VERSION__}</span>
                  </div>
                  <p class="text-caption">${user.email}</p>
                </div>
                ${['admin', 'superadmin'].includes(window.userProfile?.role) ? `
                  <a href="#admin" class="btn-secondary dropdown-action" style="display:block; text-align:center; text-decoration:none">Admin Panel</a>
                ` : ''}
                <button class="btn-primary dropdown-action" id="pwa-install-btn" style="display: ${deferredPrompt ? 'inline-flex' : 'none'};">
                  Install App
                </button>
                <button class="btn-secondary dropdown-action" id="btn-logout">
                  Sign Out
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </header>
  `;
}

// ─── Attach Top Bar Event Listeners ───
// Must be called after every router() since the DOM is re-rendered each time
function attachTopBarListeners() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await signOut(auth);
        showToast('Signed out');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPrompt = null;
    };
  }

  // Profile dropdown toggle (works on mobile tap and desktop click)
  const profileTrigger = document.getElementById('user-profile-trigger');
  const dropdown = document.getElementById('user-dropdown');
  if (profileTrigger && dropdown) {
    profileTrigger.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    };

    dropdown.onclick = (e) => {
      e.stopPropagation();
    };

    // Replace old handler to avoid stacking duplicate listeners on rerenders
    if (topBarDocClickHandler) {
      document.removeEventListener('click', topBarDocClickHandler);
    }

    topBarDocClickHandler = () => {
      dropdown.classList.remove('show');
    };
    document.addEventListener('click', topBarDocClickHandler);
  }
}

// ─── Pending Approval Screen ───
function renderPendingScreen(container) {
  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Account Pending</h1>
      <p class="text-label">Waiting for administrator approval</p>
    </div>
    <div class="card animate-enter" style="--delay:100ms">
      <div style="text-align:center; padding: var(--space-xl) 0">
        <div class="skeleton-text" style="width:60px; height:60px; border-radius:50%; margin: 0 auto var(--space-md)">
          <svg style="width:32px; height:32px; margin-top:14px; color:var(--text-secondary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <p class="text-body" style="max-width:300px; margin:0 auto">Your account has been registered. Please contact your manager to activate your access.</p>
      </div>
    </div>
  `;
}

// ─── Navigation ───
function renderNav() {
  const hash = window.location.hash || '#';
  if (!auth.currentUser && hash !== '#login') return '';
  return `
    <nav class="bottom-nav">
      <a href="#" class="nav-link ${hash === '#' ? 'active' : ''}">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        Home
      </a>
      <a href="#add" class="nav-link ${hash === '#add' ? 'active' : ''}">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
        Add Property
      </a>
    </nav>
  `;
}

// ─── Skeleton Loading ───
function renderSkeleton() {
  return `
    <div class="page-header">
      <div class="skeleton skeleton-text" style="width:40%;height:32px"></div>
      <div class="skeleton skeleton-text" style="width:25%;height:16px;margin-top:8px"></div>
    </div>
    <div class="page-content">
      ${[0,1,2].map(i => `<div class="skeleton skeleton-card animate-enter" style="--delay:${i * 80}ms"></div>`).join('')}
    </div>
  `;
}

// ─── Router ───
const router = async () => {
  const hash = window.location.hash || '#';
  const previousHash = lastHash;
  lastHash = hash;

  if (previousHash === '#') {
    sessionStorage.setItem('home-scroll-y', String(window.scrollY || 0));
  }

  const canReuseHome = hash === '#' && typeof window.__hasHomeCache === 'function' && window.__hasHomeCache();
  if (!canReuseHome) {
    app.innerHTML = renderSkeleton();
  }

  // Ensure top bar is rendered
  const existingTopBar = document.querySelector('.top-bar');
  if (existingTopBar) existingTopBar.remove();
  document.body.insertAdjacentHTML('afterbegin', renderTopBar());

  // Ensure connectivity banner is rendered
  if (!document.getElementById('connectivity-banner')) {
    renderConnectivityBanner();
  }

  // Ensure nav is always rendered
  const existingNav = document.querySelector('.bottom-nav');
  if (existingNav) existingNav.remove();
  document.body.insertAdjacentHTML('beforeend', renderNav());

  try {
    const user = auth.currentUser;

    // Public routes
    if (hash === '#login') {
      if (!authResolved) {
        app.innerHTML = `
          <div class="page-header animate-enter">
            <h1 class="text-display">Restoring Session</h1>
            <p class="text-label">Checking your saved sign-in...</p>
          </div>
          <div class="page-content">
            <div class="skeleton skeleton-card animate-enter" style="--delay:60ms"></div>
          </div>
        `;
        return;
      }
      if (user) {
        window.location.hash = '#';
        return;
      }
      renderLoginPage(app);
      return;
    }

    // Protected routes
    if (!user) {
      if (!authResolved) {
        app.innerHTML = `
          <div class="page-header animate-enter">
            <h1 class="text-display">Restoring Session</h1>
            <p class="text-label">Checking your saved sign-in...</p>
          </div>
          <div class="page-content">
            <div class="skeleton skeleton-card animate-enter" style="--delay:60ms"></div>
          </div>
        `;
        return;
      }
      window.location.hash = '#login';
      return;
    }

    // Load/Refresh profile for role checks if not in window
    if (!window.userProfile || window.userProfile.uid !== user.uid) {
      window.userProfile = await getCurrentUserProfile();
    }

    // Approval Gate: Only let active users proceed to inventory, keep admins free
    if (window.userProfile?.status !== 'active' && !['admin', 'superadmin'].includes(window.userProfile?.role)) {
       renderPendingScreen(app);
       return;
    }

    if (hash === '#') {
      await renderHome(app, { useCache: true });
    } else if (hash === '#add') {
      const renderIntakeForm = await lazyIntakeForm();
      renderIntakeForm(app);
    } else if (hash === '#admin') {
      if (['admin', 'superadmin'].includes(window.userProfile?.role)) {
        const renderAdminPage = await lazyAdminPage();
        await renderAdminPage(app);
      } else {
        window.location.hash = '#';
      }
    } else if (hash.startsWith('#property/')) {
      const id = hash.split('/')[1];
      await renderPropertyDetail(app, id);
    } else if (hash.startsWith('#edit/')) {
      const id = hash.split('/')[1];
      const renderEditProperty = await lazyEditProperty();
      await renderEditProperty(app, id);
    } else {
      app.innerHTML = `
        <div class="page-header">
          <h1 class="text-display">404</h1>
          <p class="text-label">Page not found</p>
        </div>
        <div class="card">
          <p class="text-body">The page you're looking for doesn't exist.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Router error:', err);
    if (!navigator.onLine) {
       app.innerHTML = `
        <div class="page-header">
          <h1 class="text-display">Offline</h1>
          <p class="text-label">This page wasn't cached yet and cannot be loaded while offline.</p>
        </div>
        <div class="card">
          <p class="text-body">Please connect to the internet once to load this section.</p>
          <button class="btn-primary" onclick="window.location.hash='#'" style="margin-top:var(--space-md)">Go Home</button>
        </div>
      `;
      return;
    }
    app.innerHTML = `
      <div class="page-header">
        <h1 class="text-display">System Error</h1>
      </div>
      <div class="card card-error">
        <div class="card-header">
          <h3 class="text-subheading">⚠ Firebase Not Configured</h3>
        </div>
        <div class="card-body">
          <p class="text-body">Create a <code>.env</code> file in the project root with your Firebase credentials.</p>
          <pre class="text-caption" style="margin-top:var(--space-md);background:var(--bg-input);padding:var(--space-md);border-radius:var(--radius-md);white-space:pre-wrap">VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id</pre>
        </div>
      </div>
    `;
  }

  if (hash === '#') {
    // Defer scroll restoration: renderHome is async, so wait for next paint
    const savedScroll = Number(sessionStorage.getItem('home-scroll-y') || 0);
    if (savedScroll > 0) {
      // Use double-rAF to ensure DOM has painted (critical on iOS WebKit)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScroll, left: 0, behavior: 'auto' });
        });
      });
      // Fallback: also try after a short delay for iOS PWA
      setTimeout(() => {
        if (Math.abs(window.scrollY - savedScroll) > 50) {
          window.scrollTo({ top: savedScroll, left: 0, behavior: 'auto' });
        }
      }, 300);
    }
  } else {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  // Re-attach top bar listeners after every DOM render
  attachTopBarListeners();
};

window.addEventListener('hashchange', router);

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

applyPlatformClasses();

// ─── Auth State & Boot Sequence ───
// CRITICAL: Firebase's onAuthStateChanged can take SECONDS to fire when offline
// because it needs to restore the user from IndexedDB. We cannot wait for it.
// Instead, we set a timeout: if auth hasn't resolved in 1.5s, call router() anyway
// so the user sees SOMETHING instead of a blank green screen.

onAuthStateChanged(auth, (user) => {
  authResolved = true;
  if (user) {
    syncUserProfile(user).catch(err => console.error('Sync profile error:', err));
  }
  router();
});

// Failsafe: If onAuthStateChanged is too slow, let routing continue gracefully.
// This prevents the infinite green screen when opening the PWA offline
setTimeout(() => {
  if (!authResolved) {
    console.warn('Auth restore is slow, showing restoring-session UI.');
    router();
  }
}, 4000);
