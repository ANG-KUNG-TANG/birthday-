/**
 * Particle System — golden text birthday experience
 * ALL particles render in warm gold/cream tones.
 */

const vertexShaderSource = `
    uniform float uTime;
    uniform float uParticleScale;
    uniform float uBreathSpeed;
    uniform float uBreathIntensity;

    attribute float aSize;
    attribute vec3 aTargetPosition;
    attribute float aParticleId;

    varying vec3 vColor;
    varying float vOpacity;

    void main() {
        vec3 pos = position;

        float phase = aParticleId * 6.28318 + uTime * uBreathSpeed;
        float breath = 1.0 + sin(phase) * uBreathIntensity;

        pos.x += sin(uTime * 0.5 + aParticleId * 10.0) * 0.04;
        pos.y += cos(uTime * 0.4 + aParticleId * 8.0) * 0.04;
        pos.z += sin(uTime * 0.3 + aParticleId * 12.0) * 0.04;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float distance = length(mvPosition.xyz);

        gl_PointSize = aSize * uParticleScale * (60.0 / distance) * breath;

        // Pure gold palette: deep gold -> bright gold -> champagne
        float t = sin(phase) * 0.5 + 0.5;
        vColor = mix(vec3(1.0, 0.75, 0.1), vec3(1.0, 0.92, 0.55), t);
        vOpacity = 0.55 + sin(phase) * 0.3;

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShaderSource = `
    varying vec3 vColor;
    varying float vOpacity;

    void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        if (dist > 0.5) discard;

        float strength = 1.0 - (dist * 2.0);
        strength = pow(strength, 2.0);

        gl_FragColor = vec4(vColor, strength * vOpacity);
    }
