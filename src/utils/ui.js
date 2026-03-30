// ─── Toast System ───
export function showToast(message, type = 'success', action = null) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.justifyContent = 'space-between';
  toast.style.gap = '16px';
  toast.style.pointerEvents = 'auto'; // ensure clicks work

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (action && action.text && action.onClick) {
    const btn = document.createElement('button');
    btn.textContent = action.text;
    btn.style.background = 'rgba(255,255,255,0.15)';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.padding = '4px 10px';
    btn.style.borderRadius = '4px';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '600';
    btn.style.cursor = 'pointer';
    btn.onclick = (e) => {
      e.stopPropagation();
      action.onClick();
      // Auto-dismiss the toast on click
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 400);
    };
    
    // Slight hover fx
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.25)';
    btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.15)';
    
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  
  // Standard dismissal
  const lifespan = action ? 6000 : 3200; // Give them more time if there's an action
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 400);
    }
  }, lifespan);
}
