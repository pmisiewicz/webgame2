import * as THREE from "three";
import {type GLTF, GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {acceleratedRaycast, MeshBVH} from "three-mesh-bvh";

import runningSoundUrl from "/src/sfx/running-in-grass-6237.mp3";
import waterSoundUrl from "/src/sfx/walking-in-water-199418.mp3";
import bumpSoundUrl from "/src/sfx/boing2-418548.mp3";
import forestAtmosphereUrl from "/src/sfx/forest-atmosphere-001localization-poland-329745.mp3";
import animalHitSoundUrl from "/src/sfx/zombie-bite-96528.mp3";
import errorSoundUrl from "/src/sfx/wrong-answer-21-199825.mp3";
import waterSplashSoundUrl from "/src/sfx/water-splash-02-352021.mp3";
import successSoundUrl from "/src/sfx/success-340660.mp3";
import beeFlyingSoundUrl from "/src/sfx/bee-flying-loop-42287.mp3";
import fireworkSoundUrl from "/src/sfx/firework.mp3";

// --- CONSTANTS ---

const isMobile = window.matchMedia('(pointer: coarse)').matches;

// Scene
const skyColor = 0x87ceeb;
const FOG_NEAR = 50;
const FOG_FAR = 150;

// Game
const TOTAL_EQUATIONS_TO_SOLVE = 10;
const TOTAL_CRYSTALS = TOTAL_EQUATIONS_TO_SOLVE;

// Player
const RUN_SPEED = 1.2;
const WALK_SPEED = 0.6;
const rotationSpeed = 0.035;
const MAX_STEP_HEIGHT = 1;
const WATER_SINK_DEPTH = -0.4;
const COLLISION_RADIUS = 0.8;
const JUMP_FORCE = 10;
const JUMP_GRAVITY = -30;
const MAX_JUMPS = 2;

// Spiders
const SPIDER_DETECTION_RANGE = 10;
const SPIDER_CHASE_SPEED = 0.05;
const SPIDER_WANDER_SPEED = 0.02;
const SPIDER_COLLISION_RADIUS = 0.6;
const SPIDER_JUMP_BACK_DISTANCE = 2;
const SPIDER_JUMP_BACK_DURATION = 0.5;

// Bees
const BEE_DETECTION_RANGE = 12;
const BEE_CHASE_SPEED = 0.06;
const BEE_WANDER_SPEED = 0.03;
const BEE_COLLISION_RADIUS = 0.7;
const BEE_SPAWN_ALTITUDE = 3.0;
const BEE_MIN_ALTITUDE = 1.0;
const BEE_BASE_WANDER_ALTITUDE = 3.0;
const BEE_WANDER_RANGE = 20.0;
const BEE_ATTACK_TRIGGER_DISTANCE = 2.0;
const BEE_ATTACK_DASH_DURATION = 0.3;
const BEE_ATTACK_COOLDOWN = 1.5;

// Particles
const SPLASH_PARTICLE_COUNT = 16;
const SPLASH_LIFESPAN = 1;
const SPLASH_COLOR = 0x6FBFC9;
const SPLASH_EMISSION_RATE = 0.15;
const BIG_SPLASH_PARTICLE_COUNT = 150;
const BIG_SPLASH_SPREAD = 1.5;
const BIG_SPLASH_VELOCITY_MULTIPLIER = 2.5;
const CRYSTAL_PARTICLE_COUNT = 100;
const CRYSTAL_LIFESPAN = 0.8;
const CRYSTAL_PARTICLE_SPEED = 5;
const CRYSTAL_COLLECT_RADIUS = 1.5;
const GRAVITY = -9.8 * 0.5;

// UI
const MINIMAP_SIZE = isMobile ? 120 : 250;
const UI_CRYSTAL_SIZE = isMobile ? 20 : 50;
const UI_CRYSTAL_CAM_HEIGHT = 3.0;
const UI_CRYSTAL_SCALE = 0.3;

// Performance
const FPS_LIMIT = 60;
const interval = 1000 / FPS_LIMIT;

// --- CORE THREE.JS SETUP ---

const scene = new THREE.Scene();
scene.background = new THREE.Color(skyColor);
scene.fog = new THREE.Fog(skyColor, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.5,
    FOG_FAR,
);
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();
const loader = new GLTFLoader();

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// --- GAME STATE & HELPERS ---

// Input
const keys: { [key: string]: boolean } = {};
let controlsLocked: boolean = false;

// Entity Arrays
const worldObjects: THREE.Mesh[] = [];
const clouds: THREE.Group[] = [];
const animals: THREE.Group[] = [];
const crystals: THREE.Group[] = [];

// Player
let playerModel: THREE.Group | null = null;
let playerHeight = 1;
let mixer: THREE.AnimationMixer | null = null;
let runAction: THREE.AnimationAction | null = null;
let walkAction: THREE.AnimationAction | null = null;
let fallAction: THREE.AnimationAction | null = null;
let jumpAction: THREE.AnimationAction | null = null;

// Player State
let moveSpeed = RUN_SPEED;
let isJumping = false;
let jumpVelocity = 0;
let jumpAnimationPlayed = false;
let wasJumping = false;
let jumpsRemaining = MAX_JUMPS;
let bumpSoundPlayed = false;

// Audio References
let runningSound: THREE.PositionalAudio | null = null;
let waterSound: THREE.PositionalAudio | null = null;
let bumpSound: THREE.PositionalAudio | null = null;
let biteSound: THREE.PositionalAudio | null = null;
let errorSound: THREE.PositionalAudio | null = null;
let waterSplashSound: THREE.PositionalAudio | null = null;
let backgroundMusic: THREE.Audio | THREE.PositionalAudio;
let successSound: THREE.Audio | THREE.PositionalAudio;
let fireworkBuffer: AudioBuffer | null = null;

// Game Logic
let collectedCrystals = 0;
let currentTargetNumber: number = 0;
let currentEquation: string = "";

// Helpers
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

// Performance
let then = performance.now();
let fpsElement: HTMLElement | null = null;
let frameCount = 0;
let lastTime = performance.now();
const fpsInterval = 1000;

// Loading
let totalLoadingSteps = 0;
let completedLoadingSteps = 0;
let loadingHideScheduled = false;

// --- ENTITY INTERFACES ---

interface AnimalInstance {
    model: THREE.Group;
    mixer: THREE.AnimationMixer | null;
    action: THREE.AnimationAction | null;
    deathAction: THREE.AnimationAction | null;
    isPlayingDeath: boolean;
    allowedAnimations: THREE.AnimationClip[];
    walkAnimation: THREE.AnimationClip | null;
    nextAnimationChangeTime: number;
    isWalking: boolean;
    walkEndTime: number;
    moveSpeed: number;
}

const animalInstances: AnimalInstance[] = [];
const animalModels = [
    "Alpaca.gltf", "Deer.gltf", "Fox.gltf", "Horse.gltf",
    "Horse_White.gltf", "Husky.gltf", "ShibaInu.gltf", "Stag.gltf", "Wolf.gltf"
];

interface SpiderInstance {
    model: THREE.Group;
    mixer: THREE.AnimationMixer | null;
    walkAction: THREE.AnimationAction | null;
    attackAction: THREE.AnimationAction | null;
    isChasing: boolean;
    moveSpeed: number;
    isAttacking: boolean;
    isJumpingBack: boolean;
    jumpBackStartTime: number;
    jumpBackDuration: number;
    jumpBackStartPos: THREE.Vector3 | null;
    jumpBackEndPos: THREE.Vector3 | null;
}

const spiders: SpiderInstance[] = [];

interface BeeInstance {
    model: THREE.Group;
    mixer: THREE.AnimationMixer | null;
    flyAction: THREE.AnimationAction | null;
    attackAction: THREE.AnimationAction | null;
    flySound: THREE.PositionalAudio | null;
    isChasing: boolean;
    moveSpeed: number;
    baseAltitude: number;
    wanderTarget: THREE.Vector3 | null;
    isAttacking: boolean;
    lastAttackTime: number;
    attackStartTime: number;
    attackStartPos: THREE.Vector3 | null;
    attackEndPos: THREE.Vector3 | null;
    isRetreating: boolean;
    retreatEndTime: number;
}

const bees: BeeInstance[] = [];

interface SplashParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    age: number;
    maxAge: number;
}

const particleData: SplashParticle[] = [];
const particleGeometry = new THREE.SphereGeometry(0.05, 4, 4);
const particleMaterial = new THREE.MeshBasicMaterial({
    color: SPLASH_COLOR,
    transparent: true,
    opacity: 1,
    depthWrite: false
});
let lastSplashTime = 0;

// --- MINIMAP SETUP ---

const minimapRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
minimapRenderer.setSize(MINIMAP_SIZE, MINIMAP_SIZE);
minimapRenderer.domElement.style.position = 'absolute';
if (isMobile) {
    minimapRenderer.domElement.style.top = '20px';
} else {
    minimapRenderer.domElement.style.bottom = '20px';
}
minimapRenderer.domElement.style.right = '20px';
minimapRenderer.domElement.style.border = '3px solid #333';
minimapRenderer.domElement.style.borderRadius = '10px';
minimapRenderer.domElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
minimapRenderer.domElement.style.zIndex = '1000';
document.body.appendChild(minimapRenderer.domElement);

const minimapScene = new THREE.Scene();
minimapScene.background = new THREE.Color(0x87ceeb);

const minimapCamera = new THREE.OrthographicCamera(
    -75, 75, 75, -75, 1, 500
);
minimapCamera.position.set(0, 200, 0);
minimapCamera.lookAt(0, 0, 0);

const minimapLight = new THREE.DirectionalLight(0xffffff, 1);
minimapLight.position.set(0, 50, 0);
minimapScene.add(minimapLight);
const minimapAmbient = new THREE.AmbientLight(0xffffff, 0.2);
minimapScene.add(minimapAmbient);

let minimapWorldModel: THREE.Group | null = null;
const minimapPlayerArrow = new THREE.Mesh(
    new THREE.ConeGeometry(3, 8, 8),
    new THREE.MeshBasicMaterial({color: 0xffffff})
);
minimapPlayerArrow.rotation.x = Math.PI / 2;

// Wrap arrow in a group so we can rotate on Y axis properly
const minimapPlayerMarker = new THREE.Group();
minimapPlayerMarker.add(minimapPlayerArrow);
minimapPlayerMarker.position.y = 50;
minimapScene.add(minimapPlayerMarker);

const minimapSpiderMarkers: THREE.Mesh[] = [];
const minimapBeeMarkers: THREE.Mesh[] = [];
const minimapCrystalMarkers: THREE.Mesh[] = [];

// --- UI STATE ---

let uiCrystalRenderer: THREE.WebGLRenderer | null = null;
let uiCrystalScene: THREE.Scene | null = null;
let uiCrystalCamera: THREE.OrthographicCamera | null = null;
let uiCrystalTemplate: THREE.Group | null = null;
const uiCrystalModels: THREE.Group[] = [];
let uiCrystalCountElement: HTMLElement | null = null;

