import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let COUNT = 8000;
const TOP_TEXT = 'SEBASTIAN V.';
const TOP_RATIO = 0.6;
const BG_COUNT = 600;

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = false;

scene.add(new THREE.AmbientLight(0x334466, 1.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 5, 10);
scene.add(dirLight);
const pLight1 = new THREE.PointLight(0x4488ff, 2, 25);
pLight1.position.set(-6, 4, 5);
scene.add(pLight1);
const pLight2 = new THREE.PointLight(0xff5533, 1.5, 25);
pLight2.position.set(6, -3, 5);
scene.add(pLight2);

const clock = new THREE.Clock();
const mouse = new THREE.Vector2(9999, 9999);
const mouseWorld = new THREE.Vector3(9999, 9999, 0);
const repulsionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const raycaster = new THREE.Raycaster();

let attractMode = false;
let isExploding = false;
let currentTheme = 'rainbow';

const REPEL_RADIUS = 2.2;
const REPEL_FORCE = 4.5;
const ATTRACT_RADIUS = 4.0;
const ATTRACT_FORCE = 1.5;

const textVertShader = `
    attribute float aSize;
    attribute vec3 aRandom;
    uniform float uTime;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vRandom;

    void main() {
        vColor = color;
        vRandom = aRandom.x;

        vec3 pos = position;
        float dist = length(pos.xy);
        vAlpha = smoothstep(14.0, 6.0, dist) * 0.6 + 0.4;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * uPixelRatio * (60.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const textFragShader = `
    varying vec3 vColor;
    varying float vAlpha;
    varying float vRandom;

    void main() {
        vec2 uv = gl_PointCoord - 0.5;

        float d1 = abs(uv.x) + abs(uv.y);
        float d2 = length(uv);
        float d = min(d1, d2);

        float core = smoothstep(0.35, 0.0, d);
        float armX = smoothstep(0.5, 0.05, abs(uv.x)) * smoothstep(0.18, 0.0, abs(uv.y));
        float armY = smoothstep(0.5, 0.05, abs(uv.y)) * smoothstep(0.18, 0.0, abs(uv.x));
        float sparkle = max(core, max(armX, armY));
        sparkle = pow(sparkle, 1.5);

        gl_FragColor = vec4(vColor, sparkle * vAlpha);
    }
`;

let textGeo, textMaterial, textPoints;
let positions, targetPositions, colors, sizes, randoms;

const bgVertShader = `
    attribute float aSize;
    attribute float aSpeed;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vAlpha;

    void main() {
        vec3 pos = position;
        pos.y += sin(uTime * aSpeed + position.x * 2.0) * 0.3;
        pos.x += cos(uTime * aSpeed * 0.5 + position.y) * 0.2;

        vAlpha = 0.3 + 0.2 * sin(uTime * aSpeed + position.x);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * uPixelRatio * (40.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const bgFragShader = `
    varying float vAlpha;

    void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = 1.0 - smoothstep(0.0, 0.5, d);
        glow = pow(glow, 2.0);
        gl_FragColor = vec4(0.4, 0.5, 0.8, glow * vAlpha);
    }
`;

const bgGeo = new THREE.BufferGeometry();
const bgPos = new Float32Array(BG_COUNT * 3);
const bgSizes = new Float32Array(BG_COUNT);
const bgSpeeds = new Float32Array(BG_COUNT);
for (let i = 0; i < BG_COUNT; i++) {
    bgPos[i * 3] = (Math.random() - 0.5) * 30;
    bgPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    bgPos[i * 3 + 2] = -5 - Math.random() * 15;
    bgSizes[i] = Math.random() * 1.5 + 0.3;
    bgSpeeds[i] = Math.random() * 0.5 + 0.2;
}
bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
bgGeo.setAttribute('aSize', new THREE.BufferAttribute(bgSizes, 1));
bgGeo.setAttribute('aSpeed', new THREE.BufferAttribute(bgSpeeds, 1));

const bgMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: bgVertShader,
    fragmentShader: bgFragShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});

const bgPoints = new THREE.Points(bgGeo, bgMat);
scene.add(bgPoints);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8, 0.4, 0.85
);
composer.addPass(bloomPass);

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d', { willReadFrequently: true });

