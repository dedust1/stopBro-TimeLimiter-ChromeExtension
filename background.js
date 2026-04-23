// StopBro background service worker
// - Daily-limit tracker (existing behaviour, hardened)
// - Countdown feature: per-hostname session timer that blocks on expiry
// - Goal feature: focus session with sticky-note overlay on active tabs

const DEFAULT_SETTINGS = {
    defaultTimeLimit: 15, // minutes
    sites: []
};

let activeTabId = null;
let activeHost = null;
let intervalId = null;

// ---- helpers ----------------------------------------------------------

function hostnameOf(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
        return null;
    }
}

function hostMatches(siteHost, currentHost) {
    if (!siteHost || !currentHost) return false;
    return currentHost === siteHost || currentHost.endsWith('.' + siteHost);
}

function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['settings'], result => {
            resolve(result.settings || DEFAULT_SETTINGS);
        });
    });
}

function saveSettings(settings) {
    return new Promise(resolve => {
        chrome.storage.local.set({ settings }, resolve);
    });
}

// Send a message to every tab whose hostname matches, swallowing errors for
// tabs without a content script.
function broadcastToMatchingTabs(siteHost, message) {
    chrome.tabs.query({}, tabs => {
        (tabs || []).forEach(tab => {
            if (!tab.url || tab.id == null) return;
            const host = hostnameOf(tab.url);
            if (hostMatches(siteHost, host)) {
                chrome.tabs.sendMessage(tab.id, message, () => void chrome.runtime.lastError);
            }
        });
    });
}

function broadcastToAllTabs(message) {
    chrome.tabs.query({}, tabs => {
        (tabs || []).forEach(tab => {
            if (tab.id == null) return;
            chrome.tabs.sendMessage(tab.id, message, () => void chrome.runtime.lastError);
        });
    });
}

// ---- daily-limit tracker (hardened) -----------------------------------

function stopTracking() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    activeTabId = null;
    activeHost = null;
}

async function startTracking(tabId, url) {
    const host = hostnameOf(url);
    if (!host) { stopTracking(); return; }

    const settings = await getSettings();
    const site = (settings.sites || []).find(s => hostMatches(s.url, host));
    if (!site) { stopTracking(); return; }

    if (intervalId) clearInterval(intervalId);
    activeTabId = tabId;
    activeHost = host;
    let lastTick = Date.now();
    let blockedNotified = false;

    // If this tab should already be blocked (daily or countdown), tell it now.
    if ((site.timeSpent || 0) >= site.timeLimit || (site.countdown && site.countdown.expired)) {
        chrome.tabs.sendMessage(tabId, { action: 'showBlockingScreen' }, () => void chrome.runtime.lastError);
        blockedNotified = true;
    }

    intervalId = setInterval(async () => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - lastTick) / 1000);
        if (elapsedSec <= 0) return;
        lastTick = now;

        // Re-read from storage each tick to avoid clobbering popup writes.
        const current = await getSettings();
        const currentSite = (current.sites || []).find(s => hostMatches(s.url, host));
        if (!currentSite) return;

        currentSite.timeSpent = (currentSite.timeSpent || 0);
        currentSite.extraTime = (currentSite.extraTime || 0);

        const limitReached = currentSite.timeSpent >= currentSite.timeLimit;
        if (limitReached) {
            currentSite.extraTime += elapsedSec;
            if (!blockedNotified) {
                blockedNotified = true;
                chrome.tabs.sendMessage(tabId, { action: 'showBlockingScreen' }, () => void chrome.runtime.lastError);
            }
        } else {
            currentSite.timeSpent += elapsedSec;
            if (currentSite.timeSpent >= currentSite.timeLimit && !blockedNotified) {
                blockedNotified = true;
                chrome.tabs.sendMessage(tabId, { action: 'showBlockingScreen' }, () => void chrome.runtime.lastError);
            }
        }
        await saveSettings(current);
    }, 1000);
}

// ---- daily reset ------------------------------------------------------

async function resetTimeSpent() {
    const settings = await getSettings();
    (settings.sites || []).forEach(site => {
        site.timeSpent = 0;
        site.extraTime = 0;
    });
    await saveSettings(settings);
    await new Promise(r => chrome.storage.local.set({ lastResetDate: new Date().toDateString() }, r));
    console.log('[StopBro] Daily counters reset.');
}

async function checkReset() {
    const { lastResetDate } = await new Promise(r => chrome.storage.local.get(['lastResetDate'], r));
    const today = new Date().toDateString();
    if (lastResetDate && lastResetDate !== today) {
        await resetTimeSpent();
    } else if (!lastResetDate) {
        chrome.storage.local.set({ lastResetDate: today });
    }
}

// ---- countdown feature ------------------------------------------------