let equationElement: HTMLElement | null = null;

// --- MAIN LIGHTING ---

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2);
hemiLight.position.set(0, 100, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 25, 50);
dirLight.target.position.set(0, 0, 0);
dirLight.castShadow = true;
const shadowSize = 25;
dirLight.shadow.camera.left = -shadowSize;
dirLight.shadow.camera.right = shadowSize;
dirLight.shadow.camera.top = shadowSize;
dirLight.shadow.camera.bottom = -shadowSize;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = FOG_FAR;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);
scene.add(dirLight.target);

// --- HELPER FUNCTIONS ---

function clearAllKeys() {
    for (const k in keys) {
        if (Object.prototype.hasOwnProperty.call(keys, k)) keys[k] = false;
    }
}

function isWaterSurface(object: THREE.Object3D): boolean {
    const mesh = object as THREE.Mesh;
    if (mesh.material && "color" in mesh.material) {
        const materialColor = (mesh.material as THREE.MeshStandardMaterial).color;
        return materialColor.getHex() === 0x00bfd4 || materialColor.getHex() === 0x81dfeb;
    }
    return false;
}

function getGroundIntersection(position: THREE.Vector3, raycastHeight: number = 10): THREE.Intersection | null {
    const groundCheckOrigin = position.clone();
    groundCheckOrigin.y += raycastHeight;
    const downVector = new THREE.Vector3(0, -1, 0);

    raycaster.set(groundCheckOrigin, downVector);
    const groundIntersects = raycaster.intersectObjects(worldObjects, true);

    if (groundIntersects.length > 0) {
        return groundIntersects[0];
    }
    return null;
}

async function createAudioFromUrl(
    url: string,
    isPositional: boolean,
    listener: THREE.AudioListener,
    options: { loop?: boolean; volume?: number; refDistance?: number } = {}
): Promise<THREE.Audio | THREE.PositionalAudio> {
    try {
        const buffer = await audioLoader.loadAsync(url);
        const audio = isPositional
            ? new THREE.PositionalAudio(listener)
            : new THREE.Audio(listener);

        audio.setBuffer(buffer);
        if (options.loop !== undefined) audio.setLoop(options.loop);
        if (options.volume !== undefined) audio.setVolume(options.volume);
        if (isPositional && options.refDistance !== undefined) {
            (audio as THREE.PositionalAudio).setRefDistance(options.refDistance);
        }
        return audio;
    } catch (err) {
        console.error(`Error loading audio from ${url}:`, err);
        throw err;
    }
}

interface SpawnOptions {
    areaSize: number;
    spawnAttempts?: number;
    minDistanceFromPlayer?: number;
    playerStartPos?: THREE.Vector3;
    raycastStartY?: number;
    allowWater?: boolean;
    considerWaterHeight?: boolean;
    waterHeightThreshold?: number;
    clearanceHeight?: number;
    clearanceOriginOffset?: number;
    maxGroundY?: number;
    minSlopeDot?: number;
    requireSlopeCheck?: boolean;
    requireClearance?: boolean;
}

function findValidGroundPosition(opts: SpawnOptions): {
    position: THREE.Vector3;
    groundY: number;
    hitObject: THREE.Mesh
} | null {
    const {
        areaSize,
        spawnAttempts = 100,
        minDistanceFromPlayer,
        playerStartPos,
        raycastStartY = 50,
        allowWater = false,
        considerWaterHeight = true,
        waterHeightThreshold = 0.5,
        clearanceHeight = 3.0,
        clearanceOriginOffset = 0.1,
        maxGroundY = Infinity,
        minSlopeDot = 0.85,
        requireSlopeCheck = true,
        requireClearance = true,
    } = opts;

    for (let attempts = 0; attempts < spawnAttempts; attempts++) {
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;

        if (minDistanceFromPlayer && playerStartPos) {
            const spawnPos2D = new THREE.Vector3(x, 0, z);
            if (spawnPos2D.distanceTo(playerStartPos) < minDistanceFromPlayer) {
                continue;
            }
        }

        const origin = new THREE.Vector3(x, 0, z);
        const intersect = getGroundIntersection(origin, raycastStartY);
        if (!intersect) continue;

        const groundY = intersect.point.y;
        const hitObject = intersect.object as THREE.Mesh;

        const isWater = isWaterSurface(hitObject) || (considerWaterHeight && groundY < waterHeightThreshold);
        if (!allowWater && isWater) continue;

        if (requireSlopeCheck) {
            const face = intersect.face;
            if (face) {
                const worldNormal = face.normal.clone().applyMatrix3(
                    new THREE.Matrix3().getNormalMatrix(hitObject.matrixWorld)
                ).normalize();
                const slopeDot = worldNormal.dot(new THREE.Vector3(0, 1, 0));
                if (slopeDot < minSlopeDot) {
                    continue;
                }
            }
        }

        if (requireClearance && clearanceHeight > 0) {
            const clearanceOrigin = intersect.point.clone();
            clearanceOrigin.y += clearanceOriginOffset;
            const upRay = new THREE.Vector3(0, 1, 0);
            raycaster.set(clearanceOrigin, upRay);
            raycaster.far = clearanceHeight;
            const clearanceIntersects = raycaster.intersectObjects(worldObjects, true);
            raycaster.far = Infinity;
            const hasClearance = clearanceIntersects.length === 0;
            if (!hasClearance) continue;
        }

        if (groundY >= maxGroundY) continue;

        return {position: new THREE.Vector3(x, groundY, z), groundY, hitObject};
    }
    return null;
}

async function loadModel(
    name: string,
): Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }> {
    return new Promise((resolve, reject) => {
        loader.load(
            `/models/${name}`,
            (gltf: GLTF) => {
                const model = gltf.scene;
                model.traverse((child: THREE.Object3D) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                    }
                });
                resolve({model, animations: gltf.animations});
            },
            undefined,
            (err: unknown) => reject(err),
        );
    });
}

function isMesh(child: THREE.Object3D): child is THREE.Mesh {
    return (child as THREE.Mesh).isMesh && 'geometry' in child;
}

// --- LOADING & UI FUNCTIONS ---

function setupFpsCounter() {
    fpsElement = document.createElement('div');
    fpsElement.id = 'fps-counter';
    fpsElement.textContent = 'FPS: --';
    document.body.appendChild(fpsElement);
}

function setupLoadingBar() {
    const container = document.createElement('div');
    container.id = 'loading-container';
    document.body.appendChild(container);

    const panel = document.createElement('div');
    panel.id = 'loading-panel';
    panel.innerHTML = `
        <div id="controls-info">
            <div class="controls-title">Sterowanie</div>
            <div><strong>⬆️ lub W</strong> - przód</div>
            <div><strong>⬇️ lub S</strong> - tył</div>
            <div><strong>⬅️ lub A</strong> - lewo</div>
            <div><strong>➡️ lub D</strong> - prawo</div>
            <div><strong>Spacja</strong> - skok</div>
            <div><strong>Shift</strong> - sprint</div>
        </div>
        
        <div id="loading-text">Ładowanie...</div>

        <div id="loading-bar-bg">
            <div id="loading-bar-fill"></div>
        </div>

        <div id="loading-percentage">0%</div>
    `;
    container.appendChild(panel);
}


function setupCrystalUI() {
    const container = document.createElement('div');
    container.id = 'crystal-ui-container';
    container.style.position = 'absolute';
    container.style.bottom = '20px';
    container.style.left = '20px';
    container.style.zIndex = '1000';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    container.style.padding = '5px 10px';
    container.style.borderRadius = '10px';
    document.body.appendChild(container);

    uiCrystalCountElement = document.createElement('span');
    uiCrystalCountElement.id = 'crystal-count-text';
    uiCrystalCountElement.textContent = `0 / ${TOTAL_EQUATIONS_TO_SOLVE}`;
    uiCrystalCountElement.style.color = 'white';
    uiCrystalCountElement.style.fontSize = '24px';
    uiCrystalCountElement.style.marginRight = '12px';
    container.appendChild(uiCrystalCountElement);

    const rendererWidth = UI_CRYSTAL_SIZE * TOTAL_CRYSTALS;
    const rendererHeight = UI_CRYSTAL_SIZE;

    uiCrystalRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    uiCrystalRenderer.setSize(rendererWidth, rendererHeight);
    container.appendChild(uiCrystalRenderer.domElement);

    uiCrystalScene = new THREE.Scene();

    const camHeight = UI_CRYSTAL_CAM_HEIGHT;
    const camWidth = camHeight * (rendererWidth / rendererHeight);

    uiCrystalCamera = new THREE.OrthographicCamera(
        -camWidth / 2, camWidth / 2,
        camHeight / 2, -camHeight / 2,
        0.1, 100
    );
    uiCrystalCamera.position.z = 10;

    const uiLight = new THREE.DirectionalLight(0xffffff, 2.5);
    uiLight.position.set(1, 1, 1);
    uiCrystalScene.add(uiLight);
    const uiAmbient = new THREE.AmbientLight(0xffffff, 1.5);
    uiCrystalScene.add(uiAmbient);
}

function setupEquationUI() {
    equationElement = document.createElement('div');
    equationElement.id = 'equation-ui';
    equationElement.style.position = 'absolute';
    equationElement.style.top = '30px';
    equationElement.style.left = '50%';
    equationElement.style.transform = 'translateX(-50%)';
    equationElement.style.zIndex = '1000';
    equationElement.style.color = 'white';
    equationElement.style.fontSize = isMobile ? '18px' : '45px';
    equationElement.style.fontFamily = 'Arial, sans-serif';
    equationElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    equationElement.style.padding = '10px 20px';
    equationElement.style.borderRadius = '10px';
    equationElement.style.textShadow = '2px 2px 4px #000000';
    document.body.appendChild(equationElement);
}

function updateEquationUI() {
    if (equationElement) {
        equationElement.textContent = `Rozwiąż działanie: ${currentEquation}`;
        equationElement.classList.add('collected');
        setTimeout(() => equationElement?.classList.remove('collected'), 300);
    }
}

function updateLoadingBar(progress: number, text: string = 'Ładowanie...') {
    const container = document.getElementById('loading-container');
    const fill = document.getElementById('loading-bar-fill');
    const percentage = document.getElementById('loading-percentage');
    const loadingText = document.getElementById('loading-text');

    if (fill) fill.style.width = `${progress}%`;
    if (percentage) percentage.textContent = `${Math.round(progress)}%`;
    if (loadingText) loadingText.textContent = text;

    if (progress >= 100 && container && !loadingHideScheduled) {
        loadingHideScheduled = true;
        setTimeout(() => {
            container.classList.add('hidden');
            setTimeout(() => {
                container.remove();
            }, 500);
        }, 1000);
    }
}