const palettes = {
    neon: [
        [0.0, 1.0, 1.0], [1.0, 0.0, 1.0], [0.0, 1.0, 0.5],
        [1.0, 1.0, 0.0], [0.5, 0.0, 1.0], [0.0, 0.5, 1.0],
    ],
    pastel: [
        [1.0, 0.7, 0.7], [0.7, 1.0, 0.7], [0.7, 0.7, 1.0],
        [1.0, 1.0, 0.7], [1.0, 0.8, 0.6], [0.8, 0.7, 1.0],
    ],
    mono: [
        [0.5, 0.7, 1.0], [0.6, 0.8, 1.0], [0.4, 0.6, 0.9],
        [0.7, 0.85, 1.0], [0.3, 0.55, 0.85], [0.55, 0.75, 0.95],
    ],
    rainbow: null,
};

function getColor(i, total) {
    if (currentTheme === 'rainbow') {
        const c = new THREE.Color();
        c.setHSL(i / total, 0.7, 0.6);
        return [c.r, c.g, c.b];
    }
    const pal = palettes[currentTheme];
    const base = pal[i % pal.length];
    const variation = (Math.random() - 0.5) * 0.15;
    return [
        THREE.MathUtils.clamp(base[0] + variation, 0, 1),
        THREE.MathUtils.clamp(base[1] + variation, 0, 1),
        THREE.MathUtils.clamp(base[2] + variation, 0, 1),
    ];
}

function initTextParticles() {
    if (textPoints) {
        scene.remove(textPoints);
        textGeo.dispose();
        textMaterial.dispose();
    }

    textGeo = new THREE.BufferGeometry();
    positions = new Float32Array(COUNT * 3);
    targetPositions = new Float32Array(COUNT * 3);
    colors = new Float32Array(COUNT * 3);
    sizes = new Float32Array(COUNT);
    randoms = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
        sizes[i] = Math.random() * 1.5 + 0.5;
        randoms[i * 3] = Math.random();
        randoms[i * 3 + 1] = Math.random();
        randoms[i * 3 + 2] = Math.random();
    }

    const c = getColor(0, 1);
    for (let i = 0; i < COUNT; i++) {
        const ci = getColor(i, COUNT);
        colors[i * 3] = ci[0];
        colors[i * 3 + 1] = ci[1];
        colors[i * 3 + 2] = ci[2];
    }

    textGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    textGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    textGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    textGeo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));

    textMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: renderer.getPixelRatio() },
        },
        vertexShader: textVertShader,
        fragmentShader: textFragShader,
        transparent: true,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    textPoints = new THREE.Points(textGeo, textMaterial);
    scene.add(textPoints);
}

