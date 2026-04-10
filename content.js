// StopBro content script
// - Blocking overlay when a site's time is up (daily limit or countdown)
// - Goal sticky-note overlay while a focus session is active

let blockingScreenActive = false;
let goalStickyEl = null;
let goalTickerId = null;

// ---- helpers ----------------------------------------------------------

function currentHostname() {
    return window.location.hostname.toLowerCase().replace(/^www\./, '');
}

function hostMatches(siteHost, currentHost) {
    if (!siteHost || !currentHost) return false;
    return currentHost === siteHost || currentHost.endsWith('.' + siteHost);
}

function formatRemaining(ms) {
    if (ms <= 0) return '0:00';
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- boot -------------------------------------------------------------

chrome.storage.local.get(['settings', 'goal', 'goalPosition'], function (result) {
    const settings = result.settings;
    const host = currentHostname();
    if (settings && settings.sites) {
        const site = settings.sites.find(s => hostMatches(s.url, host));
        if (site) {
            const limitHit = (site.timeSpent || 0) >= site.timeLimit;
            const countdownExpired = site.countdown && site.countdown.expired;
            if ((limitHit || countdownExpired) && !blockingScreenActive) {
                showBlockingOverlay();
            }
        }
    }

    if (result.goal && result.goal.active) {
        showGoalSticky(result.goal, result.goalPosition);
    }
});

chrome.runtime.onMessage.addListener(function (message) {
    if (!message || !message.action) return;
    if (message.action === 'showBlockingScreen' && !blockingScreenActive) {
        showBlockingOverlay();
    } else if (message.action === 'showGoalSticky') {
        chrome.storage.local.get(['goalPosition'], r => showGoalSticky(message.goal, r.goalPosition));
    } else if (message.action === 'hideGoalSticky') {
        hideGoalSticky();
    } else if (message.action === 'goalExpired') {
        showGoalExpired(message.goal);
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.goal) {
        const newVal = changes.goal.newValue;
        if (!newVal || !newVal.active) {
            if (newVal && newVal.expired) showGoalExpired(newVal);
            else hideGoalSticky();
        } else {
            chrome.storage.local.get(['goalPosition'], r => showGoalSticky(newVal, r.goalPosition));
        }
    }
});

// ---- blocking overlay (existing feature) ------------------------------

function showBlockingOverlay() {
    blockingScreenActive = true;

    const overlay = document.createElement('div');
    overlay.id = 'stop-bro-overlay';
    overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(15px);
    justify-content: center;
    align-items: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const style = document.createElement('style');
    style.textContent = `
    @keyframes stopBroFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes stopBroSlideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes stopBroPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .stop-bro-button {
      display: block;
      width: 100%;
      padding: 6px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      margin-bottom: 12px;
    }
    .stop-bro-primary { background: #3B82F6; color: white; }
    .stop-bro-primary:hover { background: #2563EB; }
    .stop-bro-secondary { background: rgba(0, 0, 0, 0.05); color: #111827; }
    .stop-bro-secondary:hover { background: rgba(0, 0, 0, 0.1); }
    .stop-bro-progress {
      width: 100%;
      height: 8px;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      margin: 12px 0;
      overflow: hidden;
    }
    .stop-bro-progress-bar { height: 100%; background: #3B82F6; width: 100%; transition: width 1s linear; }
    .stop-bro-modal {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 85%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.2);
      animation: stopBroSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      text-align: center;
    }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.className = 'stop-bro-modal';

    const domain = window.location.hostname;

    const mainContent = document.createElement('div');
    mainContent.id = 'stop-bro-main-content';
    mainContent.innerHTML = `
    <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: stopBroPulse 2s infinite;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    </div>
    <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px; color:rgba(53, 53, 53, 0.91)">Stop Bro</h2>
    <p style="font-size: 16px; color: #4B5563; margin-bottom: 24px;">You've reached your time limit for <span id="stop-bro-domain"></span></p>

    <button id="stop-bro-continue" class="stop-bro-button stop-bro-secondary">Continue to site</button>
    <button id="stop-bro-close" class="stop-bro-button stop-bro-primary">Close this tab</button>
    `;
    // Render the domain via textContent so any exotic characters are safe.
    const domainSpan = mainContent.querySelector('#stop-bro-domain');
    if (domainSpan) domainSpan.textContent = domain;

    const confirmationContent = document.createElement('div');
    confirmationContent.id = 'stop-bro-confirmation';
    confirmationContent.style.display = 'none';
    confirmationContent.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 24px;">
      <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center; margin-right: 12px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div style="text-align: left;">
        <h3 style="font-size: 18px; font-weight: 500; margin-bottom: 4px; color: rgba(53, 53, 53, 0.91);">Are you sure bro?</h3>
        <p style="font-size: 14px; color: #4B5563; margin: 0;">Taking a break might be better for your focus.</p>
      </div>
    </div>

    <div class="stop-bro-progress">
      <div id="stop-bro-countdown-bar" class="stop-bro-progress-bar"></div>
    </div>
    <p id="stop-bro-countdown-text" style="font-size: 12px; color: #6B7280; margin-bottom: 20px; text-align: center;">Will continue in 10 seconds...</p>

    <button id="stop-bro-back" class="stop-bro-button stop-bro-secondary">Go back</button>
    <p style="font-size: 11px; color: #6B7280; margin-top: 8px; text-align: center; font-style: italic;">"A person who lacks purpose distracts themselves with pleasure."</p>
  `;

    modal.appendChild(mainContent);
    modal.appendChild(confirmationContent);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let countdownInterval;
    let countdown = 10;

    function startCountdown() {
        const countdownBar = document.getElementById('stop-bro-countdown-bar');
        const countdownText = document.getElementById('stop-bro-countdown-text');

        countdown = 10;
        countdownBar.style.width = '100%';

        countdownInterval = setInterval(() => {
            countdown--;
            countdownText.textContent = `Will continue in ${countdown} seconds...`;
            countdownBar.style.width = (countdown / 10 * 100) + '%';

            if (countdown <= 0) {
                stopCountdown();
                overlay.style.display = 'none';
            }
        }, 1000);
    }

    function stopCountdown() {
        clearInterval(countdownInterval);
    }

    document.getElementById('stop-bro-close').addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'closeTab' });
    });

    document.getElementById('stop-bro-continue').addEventListener('click', function () {
        mainContent.style.display = 'none';
        confirmationContent.style.display = 'block';
        startCountdown();
    });

    document.getElementById('stop-bro-back').addEventListener('click', function () {
        confirmationContent.style.display = 'none';
        mainContent.style.display = 'block';
        stopCountdown();
    });
}

