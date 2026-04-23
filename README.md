
# StopBro - TimeLimiter

Stop Bro is a simple but powerful Chrome extension that helps you stay focused online. Set a time limit for any distracting website — and when your time's up, Stop Bro steps in.

## 🛑 How it works:
- Set a Time Limit: Choose how long you can stay on a specific site.

- "Stop Bro" Popup: Once your limit is reached, a fullscreen popup appears with a blurred background telling you to "Stop bro."

- Continue with Delay: If you insist on staying, you must click "Continue to site", triggering a 10-second "Are you sure bro?" countdown.

- Track Extra Time: The extension records how much extra time you spend after the limit.

## ✨ Features
- Customizable daily time limits for different websites.

- **Countdown**: start a per-session timer for a specific site ("give me 20 minutes on YouTube"). When the timer runs out, the site is blocked for the rest of the day.

- **Focus Goal**: type a task you want to focus on and pick a duration. A draggable sticky-note overlay appears on your active tab with the goal text and a live countdown so it's always in view.

- Simple and clean interface.

- Helps you become more mindful of your time online.

- **Privacy-first**: no analytics, no telemetry, no third-party network calls. The Caveat font used for the sticky note is bundled locally (see `fonts/OFL.txt`).

## 🧭 Countdown usage
1. Open the popup and switch to the **Countdown** tab.
2. The current tab's domain is prefilled; adjust if needed.
3. Choose a duration (minutes) and click **Start Countdown**.
4. While the countdown is running, the popup shows a live `MM:SS` readout. Click **Cancel Countdown** to abort.
5. When the countdown ends, the standard "Stop Bro" blocking overlay appears on that site.

## 🎯 Focus Goal usage
1. Open the popup and switch to the **Goal** tab.
2. Type what you're working on (e.g. "Finish report intro") and set a duration (default 25 min).
3. Click **Start Focus Session**. A yellow sticky note with handwriting-style text appears on your active tab.
4. Drag it around by the header — the position is remembered across page navigations.
5. When time runs out, the sticky note turns green and shows "Time's up!". Click **Dismiss** to close it, or **End Focus Session** in the popup to stop early.

## 🔒 Known issues / backlog
- The cumulative daily tracker loop writes settings once per second; concurrent edits from the popup can be clobbered in rare cases. Planned fix: debounce writes.
- Switching away from a tracked tab to a non-tracked tab pauses the timer silently rather than persisting the elapsed time for the previous tab. Planned fix: flush-on-blur.

## 📦 Installation
1. Download or clone this repository:

`git clone https://github.com/yourusername/stop-bro.git`

2. Open Chrome and go to chrome://extensions/.

3. Enable Developer mode (top right corner).

4. Click Load unpacked and select the stop-bro directory.

5. Start setting limits and stay focused!

## 🛠️ Tech Stack
- HTML
- CSS
- JavaScript
- Chrome Extension APIs

## 📸 Screenshots
![image_alt](https://github.com/talhatak/stopBro-TimeLimiter-ChromeExtension/blob/main/img/c1.PNG?raw=true)
![image_alt](https://github.com/talhatak/stopBro-TimeLimiter-ChromeExtension/blob/main/img/c1.2.PNG?raw=true)
![image_alt](https://github.com/talhatak/stopBro-TimeLimiter-ChromeExtension/blob/main/img/c1.3.PNG?raw=true)
![image_alt](https://github.com/talhatak/stopBro-TimeLimiter-ChromeExtension/blob/main/img/c1.4.PNG?raw=true)

## 📜 License
This project is licensed under the MIT License.

The bundled **Caveat** font (in `fonts/`) is © 2014 The Caveat Project Authors and is licensed under the [SIL Open Font License, Version 1.1](fonts/OFL.txt).
