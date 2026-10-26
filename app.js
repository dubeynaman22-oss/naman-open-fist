/**
 * Open Fist - Teachable Machine Hand Gesture Application
 * Built on TensorFlow.js & Google Teachable Machine Image API
 */

// Model link: Defaults to local folder, can be overridden by Teachable Machine URL or file upload
let currentModelURL = "./my_model/";
let model = null;
let webcam = null;
let labelContainer = null;
let maxPredictions = 0;

// Application State
let isRunning = false;
let isFlipped = true;
let isDemoMode = false;
let soundEnabled = true;
let animationFrameId = null;

// Gesture Engine & Stats
let currentGesture = "none";
let gestureStartTime = 0;
let fistCount = 0;
let openCount = 0;
let totalFrames = 0;

// FPS Calculation
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;

// Web Audio Context for synthesized sound feedback
let audioCtx = null;

// Kinetic Canvas Orb parameters
let orbRadius = 35;
let targetRadius = 35;
let orbHue = 190;
let particles = [];

// Initialize DOM and Event Listeners
window.addEventListener("DOMContentLoaded", () => {
  labelContainer = document.getElementById("label-container");
  initAudio();
  initSandbox();

  // Sound toggle button
  const soundBtn = document.getElementById("sound-toggle-btn");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      document.getElementById("sound-icon").textContent = soundEnabled ? "🔊" : "🔇";
      showToast(soundEnabled ? "Audio feedback enabled" : "Audio feedback muted");
    });
  }

  // Model config modal toggle
  const configBtn = document.getElementById("config-toggle-btn");
  if (configBtn) {
    configBtn.addEventListener("click", () => toggleConfigModal(true));
  }

  // Keyboard shortcut listener for testing
  window.addEventListener("keydown", (e) => {
    if (!isRunning) return;
    if (e.key === "o" || e.key === "O") simulateGesture("Open Hand", 0.98);
    if (e.key === "f" || e.key === "F") simulateGesture("Closed Fist", 0.98);
    if (e.key === "n" || e.key === "N") simulateGesture("Neutral", 0.95);
  });
});

/**
 * Initialize Web Audio API synthesizer for clean sound effects
 */
function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  } catch (err) {
    console.warn("Web Audio API not supported:", err);
  }
}

/**
 * Play a synthesized sound frequency
 */
function playTone(freq, duration = 0.12, type = "sine") {
  if (!soundEnabled || !audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    console.warn("Tone play error:", err);
  }
}

/**
 * Play specific sound based on detected gesture
 */
function playGestureSound(gestureType) {
  if (gestureType === "open") {
    playTone(660, 0.14, "triangle"); // bright chiming tone
  } else if (gestureType === "fist") {
    playTone(280, 0.16, "sine"); // solid punchy tone
  }
}

/**
 * Main application initializer - loads model and starts webcam stream
 */
async function startApp() {
  if (isRunning) return;

  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  startBtn.disabled = true;

  updateCameraStatus("initializing", "Camera: Initializing...");

  try {
    // If demo mode is active, start webcam without model requirement
    if (isDemoMode) {
      await setupWebcam();
      isRunning = true;
      stopBtn.disabled = false;
      document.querySelector(".hud-scanner").classList.add("scanning");
      updateCameraStatus("active", "Camera: Streaming (Demo)");
      updateModelStatus("active", "Model: Demo Engine");
      window.requestAnimationFrame(loop);
      showToast("Demo mode running! Press 'O' for Open, 'F' for Fist");
      return;
    }

    // Load model if not loaded
    if (!model) {
      updateModelStatus("loading", "Loading Model...");
      const loaded = await loadModel();
      if (!loaded) {
        startBtn.disabled = false;
        updateCameraStatus("idle", "Camera: Idle");
        return;
      }
    }

    // Setup webcam
    await setupWebcam();

    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    document.querySelector(".hud-scanner").classList.add("scanning");
    updateCameraStatus("active", "Camera: Active");

    // Start prediction loop
    window.requestAnimationFrame(loop);
    showToast("Open Fist scanner running");
  } catch (err) {
    console.error("Initialization failed:", err);
    showToast("Failed to start: " + (err.message || err));
    updateCameraStatus("warning", "Camera Error");
    startBtn.disabled = false;
  }
}