function initializeLoading(steps: number) {
    totalLoadingSteps = steps;
    completedLoadingSteps = 0;
    updateLoadingBar(0, 'Ładowanie...');
}

function incrementLoadingProgress(stepName: string) {
    completedLoadingSteps++;
    const progress = (completedLoadingSteps / totalLoadingSteps) * 100;
    updateLoadingBar(progress, stepName);
}

// --- PARTICLE SYSTEM ---

function spawnParticle(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    material: THREE.MeshBasicMaterial,
    maxAge: number,
    scale: number = 1.0
) {
    const mesh = new THREE.Mesh(particleGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(scale);
    scene.add(mesh);

    particleData.push({
        mesh,
        velocity,
        age: 0,
        maxAge: maxAge,
    });
}

function spawnSplash(position: THREE.Vector3) {
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
        const material = particleMaterial.clone() as THREE.MeshBasicMaterial;
        const initialPosition = position.clone();
        initialPosition.y += 0.2;
        initialPosition.x += (Math.random() - 0.5) * 0.5;
        initialPosition.z += (Math.random() - 0.5) * 0.5;

        const velX = (Math.random() * 2 - 1) * 0.5;
        const velY = Math.random() * 1.5 + 1;
        const velZ = (Math.random() * 2 - 1) * 0.5;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        spawnParticle(initialPosition, velocity, material, SPLASH_LIFESPAN);
    }
}

function spawnBigSplash(position: THREE.Vector3) {
    for (let i = 0; i < BIG_SPLASH_PARTICLE_COUNT; i++) {
        const material = particleMaterial.clone() as THREE.MeshBasicMaterial;
        const initialPosition = position.clone();
        initialPosition.y += 0.3;
        initialPosition.x += (Math.random() - 0.5) * BIG_SPLASH_SPREAD;
        initialPosition.z += (Math.random() - 0.5) * BIG_SPLASH_SPREAD;

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.8 + 0.4;
        const velX = Math.cos(angle) * speed * BIG_SPLASH_VELOCITY_MULTIPLIER;
        const velY = Math.random() * 2.5 + 1.5;
        const velZ = Math.sin(angle) * speed * BIG_SPLASH_VELOCITY_MULTIPLIER;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        const scale = Math.random() * 0.5 + 0.8;
        spawnParticle(initialPosition, velocity, material, SPLASH_LIFESPAN * 1.2, scale);
    }
}

function spawnCrystalCollectEffect(position: THREE.Vector3, color: THREE.Color) {
    for (let i = 0; i < CRYSTAL_PARTICLE_COUNT; i++) {
        const material = particleMaterial.clone() as THREE.MeshBasicMaterial;
        material.color.set(color);
        material.opacity = 1;

        const initialPosition = position.clone();
        initialPosition.y += 0.5;

        const angle = Math.random() * Math.PI * 2;
        const horizontalSpeed = Math.random() * 0.5 + 0.5;
        const velX = Math.cos(angle) * horizontalSpeed * CRYSTAL_PARTICLE_SPEED;
        const velY = (Math.random() * 0.5 + 0.5) * CRYSTAL_PARTICLE_SPEED;
        const velZ = Math.sin(angle) * horizontalSpeed * CRYSTAL_PARTICLE_SPEED;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        const scale = Math.random() * 0.3 + 0.5;
        const maxAge = CRYSTAL_LIFESPAN * (Math.random() * 0.3 + 0.8);

        spawnParticle(initialPosition, velocity, material, maxAge, scale);
    }
}

function updateSplashes(delta: number) {
    for (let i = particleData.length - 1; i >= 0; i--) {
        const particle = particleData[i];
        particle.age += delta;

        if (particle.age > particle.maxAge) {
            scene.remove(particle.mesh);
            if (particle.mesh.material instanceof THREE.Material) {
                particle.mesh.material.dispose();
            }
            particleData.splice(i, 1);
            continue;
        }

        particle.velocity.y += GRAVITY * delta;
        particle.mesh.position.addScaledVector(particle.velocity, delta);

        const lifeRatio = 1 - (particle.age / particle.maxAge);
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = lifeRatio;
        const scale = lifeRatio * 0.9 + 0.3;
        particle.mesh.scale.setScalar(scale);
    }
}

// --- ENTITY CREATION ---

async function createSun() {
    incrementLoadingProgress('Ładowanie Słońca...');
    const sunGroup = new THREE.Group();
    const sunMaterial = new THREE.MeshBasicMaterial({color: 0xfdb813});
    const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 32), sunMaterial);
    sunGroup.add(sun);

    const glowMaterial1 = new THREE.MeshBasicMaterial({color: 0xffd700, transparent: true, opacity: 0.3});
    const glow1 = new THREE.Mesh(new THREE.SphereGeometry(9.5, 32, 32), glowMaterial1);
    sunGroup.add(glow1);

    const glowMaterial2 = new THREE.MeshBasicMaterial({color: 0xffe4b5, transparent: true, opacity: 0.2});
    const glow2 = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 32), glowMaterial2);
    sunGroup.add(glow2);

    const glowMaterial3 = new THREE.MeshBasicMaterial({color: 0xffffe0, transparent: true, opacity: 0.1});
    const glow3 = new THREE.Mesh(new THREE.SphereGeometry(13, 32, 32), glowMaterial3);
    sunGroup.add(glow3);

    sunGroup.position.set(50, 40, 100);
    scene.add(sunGroup);
}

function createCloud(): THREE.Group {
    const cloud = new THREE.Group();
    const cloudMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
    });

    for (let i = 0; i < 8; i++) {
        const sphereGeometry = new THREE.SphereGeometry(Math.random() * 2 + 1, 8, 8);
        const sphere = new THREE.Mesh(sphereGeometry, cloudMaterial);
        sphere.position.set(
            Math.random() * 4 - 2,
            Math.random() * 2 - 1,
            Math.random() * 4 - 2,
        );
        cloud.add(sphere);
    }
    return cloud;
}

async function createClouds() {
    incrementLoadingProgress('Ładowanie chmur...');
    const cloudCount = 25;
    const areaSize = 250;
    const altitude = 25;

    for (let i = 0; i < cloudCount; i++) {
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;
        const y = altitude + Math.random() * 20;
        const cloud = createCloud();
        const scaleFactor = Math.random() + 1;
        cloud.scale.setScalar(scaleFactor);
        cloud.position.set(x, y, z);
        scene.add(cloud);
        clouds.push(cloud);
    }
}

async function createWorld() {
    try {
        const {model} = await loadModel("Nature.glb");
        incrementLoadingProgress('Ładowanie mapy...');

        model.scale.setScalar(50);
        model.position.set(0, 10, 0);

        model.traverse((child) => {
            if (isMesh(child)) {
                worldObjects.push(child);
                const geometry = child.geometry as THREE.BufferGeometry;
                if (geometry.isBufferGeometry) {
                    // Ensures the raycaster can return a 'face' and 'face.normal'
                    geometry.computeVertexNormals();
                    (geometry as any).boundsTree = new MeshBVH(geometry);
                    child.raycast = acceleratedRaycast;
                }
            }
        });

        scene.add(model);

        minimapWorldModel = model.clone();
        minimapWorldModel.scale.setScalar(50);
        minimapWorldModel.position.set(0, 10, 0);
        minimapScene.add(minimapWorldModel);

        incrementLoadingProgress('Mapa załadowana');
    } catch (err) {
        console.warn("Błąd ładowania modelu Nature.glb:", err);
        incrementLoadingProgress('Błąd ładowania mapy');
    }
}

async function loadUICrystalTemplate() {
    incrementLoadingProgress('Ładowanie interfejsu gry...');
    try {
        const {model} = await loadModel("Crystal.glb");
        uiCrystalTemplate = model;
        uiCrystalTemplate.scale.setScalar(UI_CRYSTAL_SCALE);
    } catch (err) {
        console.warn("Failed to load UI crystal template:", err);
    }
}

async function loadAudio() {
    if (!playerModel) return;
    try {
        runningSound = await createAudioFromUrl(runningSoundUrl, true, listener, {
            loop: true, volume: 1.5, refDistance: 10
        }) as THREE.PositionalAudio;
        playerModel.add(runningSound);

        waterSound = await createAudioFromUrl(waterSoundUrl, true, listener, {
            loop: true, volume: 0.5, refDistance: 10
        }) as THREE.PositionalAudio;
        playerModel.add(waterSound);

        bumpSound = await createAudioFromUrl(bumpSoundUrl, true, listener, {
            loop: false, volume: 0.25, refDistance: 10
        }) as THREE.PositionalAudio;
        playerModel.add(bumpSound);

        biteSound = await createAudioFromUrl(animalHitSoundUrl, true, listener, {
            loop: false, volume: 1, refDistance: 10
        }) as THREE.PositionalAudio;
        playerModel.add(biteSound);

        errorSound = await createAudioFromUrl(errorSoundUrl, true, listener, {
            loop: false, volume: 1, refDistance: 10
        }) as THREE.PositionalAudio;
        playerModel.add(errorSound);

        waterSplashSound = await createAudioFromUrl(waterSplashSoundUrl, true, listener, {
            loop: false, volume: 0.75, refDistance: 15
        }) as THREE.PositionalAudio;
        playerModel.add(waterSplashSound);

        backgroundMusic = await createAudioFromUrl(forestAtmosphereUrl, false, listener, {
            loop: true, volume: 0.3
        });
        backgroundMusic.play();

        successSound = await createAudioFromUrl(successSoundUrl, false, listener, {
            loop: false, volume: 0.8
        });

        fireworkBuffer = await audioLoader.loadAsync(fireworkSoundUrl);

    } catch (err) {
        console.error("One or more audio files failed to load:", err);
    }
}

async function createPlayer() {
    try {
        incrementLoadingProgress('Ładowanie postaci...');
        const {model, animations} = await loadModel("Animated Platformer Character.glb");
        playerModel = model;

        await loadAudio();

        playerModel.scale.setScalar(0.5);
        playerModel.position.set(5, 7, 8);

        const bbox = new THREE.Box3().setFromObject(playerModel);
        playerHeight = bbox.max.y - bbox.min.y;

        scene.add(playerModel);

        if (animations && animations.length > 0) {
            mixer = new THREE.AnimationMixer(playerModel);

            const runClip = animations.find((clip) => clip.name === "CharacterArmature|Run");
            const walkClip = animations.find((clip) => clip.name === "CharacterArmature|Walk");
            const fallClip = animations.find((clip) => clip.name === "CharacterArmature|Death");
            const jumpClip = animations.find((clip) => clip.name === "CharacterArmature|Jump");

            if (runClip) {
                runAction = mixer.clipAction(runClip);
                runAction.setLoop(THREE.LoopRepeat, Infinity);
            }
            if (walkClip) {
                walkAction = mixer.clipAction(walkClip);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
            }
            if (fallClip) {
                fallAction = mixer.clipAction(fallClip);
                fallAction.setLoop(THREE.LoopOnce, 1);
                fallAction.clampWhenFinished = true;
            }
            if (jumpClip) {
                jumpAction = mixer.clipAction(jumpClip);
                jumpAction.setLoop(THREE.LoopOnce, 1);
                jumpAction.clampWhenFinished = true;
            }

            if (mixer) {
                mixer.addEventListener("finished", (e) => {
                    if (fallAction && e.action === fallAction) fallAction.stop();
                    if (jumpAction && e.action === jumpAction) jumpAction.stop();
                });
            }
        }
        incrementLoadingProgress('Postać załadowana');
        updateCameraPosition(true);
    } catch (err) {
        console.warn("Błąd ładowania modelu 'Animated Platformer Character.glb':", err);
        incrementLoadingProgress('Błąd ładowania postaci');
    }
}

