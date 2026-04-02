export function renderConnectivityBanner() {
  const banner = document.createElement('div');
  banner.id = 'connectivity-banner';
  banner.className = 'connectivity-banner';
  banner.innerHTML = `
    <div class="connectivity-content">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>Working offline - changes will sync when connected</span>
    </div>
  `;
  document.body.appendChild(banner);

  function updateStatus() {
    if (navigator.onLine) {
      banner.classList.remove('visible');
    } else {
      banner.classList.add('visible');
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus(); // Initial check
}