/**
 * Stop camera and prediction loop
 */
function stopApp() {
  isRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  if (webcam) {
    try {
      webcam.stop();
    } catch (e) {
      console.warn("Error stopping webcam:", e);
    }
  }

  const container = document.getElementById("webcam-container");
  container.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "webcam-placeholder";
  placeholder.id = "webcam-placeholder";
  placeholder.innerHTML = `
    <div class="placeholder-icon">📷</div>
    <p>Webcam is currently inactive</p>
    <span>Click "Start Stream" below to initialize</span>
  `;
  container.appendChild(placeholder);

  document.querySelector(".hud-scanner").classList.remove("scanning");
  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;

  updateCameraStatus("idle", "Camera: Stopped");
  resetGestureDisplay();
  showToast("Stream stopped");
}

/**
 * Flip webcam mirror view
 */
function toggleFlip() {
  isFlipped = !isFlipped;
  if (isRunning) {
    stopApp();
    setTimeout(() => startApp(), 250);
  }
  showToast(isFlipped ? "Mirror View: ON" : "Mirror View: OFF");
}

/**
 * Setup Teachable Machine Webcam
 */
async function setupWebcam() {
  const container = document.getElementById("webcam-container");
  container.innerHTML = "";

  const width = 400;
  const height = 400;
  webcam = new tmImage.Webcam(width, height, isFlipped);

  await webcam.setup({ facingMode: "user" });
  await webcam.play();

  container.appendChild(webcam.canvas);
}

/**
 * Load Teachable Machine model from URL
 */
async function loadModel(customUrl = null) {
  const urlToUse = customUrl || currentModelURL;
  const modelURL = urlToUse.endsWith("/") ? urlToUse + "model.json" : urlToUse + "/model.json";
  const metadataURL = urlToUse.endsWith("/") ? urlToUse + "metadata.json" : urlToUse + "/metadata.json";

  try {
    updateModelStatus("loading", "Fetching model...");
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    buildLabelContainers(model.getClassLabels());
    updateModelStatus("active", `Model: Loaded (${maxPredictions} Classes)`);
    showToast(`Successfully loaded model with ${maxPredictions} classes`);
    return true;
  } catch (err) {
    console.error("Model load failed:", err);
    updateModelStatus("warning", "Model load failed");
    showToast("Could not load model. Check URL or use Upload/Demo tab.");
    toggleConfigModal(true);
    return false;
  }
}

/**
 * Load model directly from local File objects (model.json, metadata.json, weights.bin)
 */
async function loadModelFromFiles(modelFile, weightsFile, metadataFile) {
  try {
    updateModelStatus("loading", "Loading files...");
    model = await tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
    maxPredictions = model.getTotalClasses();

    buildLabelContainers(model.getClassLabels());
    updateModelStatus("active", `Model: Files Loaded (${maxPredictions} Classes)`);
    showToast("Model loaded successfully from local files!");
    toggleConfigModal(false);
    return true;
  } catch (err) {
    console.error("File load failed:", err);
    updateModelStatus("warning", "Failed to load files");
    showToast("Error loading files: Ensure model.json, metadata.json, and weights.bin are selected.");
    return false;
  }
}

/**
 * Populate #label-container with structure for each class
 */
function buildLabelContainers(classLabels) {
  labelContainer = document.getElementById("label-container");
  labelContainer.innerHTML = "";

  const classCountEl = document.getElementById("class-count");
  if (classCountEl) {
    classCountEl.textContent = `${classLabels.length} Classes`;
  }

  for (let i = 0; i < classLabels.length; i++) {
    const row = document.createElement("div");
    row.className = "prediction-row";
    row.id = `pred-row-${i}`;

    row.innerHTML = `
      <div class="prediction-meta">
        <span class="prediction-label">${classLabels[i]}</span>
        <span class="prediction-val" id="pred-val-${i}">0%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="pred-bar-${i}" style="width: 0%"></div>
      </div>
    `;
    labelContainer.appendChild(row);
  }
}

