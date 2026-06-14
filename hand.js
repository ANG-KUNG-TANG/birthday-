/**
 * MediaPipe Hands Gesture Recognition Class
 *
 * Reports:
 *  - gesture: 'open' | 'fist' | 'peace' | 'unknown'
 *  - x: normalized horizontal hand position (-1 left ... +1 right)
 *  - y: normalized vertical hand position (-1 up ... +1 down)
 *  - scale: normalized hand size in frame (bigger = closer to camera,
 *           smaller = hand pulled back / further away)
 */
class HandDetector {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.currentGesture = 'unknown';
        this.onGestureChangeCallback = null;
        this.onHandUpdateCallback = null;
        this.onHandLostCallback = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const HandsClass = window.Hands;
            const CameraClass = window.Camera;

            if (typeof HandsClass === 'undefined') {
                reject(new Error('MediaPipe Hands library not loaded'));
                return;
            }

            try {
                this.hands = new HandsClass({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });

                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.6,
                    minTrackingConfidence: 0.5
                });

                this.hands.onResults((results) => this.processResults(results));

                this.startCamera().then(resolve).catch(reject);
            } catch (e) {
                reject(e);
            }
        });
    }

    async startCamera() {
        const videoElement = document.getElementById('video');
        const videoContainer = document.getElementById('video-container');
        const CameraClass = window.Camera;

        if (typeof CameraClass === 'undefined') {
            throw new Error('MediaPipe Camera library not loaded');
        }

        this.camera = new CameraClass(videoElement, {
            onFrame: async () => { await this.hands.send({ image: videoElement }); },
            width: 320,
            height: 240
        });

        await this.camera.start();
        videoContainer.classList.remove('hidden');
    }

    processResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            if (this.onHandLostCallback) this.onHandLostCallback();
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const gesture = this.analyzeGesture(landmarks);
        this.updateGesture(gesture);

        const palmCenter = {
            x: (landmarks[0].x + landmarks[9].x) / 2,
            y: (landmarks[0].y + landmarks[9].y) / 2
        };

        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const lm of landmarks) {
            if (lm.x < minX) minX = lm.x;
            if (lm.x > maxX) maxX = lm.x;
            if (lm.y < minY) minY = lm.y;
            if (lm.y > maxY) maxY = lm.y;
        }
        const scale = Math.max(maxX - minX, maxY - minY);

        if (this.onHandUpdateCallback) {
            this.onHandUpdateCallback({
                gesture,
                x: (palmCenter.x - 0.5) * -2, // mirrored feed -> flip for natural left/right
                y: (palmCenter.y - 0.5) * -2,
                scale
            });
        }
    }

    onHandUpdate(callback) { this.onHandUpdateCallback = callback; }
    onHandLost(callback) { this.onHandLostCallback = callback; }
    onGestureChange(callback) { this.onGestureChangeCallback = callback; }

    /**
     * Classify the hand pose:
     *  - 'open'  : 3+ fingers extended
     *  - 'fist'  : 0-1 fingers extended
     *  - 'peace' : index + middle extended, ring + pinky folded (✌️)
     */
    analyzeGesture(landmarks) {
        const wrist = landmarks[0];
        const tips = [8, 12, 16, 20];
        const joints = [6, 10, 14, 18];

        const extended = tips.map((tip, i) => {
            const tipDist = this.getDist(landmarks[tip], wrist);
            const jointDist = this.getDist(landmarks[joints[i]], wrist);
            return tipDist > jointDist * 1.2;
        });

        const openCount = extended.filter(Boolean).length;
        const isPeace = extended[0] && extended[1] && !extended[2] && !extended[3];

        if (isPeace) return 'peace';
        if (openCount <= 1) return 'fist';
        if (openCount >= 3) return 'open';
        return 'unknown';
    }

    getDist(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    }

    updateGesture(gesture) {
        if (gesture !== this.currentGesture && gesture !== 'unknown') {
            this.currentGesture = gesture;
            if (this.onGestureChangeCallback) this.onGestureChangeCallback(gesture);
        }
    }
}