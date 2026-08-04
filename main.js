import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COUNT = 18000;
const TOP_TEXT = 'SEBASTIAN V.';
const TOP_RATIO = 0.6;
const TOP_COUNT = Math.floor(COUNT * TOP_RATIO);
const BOT_COUNT = COUNT - TOP_COUNT;

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

const pointLight1 = new THREE.PointLight(0x4488ff, 2, 25);
pointLight1.position.set(-6, 4, 5);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xff5533, 1.5, 25);
pointLight2.position.set(6, -3, 5);
scene.add(pointLight2);

const clock = new THREE.Clock();

const sphereGeo = new THREE.IcosahedronGeometry(0.055, 2);
const material = new THREE.MeshPhysicalMaterial({
    color: 0x99bbff,
    metalness: 0.5,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
});

const mesh = new THREE.InstancedMesh(sphereGeo, material, COUNT);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

const dummy = new THREE.Object3D();
const positions = new Float32Array(COUNT * 3);
const targetPositions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d', { willReadFrequently: true });

function getTextPoints(text, count, fontSize, canvasW, canvasH) {
    textCanvas.width = canvasW;
    textCanvas.height = canvasH;
    textCtx.clearRect(0, 0, canvasW, canvasH);

    textCtx.fillStyle = '#fff';
    textCtx.font = `bold ${fontSize}px Arial, sans-serif`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText(text, canvasW / 2, canvasH / 2);

    const imageData = textCtx.getImageData(0, 0, canvasW, canvasH);
    const pixels = imageData.data;

    const points = [];
    const step = 3;
    for (let y = 0; y < canvasH; y += step) {
        for (let x = 0; x < canvasW; x += step) {
            const i = (y * canvasW + x) * 4;
            if (pixels[i] > 128) {
                points.push({
                    x: (x / canvasW - 0.5) * 14,
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
                (Math.random() - 0.5) * 0.5
            );
        }
    }
    return result;
}

function updateTargets() {
    const inputText = document.getElementById('nameInput').value || ' ';
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

function initColors() {
    for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const isTop = i < TOP_COUNT;
        const t = Math.random();

        if (isTop) {
            colors[i3] = THREE.MathUtils.lerp(0.3, 0.6, t);
            colors[i3 + 1] = THREE.MathUtils.lerp(0.5, 0.7, t);
            colors[i3 + 2] = THREE.MathUtils.lerp(0.9, 1.0, t);
        } else {
            colors[i3] = THREE.MathUtils.lerp(0.5, 0.9, t);
            colors[i3 + 1] = THREE.MathUtils.lerp(0.3, 0.6, t);
            colors[i3 + 2] = THREE.MathUtils.lerp(0.4, 0.8, t);
        }
    }
}

function initPositions() {
    for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * 20;
        positions[i3 + 1] = (Math.random() - 0.5) * 12;
        positions[i3 + 2] = (Math.random() - 0.5) * 10;
    }
}

initColors();
initPositions();
updateTargets();

document.getElementById('nameInput').addEventListener('input', updateTargets);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const color = new THREE.Color();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const tx = targetPositions[i3];
        const ty = targetPositions[i3 + 1];
        const tz = targetPositions[i3 + 2];

        const wave = Math.sin(elapsed * 1.5 + i * 0.005) * 0.03;

        positions[i3] += (tx - positions[i3]) * 0.045;
        positions[i3 + 1] += (ty + wave - positions[i3 + 1]) * 0.045;
        positions[i3 + 2] += (tz - positions[i3 + 2]) * 0.045;

        dummy.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
        const s = 0.85 + Math.sin(elapsed * 2 + i * 0.08) * 0.12;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        color.setRGB(colors[i3], colors[i3 + 1], colors[i3 + 2]);
        mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
}

animate();