// ---- goal sticky note --------------------------------------------------

function injectGoalStyles() {
    if (document.getElementById('stop-bro-goal-styles')) return;
    const style = document.createElement('style');
    style.id = 'stop-bro-goal-styles';
    const fontUrl = chrome.runtime.getURL('fonts/Caveat-Regular.woff2');
    style.textContent = `
    @font-face {
      font-family: 'StopBroCaveat';
      src: url('${fontUrl}') format('woff2');
      font-weight: 400;
      font-display: swap;
    }
    #stop-bro-goal-sticky {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 240px;
      min-width: 180px;
      min-height: 120px;
      max-width: 500px;
      max-height: 400px;
      resize: both;
      overflow: hidden;
      background: #FFF8B8;
      color: #333;
      padding: 14px 16px 12px;
      border-radius: 4px;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1);
      transform: rotate(-1.5deg);
      z-index: 2147483646;
      font-family: 'StopBroCaveat', 'Bradley Hand', 'Segoe Print', cursive;
      user-select: none;
      border: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
    }
    #stop-bro-goal-sticky .sbg-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      cursor: grab;
      margin-bottom: 2px;
    }
    #stop-bro-goal-sticky.dragging .sbg-header { cursor: grabbing; }
    #stop-bro-goal-sticky .sbg-grip {
      width: 20px;
      height: 6px;
      border-top: 2px dotted rgba(0, 0, 0, 0.35);
      border-bottom: 2px dotted rgba(0, 0, 0, 0.35);
    }
    #stop-bro-goal-sticky .sbg-timer {
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(0, 0, 0, 0.55);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    #stop-bro-goal-sticky .sbg-goal {
      font-size: 32px;
      line-height: 1.2;
      margin: 8px 0 10px;
      word-wrap: break-word;
      flex: 1;
    }
    #stop-bro-goal-sticky .sbg-done {
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0.25);
      color: #333;
      border-radius: 4px;
      padding: 4px 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      cursor: pointer;
      width: 100%;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    #stop-bro-goal-sticky .sbg-done:hover { background: rgba(0, 0, 0, 0.07); }
    #stop-bro-goal-sticky.sbg-expired { background: #D1FAE5; }
    #stop-bro-goal-sticky.sbg-expired .sbg-timer { color: #047857; }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function showGoalSticky(goal, savedPosition) {
    if (!goal || !goal.active) return;
    hideGoalSticky();
    injectGoalStyles();

    const sticky = document.createElement('div');
    sticky.id = 'stop-bro-goal-sticky';

    const header = document.createElement('div');
    header.className = 'sbg-header';
    const grip = document.createElement('div');
    grip.className = 'sbg-grip';
    const timer = document.createElement('div');
    timer.className = 'sbg-timer';
    timer.textContent = formatRemaining(goal.startedAt + goal.durationMs - Date.now());
    header.appendChild(grip);
    header.appendChild(timer);

    const goalText = document.createElement('div');
    goalText.className = 'sbg-goal';
    goalText.textContent = goal.text || 'Focus session';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'sbg-done';
    doneBtn.type = 'button';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'endGoal' });
    });

    sticky.appendChild(header);
    sticky.appendChild(goalText);
    sticky.appendChild(doneBtn);

    // Restore saved position and size.
    if (savedPosition) {
        if (typeof savedPosition.top === 'number' && typeof savedPosition.left === 'number') {
            sticky.style.top = savedPosition.top + 'px';
            sticky.style.left = savedPosition.left + 'px';
            sticky.style.right = 'auto';
        }
        if (savedPosition.width) sticky.style.width = savedPosition.width + 'px';
        if (savedPosition.height) sticky.style.height = savedPosition.height + 'px';
    }

    (document.body || document.documentElement).appendChild(sticky);
    goalStickyEl = sticky;

    // Live countdown tick.
    if (goalTickerId) clearInterval(goalTickerId);
    const tick = () => {
        const remaining = goal.startedAt + goal.durationMs - Date.now();
        timer.textContent = formatRemaining(remaining);
        if (remaining <= 0) {
            clearInterval(goalTickerId);
            goalTickerId = null;
        }
    };
    tick();
    goalTickerId = setInterval(tick, 500);

    // Persist resize via ResizeObserver.
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const rect = sticky.getBoundingClientRect();
            chrome.storage.local.set({
                goalPosition: {
                    top: Math.round(rect.top),
                    left: Math.round(rect.left),
                    width: sticky.offsetWidth,
                    height: sticky.offsetHeight
                }
            });
        }, 300);
    });
    ro.observe(sticky);

    // Dragging.
    let dragState = null;
    header.addEventListener('pointerdown', (e) => {
        const rect = sticky.getBoundingClientRect();
        dragState = {
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            pointerId: e.pointerId
        };
        sticky.classList.add('dragging');
        header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const left = Math.max(0, Math.min(window.innerWidth - sticky.offsetWidth, e.clientX - dragState.offsetX));
        const top = Math.max(0, Math.min(window.innerHeight - sticky.offsetHeight, e.clientY - dragState.offsetY));
        sticky.style.left = left + 'px';
        sticky.style.top = top + 'px';
        sticky.style.right = 'auto';
    });
    const endDrag = (e) => {
        if (!dragState) return;
        sticky.classList.remove('dragging');
        try { header.releasePointerCapture(dragState.pointerId); } catch (_) {}
        const rect = sticky.getBoundingClientRect();
        chrome.storage.local.set({
            goalPosition: {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                width: sticky.offsetWidth,
                height: sticky.offsetHeight
            }
        });
        dragState = null;
    };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);
}

function hideGoalSticky() {
    if (goalTickerId) {
        clearInterval(goalTickerId);
        goalTickerId = null;
    }
    if (goalStickyEl && goalStickyEl.parentNode) {
        goalStickyEl.parentNode.removeChild(goalStickyEl);
    }
    goalStickyEl = null;
}

function showGoalExpired(goal) {
    injectGoalStyles();
    if (!goalStickyEl) {
        showGoalSticky({ ...goal, active: true });
    }
    if (!goalStickyEl) return;
    goalStickyEl.classList.add('sbg-expired');
    const timerEl = goalStickyEl.querySelector('.sbg-timer');
    if (timerEl) timerEl.textContent = "Time\u2019s up!";
    const doneBtn = goalStickyEl.querySelector('.sbg-done');
    if (doneBtn) {
        doneBtn.textContent = 'Dismiss';
        const newBtn = doneBtn.cloneNode(true);
        doneBtn.parentNode.replaceChild(newBtn, doneBtn);
        newBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'endGoal' });
            hideGoalSticky();
        });
    }
    if (goalTickerId) {
        clearInterval(goalTickerId);
        goalTickerId = null;
    }
}