function getTextPoints(text, count, fontSize, canvasW, canvasH) {
    textCtx.font = `bold ${fontSize}px "Google Sans Flex", Arial, sans-serif`;
    const measured = textCtx.measureText(text).width;
    const padding = fontSize * 2;
    const fitW = Math.max(canvasW, measured + padding);

    textCanvas.width = fitW;
    textCanvas.height = canvasH;
    textCtx.clearRect(0, 0, fitW, canvasH);

    textCtx.fillStyle = '#fff';
    textCtx.font = `bold ${fontSize}px "Google Sans Flex", Arial, sans-serif`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText(text, fitW / 2, canvasH / 2);

    const imageData = textCtx.getImageData(0, 0, fitW, canvasH);
    const pixels = imageData.data;

    const points = [];
    const step = 3;
    for (let y = 0; y < canvasH; y += step) {
        for (let x = 0; x < fitW; x += step) {
            const i = (y * fitW + x) * 4;
            if (pixels[i] > 128) {
                points.push({
                    x: (x / fitW - 0.5) * 14,
                    y: -(y / canvasH - 0.5) * 5,
                });
            }
        }
    }

    const result = [];
    for (let i = 0; i < count; i++) {
        if (points.length === 0) {
            result.push((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2);
        } else {
            const p = points[Math.floor(Math.random() * points.length)];
            result.push(
                p.x + (Math.random() - 0.5) * 0.15,
                p.y + (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.8
            );
        }
    }
    return result;
}

function updateTargets() {
    const inputText = document.getElementById('nameInput').value || ' ';
    const TOP_COUNT = Math.floor(COUNT * TOP_RATIO);
    const BOT_COUNT = COUNT - TOP_COUNT;

    const topTargets = getTextPoints(TOP_TEXT, TOP_COUNT, 80, 800, 150);
    const botTargets = getTextPoints(inputText.toUpperCase(), BOT_COUNT, 65, 700, 120);

    for (let i = 0; i < TOP_COUNT; i++) {
        const i3 = i * 3;
        targetPositions[i3] = topTargets[i3];
        targetPositions[i3 + 1] = topTargets[i3 + 1] + 1.8;
        targetPositions[i3 + 2] = topTargets[i3 + 2];
    }

    for (let i = 0; i < BOT_COUNT; i++) {
        const i3 = (TOP_COUNT + i) * 3;
        const b3 = i * 3;
        targetPositions[i3] = botTargets[b3];
        targetPositions[i3 + 1] = botTargets[b3 + 1] - 1.8;
        targetPositions[i3 + 2] = botTargets[b3 + 2];
    }
}

function updateColors() {
    for (let i = 0; i < COUNT; i++) {
        const ci = getColor(i, COUNT);
        colors[i * 3] = ci[0];
        colors[i * 3 + 1] = ci[1];
        colors[i * 3 + 2] = ci[2];
    }
    textGeo.getAttribute('color').needsUpdate = true;
}

function explode() {
    isExploding = true;
    for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const dx = positions[i3] - mouseWorld.x;
        const dy = positions[i3 + 1] - mouseWorld.y;
        const dz = positions[i3 + 2] - mouseWorld.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = 8 + Math.random() * 6;
        positions[i3] += (dx / dist) * force;
        positions[i3 + 1] += (dy / dist) * force;
        positions[i3 + 2] += (dz / dist) * force;
    }
    setTimeout(() => { isExploding = false; }, 2000);
}

document.getElementById('themeSelect').addEventListener('change', (e) => {
    currentTheme = e.target.value;
    updateColors();
});

document.getElementById('countSlider').addEventListener('input', (e) => {
    COUNT = parseInt(e.target.value);
    initTextParticles();
    updateTargets();
});

document.getElementById('attractionBtn').addEventListener('click', () => {
    attractMode = !attractMode;
    document.getElementById('attractionBtn').textContent = attractMode ? 'Modo: Atraccion' : 'Modo: Repulsion';
});

document.getElementById('nameInput').addEventListener('input', updateTargets);

document.getElementById('screenshotBtn').addEventListener('click', () => {
    composer.render();
    const link = document.createElement('a');
    link.download = 'particle-text.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    textMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    bgMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
});

canvas.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(repulsionPlane, mouseWorld);
});

canvas.addEventListener('mouseleave', () => {
    mouseWorld.set(9999, 9999, 0);
});

let mouseDownPos = { x: 0, y: 0 };
canvas.addEventListener('mousedown', (e) => {
    mouseDownPos.x = e.clientX;
    mouseDownPos.y = e.clientY;
});

canvas.addEventListener('mouseup', (e) => {
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
        explode();
    }
});

const _diff = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    textMaterial.uniforms.uTime.value = elapsed;
    bgMat.uniforms.uTime.value = elapsed;

    for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const tx = targetPositions[i3];
        const ty = targetPositions[i3 + 1];
        const tz = targetPositions[i3 + 2];

        let finalX = tx;
        let finalY = ty;
        let finalZ = tz;

        if (!isExploding) {
            _diff.set(
                positions[i3] - mouseWorld.x,
                positions[i3 + 1] - mouseWorld.y,
                positions[i3 + 2] - mouseWorld.z
            );
            const dist = _diff.length();

            if (attractMode) {
                if (dist < ATTRACT_RADIUS && dist > 0.1) {
                    const norm = _diff.clone().normalize().multiplyScalar(-1);
                    const force = (1 - dist / ATTRACT_RADIUS) * ATTRACT_FORCE;
                    finalX += norm.x * force;
                    finalY += norm.y * force;
                    finalZ += norm.z * force;
                }
            } else {
                if (dist < REPEL_RADIUS && dist > 0.001) {
                    const force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
                    _diff.normalize().multiplyScalar(force);
                    finalX += _diff.x;
                    finalY += _diff.y;
                    finalZ += _diff.z;
                }
            }
        }

        const wave = Math.sin(elapsed * 1.5 + i * 0.005) * 0.03;

        positions[i3] += (finalX - positions[i3]) * 0.06;
        positions[i3 + 1] += (finalY + wave - positions[i3 + 1]) * 0.06;
        positions[i3 + 2] += (finalZ - positions[i3 + 2]) * 0.06;
    }

    textGeo.getAttribute('position').needsUpdate = true;
    controls.update();
    composer.render();
}

document.fonts.ready.then(() => {
    initTextParticles();
    updateTargets();
    animate();
});
