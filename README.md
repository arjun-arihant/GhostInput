# GhostInput

> Schedule automated key presses and mouse clicks with advanced timing, multi-tab support, and a sleek modern overlay.

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**GhostInput** is a powerful Chrome extension designed to automate repetitive browser tasks. Whether you're gaming, testing, or performing data entry, this extension allows you to simulate keyboard and mouse inputs at precise intervals across multiple tabs simultaneously.

---

## ✨ Features

- **🎯 Precision Automation**: Simulate any key press or mouse click.
- **⏱️ Flexible Intervals**: Set exact execution times (ms, seconds, minutes).
- **📑 Multi-Tab Support**: Run different actions on different tabs at the same time.
- **🌘 Modern Overlay**: 
  - Ultra-compact, draggable floating widget.
  - Theme-aware (syncs with your Light/Dark settings).
  - Shows real-time countdowns for active actions.
  - Minimizable to a tiny bubble to save screen space.
- **💾 Profiles**: Save and switch between different automation configurations instantly.
- **🎲 Randomization**: Option to randomize intervals for more human-like behavior.
- **🔔 Notifications**: Optional alerts when actions start or stop.

---

## 🚀 Installation

### From Source (Developer Mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ghost-input.git
   ```

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top right toggle).

3. **Load Unpacked**
   - Click **Load unpacked**.
   - Select the `super-extention` folder (or the root directory of this repo).

4. **Pin & Play**
   - Pin the extension icon to your toolbar for easy access.

---

## 📖 Usage Guides

### Creating an Action
1. Open the extension popup.
2. Enter a **Name** for your action (e.g., "Refresh Page").
3. Select the **Trigger Type** (Keyboard or Mouse).
4. Choose the specific **Key** or **Click Type**.
5. Set the **Input Interval** (e.g., every 5 seconds).
6. Click **Add Action**.

### Multi-Tab Instance Management
1. Actions are global by default but must be enabled per tab.
2. In the popup, find your action in the list.
3. Click the **Tabs / Instances** dropdown.
4. Toggle the switch for the *Current Tab* to enable it.
5. Watch the **Overlay** appear on the page to confirm it's running.

### Using the Overlay
- **Drag**: Click and hold anywhere on the widget to move it.
- **Minimize**: Click the `−` button (or the widget itself if minimized) to shrink it to a tiny pill.
- **Track**: See live countdowns for every scheduled event.

---

## 🛠️ Development

### Project Structure
- `manifest.json`: Extension configuration (Manifest V3).
- `popup.html` / `popup.js`: Main user interface.
- `content.js`: In-page logic (Overlay, DOM interaction).
- `background.js`: Service worker for timers and state management.
- `storage.js`: Wrapper for `chrome.storage.local`.

### Permissions Explained
- `storage`: Saving your actions and profiles.
- `activeTab` / `tabs`: Identifying which tab actions should run on.
- `scripting`: Injecting key presses and clicks into web pages.
- `alarms`: Handling precise timing events.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
