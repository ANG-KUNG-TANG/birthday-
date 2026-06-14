/**
 * FLOW — 4 steps
 * ──────────────────────────────────────────────────────────────────
 * Step 1  Show open hand → countdown 3-2-1 → burst →
 *         golden "HAPPY BIRTHDAY LILY" particles
 *
 * Step 2  ✌️ Peace sign → wish panel slides up
 *         ("Things I Like About You" + two answer buttons)
 *         Click either button → panel closes → back to golden HB
 *
 * Step 3  ✊ Fist (hold) → secret heart + secret message
 *         ✌️ Peace again → back to HB
 *
 * Step 4  ✌️ Peace sign (after secret seen) → capture webcam photo
 *         → overlay birthday wish → "THE END" card
 */

let scene, camera, renderer, particleSystem, handDetector;
let clock = new THREE.Clock();
let frameCount = 0, lastTime = 0;

// ── Opening ──────────────────────────────────────────────────────
let openingPhase = 'waiting-for-hand';
let openingTimer = 0;
const OPENING_TIMINGS = { 'countdown-3': 1.0, 'countdown-2': 1.0, 'countdown-1': 1.0, 'burst': 1.4 };

// ── App state ────────────────────────────────────────────────────
// appStep: 'home' | 'wish' | 'secret' | 'done'
let appStep = 'home';
let secretSeen = false;
let finaleDone = false;

// ── Gesture smoothing ────────────────────────────────────────────
const HOLD_FRAMES = 14;
const GESTURE_COOLDOWN = 1400;
let gestureHoldDir = null;
let gestureHoldCount = 0;
let gestureCooldown = false;
let smoothX = 0, smoothY = 0, smoothScale = 0.3;
const EMA = 0.25;