// --- ENTITY SPAWNING ---

async function spawnAnimals(count: number) {
    const areaSize = 250;
    const spawnAttempts = 15;

    for (let i = 0; i < count; i++) {
        const randomAnimalModel = animalModels[Math.floor(Math.random() * animalModels.length)];
        try {
            const {model, animations} = await loadModel(randomAnimalModel);
            incrementLoadingProgress(`Ładowanie zwierząt... (${i + 1}/${count})`);

            const scaleFactor = 0.4 + Math.random() * 0.3;
            model.scale.setScalar(scaleFactor);
            model.rotation.y = Math.random() * Math.PI * 2;

            const res = findValidGroundPosition({
                areaSize, spawnAttempts, raycastStartY: 50, allowWater: false,
                clearanceHeight: 3.0, clearanceOriginOffset: 0.1, maxGroundY: 15,
                requireSlopeCheck: true, requireClearance: true
            });
            if (res) model.position.set(res.position.x, res.groundY, res.position.z);

            let animalMixer: THREE.AnimationMixer | null = null;
            let animalAction: THREE.AnimationAction | null = null;
            let animalDeathAction: THREE.AnimationAction | null = null;
            let allowedAnimations: THREE.AnimationClip[] = [];
            let walkAnimation: THREE.AnimationClip | null = null;

            if (animations && animations.length > 0) {
                animalMixer = new THREE.AnimationMixer(model);
                allowedAnimations = animations.filter(clip => {
                    const name = clip.name.toLowerCase();
                    return (name.includes('eating') || name.includes('idle'))
                        && !name.includes('jump') && !name.includes('hit') && !name.includes('walk');
                });
                walkAnimation = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    return name.includes('walk') && !name.includes('death') && !name.includes('hit');
                }) || null;
                const deathClip = animations.find(clip => clip.name.toLowerCase().includes('death'));

                if (allowedAnimations.length > 0) {
                    const randomClip = allowedAnimations[Math.floor(Math.random() * allowedAnimations.length)];
                    animalAction = animalMixer.clipAction(randomClip);
                    animalAction.setLoop(THREE.LoopRepeat, Infinity);
                    animalAction.play();
                }
                if (deathClip) {
                    animalDeathAction = animalMixer.clipAction(deathClip);
                    animalDeathAction.setLoop(THREE.LoopOnce, 1);
                    animalDeathAction.clampWhenFinished = true;
                }
            }

            scene.add(model);
            animals.push(model);
            animalInstances.push({
                model: model, mixer: animalMixer, action: animalAction,
                deathAction: animalDeathAction, isPlayingDeath: false,
                allowedAnimations: allowedAnimations, walkAnimation: walkAnimation,
                nextAnimationChangeTime: clock.getElapsedTime() + 2 + Math.random() * 8,
                isWalking: false, walkEndTime: 0,
                moveSpeed: 0.01 + Math.random() * 0.03
            });
        } catch (err) {
            console.warn(`Failed to load animal model ${randomAnimalModel}:`, err);
        }
    }
}

async function spawnSpiders(count: number) {
    const areaSize = 200;
    const spawnAttempts = 15;
    const MIN_DISTANCE_FROM_PLAYER = 50;
    const playerStartPos = new THREE.Vector3(5, 0, 8);

    for (let i = 0; i < count; i++) {
        try {
            const {model, animations} = await loadModel("Spider.glb");
            incrementLoadingProgress(`Ładowanie Pajączurów... (${i + 1}/${count})`);

            model.scale.setScalar(0.33);
            model.rotation.y = Math.random() * Math.PI * 2;

            const res = findValidGroundPosition({
                areaSize, spawnAttempts, minDistanceFromPlayer: MIN_DISTANCE_FROM_PLAYER,
                playerStartPos, raycastStartY: 50, allowWater: false,
                clearanceHeight: 3.0, clearanceOriginOffset: 0.1, maxGroundY: 15,
                requireSlopeCheck: false, requireClearance: true
            });
            if (res) model.position.set(res.position.x, res.groundY, res.position.z);

            let spiderMixer: THREE.AnimationMixer | null = null;
            let spiderWalkAction: THREE.AnimationAction | null = null;
            let spiderAttackAction: THREE.AnimationAction | null = null;

            if (animations && animations.length > 0) {
                spiderMixer = new THREE.AnimationMixer(model);
                const walkClip = animations.find(clip => clip.name.toLowerCase().includes('walk'));
                const attackClip = animations.find(clip => clip.name.toLowerCase().includes('attack') || clip.name.toLowerCase().includes('bite'));

                if (walkClip) {
                    spiderWalkAction = spiderMixer.clipAction(walkClip);
                } else if (animations.length > 0) {
                    spiderWalkAction = spiderMixer.clipAction(animations[0]);
                }
                if (spiderWalkAction) {
                    spiderWalkAction.setLoop(THREE.LoopRepeat, Infinity);
                    spiderWalkAction.play();
                }

                if (attackClip) {
                    spiderAttackAction = spiderMixer.clipAction(attackClip);
                } else if (animations.length > 0) {
                    spiderAttackAction = spiderMixer.clipAction(animations[0]);
                }
                if (spiderAttackAction) {
                    spiderAttackAction.setLoop(THREE.LoopOnce, 1);
                    spiderAttackAction.clampWhenFinished = true;
                }
            }

            scene.add(model);
            spiders.push({
                model: model, mixer: spiderMixer, walkAction: spiderWalkAction,
                attackAction: spiderAttackAction, isChasing: false,
                moveSpeed: SPIDER_WANDER_SPEED, isAttacking: false,
                isJumpingBack: false, jumpBackStartTime: 0,
                jumpBackDuration: SPIDER_JUMP_BACK_DURATION,
                jumpBackStartPos: null, jumpBackEndPos: null
            });
        } catch (err) {
            console.warn(`Failed to load spider model:`, err);
        }
    }
}

async function spawnBees(count: number) {
    const areaSize = 200;
    const spawnAttempts = 15;
    const MIN_DISTANCE_FROM_PLAYER = 40;
    const playerStartPos = new THREE.Vector3(5, 0, 8);

    for (let i = 0; i < count; i++) {
        try {
            const {model, animations} = await loadModel("Armabee Evolved.glb");
            incrementLoadingProgress(`Ładowanie Żarłocznych Pszczół... (${i + 1}/${count})`);

            model.scale.setScalar(0.25);
            model.rotation.y = Math.random() * Math.PI * 2;

            const resBee = findValidGroundPosition({
                areaSize, spawnAttempts, minDistanceFromPlayer: MIN_DISTANCE_FROM_PLAYER,
                playerStartPos, raycastStartY: 50, allowWater: true,
                clearanceHeight: 3.0, clearanceOriginOffset: 0.1, maxGroundY: 15,
                requireSlopeCheck: false, requireClearance: true
            });
            if (resBee) {
                model.position.set(resBee.position.x, resBee.groundY + BEE_SPAWN_ALTITUDE, resBee.position.z);
            } else {
                model.position.set(0, BEE_SPAWN_ALTITUDE, 0);
            }

            let beeFlySound: THREE.PositionalAudio | null = null;
            if (listener) {
                beeFlySound = new THREE.PositionalAudio(listener);
                audioLoader.load(beeFlyingSoundUrl, (buffer) => {
                    if (beeFlySound) {
                        beeFlySound.setBuffer(buffer);
                        beeFlySound.setLoop(true);
                        beeFlySound.setVolume(0.8);
                        beeFlySound.setRefDistance(5);
                    }
                });
                model.add(beeFlySound);
            }

            let beeMixer: THREE.AnimationMixer | null = null;
            let beeFlyAction: THREE.AnimationAction | null = null;
            let beeAttackAction: THREE.AnimationAction | null = null;

            if (animations && animations.length > 0) {
                beeMixer = new THREE.AnimationMixer(model);
                let flyClip = animations.find(clip => clip.name.toLowerCase().includes('fly'));
                if (!flyClip) flyClip = animations.find(clip => clip.name.toLowerCase().includes('idle'));
                const attackClip = animations.find(clip => clip.name.toLowerCase().includes('attack') || clip.name.toLowerCase().includes('bite'));

                if (flyClip) {
                    beeFlyAction = beeMixer.clipAction(flyClip);
                } else if (animations.length > 0) {
                    beeFlyAction = beeMixer.clipAction(animations[0]);
                }
                if (beeFlyAction) {
                    beeFlyAction.setLoop(THREE.LoopRepeat, Infinity);
                    beeFlyAction.play();
                }

                if (attackClip) {
                    beeAttackAction = beeMixer.clipAction(attackClip);
                } else if (animations.length > 0) {
                    beeAttackAction = beeMixer.clipAction(animations[0]);
                }
                if (beeAttackAction) {
                    beeAttackAction.setLoop(THREE.LoopOnce, 1);
                    beeAttackAction.clampWhenFinished = true;
                }
            }

            scene.add(model);
            bees.push({
                model: model, mixer: beeMixer, flyAction: beeFlyAction,
                attackAction: beeAttackAction, flySound: beeFlySound,
                isChasing: false, moveSpeed: BEE_WANDER_SPEED,
                baseAltitude: model.position.y, wanderTarget: null,
                isAttacking: false, lastAttackTime: 0, attackStartTime: 0,
                attackStartPos: null, attackEndPos: null,
                isRetreating: false, retreatEndTime: 0
            });
        } catch (err) {
            console.warn(`Failed to load bee model:`, err);
        }
    }
}