/**
 * Main animation frame loop
 */
async function loop() {
  if (!isRunning) return;

  if (webcam) {
    webcam.update();
  }

  totalFrames++;
  calculateFps();
  document.getElementById("stat-total-frames").textContent = totalFrames;

  if (!isDemoMode && model && webcam) {
    await predict();
  }

  animationFrameId = window.requestAnimationFrame(loop);
}

/**
 * Run prediction through the Teachable Machine model
 */
async function predict() {
  if (!model || !webcam || !webcam.canvas) return;

  const prediction = await model.predict(webcam.canvas);

  let topClass = "";
  let topProb = -1;
  let topIndex = -1;

  for (let i = 0; i < maxPredictions; i++) {
    const className = prediction[i].className;
    const probability = prediction[i].probability;
    const percentage = (probability * 100).toFixed(1) + "%";

    const valEl = document.getElementById(`pred-val-${i}`);
    const barEl = document.getElementById(`pred-bar-${i}`);
    const rowEl = document.getElementById(`pred-row-${i}`);

    if (valEl) valEl.textContent = percentage;
    if (barEl) barEl.style.width = percentage;

    if (rowEl) {
      rowEl.classList.remove("top-active", "fist-active");
    }

    if (probability > topProb) {
      topProb = probability;
      topClass = className;
      topIndex = i;
    }
  }

  if (topIndex !== -1) {
    const topRow = document.getElementById(`pred-row-${topIndex}`);
    if (topRow) {
      const lowerName = topClass.toLowerCase();
      if (lowerName.includes("open") || lowerName.includes("hand")) {
        topRow.classList.add("top-active");
      } else {
        topRow.classList.add("fist-active");
      }
    }
    classifyGesture(topClass, topProb);
  }
}

/**
 * Classify top predicted class and trigger UI updates and sound effects
 */
function classifyGesture(className, probability) {
  const lower = className.toLowerCase();
  let normalizedType = "unknown";
  let displayTitle = className;
  let emoji = "🖐️";

  if (lower.includes("fist") || lower.includes("closed") || lower.includes("punch")) {
    normalizedType = "fist";
    displayTitle = "Closed Fist";
    emoji = "✊";
  } else if (lower.includes("open") || lower.includes("hand") || lower.includes("palm")) {
    normalizedType = "open";
    displayTitle = "Open Hand";
    emoji = "🖐️";
  } else if (probability < 0.6) {
    normalizedType = "uncertain";
    displayTitle = "Scanning Hand...";
    emoji = "🔎";
  } else {
    normalizedType = "custom";
    displayTitle = className;
    emoji = "✨";
  }

  // Handle gesture change
  if (normalizedType !== currentGesture) {
    currentGesture = normalizedType;
    gestureStartTime = performance.now();

    if (normalizedType === "fist") {
      fistCount++;
      document.getElementById("stat-fist-count").textContent = fistCount;
      playGestureSound("fist");
      targetRadius = 18; // Compress orb
      orbHue = 200;
    } else if (normalizedType === "open") {
      openCount++;
      document.getElementById("stat-open-count").textContent = openCount;
      playGestureSound("open");
      targetRadius = 55; // Expand orb
      orbHue = 155;
    } else {
      targetRadius = 35;
      orbHue = 260;
    }
  }

  // Update duration
  const holdSeconds = ((performance.now() - gestureStartTime) / 1000).toFixed(1);

  // Update UI Elements
  updateGestureUI(displayTitle, emoji, normalizedType, probability, holdSeconds);
}

/**
 * Update the main visual gesture card & webcam badge
 */
