import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { auth } from './backend/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { syncUserProfile, getCurrentUserProfile } from './backend/userRoleService';
import { renderConnectivityBanner } from './components/ConnectivityBanner';
import { showToast } from './utils/ui';

// Statically import core pages so they are immediately available for offline use
import { renderHome } from './pages/Home.js';
import { renderIntakeForm } from './pages/IntakeForm.js';
import { renderPropertyDetail } from './pages/PropertyDetail.js';
import { renderEditProperty } from './pages/EditProperty.js';
import { renderLoginPage } from './pages/Login.js';
import { renderAdminPage } from './pages/Admin.js';

const app = document.getElementById('app');

// ─── Initial App Shell Render (Zero Latency) ───
// Render this immediately so the user never stares at a blank green screen while Firebase/IndexedDb initializes
if (!app.innerHTML.trim()) {
  app.innerHTML = `
    <div class="page-header" style="margin-top:20px;">
      <div class="skeleton skeleton-text" style="width:50%;height:32px"></div>
    </div>
    <div class="page-content" style="margin-top:24px;">
      <div class="skeleton skeleton-card" style="height:120px; animation-duration:1.5s;"></div>
      <div class="skeleton skeleton-card" style="height:120px; animation-duration:1.5s; animation-delay:50ms;"></div>
    </div>
  `;
}

// Toast system now in utils/ui.js

// ─── Initialize Service Worker ───
const updateSW = registerSW({
  onNeedRefresh() {
    showToast('New update available', 'info', {
      text: 'Update Now',
      onClick: () => updateSW(true)
    });
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

// ─── PWA Install Prompt Logic ───
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show the install button if it exists
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
        <div style="display: flex; align-items: center; gap: var(--space-md);">
          <span class="top-bar-tag">Inventory</span>
          ${user ? `
            <div class="user-profile" id="user-profile-trigger">
              <div class="user-avatar">${initial}</div>
              <div class="user-dropdown" id="user-dropdown">
                <div class="user-dropdown-header">
                  <div style="display:flex; justify-content:space-between; align-items:center">
                    <p class="text-label" style="color: var(--text-primary)">${userDisplay}</p>
                    <span class="text-caption" style="font-size: 10px; opacity: 0.5">v1.3.1</span>
                  </div>
                  <p class="text-caption">${user.email}</p>
                </div>
                ${window.userProfile?.role === 'admin' ? `
                  <a href="#admin" class="btn-secondary" style="display:block; text-align:center; padding: 4px; font-size: 12px; margin-top: 8px; text-decoration:none">Admin Panel</a>
                ` : ''}
                <button class="btn-primary" id="pwa-install-btn" style="display: ${deferredPrompt ? 'inline-flex' : 'none'}; min-height: 36px; padding: 4px 12px; font-size: 12px; margin-top: 8px; width: 100%;">
                  Install App
                </button>
                <button class="btn-secondary" id="btn-logout" style="min-height: 36px; padding: 4px 12px; font-size: 12px; margin-top: 8px; width: 100%;">
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

  // Render shell with skeleton loading
  app.innerHTML = renderSkeleton();

  // Ensure top bar is rendered
  if (!document.querySelector('.top-bar')) {
    document.body.insertAdjacentHTML('afterbegin', renderTopBar());
  }

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
      if (user) {
        window.location.hash = '#';
        return;
      }
      renderLoginPage(app);
      return;
    }

    // Protected routes
    if (!user) {
      window.location.hash = '#login';
      return;
    }

    // Load/Refresh profile for role checks if not in window
    if (!window.userProfile || window.userProfile.uid !== user.uid) {
      // getCurrentUserProfile now uses a fast cache-first approach
      window.userProfile = await getCurrentUserProfile();
    }

    // Approval Gate: Only let active users proceed to inventory, keep admins free
    if (window.userProfile?.status !== 'active' && window.userProfile?.role !== 'admin') {
       renderPendingScreen(app);
       return;
    }

    if (hash === '#') {
      await renderHome(app);
    } else if (hash === '#add') {
      renderIntakeForm(app);
    } else if (hash === '#admin') {
      if (window.userProfile?.role === 'admin') {
        await renderAdminPage(app);
      } else {
        window.location.hash = '#';
      }
    } else if (hash.startsWith('#property/')) {
      const id = hash.split('/')[1];
      await renderPropertyDetail(app, id);
    } else if (hash.startsWith('#edit/')) {
      const id = hash.split('/')[1];
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
};

window.addEventListener('hashchange', router);

// Handle Auth State
onAuthStateChanged(auth, (user) => {
  if (user) {
    syncUserProfile(user).catch(err => console.error('Sync profile error:', err));
  }
  router();
  
  // Set up listeners after DOM updates (on each router run)
  setTimeout(() => {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
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
      installBtn.onclick = async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
          installBtn.style.display = 'none';
        }
        deferredPrompt = null;
      };
    }
  }, 100);
});