async function spawnCrystals(numbersToSpawn: number[]) {
    const areaSize = 220;
    const spawnAttempts = 1000;
    const MIN_DISTANCE_FROM_PLAYER = 20;
    const playerStartPos = new THREE.Vector3(5, 7, 8);

    const colorPalette = [0x0099ff, 0x00ff66, 0xff3333, 0xff66ff, 0xffff00];

    for (let i = 0; i < numbersToSpawn.length; i++) {
        try {
            const {model} = await loadModel("Crystal.glb");
            incrementLoadingProgress(`Ładowanie Magicznych Kryształów... (${i + 1}/${numbersToSpawn.length})`);

            model.scale.setScalar(0.1);
            model.rotation.y = Math.random() * Math.PI * 2;

            const res = findValidGroundPosition({
                areaSize, spawnAttempts, minDistanceFromPlayer: MIN_DISTANCE_FROM_PLAYER,
                playerStartPos, raycastStartY: 50, allowWater: false,
                considerWaterHeight: true, waterHeightThreshold: 0.5,
                clearanceHeight: 4.0, clearanceOriginOffset: 0.1, maxGroundY: 8,
                minSlopeDot: 0.85, requireSlopeCheck: true, requireClearance: true
            });
            if (res) model.position.copy(res.position);

            const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            const crystalNumber = numbersToSpawn[i];
            const numberText = crystalNumber.toString();
            const numberColor = new THREE.Color(randomColor);

            const numberMesh = createCrystalNumber(numberText, numberColor);
            numberMesh.position.y = 12;
            model.userData.crystalValue = crystalNumber;

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = false;
                    mesh.receiveShadow = false;
                    if (mesh.material) {
                        const material = mesh.material as THREE.MeshStandardMaterial;
                        material.emissive = new THREE.Color(randomColor);
                        material.emissiveIntensity = 1;
                    }
                }
            });

            model.add(numberMesh);
            scene.add(model);
            crystals.push(model);
        } catch (err) {
            console.warn(`Failed to load crystal model:`, err);
        }
    }
}

// --- GAME LOGIC ---