const BG_COLOR = 0x050608;

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    scene.fog = new THREE.FogExp2(BG_COLOR, 0.012);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 6;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    addStarfield();
    addNebula();
    particleSystem = new ParticleSystem(scene);

    handDetector = new HandDetector();
    handDetector.onHandUpdate(handleHandFrame);
    handDetector.onHandLost(() => {
        gestureHoldDir = null;
        gestureHoldCount = 0;
        hideGestureIndicator();
    });

    const insecureContext = !window.isSecureContext;

    try {
        if (insecureContext) {
            throw new Error('Insecure origin: camera blocked (need https or localhost)');
        }
        await handDetector.init();
        setStatus('Gesture control active');
    } catch (e) {
        console.warn('Hand detection unavailable:', e.message || e);
        let reason = 'Tap buttons below';
        if (insecureContext) {
            reason = 'No camera (page not https) — use buttons';
        } else if (e && e.name === 'NotAllowedError') {
            reason = 'Camera permission denied — use buttons';
        } else if (e && e.name === 'NotFoundError') {
            reason = 'No camera found — use buttons';
        } else if (e && /MediaPipe/i.test(e.message || '')) {
            reason = 'Gesture library failed to load — use buttons';
        }
        setStatus('Manual mode');
        document.getElementById('status').style.color = '#ff9900';
        setHint(reason);
        document.getElementById('video-container').classList.add('hidden');
        setupKeyboard();
        showManualControls();
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

// ── Hand router ──────────────────────────────────────────────────
function handleHandFrame(data) {
    if (openingPhase === 'waiting-for-hand') {
        if (data.gesture === 'open') beginCountdown();
        return;
    }
    if (openingPhase !== 'done') return;
    if (finaleDone) return;

    smoothX = smoothX * (1 - EMA) + data.x * EMA;
    smoothY = smoothY * (1 - EMA) + data.y * EMA;
    smoothScale = smoothScale * (1 - EMA) + data.scale * EMA;

    // Gentle drift at home
    if (appStep === 'home' && data.gesture === 'open' && particleSystem.phase === 'idle') {
        particleSystem.setHandOffset(smoothX * 2.5, smoothY * 1.5);
    }

    // Peace sign handling
    if (data.gesture === 'peace') {
        if (appStep === 'home') {
            // Step 2: show wish
            if (!gestureCooldown) triggerStep('wish');
        } else if (appStep === 'wish') {
            // nothing — wait for button click
        } else if (appStep === 'secret') {
            // peace from secret → back home
            if (!gestureCooldown) triggerStep('home');
        }
        gestureHoldDir = null; gestureHoldCount = 0; hideGestureIndicator();
        return;
    }

    if (gestureCooldown) return;

    // Fist hold → secret (only from home or wish)
    let dir = null;
    if (data.gesture === 'fist') dir = 'fist';

    if (dir === gestureHoldDir && dir !== null) {
        gestureHoldCount++;
        showGestureIndicator(dir, gestureHoldCount / HOLD_FRAMES);
        if (gestureHoldCount >= HOLD_FRAMES) {
            if (dir === 'fist' && (appStep === 'home' || appStep === 'wish')) {
                closePanel('wish');
                triggerStep('secret');
            }
            gestureHoldDir = null; gestureHoldCount = 0;
        }
    } else {
        gestureHoldDir = dir;
        gestureHoldCount = dir ? 1 : 0;
        if (!dir) hideGestureIndicator();
    }
}

// ── Opening sequence ─────────────────────────────────────────────
function beginCountdown() {
    openingPhase = 'countdown-3';
    openingTimer = 0;
    setHint('');
}

function tickOpeningSequence(dt) {
    if (openingPhase === 'done' || openingPhase === 'waiting-for-hand') return;
    openingTimer -= dt;
    if (openingTimer > 0) return;

    const phases = Object.keys(OPENING_TIMINGS);
    const idx = phases.indexOf(openingPhase);

    switch (openingPhase) {
        case 'countdown-3': showCountdown('3'); break;
        case 'countdown-2': showCountdown('2'); break;
        case 'countdown-1': showCountdown('1'); break;
        case 'burst':
            showCountdown('');
            particleSystem.explode();
            flashBurst();
            setTimeout(() => particleSystem.setState('home'), 350);
            setTimeout(() => {
                hideOpeningOverlay();
                appStep = 'home';
                openingPhase = 'done';
                setHint('✌️ Peace sign → see the wish');
                showBirthdayDecor();
                if (window.startMusic) window.startMusic();
            }, 1300);
            break;
    }

    const nextPhase = phases[idx + 1];
    if (nextPhase) {
        openingPhase = nextPhase;
        openingTimer = OPENING_TIMINGS[nextPhase];
    }
}

function showCountdown(text) {
    const el = document.getElementById('countdown-number');
    el.textContent = text;
    el.style.opacity = text ? '1' : '0';
    if (text) {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = 'countPulse 0.9s ease-out forwards';
    }
}

function hideOpeningOverlay() {
    const o = document.getElementById('opening-overlay');
    o.style.opacity = '0';
    setTimeout(() => { o.style.display = 'none'; }, 800);
}

function flashBurst() {
    const f = document.getElementById('burst-flash');
    f.style.opacity = '0.85';
    setTimeout(() => { f.style.opacity = '0'; }, 600);
}

// ── Bubbles & decorations ──────────────────────────────────────────
let bubbleSpawnInterval = null;

function showBirthdayDecor() {
    const bubbles = document.getElementById('bubble-layer');
    const decor = document.getElementById('decoration-layer');
    if (bubbles) bubbles.classList.remove('hidden');
    if (decor) decor.classList.remove('hidden');
    startBubbleSpawner();
}

function startBubbleSpawner() {
    if (bubbleSpawnInterval) return;
    const layer = document.getElementById('bubble-layer');
    if (!layer) return;

    const spawnBubble = () => {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        const size = 14 + Math.random() * 46; // 14px - 60px
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';
        bubble.style.left = Math.random() * 100 + 'vw';
        const duration = 9 + Math.random() * 10; // 9s - 19s
        bubble.style.animationDuration = duration + 's';
        bubble.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
        layer.appendChild(bubble);
        setTimeout(() => bubble.remove(), duration * 1000 + 500);
    };

    // Seed a few immediately so it doesn't feel empty
    for (let i = 0; i < 6; i++) setTimeout(spawnBubble, i * 250);

    bubbleSpawnInterval = setInterval(spawnBubble, 600);
}

// ── Step transitions ─────────────────────────────────────────────
function triggerStep(step) {
    if (step === appStep) return;
    appStep = step;
    gestureCooldown = true;
    setTimeout(() => { gestureCooldown = false; updateIdleHint(); }, GESTURE_COOLDOWN);

    if (step === 'home') {
        closePanel('wish');
        closePanel('secret');
        particleSystem.setState('home');
        setHint(secretSeen ? '✌️ Peace → capture photo' : '✌️ Peace sign → see the wish');
    } else if (step === 'wish') {
        particleSystem.setState('wish');
        openPanel('wish');
        setHint('Click a button to answer 💛');
    } else if (step === 'secret') {
        secretSeen = true;
        particleSystem.setState('secret');
        openPanel('secret');
        setHint('✌️ Peace → back to Happy Birthday');
        updateDot('secret');
    } else if (step === 'done') {
        triggerFinale();
    }
}

function updateIdleHint() {
    if (appStep === 'home') {
        setHint(secretSeen ? '✌️ Peace → capture your photo' : '✌️ Peace → wish  |  ✊ Fist → secret');
    }
}

// Called by both answer buttons on the wish panel
window.chooseAnswer = function () {
    closePanel('wish');
    updateDot('wish');
    if (secretSeen) {
        // Step 4: capture
        appStep = 'home';
        triggerStep('done');
    } else {
        // Back to home, hint to find secret
        appStep = 'wish'; // force transition
        triggerStep('home');
        setTimeout(() => setHint('✊ Hold fist → secret message  |  ✌️ Peace → see again'), 1500);
    }
};

// ── Panel helpers ─────────────────────────────────────────────────
function openPanel(id) {
    const el = document.getElementById('panel-' + id);
    if (el) el.classList.add('active');
}
function closePanel(id) {
    const el = document.getElementById('panel-' + id);
    if (el) el.classList.remove('active');
}
function updateDot(id) {
    const dot = document.getElementById('dot-' + id);
    if (dot) dot.classList.add('seen');
}

// ── Gesture indicator ─────────────────────────────────────────────
function showGestureIndicator(dir, progress) {
    const el = document.getElementById('gesture-indicator');
    const fill = document.getElementById('gesture-fill');
    const icons = { fist: '✊', peace: '✌️' };
    el.querySelector('.gesture-icon').textContent = icons[dir] || '';
    fill.style.width = Math.min(progress * 100, 100) + '%';
    el.style.opacity = '1';
}
function hideGestureIndicator() {
    document.getElementById('gesture-indicator').style.opacity = '0';
}

// ── Photo finale ──────────────────────────────────────────────────
function triggerFinale() {
    finaleDone = true;
    particleSystem.setState('final');

    const canvas = document.createElement('canvas');
    const W = 640, H = 480;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const video = document.getElementById('video');
    if (video && video.videoWidth) {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, W, H);
        ctx.restore();
    } else {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#1c1712');
        grad.addColorStop(1, '#050608');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // Gold border
    ctx.strokeStyle = '#FFD27A';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, W - 10, H - 10);

    // Gold ribbon at bottom
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 100, W, 100);

    ctx.fillStyle = '#FFD27A';
    ctx.font = '900 40px serif';
    ctx.textAlign = 'center';
    ctx.fillText('Happy Birthday, Lily 🎉', W / 2, H - 55);

    ctx.fillStyle = '#FFD27A';
    ctx.font = '22px sans-serif';
    ctx.fillText('🎂  ❤️  ✨', W / 2, H - 18);

    document.getElementById('final-photo').src = canvas.toDataURL('image/png');
    setHint('🎉 Happy Birthday, Lily!');

    setTimeout(() => {
        document.getElementById('final-screen').classList.add('active');
    }, 700);
}