async function startCountdown(hostname, durationMs) {
    const host = (hostname || '').toLowerCase().replace(/^www\./, '');
    if (!host || !durationMs || durationMs < 1000) return;

    const settings = await getSettings();
    settings.sites = settings.sites || [];
    let site = settings.sites.find(s => s.url === host);
    if (!site) {
        // Create a transient entry for the countdown; use the default daily
        // limit as a ceiling so the site still tracks normally.
        site = {
            url: host,
            timeLimit: (settings.defaultTimeLimit || 15) * 60,
            timeSpent: 0,
            extraTime: 0
        };
        settings.sites.push(site);
    }
    site.countdown = {
        startedAt: Date.now(),
        durationMs: durationMs,
        expired: false
    };
    await saveSettings(settings);

    const alarmName = `countdown:${host}`;
    await new Promise(r => chrome.alarms.clear(alarmName, () => r()));
    chrome.alarms.create(alarmName, { when: Date.now() + durationMs });
}

async function cancelCountdown(hostname) {
    const host = (hostname || '').toLowerCase().replace(/^www\./, '');
    if (!host) return;
    const settings = await getSettings();
    const site = (settings.sites || []).find(s => s.url === host);
    if (site && site.countdown) {
        delete site.countdown;
        await saveSettings(settings);
    }
    chrome.alarms.clear(`countdown:${host}`);
}

async function expireCountdown(hostname) {
    const settings = await getSettings();
    const site = (settings.sites || []).find(s => s.url === hostname);
    if (!site) return;
    site.countdown = site.countdown || {};
    site.countdown.expired = true;
    await saveSettings(settings);
    broadcastToMatchingTabs(hostname, { action: 'showBlockingScreen' });
}

// ---- goal feature -----------------------------------------------------

async function startGoal(text, durationMs) {
    if (!text || !durationMs || durationMs < 1000) return;
    const goal = {
        text: String(text).slice(0, 200),
        startedAt: Date.now(),
        durationMs: durationMs,
        active: true
    };
    await new Promise(r => chrome.storage.local.set({ goal }, r));
    await new Promise(r => chrome.alarms.clear('goal:end', () => r()));
    chrome.alarms.create('goal:end', { when: Date.now() + durationMs });
    broadcastToAllTabs({ action: 'showGoalSticky', goal });
}

async function endGoal() {
    const { goal } = await new Promise(r => chrome.storage.local.get(['goal'], r));
    if (goal) {
        goal.active = false;
        await new Promise(r => chrome.storage.local.set({ goal }, r));
    }
    chrome.alarms.clear('goal:end');
    broadcastToAllTabs({ action: 'hideGoalSticky' });
}

async function expireGoal() {
    const { goal } = await new Promise(r => chrome.storage.local.get(['goal'], r));
    if (!goal) return;
    goal.active = false;
    goal.expired = true;
    await new Promise(r => chrome.storage.local.set({ goal }, r));
    broadcastToAllTabs({ action: 'goalExpired', goal });
}

// ---- message + alarm routing ------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.action) return;

    switch (message.action) {
        case 'settingsUpdated':
            // The settings are already in storage; just re-evaluate the
            // active tab so any newly-added site starts tracking.
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (tabs && tabs[0] && tabs[0].url) {
                    startTracking(tabs[0].id, tabs[0].url);
                }
            });
            sendResponse({ success: true });
            return true;

        case 'closeTab':
            if (sender.tab && sender.tab.id != null) chrome.tabs.remove(sender.tab.id);
            return;

        case 'startCountdown':
            startCountdown(message.hostname, message.durationMs).then(() => sendResponse({ success: true }));
            return true;

        case 'cancelCountdown':
            cancelCountdown(message.hostname).then(() => sendResponse({ success: true }));
            return true;

        case 'startGoal':
            startGoal(message.text, message.durationMs).then(() => sendResponse({ success: true }));
            return true;

        case 'endGoal':
            endGoal().then(() => sendResponse({ success: true }));
            return true;
    }
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (!alarm || !alarm.name) return;
    if (alarm.name === 'dailyReset') {
        checkReset();
        return;
    }
    if (alarm.name === 'goal:end') {
        expireGoal();
        return;
    }
    if (alarm.name.startsWith('countdown:')) {
        expireCountdown(alarm.name.slice('countdown:'.length));
    }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        if (chrome.runtime.lastError || !tab) return;
        if (tab.url) startTracking(tab.id, tab.url);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
        startTracking(tabId, changeInfo.url);
    }
});

chrome.tabs.onRemoved.addListener(tabId => {
    if (tabId === activeTabId) stopTracking();
});

// Boot-time initialisation.
chrome.runtime.onStartup.addListener(() => {
    checkReset();
    chrome.alarms.create('dailyReset', { periodInMinutes: 60 });
});

chrome.runtime.onInstalled.addListener(() => {
    checkReset();
    chrome.alarms.create('dailyReset', { periodInMinutes: 60 });
});

// Run on service-worker wake too, in case neither of the above fire.
checkReset();
chrome.alarms.create('dailyReset', { periodInMinutes: 60 });