function createCrystalNumber(text: string, color: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const canvasSize = 128;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.Sprite();

    const fontSize = 100;
    context.font = `bold ${fontSize}px "Comic Sans MS", Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeStyle = 'black';
    context.lineWidth = 3;
    context.strokeText(text, canvasSize / 2, canvasSize / 2);
    context.fillStyle = color.getStyle();
    context.fillText(text, canvasSize / 2, canvasSize / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({map: texture, transparent: true});
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(10, 10, 1);
    return sprite;
}

function clearAllCrystals() {
    for (let i = crystals.length - 1; i >= 0; i--) {
        const crystal = crystals[i];
        scene.remove(crystal);
        crystal.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                (child as THREE.Mesh).geometry?.dispose();
                const material = (child as THREE.Mesh).material;
                if (material) {
                    Array.isArray(material)
                        ? material.forEach(mat => mat.dispose())
                        : material.dispose();
                }
            } else if (child instanceof THREE.Sprite) {
                (child.material as THREE.SpriteMaterial).map?.dispose();
                child.material.dispose();
            }
        });
    }
    crystals.length = 0;

    for (let i = minimapCrystalMarkers.length - 1; i >= 0; i--) {
        const marker = minimapCrystalMarkers[i];
        minimapScene.remove(marker);
        marker.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                (child as THREE.Mesh).geometry?.dispose();
                const material = (child as THREE.Mesh).material;
                if (material) {
                    Array.isArray(material)
                        ? material.forEach(mat => mat.dispose())
                        : material.dispose();
                }
            }
        });
    }
    minimapCrystalMarkers.length = 0;
}

async function generateNewEquationAndRespawnCrystals() {
    clearAllCrystals();

    type EqType = 'ADD' | 'SUB' | 'ADD_MISSING' | 'SUB_MISSING';
    const types: EqType[] = ['ADD', 'SUB', 'ADD_MISSING', 'SUB_MISSING'];
    const chosen = types[Math.floor(Math.random() * types.length)];
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    let A = 0, B = 0, unknown = 0, equationText = '';
    const MIN_VAL = 1, MAX_SUM = 10;

    if (chosen === 'ADD') {
        const S = randInt(2, MAX_SUM);
        A = randInt(1, S - 1);
        B = S - A;
        unknown = S;
        equationText = `${A} + ${B} = ?`;
    } else if (chosen === 'SUB') {
        A = randInt(2, MAX_SUM);
        B = randInt(1, A - 1);
        unknown = A - B;
        equationText = `${A} - ${B} = ?`;
    } else if (chosen === 'ADD_MISSING') {
        A = randInt(1, MAX_SUM - 1);
        const x = randInt(1, MAX_SUM - A);
        B = A + x;
        unknown = x;
        equationText = `${A} + ? = ${B}`;
    } else { // SUB_MISSING
        A = randInt(2, MAX_SUM);
        B = randInt(1, A - 1);
        unknown = A - B;
        equationText = `${A} - ? = ${B}`;
    }

    currentTargetNumber = unknown;
    currentEquation = equationText;
    updateEquationUI();

    const numbersToSpawn: number[] = [];
    const NUM_CORRECT_CRYSTALS = 3;
    for (let i = 0; i < NUM_CORRECT_CRYSTALS; i++) {
        numbersToSpawn.push(currentTargetNumber);
    }

    while (numbersToSpawn.length < TOTAL_CRYSTALS) {
        let distractor = randInt(MIN_VAL, MAX_SUM);
        if (Math.random() < 0.4) {
            const offset = randInt(-2, 2);
            distractor = Math.max(MIN_VAL, Math.min(MAX_SUM, currentTargetNumber + offset));
        }
        if (distractor !== currentTargetNumber && !numbersToSpawn.includes(distractor)) {
            numbersToSpawn.push(distractor);
        }
    }

    for (let i = numbersToSpawn.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbersToSpawn[i], numbersToSpawn[j]] = [numbersToSpawn[j], numbersToSpawn[i]];
    }

    await spawnCrystals(numbersToSpawn);
}

function checkCrystalCollection() {
    if (!playerModel) return;

    const playerPos = playerModel.position;

    for (let i = crystals.length - 1; i >= 0; i--) {
        const crystal = crystals[i];
        const crystalPos = crystal.position;
        const distance = playerPos.distanceTo(crystalPos);

        if (distance < CRYSTAL_COLLECT_RADIUS) {
            const collectedValue = crystal.userData.crystalValue as number | undefined;
            if (collectedValue === undefined) continue;

            if (collectedValue === currentTargetNumber) {
                let crystalColor = new THREE.Color(0x00aaff);
                crystal.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                        if (material && material.emissive) {
                            crystalColor.copy(material.emissive);
                        }
                    }
                });

                if (successSound) {
                    successSound.stop();
                    successSound.play();
                }
                spawnCrystalCollectEffect(crystalPos, crystalColor);

                collectedCrystals++;
                const crystalIndex = collectedCrystals - 1;

                if (uiCrystalCountElement) {
                    uiCrystalCountElement.textContent = `${collectedCrystals} / ${TOTAL_EQUATIONS_TO_SOLVE}`;
                    uiCrystalCountElement.classList.add('collected');
                    setTimeout(() => uiCrystalCountElement?.classList.remove('collected'), 300);
                }

                if (uiCrystalTemplate && uiCrystalScene && uiCrystalCamera) {
                    const newUICrystal = uiCrystalTemplate.clone();
                    newUICrystal.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            const mesh = child as THREE.Mesh;
                            if (mesh.material) {
                                const newMaterial = (mesh.material as THREE.MeshStandardMaterial).clone();
                                newMaterial.emissive = new THREE.Color(crystalColor);
                                newMaterial.emissiveIntensity = 0.75;
                                mesh.material = newMaterial;
                            }
                        }
                    });

                    const rendererWidth = UI_CRYSTAL_SIZE * TOTAL_CRYSTALS;
                    const camHeight = UI_CRYSTAL_CAM_HEIGHT;
                    const camWidth = camHeight * (rendererWidth / UI_CRYSTAL_SIZE);
                    const spacing = camWidth / TOTAL_CRYSTALS;
                    newUICrystal.position.x = (-camWidth / 2) + (spacing / 2) + (crystalIndex * spacing) + 0.5;
                    newUICrystal.position.y = -1.3;

                    uiCrystalScene.add(newUICrystal);
                    uiCrystalModels.push(newUICrystal);
                }

                if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
                    clearAllCrystals();
                    showWinScreen();
                } else {
                    // This is async, but we don't need to await it here
                    generateNewEquationAndRespawnCrystals();
                }
                return; // Stop iterating, arrays are modified

            } else {
                if (errorSound) {
                    errorSound.stop();
                    errorSound.play();
                }
            }
            break;
        }
    }
}

// --- AI & ANIMATION ---

function changeAnimalAnimation(animalInstance: AnimalInstance) {
    if (!animalInstance.mixer || animalInstance.isPlayingDeath) return;
    const currentTime = clock.getElapsedTime();
    const shouldWalk = animalInstance.walkAnimation && Math.random() < 0.4;

    if (shouldWalk && animalInstance.walkAnimation) {
        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }
        const walkAction = animalInstance.mixer.clipAction(animalInstance.walkAnimation);
        walkAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        animalInstance.action = walkAction;
        animalInstance.isWalking = true;
        animalInstance.walkEndTime = currentTime + 2 + Math.random() * 4;
    } else if (animalInstance.allowedAnimations.length > 0) {
        const randomClip = animalInstance.allowedAnimations[Math.floor(Math.random() * animalInstance.allowedAnimations.length)];
        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }
        const newAction = animalInstance.mixer.clipAction(randomClip);
        newAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        animalInstance.action = newAction;
        animalInstance.isWalking = false;
    }
    animalInstance.nextAnimationChangeTime = currentTime + 2 + Math.random() * 8;
}

function updateAnimalMovement(animalInstance: AnimalInstance) {
    if (!animalInstance.isWalking || animalInstance.isPlayingDeath) return;
    const currentTime = clock.getElapsedTime();

    if (currentTime >= animalInstance.walkEndTime) {
        animalInstance.isWalking = false;
        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }
        if (animalInstance.mixer && animalInstance.allowedAnimations.length > 0) {
            const randomClip = animalInstance.allowedAnimations[Math.floor(Math.random() * animalInstance.allowedAnimations.length)];
            const idleAction = animalInstance.mixer.clipAction(randomClip);
            idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
            animalInstance.action = idleAction;
        }
        return;
    }

    const animal = animalInstance.model;
    const ANIMAL_HEIGHT = 1.5;
    const OBSTACLE_CHECK_DISTANCE = 2.0;
    const TURN_ANGLE = Math.PI / 4;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(animal.quaternion);

    const rayOrigin = animal.position.clone();
    rayOrigin.y += ANIMAL_HEIGHT / 2;
    raycaster.set(rayOrigin, forward);
    raycaster.far = OBSTACLE_CHECK_DISTANCE;
    const intersects = raycaster.intersectObjects(worldObjects, true);
    raycaster.far = Infinity;

    let hasObstacle = intersects.length > 0 && intersects[0].distance < OBSTACLE_CHECK_DISTANCE;

    if (!hasObstacle) {
        const futurePosition = animal.position.clone().addScaledVector(forward, OBSTACLE_CHECK_DISTANCE);
        for (const otherAnimal of animals) {
            if (otherAnimal !== animal && futurePosition.distanceTo(otherAnimal.position) < 1.5) {
                hasObstacle = true;
                break;
            }
        }
        if (playerModel && futurePosition.distanceTo(playerModel.position) < 2.0) {
            hasObstacle = true;
        }
    }

    if (hasObstacle) {
        animal.rotation.y += TURN_ANGLE * (Math.random() < 0.5 ? 1 : -1);
    } else {
        const moveVector = forward.multiplyScalar(animalInstance.moveSpeed * 0.016 * 60); // Normalize to ~60fps
        const newPosition = animal.position.clone().add(moveVector);
        const groundIntersect = getGroundIntersection(newPosition, 10);

        if (groundIntersect) {
            const groundY = groundIntersect.point.y;
            const hitObject = groundIntersect.object as THREE.Mesh;
            let isSafe = !isWaterSurface(hitObject);
            if (groundIntersect.face) {
                const worldNormal = groundIntersect.face.normal.clone().applyMatrix3(
                    new THREE.Matrix3().getNormalMatrix(hitObject.matrixWorld)
                ).normalize();
                if (worldNormal.dot(new THREE.Vector3(0, 1, 0)) < 0.6) isSafe = false;
            }
            if (isSafe) {
                animal.position.set(newPosition.x, groundY, newPosition.z);
            } else {
                animal.rotation.y += Math.PI / 3;
            }
        }
    }
}

function triggerSpiderAttack(spider: SpiderInstance) {
    if (spider.isAttacking || spider.isJumpingBack || !spider.attackAction || !spider.mixer) return;

    spider.isAttacking = true;
    if (spider.walkAction && spider.walkAction.isRunning()) spider.walkAction.stop();
    spider.attackAction.reset().play();

    const onAttackFinished = (e: any) => {
        if (e.action === spider.attackAction) {
            spider.attackAction!.stop();
            spider.isAttacking = false;

            if (playerModel) {
                const direction = new THREE.Vector3().subVectors(spider.model.position, playerModel.position);
                direction.y = 0;
                direction.normalize();
                spider.jumpBackStartPos = spider.model.position.clone();
                spider.jumpBackEndPos = spider.model.position.clone().addScaledVector(direction, SPIDER_JUMP_BACK_DISTANCE);
                spider.jumpBackStartTime = clock.getElapsedTime();
                spider.isJumpingBack = true;
            }
            spider.mixer!.removeEventListener('finished', onAttackFinished);
        }
    };
    spider.mixer.addEventListener('finished', onAttackFinished);
}

function updateSpiderJumpBack(spider: SpiderInstance) {
    if (!spider.isJumpingBack || !spider.jumpBackStartPos || !spider.jumpBackEndPos) return;

    const elapsed = clock.getElapsedTime() - spider.jumpBackStartTime;
    const progress = Math.min(elapsed / spider.jumpBackDuration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentPos = spider.jumpBackStartPos.clone().lerp(spider.jumpBackEndPos, easeProgress);
    const groundIntersect = getGroundIntersection(currentPos);

    if (groundIntersect) {
        spider.model.position.set(currentPos.x, groundIntersect.point.y, currentPos.z);
    }

    if (progress >= 1) {
        spider.isJumpingBack = false;
        spider.jumpBackStartPos = null;
        spider.jumpBackEndPos = null;
        if (spider.walkAction) spider.walkAction.reset().play();
    }
}

function triggerBeeAttack(bee: BeeInstance) {
    const currentTime = clock.getElapsedTime();
    if (bee.isAttacking || currentTime < bee.lastAttackTime + BEE_ATTACK_COOLDOWN || !playerModel) return;

    bee.isAttacking = true;
    bee.lastAttackTime = currentTime;
    bee.attackStartTime = currentTime;
    bee.attackStartPos = bee.model.position.clone();
    bee.attackEndPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0));

    if (bee.flyAction && bee.flyAction.isRunning()) bee.flyAction.stop();
    if (bee.attackAction) bee.attackAction.reset().play();
}

function updateBeeAttackDash(bee: BeeInstance) {
    if (!bee.isAttacking || !bee.attackStartPos || !bee.attackEndPos) return;

    const elapsed = clock.getElapsedTime() - bee.attackStartTime;
    let progress = elapsed / BEE_ATTACK_DASH_DURATION;

    if (progress >= 1) {
        progress = 1;
        bee.isAttacking = false;
        bee.attackStartPos = null;
        bee.attackEndPos = null;
        if (bee.attackAction && bee.attackAction.isRunning()) bee.attackAction.stop();
        if (bee.flyAction && !bee.flyAction.isRunning()) bee.flyAction.reset().play();
    }

    if (bee.attackStartPos && bee.attackEndPos) {
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentPos = bee.attackStartPos.clone().lerp(bee.attackEndPos, easeProgress);
        bee.model.position.copy(currentPos);
    }
}

function updateSpiderAI(spider: SpiderInstance) {
    if (!playerModel || spider.isAttacking || spider.isJumpingBack) return;

    const spiderPos = spider.model.position;
    const playerPos = playerModel.position;
    const distanceToPlayer = spiderPos.distanceTo(playerPos);

    if (distanceToPlayer < SPIDER_DETECTION_RANGE) {
        spider.isChasing = true;
        spider.moveSpeed = SPIDER_CHASE_SPEED;

        const direction = new THREE.Vector3().subVectors(playerPos, spiderPos);
        direction.y = 0;
        direction.normalize();
        spider.model.rotation.y = Math.atan2(direction.x, direction.z);

        const attackTriggerDistance = COLLISION_RADIUS + SPIDER_COLLISION_RADIUS + 0.2;
        if (distanceToPlayer <= attackTriggerDistance) {
            if (!spider.isAttacking && !spider.isJumpingBack && !controlsLocked) {
                triggerPlayerFall();
                triggerSpiderAttack(spider);
                if (biteSound && !biteSound.isPlaying) biteSound.play();
            }
        } else {
            const moveVector = direction.multiplyScalar(spider.moveSpeed);
            const newPosition = spiderPos.clone().add(moveVector);
            const groundIntersect = getGroundIntersection(newPosition);
            if (groundIntersect && !isWaterSurface(groundIntersect.object)) {
                spider.model.position.set(newPosition.x, groundIntersect.point.y, newPosition.z);
            }
        }
    } else {
        spider.isChasing = false;
        spider.moveSpeed = SPIDER_WANDER_SPEED;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(spider.model.quaternion);

        if (Math.random() < 0.02) {
            spider.model.rotation.y += (Math.random() - 0.5) * Math.PI / 2;
        }

        const rayOrigin = spiderPos.clone();
        rayOrigin.y += 1;
        raycaster.set(rayOrigin, forward);
        raycaster.far = 2.0;
        const intersects = raycaster.intersectObjects(worldObjects, true);
        raycaster.far = Infinity;
        let hasObstacle = intersects.length > 0 && intersects[0].distance < 2.0;

        if (hasObstacle) {
            spider.model.rotation.y += Math.PI / 4;
        } else {
            const moveVector = forward.multiplyScalar(spider.moveSpeed);
            const newPosition = spiderPos.clone().add(moveVector);
            let wouldCollide = false;

            if (playerModel && newPosition.distanceTo(playerModel.position) < (COLLISION_RADIUS + SPIDER_COLLISION_RADIUS + 0.5)) {
                wouldCollide = true;
            }
            if (!wouldCollide) {
                for (const otherSpider of spiders) {
                    if (otherSpider !== spider && newPosition.distanceTo(otherSpider.model.position) < (SPIDER_COLLISION_RADIUS * 2 + 0.5)) {
                        wouldCollide = true;
                        break;
                    }
                }
            }

            if (wouldCollide) {
                spider.model.rotation.y += Math.PI / 4;
            } else {
                const groundIntersect = getGroundIntersection(newPosition);
                if (groundIntersect) {
                    if (!isWaterSurface(groundIntersect.object)) {
                        spider.model.position.set(newPosition.x, groundIntersect.point.y, newPosition.z);
                    } else {
                        spider.model.rotation.y += Math.PI / 3;
                    }
                }
            }
        }
    }
}

function forceBeeWander(bee: BeeInstance) {
    bee.isChasing = false;
    bee.moveSpeed = BEE_WANDER_SPEED;
    if (bee.flySound && bee.flySound.isPlaying) bee.flySound.stop();

    if (!bee.wanderTarget || bee.model.position.distanceTo(bee.wanderTarget) < 2.0) {
        const x = bee.model.position.x + (Math.random() - 0.5) * BEE_WANDER_RANGE;
        const z = bee.model.position.z + (Math.random() - 0.5) * BEE_WANDER_RANGE;
        let groundY = 0;
        const groundIntersect = getGroundIntersection(new THREE.Vector3(x, 0, z));
        if (groundIntersect) groundY = groundIntersect.point.y;
        const y = groundY + BEE_BASE_WANDER_ALTITUDE + (Math.random() - 0.5) * 5.0;
        if (!bee.wanderTarget) bee.wanderTarget = new THREE.Vector3(x, y, z);
        else bee.wanderTarget.set(x, y, z);
    }

    const direction = new THREE.Vector3().subVectors(bee.wanderTarget, bee.model.position).normalize();
    bee.model.lookAt(bee.wanderTarget);
    const newPosition = bee.model.position.clone().addScaledVector(direction, bee.moveSpeed);
    bee.model.position.copy(newPosition);
}

function updateBeeAI(bee: BeeInstance) {
    if (!playerModel) return;
    if (bee.isAttacking) {
        updateBeeAttackDash(bee);
        return;
    }

    const currentTime = clock.getElapsedTime();
    if (bee.isRetreating) {
        if (currentTime < bee.retreatEndTime) {
            const retreatDuration = 5.0;
            const flyAwayDuration = 1.5;
            const elapsedRetreatTime = retreatDuration - (bee.retreatEndTime - currentTime);

            if (elapsedRetreatTime < flyAwayDuration) {
                const beePos = bee.model.position;
                const playerPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0));
                const directionAway = new THREE.Vector3().subVectors(beePos, playerPos);
                directionAway.y = 0.5;
                directionAway.normalize();
                bee.model.lookAt(bee.model.position.clone().add(directionAway));
                const newPosition = beePos.clone().addScaledVector(directionAway, BEE_CHASE_SPEED);
                const groundIntersect = getGroundIntersection(newPosition, 20);
                if (groundIntersect && newPosition.y < groundIntersect.point.y + BEE_MIN_ALTITUDE) {
                    newPosition.y = groundIntersect.point.y + BEE_MIN_ALTITUDE;
                }
                bee.model.position.copy(newPosition);
            } else {
                forceBeeWander(bee);
            }
            return;
        } else {
            bee.isRetreating = false;
        }
    }

    const beePos = bee.model.position;
    const playerPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0));
    const distanceToPlayer = beePos.distanceTo(playerPos);

    if (distanceToPlayer < BEE_DETECTION_RANGE) {
        bee.isChasing = true;
        bee.moveSpeed = BEE_CHASE_SPEED;
        if (bee.flySound && !bee.flySound.isPlaying) bee.flySound.play();

        const direction = new THREE.Vector3().subVectors(playerPos, beePos).normalize();
        bee.model.lookAt(playerPos);

        if (distanceToPlayer <= BEE_ATTACK_TRIGGER_DISTANCE) {
            if (!bee.isAttacking && !controlsLocked) {
                triggerBeeAttack(bee);
                triggerPlayerFall();
                if (!bee.isRetreating) {
                    bee.isRetreating = true;
                    bee.retreatEndTime = clock.getElapsedTime() + 5.0;
                    bee.isChasing = false;
                    bee.wanderTarget = null;
                }
                if (biteSound && !biteSound.isPlaying) biteSound.play();
            }
        } else {
            const newPosition = beePos.clone().addScaledVector(direction, bee.moveSpeed);
            const groundIntersect = getGroundIntersection(newPosition, 20);
            if (groundIntersect && newPosition.y < groundIntersect.point.y + BEE_MIN_ALTITUDE) {
                newPosition.y = groundIntersect.point.y + BEE_MIN_ALTITUDE;
            }
            bee.model.position.copy(newPosition);
        }
    } else {
        forceBeeWander(bee);
    }
}

// --- PLAYER LOGIC ---

function stopPlayerActions(): void {
    if (runAction && runAction.isRunning()) runAction.stop();
    if (walkAction && walkAction.isRunning()) walkAction.stop();
    if (jumpAction && jumpAction.isRunning()) jumpAction.stop();
    if (runningSound && runningSound.isPlaying) runningSound.stop();
    if (waterSound && waterSound.isPlaying) waterSound.stop();
}

function triggerPlayerFall(lockDuration: number = 1000): void {
    if (controlsLocked && jumpsRemaining === 0) return;
    stopPlayerActions();
    if (fallAction) fallAction.reset().play();

    controlsLocked = true;
    setTimeout(() => {
        controlsLocked = false;
        if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
            controlsLocked = true;
        }
    }, lockDuration);
}

function handlePlayerMovement() {
    if (!playerModel) return;

    if (controlsLocked) {
        if (collectedCrystals < TOTAL_EQUATIONS_TO_SOLVE) {
            if (keys["a"] || keys["A"] || keys["ArrowLeft"]) playerModel.rotation.y += rotationSpeed;
            if (keys["d"] || keys["D"] || keys["ArrowRight"]) playerModel.rotation.y -= rotationSpeed;
        }
        return;
    }

    const originalPosition = playerModel.position.clone();
    let moving = false;
    let targetPosition = playerModel.position.clone();
    const speedMultiplier = isJumping ? 1.5 : 1.0;

    if (keys["w"] || keys["W"] || keys["ArrowUp"]) {
        const forwardVector = new THREE.Vector3(0, 0, -0.1).applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(forwardVector, -moveSpeed * speedMultiplier);
        moving = true;
    }
    if (keys["s"] || keys["S"] || keys["ArrowDown"]) {
        const backwardVector = new THREE.Vector3(0, 0, -0.1).applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(backwardVector, moveSpeed * speedMultiplier);
        moving = true;
    }

    if (moving) {
        const currentIntersect = getGroundIntersection(originalPosition, playerHeight);
        let currentGroundHeight = currentIntersect ? currentIntersect.point.y : originalPosition.y - 1;

        const nextIntersect = getGroundIntersection(targetPosition, originalPosition.y - targetPosition.y + playerHeight);
        let nextGroundHeight = nextIntersect ? nextIntersect.point.y : currentGroundHeight;
        const heightDifference = nextGroundHeight - currentGroundHeight;

        const movementDirection = new THREE.Vector3().subVectors(targetPosition, originalPosition).normalize();
        const horizontalOrigin = originalPosition.clone();
        horizontalOrigin.y += playerHeight + 0.2;
        raycaster.set(horizontalOrigin, movementDirection);
        raycaster.far = COLLISION_RADIUS;
        const horizontalIntersects = raycaster.intersectObjects(worldObjects, true);
        raycaster.far = Infinity;
        let hitWall = horizontalIntersects.length > 0 && horizontalIntersects[0].distance < COLLISION_RADIUS;

        let hitAnimal = false;
        const animalCollisionRadius = 0.8;
        for (const animal of animals) {
            if (targetPosition.distanceTo(animal.position) < (COLLISION_RADIUS + animalCollisionRadius)) {
                hitAnimal = true;
                break;
            }
        }

        let hitSpider = false;
        let collidedSpider: SpiderInstance | null = null;
        for (const spider of spiders) {
            if (targetPosition.distanceTo(spider.model.position) < (COLLISION_RADIUS + SPIDER_COLLISION_RADIUS)) {
                hitSpider = true;
                collidedSpider = spider;
                break;
            }
        }

        let hitBee = false;
        let collidedBee: BeeInstance | null = null;
        for (const bee of bees) {
            if (targetPosition.distanceTo(bee.model.position) < (COLLISION_RADIUS + BEE_COLLISION_RADIUS)) {
                hitBee = true;
                collidedBee = bee;
                break;
            }
        }

        if (heightDifference > MAX_STEP_HEIGHT || hitWall || hitAnimal || hitSpider || hitBee) {
            targetPosition.x = originalPosition.x;
            targetPosition.z = originalPosition.z;
            moving = false;

            if (hitBee) {
                triggerPlayerFall();
                if (collidedBee && !collidedBee.isRetreating) {
                    collidedBee.isRetreating = true;
                    collidedBee.retreatEndTime = clock.getElapsedTime() + 5.0;
                    collidedBee.isAttacking = false;
                    collidedBee.isChasing = false;
                    collidedBee.wanderTarget = null;
                    if (collidedBee.attackAction && collidedBee.attackAction.isRunning()) collidedBee.attackAction.stop();
                    if (collidedBee.flyAction && !collidedBee.flyAction.isRunning()) collidedBee.flyAction.reset().play();
                }
                if (biteSound && !biteSound.isPlaying) biteSound.play();
            } else if (hitSpider) {
                triggerPlayerFall();
                if (collidedSpider) triggerSpiderAttack(collidedSpider);
                if (biteSound && !biteSound.isPlaying) biteSound.play();
            } else if (hitWall) {
                if (bumpSound && !bumpSoundPlayed) {
                    bumpSound.play();
                    bumpSoundPlayed = true;
                }
            }
        } else {
            bumpSoundPlayed = false;
        }
    }

    playerModel.position.x = targetPosition.x;
    playerModel.position.z = targetPosition.z;

    const finalIntersect = getGroundIntersection(playerModel.position, playerHeight);
    let isWater = false;
    let groundHeight = 0;
    let playerHeightOffset = 0;

    if (finalIntersect) {
        groundHeight = finalIntersect.point.y;
        isWater = isWaterSurface(finalIntersect.object);
        playerHeightOffset = isWater ? WATER_SINK_DEPTH : 0;

        if (isJumping) {
            jumpVelocity += JUMP_GRAVITY * 0.016;
            playerModel.position.y += jumpVelocity * 0.016;
            if (playerModel.position.y <= groundHeight + playerHeightOffset) {
                playerModel.position.y = groundHeight + playerHeightOffset;
                if (isWater && wasJumping) {
                    spawnBigSplash(playerModel.position);
                    if (waterSplashSound) {
                        waterSplashSound.stop();
                        waterSplashSound.play();
                    }
                }
                isJumping = false;
                jumpVelocity = 0;
                jumpAnimationPlayed = false;
                jumpsRemaining = MAX_JUMPS;
                if (jumpAction && jumpAction.isRunning()) jumpAction.stop();
            }
            wasJumping = true;
        } else {
            playerModel.position.y = groundHeight + playerHeightOffset;
            jumpsRemaining = MAX_JUMPS;
            wasJumping = false;
        }
    } else {
        if (playerModel.position.y > 0) playerModel.position.y -= 0.1;
    }

    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) playerModel.rotation.y += rotationSpeed;
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) playerModel.rotation.y -= rotationSpeed;

    if (moving && isWater && !isJumping) {
        if (clock.getElapsedTime() > lastSplashTime + SPLASH_EMISSION_RATE) {
            spawnSplash(playerModel.position);
            lastSplashTime = clock.getElapsedTime();
        }
    }

    if (runAction && walkAction) {
        if (!controlsLocked) {
            if (isJumping) {
                if (jumpAction && !jumpAnimationPlayed) {
                    if (runAction.isRunning()) runAction.stop();
                    if (walkAction.isRunning()) walkAction.stop();
                    jumpAction.reset().play();
                    jumpAnimationPlayed = true;
                }
                if (runningSound && runningSound.isPlaying) runningSound.stop();
                if (waterSound && waterSound.isPlaying) waterSound.stop();
            } else if (moving) {
                if (isWater) {
                    moveSpeed = WALK_SPEED;
                    if (!walkAction.isRunning()) {
                        runAction.fadeOut(0.2);
                        walkAction.reset().fadeIn(0.2).play();
                    }
                    if (waterSound && !waterSound.isPlaying) waterSound.play();
                    if (runningSound && runningSound.isPlaying) runningSound.stop();
                } else {
                    if (keys["Shift"]) {
                        moveSpeed = RUN_SPEED * 2;
                        runAction.timeScale = 2.0;
                        if (runningSound) runningSound.setPlaybackRate(2.0);
                    } else {
                        moveSpeed = RUN_SPEED;
                        runAction.timeScale = 1.0;
                        if (runningSound) runningSound.setPlaybackRate(1.0);
                    }
                    if (!runAction.isRunning()) {
                        walkAction.fadeOut(0.2);
                        runAction.reset().fadeIn(0.2).play();
                    }
                    if (runningSound && !runningSound.isPlaying) runningSound.play();
                    if (waterSound && waterSound.isPlaying) waterSound.stop();
                }
            } else {
                if (runAction.isRunning()) {
                    runAction.stop();
                    runAction.timeScale = 1.0;
                }
                if (walkAction.isRunning()) walkAction.stop();
                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
                    if (runningSound) runningSound.setPlaybackRate(1.0);
                }
                if (waterSound && waterSound.isPlaying) waterSound.stop();
            }
        } else {
            if (runAction.isRunning()) runAction.stop();
            if (walkAction.isRunning()) walkAction.stop();
        }
    }
}

function updateCameraPosition(instant: boolean = false) {
    if (!playerModel) return;

    const offset = new THREE.Vector3(0, 3, -7);
    const targetPosition = new THREE.Vector3();
    offset.applyQuaternion(playerModel.quaternion);
    targetPosition.copy(playerModel.position).add(offset);

    if (instant) camera.position.copy(targetPosition);
    else camera.position.lerp(targetPosition, 0.05);

    const lookAtPoint = playerModel.position.clone().add(new THREE.Vector3(0, 3, 0));
    camera.lookAt(lookAtPoint);
}

// --- MINIMAP LOGIC ---

function createMinimapMarker(config: {
    sphereColor: THREE.ColorRepresentation, sphereRadius: number, sphereSegments?: number,
    ringColor: THREE.ColorRepresentation, ringInnerRadius: number, ringOuterRadius: number,
    ringSegments?: number, ringOpacity?: number
}): THREE.Mesh {
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(config.sphereRadius, config.sphereSegments ?? 16, config.sphereSegments ?? 16),
        new THREE.MeshBasicMaterial({color: config.sphereColor, transparent: true, opacity: 0.9})
    );
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(config.ringInnerRadius, config.ringOuterRadius, config.ringSegments ?? 16),
        new THREE.MeshBasicMaterial({
            color: config.ringColor, side: THREE.DoubleSide,
            transparent: true, opacity: config.ringOpacity ?? 0.7
        })
    );
    ring.rotation.x = -Math.PI / 2;
    marker.add(ring);
    return marker;
}

function updateAndRenderMinimap(): void {
    if (!playerModel) return;

    minimapPlayerMarker.position.x = playerModel.position.x;
    minimapPlayerMarker.position.z = playerModel.position.z;
    minimapPlayerMarker.rotation.y = playerModel.rotation.y;

    minimapCamera.position.x = playerModel.position.x;
    minimapCamera.position.y = 200;
    minimapCamera.position.z = playerModel.position.z;
    minimapCamera.lookAt(playerModel.position.x, 50, playerModel.position.z);

    for (let i = 0; i < spiders.length; i++) {
        if (i >= minimapSpiderMarkers.length) {
            const marker = createMinimapMarker({
                sphereColor: 0x000000, sphereRadius: 3,
                ringColor: 0xff0000, ringInnerRadius: 4, ringOuterRadius: 5
            });
            minimapSpiderMarkers.push(marker);
            minimapScene.add(marker);
        }
        minimapSpiderMarkers[i].position.set(spiders[i].model.position.x, 50, spiders[i].model.position.z);
    }

    for (let i = 0; i < bees.length; i++) {
        if (i >= minimapBeeMarkers.length) {
            const marker = createMinimapMarker({
                sphereColor: 0xffff00, sphereRadius: 3,
                ringColor: 0x000000, ringInnerRadius: 4, ringOuterRadius: 5
            });
            minimapBeeMarkers.push(marker);
            minimapScene.add(marker);
        }
        minimapBeeMarkers[i].position.set(bees[i].model.position.x, 60, bees[i].model.position.z);
    }

    for (let i = 0; i < crystals.length; i++) {
        if (i >= minimapCrystalMarkers.length) {
            const crystalColor = 0x00aaff; // NOTE: This is hardcoded
            const marker = createMinimapMarker({
                sphereColor: crystalColor, sphereRadius: 2, sphereSegments: 8,
                ringColor: 0xffffff, ringInnerRadius: 2, ringOuterRadius: 3,
                ringSegments: 8, ringOpacity: 0.8
            });
            minimapCrystalMarkers.push(marker);
            minimapScene.add(marker);
        }
        minimapCrystalMarkers[i].position.set(crystals[i].position.x, 50, crystals[i].position.z);
    }

    minimapRenderer.render(minimapScene, minimapCamera);
}

// --- WIN SCREEN ---

function spawn2DFirework() {
    const winScreen = document.getElementById('win-screen');
    if (!winScreen) return;

    if (fireworkBuffer && listener) {
        const sound = new THREE.Audio(listener);
        sound.setBuffer(fireworkBuffer);
        sound.setVolume(0.5 + Math.random() * 0.3);
        sound.setPlaybackRate(0.8 + Math.random() * 1);
        sound.play();
    }

    const burst = document.createElement('div');
    burst.style.position = 'absolute';
    burst.style.left = `${Math.random() * 100}%`;
    burst.style.top = `${Math.random() * 100}%`;
    burst.style.width = '1px';
    burst.style.height = '1px';
    winScreen.appendChild(burst);

    const particleCount = 40 + Math.floor(Math.random() * 30);
    const colors = ['#FF4136', '#FF851B', '#FFDC00', '#2ECC40', '#0074D9', '#B10DC9', '#FFFFFF'];
    const burstColor = colors[Math.floor(Math.random() * colors.length)];

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.left = '0';
        particle.style.top = '0';
        const size = 2 + Math.random() * 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.backgroundColor = burstColor;
        particle.style.borderRadius = '50%';

        const angle = Math.random() * 360;
        const distance = Math.random() * 150 + 80;
        const finalX = Math.cos(angle * (Math.PI / 180)) * distance;
        const finalY = Math.sin(angle * (Math.PI / 180)) * distance;
        particle.style.setProperty('--final-x', `${finalX}px`);
        particle.style.setProperty('--final-y', `${finalY}px`);

        const delay = Math.random() * 200;
        const duration = 1.0 + Math.random() * 0.5;
        particle.style.animation = `firework-burst ${duration}s ease-out forwards`;
        particle.style.animationDelay = `${delay}ms`;
        burst.appendChild(particle);
    }
    setTimeout(() => burst.remove(), 1800);
}

function showWinScreen() {
    controlsLocked = true;
    stopPlayerActions();
    if (equationElement) equationElement.style.display = 'none';
    if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
    if (successSound) {
        successSound.stop();
        successSound.play();
    }

    const winScreen = document.createElement('div');
    winScreen.id = 'win-screen';
    winScreen.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.7); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 3em; font-family: Arial, sans-serif;
        text-align: center; white-space: pre-wrap; overflow: hidden;
    `;
    winScreen.textContent = `Gratulacje!\nRozwiązałeś ${TOTAL_EQUATIONS_TO_SOLVE} działań!`;
    document.body.appendChild(winScreen);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes firework-burst {
            0%   { transform: translate(0, 0) scale(1); opacity: 1; }
            80%  { opacity: 1; }
            100% { transform: translate(var(--final-x), var(--final-y)) scale(0); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    for (let i = 0; i < 10; i++) {
        setInterval(spawn2DFirework, 500 + Math.random() * 1000);
    }
}

// --- EVENT LISTENERS ---

window.addEventListener("keydown", (event) => {
    const key = event.key;

    const leftKeys = new Set(['a', 'A', 'ArrowLeft']);
    const rightKeys = new Set(['d', 'D', 'ArrowRight']);
    const upKeys = new Set(['w', 'W', 'ArrowUp']);
    const downKeys = new Set(['s', 'S', 'ArrowDown']);

    const rightPressed = [...rightKeys].some(k => Boolean(keys[k]));
    const leftPressed = [...leftKeys].some(k => Boolean(keys[k]));
    const upPressed = [...upKeys].some(k => Boolean(keys[k]));
    const downPressed = [...downKeys].some(k => Boolean(keys[k]));

    if ((leftKeys.has(key) && rightPressed) ||
        (rightKeys.has(key) && leftPressed) ||
        (upKeys.has(key) && downPressed) ||
        (downKeys.has(key) && upPressed)) {
        clearAllKeys();
        keys[key] = true;
        event.preventDefault();
        return;
    }

    if (event.key === "Escape") {
        clearAllKeys();
        event.preventDefault();
        return;
    }
    if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
        keys[key] = false;
        return;
    }
    if (controlsLocked && (key === "w" || key === "W" || key === "ArrowUp" || key === "s" || key === "S" || key === "ArrowDown")) {
        clearAllKeys();
        return;
    }
    if ((key === " " || key === "Spacebar") && jumpsRemaining > 0 && !controlsLocked) {
        isJumping = true;
        jumpVelocity = JUMP_FORCE;
        jumpsRemaining--;
    }
    keys[key] = true;
});


window.addEventListener("keyup", (event: KeyboardEvent) => {
    keys[event.key] = false;
});

window.addEventListener("blur", () => {
    clearAllKeys();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        clearAllKeys();
    }
});

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === null) {
        clearAllKeys();
    }
});

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- MAIN LOOP ---

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const elapsed = now - then;

    if (elapsed > interval) {
        then = now - (elapsed % interval);

        // FPS Counter
        frameCount++;
        if (now > lastTime + fpsInterval) {
            const fps = Math.round((frameCount * 1000) / (now - lastTime));
            if (fpsElement) fpsElement.textContent = `FPS: ${fps}`;
            lastTime = now;
            frameCount = 0;
        }

        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        // Update Animals
        const currentTime = clock.getElapsedTime();
        for (const animalInstance of animalInstances) {
            if (animalInstance.mixer) animalInstance.mixer.update(delta);
            if (currentTime >= animalInstance.nextAnimationChangeTime) {
                changeAnimalAnimation(animalInstance);
            }
            updateAnimalMovement(animalInstance);
        }

        // Update Spiders
        for (const spider of spiders) {
            if (spider.mixer) spider.mixer.update(delta);
            updateSpiderAI(spider);
            updateSpiderJumpBack(spider);
        }

        // Update Bees
        for (const bee of bees) {
            if (bee.mixer) bee.mixer.update(delta);
            updateBeeAI(bee);
        }

        // Update Player & Game Logic
        handlePlayerMovement();
        if (!controlsLocked) checkCrystalCollection();
        updateSplashes(delta);
        for (const crystal of crystals) crystal.rotation.y += 0.01;
        updateCameraPosition();

        // Update Dynamic Light
        if (playerModel) {
            dirLight.target.position.set(playerModel.position.x, 0, playerModel.position.z);
            dirLight.position.set(
                playerModel.position.x + 50, 50, playerModel.position.z + 50
            );
            dirLight.target.updateMatrixWorld();
        }

        // Render
        updateAndRenderMinimap();
        renderer.render(scene, camera);
        if (uiCrystalRenderer && uiCrystalScene && uiCrystalCamera) {
            for (const model of uiCrystalModels) model.rotation.y += 0.01;
            uiCrystalRenderer.render(uiCrystalScene, uiCrystalCamera);
        }
    }
}

// --- INITIALIZATION ---

setupFpsCounter();
setupLoadingBar();
setupCrystalUI();
setupEquationUI();

const animalCount = 10;
const spiderCount = 3;
const beeCount = 3;

// Initialize loading with total steps: sun (1) + clouds (1) + player (2 steps) + world (2 steps) + animals + spiders + bees + crystals + UI
initializeLoading(1 + 1 + 2 + 2 + animalCount + spiderCount + beeCount + TOTAL_CRYSTALS + 1);

createSun()
    .then(() => createClouds())
    .then(() => createPlayer())
    .then(() => createWorld())
    .then(() => spawnAnimals(animalCount))
    .then(() => spawnSpiders(spiderCount))
    .then(() => spawnBees(beeCount))
    .then(() => loadUICrystalTemplate())
    .then(() => generateNewEquationAndRespawnCrystals());

animate();