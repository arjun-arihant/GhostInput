// Content script for countdown overlay on webpage
// This creates a floating widget that shows countdown timers for all active actions

(function () {
  'use strict';

  let overlayContainer = null;
  let styleElement = null;
  let countdownInterval = null;
  let isVisible = false;
  let actions = [];
  let countdowns = {};
  let currentTabId = null; // Will be set via message from background

  // Ultra-Compact Theme-Aware Overlay CSS (Scaled Up + Sharper)
  const overlayStyles = `
    /* Theme Variables - Scoped */
    #akp-countdown-overlay {
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --text-primary: #F1F5F9;
      --text-muted: #94A3B8;
      --border-color: rgba(148, 163, 184, 0.2);
      --accent: #6366F1;
      --success: #10B981;
      --warning: #F59E0B;
      
      /* Sizing Variables (Scaled Up) */
      --font-base: 15px; 
      --font-sm: 13px;
      --font-xs: 11px;
      --padding-lg: 12px;
      --padding-md: 10px;
      --radius: 4px; /* Reduced rounding */
    }
    
    /* Specificity boost for light mode */
    div#akp-countdown-overlay[data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f8fafc;
      --text-primary: #0f172a;
      --text-muted: #64748b;
      --border-color: rgba(148, 163, 184, 0.3);
    }

    #akp-countdown-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      width: auto;
      min-width: 170px; /* Reduced from 200px to decrease spacing */
      max-width: 320px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 2147483647;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2); /* Deep shadow */
      font-size: var(--font-base);
      line-height: 1.5;
      color: var(--text-primary);
      user-select: none;
      transition: opacity 0.2s, transform 0.2s;
      cursor: move; /* Whole window draggable */
    }
    
    #akp-countdown-overlay * { box-sizing: border-box; margin: 0; padding: 0; }

    #akp-countdown-overlay.akp-minimized {
      min-width: 0;
      width: 48px; /* Larger icon */
      height: 48px;
      border-radius: 8px; /* Slightly rounder for icon */
      cursor: move;
      overflow: hidden;
      background: var(--accent);
      border: none;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    #akp-countdown-overlay.akp-minimized::after {
      content: "⏱";
      font-size: 24px;
    }

    #akp-countdown-overlay.akp-minimized .akp-body,
    #akp-countdown-overlay.akp-minimized .akp-controls-hover {
      display: none !important;
    }
    
    #akp-countdown-overlay.akp-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-8px) scale(0.95);
    }

    /* Content List */
    .akp-list {
      display: flex;
      flex-direction: column;
      padding: 4px 0;
    }
    
    .akp-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px; /* Reduced from 12px */
      padding: 8px 12px; /* Increased padding */
      border-bottom: 1px solid var(--border-color);
      background: transparent;
      transition: background 0.1s;
    }
    .akp-item:hover {
      background: rgba(255,255,255,0.03);
    }
    .akp-item:last-child { border-bottom: none; }
    
    div#akp-countdown-overlay[data-theme="light"] .akp-item:hover {
      background: rgba(0,0,0,0.03);
    }
    
    .akp-info-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    
    .akp-key-badge {
      font-size: 11px; /* Larger */
      font-weight: 700;
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent);
      padding: 2px 6px;
      border-radius: 3px;
      min-width: 20px;
      text-align: center;
      border: 1px solid rgba(99, 102, 241, 0.2);
    }
    
    .akp-name-text {
      font-weight: 600;
      font-size: 13px; /* Larger */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100px; /* Wider */
      color: var(--text-primary);
    }
    
    .akp-timer {
      font-family: 'SF Mono', 'Roboto Mono', monospace;
      font-weight: 700;
      color: var(--success);
      font-size: 14px; /* Larger */
      letter-spacing: -0.02em;
    }
    .akp-timer.urgent { color: var(--warning); }
    
    .akp-empty {
      padding: 16px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      font-style: italic;
    }

    /* Controls (Hover Only) */
    .akp-controls-hover {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      opacity: 0;
      transition: opacity 0.1s;
      background: var(--bg-primary);
      border-bottom-left-radius: 4px;
      border-left: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      z-index: 10;
    }
    #akp-countdown-overlay:hover .akp-controls-hover { opacity: 1; }
    
    .akp-ctrl-btn {
      width: 24px; /* Larger touch target */
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 16px; /* Larger icon */
    }
    .akp-ctrl-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.1); }
    div#akp-countdown-overlay[data-theme="light"] .akp-ctrl-btn:hover { background: rgba(0,0,0,0.05); }
    .akp-ctrl-btn.close:hover { color: var(--danger); background: rgba(239,68,68,0.15); }
  `;

  // Create the overlay with minimal structure
  function createOverlay() {
    if (overlayContainer) return;
    if (!document.body) return;

    // Add styles
    styleElement = document.createElement('style');
    styleElement.id = 'akp-overlay-styles';
    styleElement.textContent = overlayStyles;
    document.head.appendChild(styleElement);

    // Create overlay container
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'akp-countdown-overlay';

    // Apply theme if known (default to dark if not set)
    chrome.storage.local.get(['settings'], (result) => {
      const theme = result.settings?.theme || 'dark';
      overlayContainer.setAttribute('data-theme', theme);
    });

    overlayContainer.innerHTML = `
      <div class="akp-controls-hover">
        <button class="akp-ctrl-btn akp-minimize" title="Minimize">&minus;</button>
        <button class="akp-ctrl-btn close" title="Hide">×</button>
      </div>
      <div class="akp-body">
        <div class="akp-list">
          <div class="akp-empty">No active actions</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlayContainer);

    // Event listeners
    overlayContainer.querySelector('.akp-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMinimize();
    });
    overlayContainer.querySelector('.close').addEventListener('click', (e) => {
      e.stopPropagation();
      hideOverlay();
    });

    // Restore on click (if minimized)
    overlayContainer.addEventListener('click', (e) => {
      if (overlayContainer.classList.contains('akp-minimized')) {
        toggleMinimize();
      }
    });

    // Handle theme changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        const newTheme = changes.settings.newValue?.theme || 'dark';
        if (overlayContainer) {
          overlayContainer.setAttribute('data-theme', newTheme);
        }
      }
    });

    // Make draggable
    makeDraggable(overlayContainer);

    // Start countdown updates
    startCountdownUpdates();

    isVisible = true;
  }

  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    element.addEventListener('mousedown', (e) => {
      // Allow clicking on buttons/controls without dragging
      if (e.target.closest('button') || e.target.closest('.akp-ctrl-btn')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      element.style.transition = 'none';
      element.style.width = getComputedStyle(element).width;
      element.style.right = 'auto'; // Disable right anchoring
      element.style.left = rect.left + 'px';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = (initialX + dx) + 'px';
      element.style.top = (initialY + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.style.transition = 'opacity 0.2s, transform 0.2s';
      }
    });
  }

  function toggleMinimize() {
    if (!overlayContainer) return;
    overlayContainer.classList.toggle('akp-minimized');
    // When minimized, the whole bubble becomes the drag handle effectively
  }

  function hideOverlay() {
    if (!overlayContainer) return;
    overlayContainer.classList.add('akp-hidden');
    isVisible = false;
    try {
      chrome.runtime.sendMessage({ type: 'OVERLAY_HIDDEN' });
    } catch (e) { }
  }

  function showOverlay() {
    if (!overlayContainer) {
      createOverlay();
    } else {
      overlayContainer.classList.remove('akp-hidden');
      isVisible = true;
    }
  }

  function startCountdownUpdates() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdowns();
    countdownInterval = setInterval(updateCountdowns, 100);
  }

  async function updateCountdowns() {
    if (!overlayContainer || !isVisible) return;
    if (document.hidden) return;

    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (status) {
        if (!currentTabId) {
          const tabInfo = await chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' });
          currentTabId = tabInfo?.tabId;
        }

        actions = (status.actions || []).filter(a =>
          a.instances && a.instances[currentTabId] && a.instances[currentTabId].enabled
        );
        countdowns = status.countdowns || {};
        renderActions();
      }
    } catch (e) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  }

  function renderActions() {
    const list = overlayContainer?.querySelector('.akp-list');
    if (!list) return;

    if (actions.length === 0) {
      list.innerHTML = `
        <div class="akp-empty">No active actions</div>
      `;
      return;
    }

    const now = Date.now();

    list.innerHTML = actions.map(action => {
      const actionCountdowns = countdowns[action.id];
      const tabCountdown = actionCountdowns ? actionCountdowns[currentTabId] : null;
      const remaining = tabCountdown ? Math.max(0, tabCountdown.nextExecution - now) : 0;
      const timeDisplay = formatCountdown(remaining);

      return `
        <div class="akp-item">
          <div class="akp-info-row">
            <span class="akp-key-badge">${getActionIcon(action)}</span>
            <span class="akp-name-text">${escapeHtml(action.name)}</span>
          </div>
          ${timeDisplay}
        </div>
      `;
    }).join('');
  }

  function formatCountdown(ms) {
    if (ms <= 0) {
      return '<span class="akp-timer urgent">NOW</span>';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const isUrgent = totalSeconds < 5;

    if (isUrgent) {
      const seconds = Math.floor(ms / 1000);
      const millis = Math.floor((ms % 1000) / 100);
      return `<span class="akp-timer urgent">${seconds}.${millis}s</span>`;
    } else {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `<span class="akp-timer">${minutes}:${seconds.toString().padStart(2, '0')}</span>`;
    }
  }

  function getActionIcon(action) {
    if (action.type === 'mouse') return '🖱️';
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(action.key)) {
      return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[action.key];
    }
    if (action.key === 'Space') return '␣';
    if (action.key === 'Enter') return '↵';
    return action.key?.charAt(0) || '?';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.type) {
        case 'SHOW_OVERLAY':
          showOverlay();
          sendResponse({ success: true });
          break;
        case 'HIDE_OVERLAY':
          hideOverlay();
          sendResponse({ success: true });
          break;
        case 'TOGGLE_OVERLAY':
          if (isVisible && overlayContainer && !overlayContainer.classList.contains('akp-hidden')) {
            hideOverlay();
          } else {
            showOverlay();
          }
          sendResponse({ success: true, visible: isVisible });
          break;
        default:
          sendResponse({ success: false });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  });

  // Initialize on page load
  function init() {
    console.log('[AKP] Content script init running');
    try {
      // Ask background if overlay should show on THIS specific tab
      chrome.runtime.sendMessage({ type: 'SHOULD_SHOW_OVERLAY' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[AKP] Error:', chrome.runtime.lastError);
          return;
        }
        console.log('[AKP] Should show overlay:', response);
        if (response && response.shouldShow) {
          console.log('[AKP] Creating overlay for this tab...');
          setTimeout(createOverlay, 300);
        }
      });
    } catch (e) {
      console.log('[AKP] Init error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