// ── Keyboard fallback ─────────────────────────────────────────────
// ── Manual gesture actions (shared by keyboard + on-screen buttons) ──
function manualPeace() {
    if (openingPhase === 'waiting-for-hand') {
        beginCountdown();
        return;
    }
    if (openingPhase !== 'done' || finaleDone) return;
    if (gestureCooldown) return;

    if (appStep === 'home') {
        if (secretSeen) triggerStep('done');
        else triggerStep('wish');
    } else if (appStep === 'secret') {
        triggerStep('home');
    }
}

function manualFist() {
    if (openingPhase !== 'done' || finaleDone) return;
    if (gestureCooldown) return;

    if (appStep === 'home' || appStep === 'wish') {
        closePanel('wish');
        triggerStep('secret');
    }
}

function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'KeyP') manualPeace();
        if (e.code === 'KeyF' || e.code === 'Escape') manualFist();
    });
}

function showManualControls() {
    const el = document.getElementById('manual-controls');
    if (el) el.classList.remove('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────
function setStatus(t) { const el = document.getElementById('status'); if (el) el.textContent = t; }
function setHint(t) { const el = document.getElementById('hand-hint'); if (el) el.textContent = t; }

function addStarfield() {
    const geo = new THREE.BufferGeometry();
    const count = 6000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 120;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffe8a0, size: 0.06, transparent: true, opacity: 0.4 });
    scene.add(new THREE.Points(geo, mat));
}

function addNebula() {
    const geo = new THREE.BufferGeometry();
    const n = 3000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const r = 15 + Math.random() * 25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
        pos[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xFFD27A, size: 0.09, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(geo, mat));
}

// ── Main loop ─────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    tickOpeningSequence(0.016);

    camera.position.x += (Math.sin(time * 0.07) * 0.3 - camera.position.x) * 0.01;
    camera.position.y += (Math.cos(time * 0.05) * 0.2 - camera.position.y) * 0.01;

    if (particleSystem) particleSystem.update(time);

    frameCount++;
    if (performance.now() - lastTime > 1000) {
        document.getElementById('fps').textContent = frameCount;
        frameCount = 0;
        lastTime = performance.now();
    }

    renderer.render(scene, camera);
}

window.onSystemReady = () => {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('particle-count').textContent = particleSystem.config.particleCount.toLocaleString();

    const tapOverlay = document.getElementById('tap-to-begin');
    tapOverlay.classList.remove('hidden');
    tapOverlay.addEventListener('click', () => {
        if (window.primeMusic) window.primeMusic();
        tapOverlay.classList.add('fade-out');
        setTimeout(() => tapOverlay.classList.add('hidden'), 700);
    }, { once: true });
};

init();