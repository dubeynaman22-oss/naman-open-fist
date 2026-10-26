# ✊ Open Fist - Real-Time AI Hand Gesture Classifier

A responsive, sci-fi HUD web application powered by **Google Teachable Machine** and **TensorFlow.js** for classifying hand gestures in real-time using your webcam.

Built around your Teachable Machine starter code, featuring an interactive HUD, dynamic probability bars, synthesized audio feedback, and a kinetic energy orb sandbox.

---

## 🚀 Features

- **Real-Time Webcam Gesture Detection**: Mirror view camera stream with cyber-scanning reticles and live confidence meters.
- **Teachable Machine Integration**:
  - Direct Cloud URL support (`https://teachablemachine.withgoogle.com/models/.../`).
  - Offline / local file drag & drop (`model.json`, `metadata.json`, `weights.bin`) using `tmImage.loadFromFiles()`.
  - Local server path `./my_model/`.
- **Interactive Kinetic Sandbox**: A visual physics orb that swells wide when an **Open Hand** 🖐️ is recognized and condenses tightly when a **Closed Fist** ✊ is formed.
- **Synthesized Audio Feedback**: Built-in Web Audio API feedback producing distinct chime and punch tones upon gesture transition (with mute toggle).
- **Session Stats**: Real-time counter of fists formed, open hands recognized, frame rate (FPS), and hold duration.
- **Simulated Demo Mode**: Test all UI mechanics, audio, and kinetic animations even without a webcam or trained model (shortcuts: `O` for Open, `F` for Fist, `N` for Neutral).

---

## 📦 Getting Started

### 1. Launch with Python Local Server (Recommended)

To avoid browser security restrictions with camera and local file loading:

```powershell
python serve.py
```

This will automatically serve the app at `http://localhost:8000/index.html` and launch your default browser.

---

## 🖐️ Training Your Own Model

1. Visit [Teachable Machine by Google](https://teachablemachine.withgoogle.com/train/image).
2. Create two (or more) classes:
   - **Class 1**: `Open Hand` (hold open hand up in varied angles/lighting)
   - **Class 2**: `Closed Fist` (hold clenched fist in varied angles/lighting)
   - *(Optional)* **Class 3**: `Neutral` / `Background` (no hands)
3. Click **Train Model**.
4. Click **Export Model** → select **TensorFlow.js**.
   - **Option A (Cloud URL)**: Click **Upload my model**, copy the shareable link (e.g. `https://teachablemachine.withgoogle.com/models/xyz/`), and paste it into the **Settings (⚙️)** in Open Fist.
   - **Option B (Download)**: Click **Download**, unzip the files (`model.json`, `metadata.json`, `weights.bin`), and either drag-and-drop them into the **Upload Files** tab in the app or drop them into `my_model/`.

---

## 🛠️ Project Structure

```
open-fist/
├── index.html          # Main application page with camera HUD, panels, and modals
├── styles.css          # Cyberpunk glassmorphism styling & animations
├── app.js              # TensorFlow.js & Teachable Machine logic, audio synth, and state engine
├── serve.py            # Local HTTP server with CORS headers
├── my_model/           # Directory for local model files
│   └── README.md
└── README.md           # Project guide
```

---

## ⌨️ Keyboard Shortcuts (Demo & Testing)

When stream is running:
- <kbd>O</kbd> — Simulate Open Hand gesture
- <kbd>F</kbd> — Simulate Closed Fist gesture
- <kbd>N</kbd> — Simulate Neutral / Idle state
