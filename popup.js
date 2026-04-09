// ---- helpers ----------------------------------------------------------

function normalizeHostname(input) {
    if (!input) return null;
    let raw = input.trim();
    if (!raw) return null;
    // Allow bare hostnames by giving URL() a scheme to parse.
    if (!/^https?:\/\//i.test(raw)) raw = 'http://' + raw;
    try {
        const host = new URL(raw).hostname.toLowerCase();
        return host.replace(/^www\./, '') || null;
    } catch (e) {
        return null;
    }
}

function formatRemaining(ms) {
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimeSpent(timeSpent) {
    const minutes = (timeSpent || 0) / 60;
    return minutes < 1 ? minutes.toFixed(1) : Math.floor(minutes);
}

function setText(el, text) {
    if (el) el.textContent = text;
}

// ---- main -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {

    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(tc => {
                tc.classList.toggle('active', tc.getAttribute('id') === `${tabId}-tab`);
            });
        });
    });

    // Default settings
    let settings = {
        defaultTimeLimit: 15,
        sites: []
    };

    // Holds popup-side tickers so we can clear them on close.
    let countdownTickerId = null;
    let goalTickerId = null;

    // Prefill the countdown host field with the active tab's hostname.
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || tabs.length === 0) return;
        const url = tabs[0].url || '';
        const host = normalizeHostname(url);
        if (host) {
            const countdownHostInput = document.getElementById('countdownHost');
            if (countdownHostInput && !countdownHostInput.value) countdownHostInput.value = host;
        }
    });

    // Fetch saved settings.
    chrome.storage.local.get(['settings', 'lastResetDate', 'goal'], function (result) {
        if (result.settings) {
            settings = result.settings;
            document.getElementById('timeLimit').value = (settings.defaultTimeLimit || 15);
            renderActiveWebsites();
            renderStats();
            updateInsights();
            renderCountdownStatus();
        }

        if (!result.lastResetDate) {
            chrome.storage.local.set({ lastResetDate: new Date().toDateString() });
        }

        renderGoalStatus(result.goal);
    });

    // Live updates from storage (e.g. background flips goal.active to false).
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes.settings) {
            settings = changes.settings.newValue || settings;
            renderActiveWebsites();
            renderStats();
            updateInsights();
            renderCountdownStatus();
        }
        if (changes.goal) {
            renderGoalStatus(changes.goal.newValue);
        }
    });

    // ---- Limits tab -----------------------------------------------------

    function renderActiveWebsites() {
        const siteLists = document.getElementById('active-websites');
        siteLists.innerHTML = '';

        (settings.sites || []).forEach((site, index) => {
            const li = document.createElement('li');
            li.className = 'site-item';

            const urlSpan = document.createElement('span');
            urlSpan.className = 'site-url';
            urlSpan.textContent = site.url; // XSS-safe

            const right = document.createElement('div');
            right.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const timeSpan = document.createElement('span');
            timeSpan.className = 'site-time';
            timeSpan.textContent = `${Math.round((site.timeLimit || 0) / 60)} min`;

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-site';
            delBtn.setAttribute('data-index', String(index));
            delBtn.style.cssText = 'background: none; border: none; cursor: pointer; color: #666;';
            delBtn.setAttribute('aria-label', 'Remove site');
            delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

            right.appendChild(timeSpan);
            right.appendChild(delBtn);
            li.appendChild(urlSpan);
            li.appendChild(right);
            siteLists.appendChild(li);
        });

        document.querySelectorAll('.delete-site').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                settings.sites.splice(index, 1);
                chrome.storage.local.set({ settings }, () => {
                    renderActiveWebsites();
                    renderStats();
                    updateInsights();
                    renderCountdownStatus();
                });
            });
        });
    }

    function updateInsights() {
        const insightsText = document.getElementById('insights-text');
        const totalExtensions = (settings.sites || []).reduce(
            (sum, site) => sum + ((site.extraTime || 0) > 60 ? 1 : 0), 0
        );
        // Use textContent so nothing here is interpolated as HTML.
        insightsText.textContent = '';
        insightsText.appendChild(document.createTextNode("You've extended your time on distracting websites "));
        const count = document.createElement('span');
        count.style.color = '#EF4444';
        count.textContent = String(totalExtensions);
        insightsText.appendChild(count);
        insightsText.appendChild(document.createTextNode(' times today.'));
    }

    function renderStats() {
        const statsList = document.getElementById('stats-list');
        statsList.innerHTML = '';

        (settings.sites || []).forEach(site => {
            const timeLimit = site.timeLimit || 0;
            const timeSpent = site.timeSpent || 0;
            const extraTime = site.extraTime || 0;
            const progressPercent = timeLimit > 0 ? (timeSpent / timeLimit) * 100 : 0;

            const div = document.createElement('div');
            div.className = 'stats-item';

            const inner = document.createElement('div');
            inner.style.width = '100%';

            const label = document.createElement('div');
            label.className = 'stats-label';
            label.textContent = site.url; // XSS-safe

            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-container';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.width = `${Math.min(100, progressPercent)}%`;
            progressContainer.appendChild(progressBar);

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px;';
            const spent = document.createElement('span');
            spent.textContent = `${formatTimeSpent(timeSpent + extraTime)} min`;
            const limit = document.createElement('span');
            limit.textContent = `${Math.round(timeLimit / 60)} min`;
            row.appendChild(spent);
            row.appendChild(limit);

            inner.appendChild(label);
            inner.appendChild(progressContainer);
            inner.appendChild(row);
            div.appendChild(inner);
            statsList.appendChild(div);
        });
    }

    // Add a new site
    document.getElementById('addSite').addEventListener('click', () => {
        const newSiteInput = document.getElementById('newSite');
        const host = normalizeHostname(newSiteInput.value);
        if (!host) {
            alert('Please enter a valid website (e.g. facebook.com).');
            return;
        }
        if ((settings.sites || []).some(site => site.url === host)) {
            alert('This website is already in your list.');
            return;
        }
        const minutes = parseInt(document.getElementById('timeLimit').value, 10) || 15;
        settings.sites = settings.sites || [];
        settings.sites.push({
            url: host,
            timeLimit: minutes * 60,
            timeSpent: 0,
            extraTime: 0
        });
        renderActiveWebsites();
        newSiteInput.value = '';
    });

    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => {
        settings.defaultTimeLimit = parseInt(document.getElementById('timeLimit').value, 10) || 15;
        chrome.storage.local.set({ settings }, function () {
            const saveBtn = document.getElementById('saveSettings');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saved!';
            saveBtn.disabled = true;
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }, 1500);
            renderStats();
            chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
        });
    });

    // ---- Countdown tab --------------------------------------------------

    function renderCountdownStatus() {
        const statusBox = document.getElementById('countdown-status');
        const cancelBtn = document.getElementById('cancelCountdown');
        const startBtn = document.getElementById('startCountdown');

        if (countdownTickerId) {
            clearInterval(countdownTickerId);
            countdownTickerId = null;
        }

        const activeSite = (settings.sites || []).find(s => s.countdown && !s.countdown.expired);

        if (!activeSite) {
            statusBox.classList.add('idle');
            statusBox.textContent = 'No countdown running.';
            cancelBtn.style.display = 'none';
            startBtn.textContent = 'Start Countdown';
            return;
        }

        statusBox.classList.remove('idle');
        cancelBtn.style.display = 'block';
        cancelBtn.setAttribute('data-host', activeSite.url);
        startBtn.textContent = 'Replace Countdown';

        const renderOnce = () => {
            const end = activeSite.countdown.startedAt + activeSite.countdown.durationMs;
            const remaining = end - Date.now();
            statusBox.innerHTML = '';
            const labelRow = document.createElement('div');
            labelRow.className = 'label-row';
            const label = document.createElement('span');
            label.textContent = activeSite.url;
            labelRow.appendChild(label);
            statusBox.appendChild(labelRow);
            const big = document.createElement('div');
            big.className = 'big-time';
            big.textContent = formatRemaining(remaining);
            statusBox.appendChild(big);
            if (remaining <= 0) {
                clearInterval(countdownTickerId);
                countdownTickerId = null;
            }
        };
        renderOnce();
        countdownTickerId = setInterval(renderOnce, 500);
    }

    document.getElementById('startCountdown').addEventListener('click', () => {
        const host = normalizeHostname(document.getElementById('countdownHost').value);
        const minutes = parseInt(document.getElementById('countdownMinutes').value, 10);
        if (!host) { alert('Please enter a valid website.'); return; }
        if (!minutes || minutes < 1) { alert('Please enter a valid duration.'); return; }
        chrome.runtime.sendMessage(
            { action: 'startCountdown', hostname: host, durationMs: minutes * 60 * 1000 },
            () => {
                chrome.storage.local.get(['settings'], (result) => {
                    settings = result.settings || settings;
                    renderActiveWebsites();
                    renderCountdownStatus();
                });
            }
        );
    });

    document.getElementById('cancelCountdown').addEventListener('click', (e) => {
        const host = e.currentTarget.getAttribute('data-host');
        if (!host) return;
        chrome.runtime.sendMessage({ action: 'cancelCountdown', hostname: host }, () => {
            chrome.storage.local.get(['settings'], (result) => {
                settings = result.settings || settings;
                renderCountdownStatus();
            });
        });
    });

    // ---- Goal tab -------------------------------------------------------

    function renderGoalStatus(goal) {
        const statusBox = document.getElementById('goal-status');
        const startBtn = document.getElementById('startGoal');
        const endBtn = document.getElementById('endGoal');

        if (goalTickerId) {
            clearInterval(goalTickerId);
            goalTickerId = null;
        }

        if (!goal || !goal.active) {
            statusBox.classList.add('idle');
            statusBox.textContent = 'No active focus goal.';
            endBtn.style.display = 'none';
            startBtn.textContent = 'Start Focus Session';
            return;
        }

        statusBox.classList.remove('idle');
        endBtn.style.display = 'block';
        startBtn.textContent = 'Replace Focus Goal';

        const renderOnce = () => {
            const end = goal.startedAt + goal.durationMs;
            const remaining = end - Date.now();
            statusBox.innerHTML = '';
            const labelRow = document.createElement('div');
            labelRow.className = 'label-row';
            const label = document.createElement('span');
            label.textContent = goal.text || 'Focus session';
            label.style.fontWeight = '500';
            labelRow.appendChild(label);
            statusBox.appendChild(labelRow);
            const big = document.createElement('div');
            big.className = 'big-time';
            big.textContent = formatRemaining(remaining);
            statusBox.appendChild(big);
            if (remaining <= 0) {
                clearInterval(goalTickerId);
                goalTickerId = null;
            }
        };
        renderOnce();
        goalTickerId = setInterval(renderOnce, 500);
    }

    document.getElementById('startGoal').addEventListener('click', () => {
        const text = document.getElementById('goalText').value.trim();
        const minutes = parseInt(document.getElementById('goalMinutes').value, 10);
        if (!text) { alert('Please enter a focus goal.'); return; }
        if (!minutes || minutes < 1) { alert('Please enter a valid duration.'); return; }
        chrome.runtime.sendMessage(
            { action: 'startGoal', text: text, durationMs: minutes * 60 * 1000 },
            () => {
                chrome.storage.local.get(['goal'], (result) => renderGoalStatus(result.goal));
            }
        );
    });

    document.getElementById('endGoal').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'endGoal' }, () => {
            chrome.storage.local.get(['goal'], (result) => renderGoalStatus(result.goal));
        });
    });

    // Initial render
    renderActiveWebsites();
    renderStats();
});