function updateGestureUI(title, emoji, type, prob, duration) {
  const card = document.getElementById("gesture-card");
  const heading = document.getElementById("gesture-heading");
  const emojiEl = document.getElementById("gesture-emoji");
  const confText = document.getElementById("confidence-text");
  const durationText = document.getElementById("hold-duration");
  const liveBadge = document.getElementById("live-gesture-badge");
  const badgeIcon = document.getElementById("badge-icon");
  const badgeLabel = document.getElementById("badge-label");

  if (heading) heading.textContent = title;
  if (emojiEl) emojiEl.textContent = emoji;
  if (confText) confText.textContent = `Confidence: ${(prob * 100).toFixed(1)}%`;
  if (durationText) durationText.textContent = `Duration: ${duration}s`;

  if (liveBadge) {
    badgeIcon.textContent = emoji;
    badgeLabel.textContent = title.toUpperCase();
    liveBadge.classList.remove("is-open", "is-fist");
    if (type === "open") liveBadge.classList.add("is-open");
    if (type === "fist") liveBadge.classList.add("is-fist");
  }

  if (card) {
    card.classList.remove("state-open", "state-fist");
    if (type === "open") card.classList.add("state-open");
    if (type === "fist") card.classList.add("state-fist");
  }
}

/**
 * Reset gesture display to default waiting state
 */
function resetGestureDisplay() {
  currentGesture = "none";
  updateGestureUI("No Gesture Detected", "❓", "unknown", 0, "0.0");
  const liveBadge = document.getElementById("live-gesture-badge");
  if (liveBadge) {
    liveBadge.classList.remove("is-open", "is-fist");
    document.getElementById("badge-icon").textContent = "⏳";
    document.getElementById("badge-label").textContent = "WAITING";
  }
}

/**
 * Calculate FPS
 */
function calculateFps() {
  frameCount++;
  const now = performance.now();
  const elapsed = now - lastFrameTime;

  if (elapsed >= 1000) {
    currentFps = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFrameTime = now;
    const fpsEl = document.getElementById("fps-counter");
    if (fpsEl) fpsEl.textContent = currentFps;
  }
}

/**
 * Reset session stats
 */
function resetStats() {
  fistCount = 0;
  openCount = 0;
  totalFrames = 0;
  document.getElementById("stat-fist-count").textContent = "0";
  document.getElementById("stat-open-count").textContent = "0";
  document.getElementById("stat-total-frames").textContent = "0";
  showToast("Session stats reset");
}

/**
 * Status UI Helpers
 */
function updateCameraStatus(state, text) {
  const pill = document.getElementById("camera-status");
  if (!pill) return;
  pill.classList.remove("active", "warning");
  if (state === "active") pill.classList.add("active");
  if (state === "warning") pill.classList.add("warning");
  pill.querySelector(".status-text").textContent = text;
}

function updateModelStatus(state, text) {
  const pill = document.getElementById("model-status");
  if (!pill) return;
  pill.classList.remove("active", "warning");
  if (state === "active") pill.classList.add("active");
  if (state === "warning") pill.classList.add("warning");
  pill.querySelector(".status-text").textContent = text;
}

/**
 * Modal & Tab Management
 */
function toggleConfigModal(show) {
  const modal = document.getElementById("config-modal");
  if (!modal) return;
  if (show) modal.classList.add("open");
  else modal.classList.remove("open");
}

function selectTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add("active");

  const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(
    btn => btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add("active");
}

/**
 * Configuration Action Handlers
 */
async function applyModelUrl() {
  const input = document.getElementById("model-url-input");
  let val = input ? input.value.trim() : "";
  if (!val) {
    showToast("Please enter a valid Teachable Machine URL");
    return;
  }
  if (!val.endsWith("/")) val += "/";
  currentModelURL = val;
  isDemoMode = false;

  const success = await loadModel(currentModelURL);
  if (success) {
    toggleConfigModal(false);
  }
}

function useSampleModel() {
  const input = document.getElementById("model-url-input");
  if (input) {
    input.value = "https://teachablemachine.withgoogle.com/models/o01W8Fj9U/"; // Standard gesture model or placeholder
  }
  showToast("Sample URL set. Click 'Set Model URL' to load.");
}