`;

class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.config = {
            particleCount: 20000,
            lerpFactor: 0.05,
            particleScale: 1.2,
            scatterInDuration: 0.65,
            scatterOutDuration: 0.012
        };

        this.points = null;
        this.shapeSets = {};
        this.state = 'pre-home';
        this.phase = 'idle';
        this.pendingState = null;
        this.transitionProgress = 0;
        this.handOffset = new THREE.Vector3(0, 0, 0);
        this.ready = false;
        this.init();
    }

    async init() {
        // Step 1: Happy Birthday
        this.shapeSets.home   = await this.generateTextPoints('HAPPY', 'BIRTHDAY LILY');
        // Step 2: Wish panel (particles show "LILY ❤")
        this.shapeSets.wish   = await this.generateTextPoints('LILY', '❤');
        // Step 3: Secret (heart shape)
        this.shapeSets.secret = this.generateHeartPoints();
        // Step 4: End
        this.shapeSets.final  = await this.generateTextPoints('HAPPY', 'BIRTHDAY ❤');

        const count = this.config.particleCount;
        const positions = new Float32Array(count * 3);
        const targetPositions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const ids = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 8 + Math.random() * 20;
            positions[i * 3]     = Math.cos(angle) * dist;
            positions[i * 3 + 1] = Math.sin(angle) * dist;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
            targetPositions[i * 3]     = positions[i * 3];
            targetPositions[i * 3 + 1] = positions[i * 3 + 1];
            targetPositions[i * 3 + 2] = positions[i * 3 + 2];
            sizes[i] = Math.random() * 1.5 + 0.5;
            ids[i] = Math.random();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aParticleId', new THREE.BufferAttribute(ids, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uParticleScale: { value: this.config.particleScale },
                uBreathSpeed: { value: 0.8 },
                uBreathIntensity: { value: 0.22 }
            },
            vertexShader: vertexShaderSource,
            fragmentShader: fragmentShaderSource,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.points = new THREE.Points(geometry, material);
        this.scene.add(this.points);

        this.ready = true;
        if (window.onSystemReady) window.onSystemReady();
    }

    async generateTextPoints(mainText, subText) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1024;
        canvas.height = 512;

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = canvas.width * 0.9;

        let mainSize = 170;
        do {
            ctx.font = `900 ${mainSize}px serif`;
            if (ctx.measureText(mainText).width <= maxWidth || mainSize <= 40) break;
            mainSize -= 4;
        } while (true);

        let subSize = subText ? 64 : 0;
        if (subText) {
            do {
                ctx.font = `bold ${subSize}px serif`;
                if (ctx.measureText(subText).width <= maxWidth || subSize <= 24) break;
                subSize -= 2;
            } while (true);
        }

        const gap = subText ? 28 : 0;
        const totalHeight = mainSize + (subText ? gap + subSize : 0);
        let y = canvas.height / 2 - totalHeight / 2;

        ctx.font = `900 ${mainSize}px serif`;
        ctx.fillText(mainText, canvas.width / 2, y + mainSize / 2);

        if (subText) {
            y += mainSize + gap;
            ctx.font = `bold ${subSize}px serif`;
            ctx.fillText(subText, canvas.width / 2, y + subSize / 2);
        }

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const points = [];
        const step = 3;

        for (let py = 0; py < canvas.height; py += step) {
            for (let px = 0; px < canvas.width; px += step) {
                const alpha = imgData.data[(px + py * canvas.width) * 4 + 3];
                if (alpha > 100) {
                    points.push(new THREE.Vector3(
                        (px - canvas.width / 2) * 0.018,
                        (canvas.height / 2 - py) * 0.018,
                        (Math.random() - 0.5) * 0.1
                    ));
                }
            }
        }
        return points.length ? points : [new THREE.Vector3(0, 0, 0)];
    }

    generateHeartPoints() {
        const points = [];
        const target = 7000;
        let attempts = 0;
        while (points.length < target && attempts < target * 30) {
            attempts++;
            const x = (Math.random() * 2 - 1) * 1.6;
            const y = (Math.random() * 2 - 1) * 1.5 + 0.3;
            const val = Math.pow(x * x + y * y - 1, 3) - x * x * Math.pow(y, 3);
            if (val <= 0) {
                points.push(new THREE.Vector3(x * 3.2, y * 3.2, (Math.random() - 0.5) * 0.6));
            }
        }
        if (!points.length) points.push(new THREE.Vector3(0, 0, 0));
        return points;
    }

    getRandomPointFromList(list) {
        const p = list[Math.floor(Math.random() * list.length)];
        return p.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        ));
    }

    explode() {
        if (!this.points) return;
        const targetAttrib = this.points.geometry.attributes.aTargetPosition;
        const count = this.config.particleCount;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const dist = 20 + Math.random() * 30;
            targetAttrib.setXYZ(i,
                Math.sin(phi) * Math.cos(angle) * dist,
                Math.sin(phi) * Math.sin(angle) * dist,
                Math.cos(phi) * dist
            );
        }
        targetAttrib.needsUpdate = true;
    }

    setState(newState) {
        if (!this.points || !this.shapeSets[newState]) return;
        if (this.state === newState && this.phase === 'idle') return;
        if (this.pendingState === newState) return;

        this.pendingState = newState;
        if (this.phase === 'idle') this.startScatterOut();
    }

    startScatterOut() {
        this.phase = 'scatter-out';
        this.transitionProgress = 0;
        if (this.points) this.points.position.set(0, 0, 0);
        this.handOffset.set(0, 0, 0);

        const targetAttrib = this.points.geometry.attributes.aTargetPosition;
        const count = this.config.particleCount;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 14 + Math.random() * 22;
            targetAttrib.setXYZ(i,
                Math.cos(angle) * dist,
                Math.sin(angle) * dist,
                (Math.random() - 0.5) * 12
            );
        }
        targetAttrib.needsUpdate = true;
    }

    startScatterIn() {
        const newState = this.pendingState;
        this.pendingState = null;
        this.state = newState;
        this.phase = 'scatter-in';
        this.transitionProgress = 0;

        const shape = this.shapeSets[newState];
        const targetAttrib = this.points.geometry.attributes.aTargetPosition;
        const count = this.config.particleCount;
        for (let i = 0; i < count; i++) {
            const p = this.getRandomPointFromList(shape);
            targetAttrib.setXYZ(i, p.x, p.y, p.z);
        }
        targetAttrib.needsUpdate = true;
    }

    setHandOffset(x, y) {
        this.handOffset.set(x, y, 0);
    }

    update(time) {
        if (!this.points) return;

        this.points.material.uniforms.uTime.value = time;
        const posAttrib = this.points.geometry.attributes.position;
        const targetAttrib = this.points.geometry.attributes.aTargetPosition;
        const count = this.config.particleCount;

        for (let i = 0; i < count; i++) {
            const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
            posAttrib.array[ix] += (targetAttrib.array[ix] - posAttrib.array[ix]) * this.config.lerpFactor;
            posAttrib.array[iy] += (targetAttrib.array[iy] - posAttrib.array[iy]) * this.config.lerpFactor;
            posAttrib.array[iz] += (targetAttrib.array[iz] - posAttrib.array[iz]) * this.config.lerpFactor;
        }
        posAttrib.needsUpdate = true;

        if (this.phase === 'scatter-out') {
            this.transitionProgress += this.config.scatterInDuration * 0.02;
            if (this.transitionProgress >= 1.0) this.startScatterIn();
        } else if (this.phase === 'scatter-in') {
            this.transitionProgress += this.config.scatterOutDuration;
            if (this.transitionProgress >= 1.0) {
                this.phase = 'idle';
                this.transitionProgress = 0;
                if (this.pendingState) this.startScatterOut();
            }
        }

        if (this.phase === 'idle' && this.state === 'home') {
            this.points.position.lerp(this.handOffset, 0.08);
        }
    }
}