import { auth, googleProvider } from '../backend/firebaseConfig';
import { signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword } from 'firebase/auth';
import { showToast } from '../utils/ui.js';

export function renderLoginPage(container) {
  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Welcome back</h1>
      <p class="text-label">Sign in to manage your inventory</p>
    </div>

    <div class="card animate-enter" style="--delay: 100ms; max-width: 400px; margin: 0 auto;">
      <form id="login-form" class="page-content" style="gap: var(--space-lg);">
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="login-email" class="form-input" placeholder="name@company.com" required>
        </div>
        
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" id="login-password" class="form-input" placeholder="••••••••" required>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-md);">
          <button type="submit" id="btn-login" class="btn-primary">
            Sign In with Email
          </button>
          
          <div style="display: flex; align-items: center; gap: var(--space-md);">
            <div style="flex: 1; height: 1px; background: var(--border-default);"></div>
            <span class="text-caption">OR</span>
            <div style="flex: 1; height: 1px; background: var(--border-default);"></div>
          </div>

          <button type="button" id="btn-google" class="btn-secondary">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.8 2.71v2.24h2.91c1.7-1.57 2.69-3.88 2.69-6.58z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.24c-.8.54-1.84.85-3.05.85-2.34 0-4.32-1.58-5.03-3.71H.95v2.3C2.43 15.89 5.5 18 9 18z" fill="#34A853"/>
              <path d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V5l-3.02-2.3C.36 3.91 0 5.4 0 7s.36 3.09 1.02 4.3l2.95-2.58z" fill="#FBBC05"/>
              <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.37C13.46.94 11.43 0 9 0 5.5 0 2.43 2.11.95 5.1L3.97 7.4c.71-2.13 2.69-3.82 5.03-3.82z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <p class="text-caption" style="text-align: center;">
          Don't have an account? <a href="#" id="link-toggle-auth" style="color: var(--accent-green); font-weight: 500;">Request Access</a>
        </p>
      </form>
    </div>
  `;

  const form = document.getElementById('login-form');
  const btnLogin = document.getElementById('btn-login');
  const btnGoogle = document.getElementById('btn-google');
  const toggleAuth = document.getElementById('link-toggle-auth');
  let isSignUp = false;

  toggleAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    btnLogin.textContent = isSignUp ? 'Create Account' : 'Sign In with Email';
    toggleAuth.textContent = isSignUp ? 'Sign In instead' : 'Request Access';
    document.querySelector('.text-display').textContent = isSignUp ? 'Join Footfall' : 'Welcome back';
    document.querySelector('.text-label').textContent = isSignUp ? 'Create your inventory agent account' : 'Sign in to manage your inventory';
  });

  btnGoogle.addEventListener('click', async () => {
    btnGoogle.classList.add('btn-loading');
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Logged in with Google');
      window.location.hash = '#';
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      btnGoogle.classList.remove('btn-loading');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    btnLogin.classList.add('btn-loading');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast('Account created successfully');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Welcome back');
      }
      window.location.hash = '#';
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      btnLogin.classList.remove('btn-loading');
    }
  });
}