function useDefaultLocalModel() {
  currentModelURL = "./my_model/";
  isDemoMode = false;
  loadModel(currentModelURL);
  toggleConfigModal(false);
}

/**
 * Handle direct model file selection (.json and .bin)
 */
async function handleModelFiles(event) {
  const files = Array.from(event.target.files);
  const preview = document.getElementById("file-list-preview");
  preview.innerHTML = "";

  let modelFile = null;
  let metadataFile = null;
  let weightsFile = null;

  files.forEach(f => {
    if (f.name === "model.json") modelFile = f;
    else if (f.name === "metadata.json") metadataFile = f;
    else if (f.name.endsWith(".bin")) weightsFile = f;
  });

  const names = files.map(f => f.name).join(", ");
  preview.textContent = `Selected: ${names}`;

  if (modelFile && metadataFile && weightsFile) {
    isDemoMode = false;
    await loadModelFromFiles(modelFile, weightsFile, metadataFile);
  } else {
    showToast("Please select all 3 files: model.json, metadata.json, and weights.bin");
  }
}

/**
 * Demo Mode for testing without any local or remote model
 */
function activateDemoMode() {
  isDemoMode = true;
  toggleConfigModal(false);
  maxPredictions = 2;

  buildLabelContainers(["Open Hand", "Closed Fist"]);
  updateModelStatus("active", "Demo Simulation Mode");
  showToast("Demo Mode active! Click 'Start Stream', then press 'O' or 'F' to simulate gestures.");
}

function simulateGesture(name, prob) {
  const isO = name.toLowerCase().includes("open");
  const rows = [
    { name: "Open Hand", prob: isO ? prob : 1 - prob },
    { name: "Closed Fist", prob: isO ? 1 - prob : prob }
  ];

  rows.forEach((r, idx) => {
    const valEl = document.getElementById(`pred-val-${idx}`);
    const barEl = document.getElementById(`pred-bar-${idx}`);
    if (valEl) valEl.textContent = (r.prob * 100).toFixed(1) + "%";
    if (barEl) barEl.style.width = (r.prob * 100).toFixed(1) + "%";
  });

  classifyGesture(name, prob);
}

/**
 * Toast Notification Utility
 */
let toastTimeout = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

/**
 * Kinetic Response Orb Canvas Sandbox
 */
function initSandbox() {
  const canvas = document.getElementById("sandbox-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Create ambient particles
  for (let i = 0; i < 24; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      angle: (Math.PI * 2 * i) / 24,
      dist: Math.random() * 40 + 20,
      speed: Math.random() * 0.02 + 0.01,
      size: Math.random() * 2.5 + 1.5
    });
  }

  function renderSandbox() {
    ctx.fillStyle = "rgba(3, 7, 18, 0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Smooth radius interpolation
    orbRadius += (targetRadius - orbRadius) * 0.08;

    // Outer Aura Glow
    const gradient = ctx.createRadialGradient(
      centerX, centerY, orbRadius * 0.3,
      centerX, centerY, orbRadius * 1.6
    );
    gradient.addColorStop(0, `hsla(${orbHue}, 90%, 65%, 0.8)`);
    gradient.addColorStop(0.5, `hsla(${orbHue}, 80%, 50%, 0.3)`);
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbRadius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Central Core Orb
    ctx.fillStyle = `hsl(${orbHue}, 100%, 75%)`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbRadius * 0.65, 0, Math.PI * 2);
    ctx.shadowColor = `hsl(${orbHue}, 100%, 60%)`;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Orbiting kinetic particles
    particles.forEach(p => {
      p.angle += p.speed * (currentGesture === "fist" ? 3 : 1);
      const currentDist = p.dist * (orbRadius / 35);
      const px = centerX + Math.cos(p.angle) * currentDist;
      const py = centerY + Math.sin(p.angle) * currentDist;

      ctx.fillStyle = `hsla(${orbHue + 20}, 100%, 80%, 0.75)`;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(renderSandbox);
  }

  requestAnimationFrame(renderSandbox);
}
