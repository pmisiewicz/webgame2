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
import fireworkSoundUrl from "/src/sfx/firework.mp3"; // <-- ADDED

const scene = new THREE.Scene();
const skyColor = 0x87ceeb;
scene.background = new THREE.Color(skyColor);

const FOG_NEAR = 50;
const FOG_FAR = 150;
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

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const isMobile = window.matchMedia('(pointer: coarse)').matches;

// Minimap setup - 3D renderer with top-down view
const MINIMAP_SIZE = isMobile ? 120 : 250;
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

// Minimap scene and camera
const minimapScene = new THREE.Scene();
minimapScene.background = new THREE.Color(0x87ceeb); // Sky blue background

const minimapCamera = new THREE.OrthographicCamera(
    -75, 75,  // left, right
    75, -75,  // top, bottom
    1, 500
);
minimapCamera.position.set(0, 200, 0); // High top-down view
minimapCamera.lookAt(0, 0, 0);

// Minimap lighting
const minimapLight = new THREE.DirectionalLight(0xffffff, 1);
minimapLight.position.set(0, 50, 0);
minimapScene.add(minimapLight);
const minimapAmbient = new THREE.AmbientLight(0xffffff, 0.2);
minimapScene.add(minimapAmbient);

// References for minimap entities
let minimapWorldModel: THREE.Group | null = null;

// Player marker - just a white arrow pointing forward
const minimapPlayerArrow = new THREE.Mesh(
    new THREE.ConeGeometry(3, 8, 8),
    new THREE.MeshBasicMaterial({color: 0xffffff})
);
minimapPlayerArrow.rotation.x = Math.PI / 2; // Point the cone forward

// Wrap arrow in a group so we can rotate on Y axis properly
const minimapPlayerMarker = new THREE.Group();
minimapPlayerMarker.add(minimapPlayerArrow);
minimapPlayerMarker.position.y = 50; // High above terrain
minimapScene.add(minimapPlayerMarker);

// Spider markers (no animal markers)
const minimapSpiderMarkers: THREE.Mesh[] = [];

// Bee markers
const minimapBeeMarkers: THREE.Mesh[] = [];

// Crystal markers
const minimapCrystalMarkers: THREE.Mesh[] = [];

// --- Crystal Collected UI (Top Right) ---
const TOTAL_CRYSTALS = 10; // This is now TOTAL_EQUATIONS_TO_SOLVE
const TOTAL_EQUATIONS_TO_SOLVE = TOTAL_CRYSTALS;
const UI_CRYSTAL_SIZE = isMobile ? 20 : 50; // This is the HEIGHT of the renderer
const UI_CRYSTAL_CAM_HEIGHT = 3.0; // Vertical units visible in UI camera
const UI_CRYSTAL_SCALE = 0.3; // Scale of crystal models in the UI

let uiCrystalRenderer: THREE.WebGLRenderer | null = null;
let uiCrystalScene: THREE.Scene | null = null;
let uiCrystalCamera: THREE.OrthographicCamera | null = null; // Changed to Orthographic
let uiCrystalTemplate: THREE.Group | null = null; // This is the template we will clone
const uiCrystalModels: THREE.Group[] = []; // Array to hold collected crystal models
let uiCrystalCountElement: HTMLElement | null = null;
let collectedCrystals = 0; // This now tracks solved equations

// --- Equation UI (Top Center) ---
let equationElement: HTMLElement | null = null;
let currentTargetNumber: number = 0;
let currentEquation: string = "";

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

const loader = new GLTFLoader();

let runningSound: THREE.PositionalAudio | null = null;
let waterSound: THREE.PositionalAudio | null = null;
let bumpSound: THREE.PositionalAudio | null = null;
let backgroundMusic: THREE.Audio | null = null;
let biteSound: THREE.PositionalAudio | null = null;
let errorSound: THREE.PositionalAudio | null = null;
let waterSplashSound: THREE.PositionalAudio | null = null;
let successSound: THREE.Audio | null = null;
let fireworkBuffer: AudioBuffer | null = null; // <-- ADDED

let playerModel: THREE.Group | null = null;
const RUN_SPEED = 1.2;
const WALK_SPEED = 0.6;
let moveSpeed = RUN_SPEED;
const rotationSpeed = 0.035;
const MAX_STEP_HEIGHT = 1;
const WATER_SINK_DEPTH = -0.4;
let playerHeight = 1;
const COLLISION_RADIUS = 0.8;
const keys: { [key: string]: boolean } = {};
let controlsLocked: boolean = false;

const tempBumpVector = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

const worldObjects: THREE.Mesh[] = [];

const clouds: THREE.Group[] = [];

const animalModels = [
    "Alpaca.gltf",
    "Deer.gltf",
    "Fox.gltf",
    "Horse.gltf",
    "Horse_White.gltf",
    "Husky.gltf",
    "ShibaInu.gltf",
    "Stag.gltf",
    "Wolf.gltf"
];

const animals: THREE.Group[] = [];

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

// Spider enemy system
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
const SPIDER_DETECTION_RANGE = 10;
const SPIDER_CHASE_SPEED = 0.05;
const SPIDER_WANDER_SPEED = 0.02;
const SPIDER_COLLISION_RADIUS = 0.6;
const SPIDER_JUMP_BACK_DISTANCE = 2;
const SPIDER_JUMP_BACK_DURATION = 0.5;

// Bee enemy system
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

let mixer: THREE.AnimationMixer | null = null;
let runAction: THREE.AnimationAction | null = null;
let walkAction: THREE.AnimationAction | null = null;
let fallAction: THREE.AnimationAction | null = null;
let jumpAction: THREE.AnimationAction | null = null;
const clock = new THREE.Clock();

let isJumping = false;
let jumpVelocity = 0;
let jumpAnimationPlayed = false;
let wasJumping = false; // Track if player was jumping in previous frame
const JUMP_FORCE = 10;
const JUMP_GRAVITY = -30;
const MAX_JUMPS = 2;
let jumpsRemaining = MAX_JUMPS;
let bumpSoundPlayed = false;

const FPS_LIMIT = 60;
const interval = 1000 / FPS_LIMIT;
let then = performance.now();

let fpsElement: HTMLElement | null = null;
let frameCount = 0;
let lastTime = performance.now();
const fpsInterval = 1000;

const SPLASH_PARTICLE_COUNT = 16;
const SPLASH_LIFESPAN = 1;
const SPLASH_COLOR = 0x6FBFC9;
const SPLASH_EMISSION_RATE = 0.15;
let lastSplashTime = 0;

const BIG_SPLASH_PARTICLE_COUNT = 150;
const BIG_SPLASH_SPREAD = 1.5;
const BIG_SPLASH_VELOCITY_MULTIPLIER = 2.5;

const CRYSTAL_PARTICLE_COUNT = 100;
const CRYSTAL_LIFESPAN = 0.8;
const CRYSTAL_PARTICLE_SPEED = 5;
const CRYSTAL_COLLECT_RADIUS = 1.5;

const GRAVITY = -9.8 * 0.5;

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

/**
 * Checks if a mesh object is a water surface by examining its material color.
 * @param object The THREE.Mesh object to check
 * @returns true if the object is water, false otherwise
 */
function isWaterSurface(object: THREE.Object3D): boolean {
    const mesh = object as THREE.Mesh;
    if (mesh.material && "color" in mesh.material) {
        const materialColor = (mesh.material as THREE.MeshStandardMaterial).color;
        return materialColor.getHex() === 0x00bfd4 || materialColor.getHex() === 0x81dfeb;
    }
    return false;
}

/**
 * Gets the ground height at a given position using raycasting.
 * @param position The position to check
 * @param raycastHeight The height to start the raycast from (default: 10)
 * @returns Object containing groundY and hitObject, or null if no ground found
 */
function getGroundHeight(position: THREE.Vector3, raycastHeight: number = 10): {
    groundY: number;
    hitObject: THREE.Mesh
} | null {
    const groundCheckOrigin = position.clone();
    groundCheckOrigin.y += raycastHeight;
    const downVector = new THREE.Vector3(0, -1, 0);

    raycaster.set(groundCheckOrigin, downVector);
    const groundIntersects = raycaster.intersectObjects(worldObjects, true);

    if (groundIntersects.length > 0) {
        return {
            groundY: groundIntersects[0].point.y,
            hitObject: groundIntersects[0].object as THREE.Mesh
        };
    }
    return null;
}

/**
 * Stops all player movement animations and sounds.
 */
function stopPlayerActions(): void {
    // Stop all animations
    if (runAction && runAction.isRunning()) runAction.stop();
    if (walkAction && walkAction.isRunning()) walkAction.stop();
    if (jumpAction && jumpAction.isRunning()) jumpAction.stop();

    // Stop all movement sounds
    if (runningSound && runningSound.isPlaying) runningSound.stop();
    if (waterSound && waterSound.isPlaying) waterSound.stop();
}

/**
 * Triggers the player fall animation and temporarily locks controls.
 * @param lockDuration Duration to lock controls in milliseconds (default: 1000)
 */
function triggerPlayerFall(lockDuration: number = 1000): void {
    // Don't trigger fall if game is already won/controls permanently locked
    if (controlsLocked && jumpsRemaining === 0) return;

    stopPlayerActions();

    // Play fall animation
    if (fallAction) {
        fallAction.reset().play();
    }

    // Lock controls temporarily
    controlsLocked = true;
    setTimeout(() => {
        controlsLocked = false;
        // Check if the game-win lock is also active
        if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
            controlsLocked = true;
        }
    }, lockDuration);
}

/**
 * Updates minimap entity positions and renders the 3D minimap view.
 */
function updateAndRenderMinimap(): void {
    if (!playerModel) return;

    // Update player marker position and rotation
    minimapPlayerMarker.position.x = playerModel.position.x;
    minimapPlayerMarker.position.z = playerModel.position.z;
    minimapPlayerMarker.rotation.y = playerModel.rotation.y;

    // Update camera to follow player - position camera high and look at marker level
    minimapCamera.position.x = playerModel.position.x;
    minimapCamera.position.y = 200;
    minimapCamera.position.z = playerModel.position.z;
    minimapCamera.lookAt(playerModel.position.x, 50, playerModel.position.z);

    // Update spider markers - visible but not too large
    for (let i = 0; i < spiders.length; i++) {
        if (i >= minimapSpiderMarkers.length) {
            // Create new spider marker - red sphere with ring
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(3, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.9
                })
            );

            // Add glowing ring around spider
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(4, 5, 16),
                new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.7
                })
            );
            ring.rotation.x = -Math.PI / 2;
            marker.add(ring);

            minimapSpiderMarkers.push(marker);
            minimapScene.add(marker);
        }
        const spider = spiders[i];
        const marker = minimapSpiderMarkers[i];
        marker.position.x = spider.model.position.x;
        marker.position.y = 50; // Same height as player marker
        marker.position.z = spider.model.position.z;
    }

    // Update bee markers
    for (let i = 0; i < bees.length; i++) {
        if (i >= minimapBeeMarkers.length) {
            // Create new bee marker - yellow sphere with black ring
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(3, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: 0xffff00, // Yellow
                    transparent: true,
                    opacity: 0.9
                })
            );

            // Add black ring
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(4, 5, 16),
                new THREE.MeshBasicMaterial({
                    color: 0x000000, // Black
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.7
                })
            );
            ring.rotation.x = -Math.PI / 2;
            marker.add(ring);

            minimapBeeMarkers.push(marker);
            minimapScene.add(marker);
        }
        const bee = bees[i];
        const marker = minimapBeeMarkers[i];
        marker.position.x = bee.model.position.x;
        // Bees are flying, so raise their marker slightly higher
        marker.position.y = 60;
        marker.position.z = bee.model.position.z;
    }

    // Update crystal markers - match crystal colors
    for (let i = 0; i < crystals.length; i++) {
        if (i >= minimapCrystalMarkers.length) {
            // Get the crystal's color
            const crystalColor = 0x00aaff;

            // Create new crystal marker with matching color
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(2, 8, 8),
                new THREE.MeshBasicMaterial({
                    color: crystalColor,
                    transparent: true,
                    opacity: 0.9
                })
            );

            // Add small glow ring with matching color
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(2, 3, 8),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8
                })
            );
            ring.rotation.x = -Math.PI / 2;
            marker.add(ring);

            minimapCrystalMarkers.push(marker);
            minimapScene.add(marker);
        }
        const crystal = crystals[i];
        const marker = minimapCrystalMarkers[i];
        marker.position.x = crystal.position.x;
        marker.position.y = 50; // Same height as player marker
        marker.position.z = crystal.position.z;
    }

    // Render minimap
    minimapRenderer.render(minimapScene, minimapCamera);
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

async function createSun() {
    incrementLoadingProgress('Creating Sun...');

    const sunGroup = new THREE.Group();

    const sunGeometry = new THREE.SphereGeometry(8, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xfdb813,
        transparent: false,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sunGroup.add(sun);

    const glowGeometry1 = new THREE.SphereGeometry(9.5, 32, 32);
    const glowMaterial1 = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.3,
    });
    const glow1 = new THREE.Mesh(glowGeometry1, glowMaterial1);
    sunGroup.add(glow1);

    const glowGeometry2 = new THREE.SphereGeometry(11, 32, 32);
    const glowMaterial2 = new THREE.MeshBasicMaterial({
        color: 0xffe4b5,
        transparent: true,
        opacity: 0.2,
    });
    const glow2 = new THREE.Mesh(glowGeometry2, glowMaterial2);
    sunGroup.add(glow2);

    const glowGeometry3 = new THREE.SphereGeometry(13, 32, 32);
    const glowMaterial3 = new THREE.MeshBasicMaterial({
        color: 0xffffe0,
        transparent: true,
        opacity: 0.1,
    });
    const glow3 = new THREE.Mesh(glowGeometry3, glowMaterial3);
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
        const sphereGeometry = new THREE.SphereGeometry(
            Math.random() * 2 + 1,
            8,
            8,
        );
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
    incrementLoadingProgress('Creating Clouds...');

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

function isMesh(child: THREE.Object3D): child is THREE.Mesh {
    return (child as THREE.Mesh).isMesh && 'geometry' in child;
}

async function createWorld() {
    try {
        const {model} = await loadModel("Nature.glb");
        incrementLoadingProgress('Loading World...');

        model.scale.setScalar(50);
        model.position.set(0, 10, 0);

        model.traverse((child) => {
            if (isMesh(child)) {
                worldObjects.push(child);

                const geometry = child.geometry as THREE.BufferGeometry;

                if (geometry.isBufferGeometry) {
                    // Ensures the raycaster can return a 'face' and 'face.normal' - fixes shadows
                    geometry.computeVertexNormals();

                    (geometry as any).boundsTree = new MeshBVH(geometry);
                    child.raycast = acceleratedRaycast;
                }
            }
        });

        scene.add(model);

        // Clone the world model for minimap
        minimapWorldModel = model.clone();
        minimapWorldModel.scale.setScalar(50);
        minimapWorldModel.position.set(0, 10, 0);
        minimapScene.add(minimapWorldModel);

        incrementLoadingProgress('World Loaded');
    } catch (err) {
        console.warn("Błąd ładowania modelu Nature.glb:", err);
        incrementLoadingProgress('World Load Failed');
    }
}

async function spawnAnimals(count: number) {
    const areaSize = 250;
    const spawnAttempts = 15; // Increase attempts to find better spots

    for (let i = 0; i < count; i++) {
        // Pick a random animal model
        const randomAnimalModel = animalModels[Math.floor(Math.random() * animalModels.length)];

        try {
            const {model, animations} = await loadModel(randomAnimalModel);

            incrementLoadingProgress(`Loading Animals... (${i + 1}/${count})`);

            // Random scale variation for each animal
            const scaleFactor = 0.4 + Math.random() * 0.3; // 0.4 to 0.7
            model.scale.setScalar(scaleFactor);

            // Random rotation
            model.rotation.y = Math.random() * Math.PI * 2;

            // Try to find a valid position on the ground
            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < spawnAttempts) {
                attempts++;

                // Random position
                const x = (Math.random() - 0.5) * areaSize;
                const z = (Math.random() - 0.5) * areaSize;
                const y = 50; // Start high and raycast down

                // Raycast down to find ground
                const origin = new THREE.Vector3(x, y, z);
                raycaster.set(origin, down);
                const intersects = raycaster.intersectObjects(worldObjects, true);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const hitPoint = intersects[0].point;
                    const hitObject = intersects[0].object as THREE.Mesh;

                    // Get the surface normal at the hit point
                    const face = intersects[0].face;
                    let surfaceNormal = new THREE.Vector3(0, 1, 0); // Default upward normal

                    if (face) {
                        surfaceNormal = face.normal.clone();
                        // Transform normal to world space
                        surfaceNormal.transformDirection(hitObject.matrixWorld);
                    }

                    // Check if the surface is too steep (slope check)
                    // A perfectly flat surface has normal (0, 1, 0), dot product = 1
                    // A 45-degree slope has dot product ~0.707
                    const upVector = new THREE.Vector3(0, 1, 0);
                    const slopeDot = surfaceNormal.dot(upVector);
                    const minSlopeDot = 0.85; // Roughly 30 degrees max slope

                    // Check if it's not water
                    const isWater = isWaterSurface(hitObject);

                    // Additional check: make sure there's clearance above (not under a tree canopy)
                    const clearanceHeight = 3.0;
                    const clearanceOrigin = hitPoint.clone();
                    clearanceOrigin.y += 0.1; // Start just above ground
                    const upRay = new THREE.Vector3(0, 1, 0);
                    raycaster.set(clearanceOrigin, upRay);
                    raycaster.far = clearanceHeight;
                    const clearanceIntersects = raycaster.intersectObjects(worldObjects, true);
                    raycaster.far = Infinity;

                    const hasClearance = clearanceIntersects.length === 0;

                    // Accept position if: not water, not too steep, has clearance, and not too high
                    const maxHeight = 15; // Don't spawn too high up (on tall rocks/trees)
                    if (!isWater && slopeDot >= minSlopeDot && hasClearance && groundY < maxHeight) {
                        model.position.set(x, groundY, z);
                        validPosition = true;
                    }
                }
            }

            if (!validPosition) {
                model.position.set(0, 0, 0);
            }

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                }
            });

            let animalMixer: THREE.AnimationMixer | null = null;
            let animalAction: THREE.AnimationAction | null = null;
            let animalDeathAction: THREE.AnimationAction | null = null;
            let allowedAnimations: THREE.AnimationClip[] = [];
            let walkAnimation: THREE.AnimationClip | null = null;

            if (animations && animations.length > 0) {
                animalMixer = new THREE.AnimationMixer(model);

                // Find idle/eating animations
                allowedAnimations = animations.filter(clip => {
                    const name = clip.name.toLowerCase();
                    return (name.includes('eating') || name.includes('idle'))
                        && !name.includes('jump')
                        && !name.includes('hit')
                        && !name.includes('walk');
                });

                // Find walk animation
                walkAnimation = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    return name.includes('walk') && !name.includes('death') && !name.includes('hit');
                }) || null;

                if (walkAnimation) {
                    console.log(`Found walk animation "${walkAnimation.name}" for ${randomAnimalModel}`);
                }

                // Find death animation
                const deathClip = animations.find(clip => clip.name.toLowerCase().includes('death'));

                if (allowedAnimations.length > 0) {
                    // Pick a random animation clip from allowed animations
                    const randomClip = allowedAnimations[Math.floor(Math.random() * allowedAnimations.length)];
                    animalAction = animalMixer.clipAction(randomClip);
                    animalAction.setLoop(THREE.LoopRepeat, Infinity);
                    animalAction.play();

                    console.log(`Playing animation "${randomClip.name}" for ${randomAnimalModel}`);
                } else {
                    console.log(`No Eating/Idle animations found for ${randomAnimalModel}`);
                }

                // Setup death animation if available
                if (deathClip) {
                    animalDeathAction = animalMixer.clipAction(deathClip);
                    animalDeathAction.setLoop(THREE.LoopOnce, 1);
                    animalDeathAction.clampWhenFinished = true;
                    console.log(`Death animation "${deathClip.name}" ready for ${randomAnimalModel}`);
                }
            }

            scene.add(model);
            animals.push(model);
            animalInstances.push({
                model: model,
                mixer: animalMixer,
                action: animalAction,
                deathAction: animalDeathAction,
                isPlayingDeath: false,
                allowedAnimations: allowedAnimations,
                walkAnimation: walkAnimation,
                nextAnimationChangeTime: clock.getElapsedTime() + 2 + Math.random() * 8, // 2-10 seconds
                isWalking: false,
                walkEndTime: 0,
                moveSpeed: 0.01 + Math.random() * 0.03
            });

        } catch (err) {
            console.warn(`Failed to load animal model ${randomAnimalModel}:`, err);
        }
    }

    console.log(`Spawned ${animals.length} animals on the map`);
}

async function spawnSpiders(count: number) {
    const areaSize = 200;
    const spawnAttempts = 15;
    const MIN_DISTANCE_FROM_PLAYER = 50; // Minimum distance from player spawn point
    const playerStartPos = new THREE.Vector3(5, 0, 8); // Player starting position (y doesn't matter for distance check)

    for (let i = 0; i < count; i++) {
        try {
            const {model, animations} = await loadModel("Spider.glb");

            incrementLoadingProgress(`Loading Spiders... (${i + 1}/${count})`);

            // Spider scale
            const scaleFactor = 0.33;
            model.scale.setScalar(scaleFactor);

            // Random rotation
            model.rotation.y = Math.random() * Math.PI * 2;

            // Try to find a valid position on the ground
            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < spawnAttempts) {
                attempts++;

                const x = (Math.random() - 0.5) * areaSize;
                const z = (Math.random() - 0.5) * areaSize;
                const y = 50;

                // Check distance from player starting position
                const spawnPos = new THREE.Vector3(x, 0, z);
                const distanceFromPlayer = spawnPos.distanceTo(playerStartPos);

                if (distanceFromPlayer < MIN_DISTANCE_FROM_PLAYER) {
                    continue; // Too close to player, try again
                }

                const origin = new THREE.Vector3(x, y, z);
                raycaster.set(origin, down);
                const intersects = raycaster.intersectObjects(worldObjects, true);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const hitPoint = intersects[0].point;
                    const hitObject = intersects[0].object as THREE.Mesh;

                    const isWater = isWaterSurface(hitObject);

                    const clearanceHeight = 3.0;
                    const clearanceOrigin = hitPoint.clone();
                    clearanceOrigin.y += 0.1;
                    const upRay = new THREE.Vector3(0, 1, 0);
                    raycaster.set(clearanceOrigin, upRay);
                    raycaster.far = clearanceHeight;
                    const clearanceIntersects = raycaster.intersectObjects(worldObjects, true);
                    raycaster.far = Infinity;

                    const hasClearance = clearanceIntersects.length === 0;
                    const maxHeight = 15;

                    // Spiders can spawn on steep surfaces - only check water, clearance, max height, and distance from player
                    if (!isWater && hasClearance && groundY < maxHeight) {
                        model.position.set(x, groundY, z);
                        validPosition = true;
                    }
                }
            }

            if (!validPosition) {
                model.position.set(0, 0, 0);
            }

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                }
            });

            let spiderMixer: THREE.AnimationMixer | null = null;
            let spiderWalkAction: THREE.AnimationAction | null = null;
            let spiderAttackAction: THREE.AnimationAction | null = null;

            if (animations && animations.length > 0) {
                spiderMixer = new THREE.AnimationMixer(model);

                // Find walk/idle animation
                const walkClip = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    console.log(clip.name.toLowerCase())
                    return name.includes('walk');
                });

                // Find attack animation
                const attackClip = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    return name.includes('attack') || name.includes('bite');
                });

                if (walkClip) {
                    spiderWalkAction = spiderMixer.clipAction(walkClip);
                    spiderWalkAction.setLoop(THREE.LoopRepeat, Infinity);
                    spiderWalkAction.play();
                    console.log(`Spider playing animation "${walkClip.name}"`);
                } else if (animations.length > 0) {
                    // Just use the first animation if no walk found
                    spiderWalkAction = spiderMixer.clipAction(animations[0]);
                    spiderWalkAction.setLoop(THREE.LoopRepeat, Infinity);
                    spiderWalkAction.play();
                    console.log(`Spider playing first animation "${animations[0].name}"`);
                }

                // Setup attack animation if available
                if (attackClip) {
                    spiderAttackAction = spiderMixer.clipAction(attackClip);
                    spiderAttackAction.setLoop(THREE.LoopOnce, 1);
                    spiderAttackAction.clampWhenFinished = true;
                    console.log(`Spider attack animation "${attackClip.name}" ready`);
                } else {
                    console.log('No attack animation found for spider, will use first animation');
                    // Use first animation as attack if no specific attack animation
                    if (animations.length > 0) {
                        spiderAttackAction = spiderMixer.clipAction(animations[0]);
                        spiderAttackAction.setLoop(THREE.LoopOnce, 1);
                        spiderAttackAction.clampWhenFinished = true;
                    }
                }
            }

            scene.add(model);
            spiders.push({
                model: model,
                mixer: spiderMixer,
                walkAction: spiderWalkAction,
                attackAction: spiderAttackAction,
                isChasing: false,
                moveSpeed: SPIDER_WANDER_SPEED,
                isAttacking: false,
                isJumpingBack: false,
                jumpBackStartTime: 0,
                jumpBackDuration: SPIDER_JUMP_BACK_DURATION,
                jumpBackStartPos: null,
                jumpBackEndPos: null
            });

        } catch (err) {
            console.warn(`Failed to load spider model:`, err);
        }
    }

    console.log(`Spawned ${spiders.length} spiders on the map`);
}

async function spawnBees(count: number) {
    const areaSize = 200;
    const spawnAttempts = 15;
    const MIN_DISTANCE_FROM_PLAYER = 40;
    const playerStartPos = new THREE.Vector3(5, 0, 8);

    for (let i = 0; i < count; i++) {
        try {
            const {model, animations} = await loadModel("Armabee Evolved.glb");

            incrementLoadingProgress(`Loading Bees... (${i + 1}/${count})`);

            // Bee scale
            const scaleFactor = 0.25;
            model.scale.setScalar(scaleFactor);

            // Random rotation
            model.rotation.y = Math.random() * Math.PI * 2;

            // Try to find a valid position
            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < spawnAttempts) {
                attempts++;

                const x = (Math.random() - 0.5) * areaSize;
                const z = (Math.random() - 0.5) * areaSize;
                const y = 50; // Raycast from high up

                // Check distance from player starting position
                const spawnPos = new THREE.Vector3(x, 0, z);
                const distanceFromPlayer = spawnPos.distanceTo(playerStartPos);

                if (distanceFromPlayer < MIN_DISTANCE_FROM_PLAYER) {
                    continue; // Too close to player, try again
                }

                // Raycast down to find ground
                const origin = new THREE.Vector3(x, y, z);
                raycaster.set(origin, down);
                const intersects = raycaster.intersectObjects(worldObjects, true);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const hitPoint = intersects[0].point;

                    // Check for clearance *above* the ground, but *at* spawn height
                    const clearanceHeight = 3.0; // Check 3m bubble around bee
                    const clearanceOrigin = hitPoint.clone();
                    clearanceOrigin.y = groundY + BEE_SPAWN_ALTITUDE; // Check at actual spawn height
                    const upRay = new THREE.Vector3(0, 1, 0);
                    raycaster.set(clearanceOrigin, upRay);
                    raycaster.far = clearanceHeight;
                    const clearanceIntersects = raycaster.intersectObjects(worldObjects, true);
                    raycaster.far = Infinity;

                    const hasClearance = clearanceIntersects.length === 0;
                    const maxHeight = 15; // Ground height max

                    // Bees can spawn over water, but check clearance and ground height
                    if (hasClearance && groundY < maxHeight) {
                        model.position.set(x, groundY + BEE_SPAWN_ALTITUDE, z);
                        validPosition = true;
                    }
                }
            }

            if (!validPosition) {
                model.position.set(0, BEE_SPAWN_ALTITUDE, 0); // Fallback
            }

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                }
            });

            // Load bee flying sound
            let beeFlySound: THREE.PositionalAudio | null = null;
            if (listener) {
                beeFlySound = new THREE.PositionalAudio(listener);
                audioLoader.load(
                    beeFlyingSoundUrl,
                    function (buffer) {
                        if (beeFlySound) {
                            beeFlySound.setBuffer(buffer);
                            beeFlySound.setLoop(true);
                            beeFlySound.setVolume(0.8); // Adjust volume
                            beeFlySound.setRefDistance(5); // Adjust distance
                        }
                    },
                    undefined,
                    (err) => {
                        console.error("Error loading bee flying sound:", err);
                    },
                );
                model.add(beeFlySound); // Add sound to the bee model
            }

            let beeMixer: THREE.AnimationMixer | null = null;
            let beeFlyAction: THREE.AnimationAction | null = null;
            let beeAttackAction: THREE.AnimationAction | null = null;

            if (animations && animations.length > 0) {
                beeMixer = new THREE.AnimationMixer(model);

                // Find fly/idle animation
                let flyClip = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    return name.includes('fly');
                });
                if (!flyClip) {
                    flyClip = animations.find(clip => clip.name.toLowerCase().includes('idle'));
                }

                // Find attack animation
                const attackClip = animations.find(clip => {
                    const name = clip.name.toLowerCase();
                    return name.includes('attack') || name.includes('bite');
                });

                if (flyClip) {
                    beeFlyAction = beeMixer.clipAction(flyClip);
                    beeFlyAction.setLoop(THREE.LoopRepeat, Infinity);
                    beeFlyAction.play();
                    console.log(`Bee playing animation "${flyClip.name}"`);
                } else if (animations.length > 0) {
                    // Just use the first animation if no fly/idle found
                    beeFlyAction = beeMixer.clipAction(animations[0]);
                    beeFlyAction.setLoop(THREE.LoopRepeat, Infinity);
                    beeFlyAction.play();
                    console.log(`Bee playing first animation "${animations[0].name}"`);
                }

                // Setup attack animation if available
                if (attackClip) {
                    beeAttackAction = beeMixer.clipAction(attackClip);
                    beeAttackAction.setLoop(THREE.LoopOnce, 1);
                    beeAttackAction.clampWhenFinished = true;
                    console.log(`Bee attack animation "${attackClip.name}" ready`);
                } else {
                    console.log('No attack animation found for bee, will use first animation');
                    if (animations.length > 0) {
                        beeAttackAction = beeMixer.clipAction(animations[0]);
                        beeAttackAction.setLoop(THREE.LoopOnce, 1);
                        beeAttackAction.clampWhenFinished = true;
                    }
                }
            }

            scene.add(model);
            bees.push({
                model: model,
                mixer: beeMixer,
                flyAction: beeFlyAction,
                attackAction: beeAttackAction,
                flySound: beeFlySound,
                isChasing: false,
                moveSpeed: BEE_WANDER_SPEED,
                baseAltitude: model.position.y,
                wanderTarget: null,
                isAttacking: false,
                lastAttackTime: 0,
                attackStartTime: 0,
                attackStartPos: null,
                attackEndPos: null,
                isRetreating: false,
                retreatEndTime: 0
            });

        } catch (err) {
            console.warn(`Failed to load bee model:`, err);
        }
    }

    console.log(`Spawned ${bees.length} bees on the map`);
}

function triggerSpiderAttack(spider: SpiderInstance) {
    if (spider.isAttacking || spider.isJumpingBack || !spider.attackAction || !spider.mixer) {
        return;
    }

    spider.isAttacking = true;

    // Stop walk animation and play attack
    if (spider.walkAction && spider.walkAction.isRunning()) {
        spider.walkAction.stop();
    }

    spider.attackAction.reset().play();
    console.log('Spider attacking!');

    // Setup event listener for when attack animation finishes
    const onAttackFinished = (e: any) => {
        if (e.action === spider.attackAction) {
            spider.attackAction!.stop();
            spider.isAttacking = false;

            // Start jump back
            if (playerModel) {
                const spiderPos = spider.model.position;
                const playerPos = playerModel.position;

                // Calculate direction away from player
                const direction = new THREE.Vector3().subVectors(spiderPos, playerPos);
                direction.y = 0;
                direction.normalize();

                spider.jumpBackStartPos = spiderPos.clone();
                spider.jumpBackEndPos = spiderPos.clone().addScaledVector(direction, SPIDER_JUMP_BACK_DISTANCE);
                spider.jumpBackStartTime = clock.getElapsedTime();
                spider.isJumpingBack = true;
            }

            // Remove this specific listener
            spider.mixer!.removeEventListener('finished', onAttackFinished);
        }
    };
    spider.mixer.addEventListener('finished', onAttackFinished);
}

function updateSpiderJumpBack(spider: SpiderInstance) {
    if (!spider.isJumpingBack || !spider.jumpBackStartPos || !spider.jumpBackEndPos) {
        return;
    }

    const currentTime = clock.getElapsedTime();
    const elapsed = currentTime - spider.jumpBackStartTime;
    const progress = Math.min(elapsed / spider.jumpBackDuration, 1);

    // Ease-out interpolation for smooth jump back
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    // Interpolate position
    const currentPos = spider.jumpBackStartPos.clone().lerp(spider.jumpBackEndPos, easeProgress);

    // Check ground height at current position
    const groundResult = getGroundHeight(currentPos);

    if (groundResult) {
        spider.model.position.x = currentPos.x;
        spider.model.position.z = currentPos.z;
        spider.model.position.y = groundResult.groundY;
    }

    // Jump back complete
    if (progress >= 1) {
        spider.isJumpingBack = false;
        spider.jumpBackStartPos = null;
        spider.jumpBackEndPos = null;

        // Resume walk animation
        if (spider.walkAction) {
            spider.walkAction.reset().play();
        }
    }
}

function triggerBeeAttack(bee: BeeInstance) {
    const currentTime = clock.getElapsedTime();
    if (bee.isAttacking || currentTime < bee.lastAttackTime + BEE_ATTACK_COOLDOWN || !playerModel) {
        return;
    }

    bee.isAttacking = true;
    bee.lastAttackTime = currentTime;
    bee.attackStartTime = currentTime;
    bee.attackStartPos = bee.model.position.clone();
    bee.attackEndPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0)); // Target player center

    if (bee.flyAction && bee.flyAction.isRunning()) {
        bee.flyAction.stop();
    }
    if (bee.attackAction) {
        bee.attackAction.reset().play();
    }

    console.log('Bee attacking!');
}

function updateBeeAttackDash(bee: BeeInstance) {
    if (!bee.isAttacking || !bee.attackStartPos || !bee.attackEndPos) {
        return;
    }

    const currentTime = clock.getElapsedTime();
    const elapsed = currentTime - bee.attackStartTime;
    let progress = elapsed / BEE_ATTACK_DASH_DURATION;

    if (progress >= 1) {
        progress = 1;
        bee.isAttacking = false;
        bee.attackStartPos = null;
        bee.attackEndPos = null;

        if (bee.attackAction && bee.attackAction.isRunning()) {
            bee.attackAction.stop();
        }
        if (bee.flyAction && !bee.flyAction.isRunning()) {
            bee.flyAction.reset().play();
        }
    }

    if (bee.attackStartPos && bee.attackEndPos) {
        // Ease-out interpolation for the dash
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentPos = bee.attackStartPos.clone().lerp(bee.attackEndPos, easeProgress);
        bee.model.position.copy(currentPos);
    }
}

// Crystal system
const crystals: THREE.Group[] = [];

/**
 * Creates a 3D text label (a billboard) for a crystal.
 * This works by drawing text onto a 2D canvas and using that as a texture
 * on a THREE.Sprite, which always faces the camera.
 * @param text The number to display (e.g., "1").
 * @param color The THREE.Color of the crystal's glow.
 * @returns A THREE.Sprite with the number texture.
 */
function createCrystalNumber(text: string, color: THREE.Color): THREE.Sprite { // <-- 1. Return THREE.Sprite
    const canvas = document.createElement('canvas');
    const canvasSize = 128; // Texture resolution (power of 2)
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const context = canvas.getContext('2d');
    if (!context) {
        // Fallback in case canvas fails
        return new THREE.Sprite(); // <-- 2. Return empty Sprite
    }

    // --- Setup Font Style ---
    const fontSize = 100;
    // Use a common "cartoon-like" font, fallback to sans-serif
    context.font = `bold ${fontSize}px "Comic Sans MS", Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle'; // Center text vertically

    // --- Draw Black Border ---
    context.strokeStyle = 'black'; // Black border color
    context.lineWidth = 3; // Border thickness
    context.strokeText(text, canvasSize / 2, canvasSize / 2);

    // --- Draw Colored Fill ---
    context.fillStyle = color.getStyle(); // Get CSS string (e.g., "rgb(0, 153, 255)")
    context.fillText(text, canvasSize / 2, canvasSize / 2);

    // --- Create Texture ---
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true; // Ensure texture uploads to GPU

    // --- 3. Use SpriteMaterial ---
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
    });

    // --- 4. Create Sprite instead of Mesh ---
    const sprite = new THREE.Sprite(material);

    // Set the size. This is in local space (like the plane was).
    // When parented to the crystal (scale 0.1), this will be 10x10 world units.
    sprite.scale.set(10, 10, 1);

    return sprite;
}

/**
 * Removes all crystals from the scene and minimap.
 */
function clearAllCrystals() {
    // 1. Remove from main scene and dispose
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
            } else if (child instanceof THREE.Sprite) { // Dispose sprite material
                (child.material as THREE.SpriteMaterial).map?.dispose();
                child.material.dispose();
            }
        });
    }
    crystals.length = 0; // Clear the array

    // 2. Remove from minimap scene and dispose
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
    minimapCrystalMarkers.length = 0; // Clear the array
}

/**
 * Generates a new equation, clears old crystals, and spawns a new set.
 */
async function generateNewEquationAndRespawnCrystals() {
    // 1. Clear all old crystals
    clearAllCrystals();

    // 2. Choose an equation type randomly
    type EqType = 'ADD' | 'SUB' | 'ADD_MISSING' | 'SUB_MISSING';
    const types: EqType[] = ['ADD', 'SUB', 'ADD_MISSING', 'SUB_MISSING'];
    const chosen = types[Math.floor(Math.random() * types.length)];

    // Helper to get random int inclusive
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    let A = 0;
    let B = 0;
    let unknown = 0;
    let equationText = '';

    // Keep answers in range 1..10 (adjust as needed)
    const MIN_VAL = 1;
    const MAX_SUM = 10;

    if (chosen === 'ADD') {
        // A + B = ?
        const S = randInt(2, MAX_SUM); // sum in [2, 10]
        A = randInt(1, S - 1);
        B = S - A;
        unknown = S;
        equationText = `${A} + ${B} = ?`;
    } else if (chosen === 'SUB') {
        // A - B = ?
        // Ensure result >= 1: pick A in [2,10], B in [1, A-1]
        A = randInt(2, MAX_SUM);
        B = randInt(1, A - 1);
        unknown = A - B;
        equationText = `${A} - ${B} = ?`;
    } else if (chosen === 'ADD_MISSING') {
        // A + ? = B  => unknown = B - A (must be >=1)
        A = randInt(1, MAX_SUM - 1);
        // unknown x in [1, MAX_SUM - A] so B = A + x <= MAX_SUM
        const x = randInt(1, MAX_SUM - A);
        B = A + x;
        unknown = x;
        equationText = `${A} + ? = ${B}`;
    } else { // SUB_MISSING
        // A - ? = B => unknown = A - B (must be >=1), so pick A > B
        // Choose A in [2, MAX_SUM], B in [1, A-1]
        A = randInt(2, MAX_SUM);
        B = randInt(1, A - 1);
        unknown = A - B;
        equationText = `${A} - ? = ${B}`;
    }

    // 3. Set globals and update UI
    currentTargetNumber = unknown;
    currentEquation = equationText;
    updateEquationUI();

    // 4. Build numbers to spawn
    const numbersToSpawn: number[] = [];
    const NUM_CORRECT_CRYSTALS = 3;

    // Add correct answers
    for (let i = 0; i < NUM_CORRECT_CRYSTALS; i++) {
        numbersToSpawn.push(currentTargetNumber);
    }

    // Add distractor answers (avoid duplicates of the correct answer)
    while (numbersToSpawn.length < TOTAL_CRYSTALS) {
        // Distractors in [1, MAX_SUM] but not equal to correct
        let distractor = randInt(MIN_VAL, MAX_SUM);

        // Slightly bias distractors toward nearby values (optional)
        // If too close to correct push it sometimes; otherwise keep random.
        if (Math.random() < 0.4) {
            const offset = randInt(-2, 2);
            distractor = Math.max(MIN_VAL, Math.min(MAX_SUM, currentTargetNumber + offset));
        }

        if (distractor !== currentTargetNumber && !numbersToSpawn.includes(distractor)) {
            numbersToSpawn.push(distractor);
        }
    }

    // Shuffle
    for (let i = numbersToSpawn.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbersToSpawn[i], numbersToSpawn[j]] = [numbersToSpawn[j], numbersToSpawn[i]];
    }

    // 5. Spawn crystals
    await spawnCrystals(numbersToSpawn);
}


/**
 * Spawns a set of crystals based on an array of numbers.
 * @param numbersToSpawn An array of numbers to display on the crystals.
 */
async function spawnCrystals(numbersToSpawn: number[]) {
    const areaSize = 220;
    const spawnAttempts = 1000;
    const MIN_DISTANCE_FROM_PLAYER = 20; // Minimum distance from player spawn point
    const playerStartPos = new THREE.Vector3(5, 7, 8);

    for (let i = 0; i < numbersToSpawn.length; i++) {
        try {
            const {model} = await loadModel("Crystal.glb");

            incrementLoadingProgress(`Spawning Crystals... (${i + 1}/${numbersToSpawn.length})`);

            // Crystal scale - make them smaller
            const scaleFactor = 0.1;
            model.scale.setScalar(scaleFactor);

            // Random rotation for variety
            model.rotation.y = Math.random() * Math.PI * 2;

            // Try to find a valid position on the ground
            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < spawnAttempts) {
                attempts++;

                const x = (Math.random() - 0.5) * areaSize;
                const z = (Math.random() - 0.5) * areaSize;
                const y = 50; // Start high for raycasting

                // Check distance from player starting position
                const spawnPos = new THREE.Vector3(x, 0, z);
                const distanceFromPlayer = spawnPos.distanceTo(playerStartPos);

                if (distanceFromPlayer < MIN_DISTANCE_FROM_PLAYER) {
                    continue; // Too close to player, try again
                }

                const origin = new THREE.Vector3(x, y, z);
                raycaster.set(origin, down);
                const intersects = raycaster.intersectObjects(worldObjects, true);

                if (intersects.length > 0) {
                    const groundY = intersects[0].point.y;
                    const hitPoint = intersects[0].point;
                    const hitObject = intersects[0].object as THREE.Mesh;

                    // Check if it's water - both by material color and height
                    const isWater = isWaterSurface(hitObject) || groundY < 0.5;

                    // Check for clearance above (not under trees or other objects)
                    const clearanceHeight = 4.0;
                    const clearanceOrigin = hitPoint.clone();
                    clearanceOrigin.y += 0.1;
                    const upRay = new THREE.Vector3(0, 1, 0);
                    raycaster.set(clearanceOrigin, upRay);
                    raycaster.far = clearanceHeight;
                    const clearanceIntersects = raycaster.intersectObjects(worldObjects, true);
                    raycaster.far = Infinity;

                    const hasClearance = clearanceIntersects.length === 0;

                    // Check slope - crystals should be on relatively flat ground
                    const normal = intersects[0].face?.normal;
                    let slopeDot = 1;
                    if (normal) {
                        const worldNormal = normal.clone().applyMatrix3(
                            new THREE.Matrix3().getNormalMatrix(hitObject.matrixWorld)
                        ).normalize();
                        slopeDot = worldNormal.dot(new THREE.Vector3(0, 1, 0));
                    }
                    const minSlopeDot = 0.85; // Roughly 30 degrees max slope

                    // Accept position if: not water, not too steep, has clearance, height is accessible
                    if (!isWater && slopeDot >= minSlopeDot && hasClearance && groundY < 8) {
                        model.position.set(x, groundY, z);
                        validPosition = true;
                    }
                }
            }

            if (!validPosition) {
                // Fallback: place near origin if no valid position found
                console.warn(`Could not find valid position for crystal ${i + 1}, placing at origin`);
                model.position.set(0, 0, 0);
            }

            // Random color selection for crystal glow
            const colorPalette = [
                0x0099ff, // Blue
                0x00ff66, // Green
                0xff3333, // Red
                0xff66ff, // Pink
                0xffff00, // Yellow
            ];
            const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

            // Get the text (from the array) and color
            const crystalNumber = numbersToSpawn[i];
            const numberText = crystalNumber.toString();
            const numberColor = new THREE.Color(randomColor);

            // Create the number mesh using the helper function
            const numberMesh = createCrystalNumber(numberText, numberColor);

            // Position it slightly above the crystal's origin (in local space)
            numberMesh.position.y = 12;

            // Store the crystal's value in its userData
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

            // Add the number mesh as a child of the crystal's main group.
            model.add(numberMesh);

            scene.add(model);
            crystals.push(model);
        } catch (err) {
            console.warn(`Failed to load crystal model:`, err);
        }
    }

    console.log(`Spawned ${crystals.length} crystals on the map`);
}

/**
 * Loads the crystal model for the UI template.
 */
async function loadUICrystalTemplate() {
    incrementLoadingProgress('Loading UI...');
    try {
        const {model} = await loadModel("Crystal.glb");
        uiCrystalTemplate = model;
        uiCrystalTemplate.scale.setScalar(UI_CRYSTAL_SCALE); // Scale it down for the UI
    } catch (err) {
        console.warn("Failed to load UI crystal template:", err);
    }
}

function loadAudio() {
    if (!playerModel) return;

    runningSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        runningSoundUrl,
        function (buffer) {
            if (runningSound) {
                runningSound.setBuffer(buffer);
                runningSound.setLoop(true);
                runningSound.setVolume(1.5);
                runningSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Błąd ładowania dźwięku trawy:", err);
        },
    );
    playerModel.add(runningSound);

    waterSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        waterSoundUrl,
        function (buffer) {
            if (waterSound) {
                waterSound.setBuffer(buffer);
                waterSound.setLoop(true);
                waterSound.setVolume(0.5);
                waterSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Błąd ładowania dźwięku wody:", err);
        },
    );
    playerModel.add(waterSound);

    bumpSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        bumpSoundUrl,
        function (buffer) {
            if (bumpSound) {
                bumpSound.setBuffer(buffer);
                bumpSound.setLoop(false);
                bumpSound.setVolume(0.25);
                bumpSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Błąd ładowania dźwięku uderzenia:", err);
        },
    );
    playerModel.add(bumpSound);

    // Load and play background music
    backgroundMusic = new THREE.Audio(listener);
    audioLoader.load(
        forestAtmosphereUrl,
        function (buffer) {
            if (backgroundMusic) {
                backgroundMusic.setBuffer(buffer);
                backgroundMusic.setLoop(true);
                backgroundMusic.setVolume(0.3);
                backgroundMusic.play();
            }
        },
        undefined,
        (err) => {
            console.error("Error loading background music:", err);
        },
    );

    // Load bite sound
    biteSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        animalHitSoundUrl,
        function (buffer) {
            if (biteSound) {
                biteSound.setBuffer(buffer);
                biteSound.setLoop(false);
                biteSound.setVolume(1);
                biteSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Error loading bite sound:", err);
        },
    );
    playerModel.add(biteSound);

    // Load error sound
    errorSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        errorSoundUrl,
        function (buffer) {
            if (errorSound) {
                errorSound.setBuffer(buffer);
                errorSound.setLoop(false);
                errorSound.setVolume(1);
                errorSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Error loading error sound:", err);
        },
    );
    playerModel.add(errorSound);

    // Load water splash sound
    waterSplashSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        waterSplashSoundUrl,
        function (buffer) {
            if (waterSplashSound) {
                waterSplashSound.setBuffer(buffer);
                waterSplashSound.setLoop(false);
                waterSplashSound.setVolume(0.75);
                waterSplashSound.setRefDistance(15);
            }
        },
        undefined,
        (err) => {
            console.error("Error loading water splash sound:", err);
        },
    );
    playerModel.add(waterSplashSound);

    successSound = new THREE.Audio(listener);
    audioLoader.load(
        successSoundUrl,
        function (buffer) {
            if (successSound) {
                successSound.setBuffer(buffer);
                successSound.setLoop(false);
                successSound.setVolume(0.8);
            }
        },
        undefined,
        (err) => {
            console.error("Error loading success sound:", err);
        },
    );

    audioLoader.load(
        fireworkSoundUrl,
        function (buffer) {
            fireworkBuffer = buffer;
        },
        undefined,
        (err) => {
            console.error("Error loading firework sound:", err);
        },
    );
}

async function createPlayer() {
    try {
        incrementLoadingProgress('Loading Player...');
        const {model, animations} = await loadModel("Animated Platformer Character.glb");
        playerModel = model;

        loadAudio();

        playerModel.scale.setScalar(0.5);
        playerModel.position.set(5, 7, 8);

        const bbox = new THREE.Box3().setFromObject(playerModel);
        const modelHeight = bbox.max.y - bbox.min.y;
        playerHeight = modelHeight;
        console.log(`Player model height: ${modelHeight.toFixed(2)}`);

        scene.add(playerModel);

        if (animations && animations.length > 0) {
            mixer = new THREE.AnimationMixer(playerModel);

            const runClip = animations.find(
                (clip) => clip.name === "CharacterArmature|Run",
            );
            const walkClip = animations.find(
                (clip) => clip.name === "CharacterArmature|Walk",
            );
            const fallClip = animations.find(
                (clip) => clip.name === "CharacterArmature|Death",
            );
            const jumpClip = animations.find(
                (clip) => clip.name === "CharacterArmature|Jump",
            );

            if (runClip) {
                runAction = mixer.clipAction(runClip);
                runAction.setLoop(THREE.LoopRepeat, Infinity);
            } else {
                console.warn(
                    "Nie znaleziono klipu animacji 'run'. Dostępne klipy:",
                    animations.map((c) => c.name),
                );
            }

            if (walkClip) {
                walkAction = mixer.clipAction(walkClip);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
            } else {
                console.warn(
                    "Nie znaleziono klipu animacji 'walk'. Dostępne klipy:",
                    animations.map((c) => c.name),
                );
            }

            if (fallClip) {
                fallAction = mixer.clipAction(fallClip);
                fallAction.setLoop(THREE.LoopOnce, 1);
                fallAction.clampWhenFinished = true;
            } else {
                console.warn(
                    "Nie znaleziono klipu animacji 'death'. Dostępne klipy:",
                    animations.map((c) => c.name),
                );
            }

            if (jumpClip) {
                jumpAction = mixer.clipAction(jumpClip);
                jumpAction.setLoop(THREE.LoopOnce, 1);
                jumpAction.clampWhenFinished = true;
            } else {
                console.warn(
                    "Nie znaleziono klipu animacji 'jump'. Dostępne klipy:",
                    animations.map((c) => c.name),
                );
            }

            if (mixer) {
                mixer.addEventListener("finished", (e) => {
                    if (fallAction && e.action === fallAction) {
                        fallAction.stop();
                    }
                    if (jumpAction && e.action === jumpAction) {
                        jumpAction.stop();
                    }
                });
            }
        } else {
            console.warn("Model 'Animated Platformer Character.glb' nie zawiera animacji.");
        }

        incrementLoadingProgress('Player Loaded');
        updateCameraPosition(true);
    } catch (err) {
        console.warn("Błąd ładowania modelu 'Animated Platformer Character.glb':", err);
        incrementLoadingProgress('Player Load Failed');
    }
}

/**
 * Creates and launches a burst of splash particles from the given position.
 */
function spawnSplash(position: THREE.Vector3) {
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
        const material = particleMaterial.clone();
        const mesh = new THREE.Mesh(particleGeometry, material);

        const initialPosition = position.clone();
        initialPosition.y += 0.2;
        initialPosition.x += (Math.random() - 0.5) * 0.5;
        initialPosition.z += (Math.random() - 0.5) * 0.5;
        mesh.position.copy(initialPosition);

        const velX = (Math.random() * 2 - 1) * 0.5;
        const velY = Math.random() * 1.5 + 1;
        const velZ = (Math.random() * 2 - 1) * 0.5;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        scene.add(mesh);

        particleData.push({
            mesh,
            velocity,
            age: 0,
            maxAge: SPLASH_LIFESPAN,
        });
    }
}

/**
 * Creates a large dramatic splash effect for landing in water.
 * @param position The position to spawn the big splash
 */
function spawnBigSplash(position: THREE.Vector3) {
    for (let i = 0; i < BIG_SPLASH_PARTICLE_COUNT; i++) {
        const material = particleMaterial.clone();
        const mesh = new THREE.Mesh(particleGeometry, material);

        const initialPosition = position.clone();
        initialPosition.y += 0.3;
        initialPosition.x += (Math.random() - 0.5) * BIG_SPLASH_SPREAD;
        initialPosition.z += (Math.random() - 0.5) * BIG_SPLASH_SPREAD;
        mesh.position.copy(initialPosition);

        // Larger, more varied velocities for dramatic effect
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.8 + 0.4; // 0.4 to 1.2
        const velX = Math.cos(angle) * speed * BIG_SPLASH_VELOCITY_MULTIPLIER;
        const velY = Math.random() * 2.5 + 1.5; // 1.5 to 4.0 (higher than normal splash)
        const velZ = Math.sin(angle) * speed * BIG_SPLASH_VELOCITY_MULTIPLIER;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        // Vary particle size for more realistic effect
        const scale = Math.random() * 0.5 + 0.8; // 0.8 to 1.3
        mesh.scale.setScalar(scale);

        scene.add(mesh);

        particleData.push({
            mesh,
            velocity,
            age: 0,
            maxAge: SPLASH_LIFESPAN * 1.2, // Big splash particles last slightly longer
        });
    }
}

function spawnCrystalCollectEffect(position: THREE.Vector3, color: THREE.Color) {
    for (let i = 0; i < CRYSTAL_PARTICLE_COUNT; i++) {
        // Clone the base particle material and set the crystal's color
        const material = particleMaterial.clone() as THREE.MeshBasicMaterial;
        material.color.set(color);
        material.opacity = 1;

        const mesh = new THREE.Mesh(particleGeometry, material);

        // Start at the crystal's position
        const initialPosition = position.clone();
        initialPosition.y += 0.5; // Start slightly above ground
        mesh.position.copy(initialPosition);

        // Random outward and upward velocity
        const angle = Math.random() * Math.PI * 2;
        const horizontalSpeed = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
        const velX = Math.cos(angle) * horizontalSpeed * CRYSTAL_PARTICLE_SPEED;
        const velY = (Math.random() * 0.5 + 0.5) * CRYSTAL_PARTICLE_SPEED; // Upward burst
        const velZ = Math.sin(angle) * horizontalSpeed * CRYSTAL_PARTICLE_SPEED;
        const velocity = new THREE.Vector3(velX, velY, velZ);

        // Use a slightly smaller particle size
        const scale = Math.random() * 0.3 + 0.5; // 0.5 to 0.8
        mesh.scale.setScalar(scale);

        scene.add(mesh);

        particleData.push({
            mesh,
            velocity,
            age: 0,
            maxAge: CRYSTAL_LIFESPAN * (Math.random() * 0.3 + 0.8), // Vary lifespan
        });
    }
}

/**
 * Updates the position, scale, and opacity of all active splash particles.
 */
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


function changeAnimalAnimation(animalInstance: AnimalInstance) {
    if (!animalInstance.mixer || animalInstance.isPlayingDeath) {
        return;
    }

    const currentTime = clock.getElapsedTime();

    // 40% chance to walk if walk animation is available
    const shouldWalk = animalInstance.walkAnimation && Math.random() < 0.4;

    if (shouldWalk && animalInstance.walkAnimation) {
        // Start walking
        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }

        const walkAction = animalInstance.mixer.clipAction(animalInstance.walkAnimation);
        walkAction.reset();
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkAction.play();

        animalInstance.action = walkAction;
        animalInstance.isWalking = true;
        animalInstance.walkEndTime = currentTime + 2 + Math.random() * 4; // Walk for 2-6 seconds
    } else if (animalInstance.allowedAnimations.length > 0) {
        // Pick a random idle/eating animation
        const randomClip = animalInstance.allowedAnimations[Math.floor(Math.random() * animalInstance.allowedAnimations.length)];

        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }

        const newAction = animalInstance.mixer.clipAction(randomClip);
        newAction.reset();
        newAction.setLoop(THREE.LoopRepeat, Infinity);
        newAction.play();

        animalInstance.action = newAction;
        animalInstance.isWalking = false;
    }

    // Schedule next animation change (2-10 seconds)
    animalInstance.nextAnimationChangeTime = currentTime + 2 + Math.random() * 8;
}

function updateAnimalMovement(animalInstance: AnimalInstance) {
    if (!animalInstance.isWalking || animalInstance.isPlayingDeath) {
        return;
    }

    const currentTime = clock.getElapsedTime();

    // Check if walking time is over
    if (currentTime >= animalInstance.walkEndTime) {
        animalInstance.isWalking = false;

        // Stop walk animation immediately and switch to idle
        if (animalInstance.action && animalInstance.action.isRunning()) {
            animalInstance.action.stop();
        }

        // Pick a random idle/eating animation
        if (animalInstance.mixer && animalInstance.allowedAnimations.length > 0) {
            const randomClip = animalInstance.allowedAnimations[Math.floor(Math.random() * animalInstance.allowedAnimations.length)];
            const idleAction = animalInstance.mixer.clipAction(randomClip);
            idleAction.reset();
            idleAction.setLoop(THREE.LoopRepeat, Infinity);
            idleAction.play();
            animalInstance.action = idleAction;
        }

        return;
    }

    const animal = animalInstance.model;
    const ANIMAL_HEIGHT = 1.5;
    const OBSTACLE_CHECK_DISTANCE = 2.0;
    const TURN_ANGLE = Math.PI / 4; // 45 degrees

    // Get forward direction
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(animal.quaternion);

    // Check for obstacles ahead
    const rayOrigin = animal.position.clone();
    rayOrigin.y += ANIMAL_HEIGHT / 2;

    raycaster.set(rayOrigin, forward);
    raycaster.far = OBSTACLE_CHECK_DISTANCE;
    const intersects = raycaster.intersectObjects(worldObjects, true);
    raycaster.far = Infinity;

    let hasObstacle = false;
    if (intersects.length > 0) {
        hasObstacle = intersects[0].distance < OBSTACLE_CHECK_DISTANCE;
    }

    // Check if other animals are in the way
    if (!hasObstacle) {
        const futurePosition = animal.position.clone();
        futurePosition.addScaledVector(forward, OBSTACLE_CHECK_DISTANCE);

        for (const otherAnimal of animals) {
            if (otherAnimal === animal) continue;

            const distance = futurePosition.distanceTo(otherAnimal.position);
            if (distance < 1.5) {
                hasObstacle = true;
                break;
            }
        }
    }

    // Check if player is in the way
    if (!hasObstacle && playerModel) {
        const futurePosition = animal.position.clone();
        futurePosition.addScaledVector(forward, OBSTACLE_CHECK_DISTANCE);

        const distanceToPlayer = futurePosition.distanceTo(playerModel.position);
        if (distanceToPlayer < 2.0) {
            hasObstacle = true;
        }
    }

    if (hasObstacle) {
        // Turn away from obstacle - randomly choose left or right
        const turnDirection = Math.random() < 0.5 ? 1 : -1;
        animal.rotation.y += TURN_ANGLE * turnDirection;
    } else {
        // Move forward
        const moveVector = forward.multiplyScalar(animalInstance.moveSpeed * 0.016 * 60); // Normalize to ~60fps
        const newPosition = animal.position.clone().add(moveVector);

        // Check ground height at new position - need to do full raycast for normal data
        const groundCheckOrigin = newPosition.clone();
        groundCheckOrigin.y += 10;
        const downVector = new THREE.Vector3(0, -1, 0);

        raycaster.set(groundCheckOrigin, downVector);
        const groundIntersects = raycaster.intersectObjects(worldObjects, true);

        if (groundIntersects.length > 0) {
            const groundY = groundIntersects[0].point.y;
            const hitObject = groundIntersects[0].object as THREE.Mesh;

            // Check if terrain is not too steep and not water
            const face = groundIntersects[0].face;
            let isSafe = true;

            // Check slope if we have face normal data
            if (face) {
                const worldNormal = face.normal.clone().applyMatrix3(
                    new THREE.Matrix3().getNormalMatrix(hitObject.matrixWorld)
                ).normalize();
                const slopeDot = worldNormal.dot(new THREE.Vector3(0, 1, 0));
                isSafe = slopeDot > 0.6; // Not too steep
            }

            // Check if it's water
            const isWater = isWaterSurface(hitObject);
            if (isWater) {
                isSafe = false;
            }

            if (isSafe) {
                // Move to new position
                animal.position.x = newPosition.x;
                animal.position.z = newPosition.z;
                animal.position.y = groundY;
            } else {
                // Turn around if terrain is unsafe
                animal.rotation.y += Math.PI / 3; // Turn 60 degrees
            }
        }
    }
}

function updateSpiderAI(spider: SpiderInstance) {
    if (!playerModel) return;

    // Don't update AI if spider is attacking or jumping back
    if (spider.isAttacking || spider.isJumpingBack) {
        return;
    }

    const spiderPos = spider.model.position;
    const playerPos = playerModel.position;
    const distanceToPlayer = spiderPos.distanceTo(playerPos);

    // Check if player is in detection range
    if (distanceToPlayer < SPIDER_DETECTION_RANGE) {
        spider.isChasing = true;
        spider.moveSpeed = SPIDER_CHASE_SPEED;

        // Calculate direction to player
        const direction = new THREE.Vector3().subVectors(playerPos, spiderPos);
        direction.y = 0; // Keep movement horizontal
        direction.normalize();

        // Rotate spider to face player
        spider.model.rotation.y = Math.atan2(direction.x, direction.z);

        // Check current distance to player
        const currentDistanceToPlayer = spiderPos.distanceTo(playerPos);
        const attackTriggerDistance = COLLISION_RADIUS + SPIDER_COLLISION_RADIUS + 0.2; // Slightly larger to trigger before collision

        // If within attack range, trigger attack
        if (currentDistanceToPlayer <= attackTriggerDistance) {
            // Spider is close enough to attack - trigger it
            if (!spider.isAttacking && !spider.isJumpingBack && playerModel && !controlsLocked) {
                // Make player fall
                triggerPlayerFall();

                // Trigger spider attack animation and jump back
                triggerSpiderAttack(spider);

                // Play hit sound
                if (biteSound && !biteSound.isPlaying) {
                    biteSound.play();
                }
            }
        } else {
            // Move towards player if not in attack range
            const moveVector = direction.multiplyScalar(spider.moveSpeed);
            const newPosition = spiderPos.clone().add(moveVector);

            // Check ground height at new position
            const groundResult = getGroundHeight(newPosition);

            if (groundResult) {
                const {groundY, hitObject} = groundResult;

                // Spiders can walk on steep surfaces - only check for water
                const isWater = isWaterSurface(hitObject);

                if (!isWater) {
                    spider.model.position.x = newPosition.x;
                    spider.model.position.z = newPosition.z;
                    spider.model.position.y = groundY;
                }
            }
        }
    } else {
        // Wander behavior when player is far
        spider.isChasing = false;
        spider.moveSpeed = SPIDER_WANDER_SPEED;

        // Get forward direction
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(spider.model.quaternion);

        // Randomly change direction occasionally
        if (Math.random() < 0.02) { // 2% chance per frame
            spider.model.rotation.y += (Math.random() - 0.5) * Math.PI / 2;
        }

        // Check for obstacles ahead
        const rayOrigin = spiderPos.clone();
        rayOrigin.y += 1;

        raycaster.set(rayOrigin, forward);
        raycaster.far = 2.0;
        const intersects = raycaster.intersectObjects(worldObjects, true);
        raycaster.far = Infinity;

        let hasObstacle = false;
        if (intersects.length > 0 && intersects[0].distance < 2.0) {
            hasObstacle = true;
        }

        if (hasObstacle) {
            // Turn away from obstacle
            spider.model.rotation.y += Math.PI / 4;
        } else {
            // Move forward
            const moveVector = forward.multiplyScalar(spider.moveSpeed);
            const newPosition = spiderPos.clone().add(moveVector);

            // Check if we'd collide with player or other spiders
            let wouldCollide = false;

            // Check player collision
            if (playerModel) {
                const distToPlayer = newPosition.distanceTo(playerModel.position);
                if (distToPlayer < (COLLISION_RADIUS + SPIDER_COLLISION_RADIUS + 0.5)) {
                    wouldCollide = true;
                }
            }

            // Check other spiders
            if (!wouldCollide) {
                for (const otherSpider of spiders) {
                    if (otherSpider === spider) continue;
                    const distToOtherSpider = newPosition.distanceTo(otherSpider.model.position);
                    if (distToOtherSpider < (SPIDER_COLLISION_RADIUS * 2 + 0.5)) {
                        wouldCollide = true;
                        break;
                    }
                }
            }

            if (wouldCollide) {
                // Turn to avoid collision
                spider.model.rotation.y += Math.PI / 4;
            } else {
                // Check ground height
                const groundResult = getGroundHeight(newPosition);

                if (groundResult) {
                    const {groundY, hitObject} = groundResult;

                    // Spiders can walk on steep surfaces - only check for water
                    const isWater = isWaterSurface(hitObject);

                    if (!isWater) {
                        spider.model.position.x = newPosition.x;
                        spider.model.position.z = newPosition.z;
                        spider.model.position.y = groundY;
                    } else {
                        spider.model.rotation.y += Math.PI / 3;
                    }
                }
            }
        }
    }
}

/**
 * Handles the wandering behavior for a bee.
 * @param bee The bee instance
 */
function forceBeeWander(bee: BeeInstance) {
    bee.isChasing = false;
    bee.moveSpeed = BEE_WANDER_SPEED;

    // Stop flying sound
    if (bee.flySound && bee.flySound.isPlaying) {
        bee.flySound.stop();
    }

    // Check if wander target is reached or null
    if (!bee.wanderTarget || bee.model.position.distanceTo(bee.wanderTarget) < 2.0) {
        // Generate new wander target
        const x = bee.model.position.x + (Math.random() - 0.5) * BEE_WANDER_RANGE;
        const z = bee.model.position.z + (Math.random() - 0.5) * BEE_WANDER_RANGE;

        // Find ground height at new (x, z)
        let groundY = 0;
        const groundResult = getGroundHeight(new THREE.Vector3(x, 50, z));
        if (groundResult) {
            groundY = groundResult.groundY;
        }

        const y = groundY + BEE_BASE_WANDER_ALTITUDE + (Math.random() - 0.5) * 5.0; // Vary altitude

        if (!bee.wanderTarget) {
            bee.wanderTarget = new THREE.Vector3(x, y, z);
        } else {
            bee.wanderTarget.set(x, y, z);
        }
    }

    // Move towards wander target
    const beePos = bee.model.position; // Need to define beePos
    const direction = new THREE.Vector3().subVectors(bee.wanderTarget, beePos);
    direction.normalize();

    bee.model.lookAt(bee.wanderTarget);

    const moveVector = direction.multiplyScalar(bee.moveSpeed);
    const newPosition = beePos.clone().add(moveVector);

    bee.model.position.copy(newPosition);
}

function updateBeeAI(bee: BeeInstance) {
    if (!playerModel) return;

    // Handle attack dash logic first
    if (bee.isAttacking) {
        updateBeeAttackDash(bee);
        return;
    }

    // Handle retreat logic
    if (bee.isRetreating) {
        const currentTime = clock.getElapsedTime();
        if (currentTime < bee.retreatEndTime) {
            // Bee is retreating.

            // Fly away for the first 1.5 seconds
            const retreatDuration = 5.0;
            const flyAwayDuration = 1.5;
            const elapsedRetreatTime = retreatDuration - (bee.retreatEndTime - currentTime);

            if (elapsedRetreatTime < flyAwayDuration) {
                // Fly directly away from player
                const beePos = bee.model.position;
                const playerPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0));
                const directionAway = new THREE.Vector3().subVectors(beePos, playerPos);
                directionAway.y = 0.5; // Fly up and away
                directionAway.normalize();

                bee.model.lookAt(bee.model.position.clone().add(directionAway)); // Look where it's going

                const moveVector = directionAway.multiplyScalar(BEE_CHASE_SPEED); // Retreat quickly
                const newPosition = beePos.clone().add(moveVector);

                // Check ground height to avoid flying into ground
                const groundResult = getGroundHeight(newPosition, 20);
                if (groundResult) {
                    const {groundY} = groundResult;
                    if (newPosition.y < groundY + BEE_MIN_ALTITUDE) {
                        newPosition.y = groundY + BEE_MIN_ALTITUDE;
                    }
                }
                bee.model.position.copy(newPosition);

            } else {
                // After 1.5s, just wander
                forceBeeWander(bee);
            }

            return; // Do not proceed to chasing logic
        } else {
            // Retreat time is over
            bee.isRetreating = false;
        }
    }

    const beePos = bee.model.position;
    const playerPos = playerModel.position.clone().add(new THREE.Vector3(0, playerHeight / 2, 0)); // Target player center
    const distanceToPlayer = beePos.distanceTo(playerPos);

    // Check if player is in detection range
    if (distanceToPlayer < BEE_DETECTION_RANGE) {
        bee.isChasing = true;
        bee.moveSpeed = BEE_CHASE_SPEED;

        // Play flying sound
        if (bee.flySound && !bee.flySound.isPlaying) {
            bee.flySound.play();
        }

        // Calculate 3D direction to player
        const direction = new THREE.Vector3().subVectors(playerPos, beePos);
        direction.normalize();

        // Rotate bee to face player
        bee.model.lookAt(playerPos);

        // Check current distance to player
        const attackTriggerDistance = BEE_ATTACK_TRIGGER_DISTANCE;

        // If within attack range, trigger attack
        if (distanceToPlayer <= attackTriggerDistance) {
            if (!bee.isAttacking && playerModel && !controlsLocked) {
                // Trigger bee attack dash
                triggerBeeAttack(bee);

                // Make player fall
                triggerPlayerFall();

                // Make bee retreat
                if (!bee.isRetreating) {
                    bee.isRetreating = true;
                    bee.retreatEndTime = clock.getElapsedTime() + 5.0; // 5 second retreat
                    bee.isChasing = false;
                    bee.wanderTarget = null; // Force new wander target on next wander
                }

                // Play hit sound
                if (biteSound && !biteSound.isPlaying) {
                    biteSound.play();
                }
            }
        } else {
            // Move towards player if not in attack range
            const moveVector = direction.multiplyScalar(bee.moveSpeed);
            const newPosition = beePos.clone().add(moveVector);

            // Simple obstacle avoidance: check ground height below *future* position
            const groundResult = getGroundHeight(newPosition, 20); // Raycast from higher up
            if (groundResult) {
                const {groundY} = groundResult;
                // Ensure bee stays a minimum height above the ground
                if (newPosition.y < groundY + BEE_MIN_ALTITUDE) {
                    newPosition.y = groundY + BEE_MIN_ALTITUDE;
                }
            }

            bee.model.position.copy(newPosition);
        }
    } else {
        // Wander behavior when player is far
        forceBeeWander(bee);
    }
}

function handlePlayerMovement() {
    if (!playerModel) return;

    if (controlsLocked) {
        // Allow rotation only if it's the temporary fall lock, not the permanent game-win lock
        if (collectedCrystals < TOTAL_EQUATIONS_TO_SOLVE) {
            if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
                playerModel.rotation.y += rotationSpeed;
            }
            if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
                playerModel.rotation.y -= rotationSpeed;
            }
        }
        return;
    }

    const originalPosition = playerModel.position.clone();
    let moving = false;
    let targetPosition = playerModel.position.clone();

    // Apply jump speed multiplier when jumping
    const speedMultiplier = isJumping ? 1.5 : 1.0;

    if (keys["w"] || keys["W"] || keys["ArrowUp"]) {
        const forwardVector = new THREE.Vector3(0, 0, -0.1);
        forwardVector.applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(forwardVector, -moveSpeed * speedMultiplier);
        moving = true;
    }
    if (keys["s"] || keys["S"] || keys["ArrowDown"]) {
        const backwardVector = new THREE.Vector3(0, 0, -0.1);
        backwardVector.applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(backwardVector, moveSpeed * speedMultiplier);
        moving = true;
    }

    if (moving) {
        const currentOrigin = originalPosition.clone();
        currentOrigin.y += playerHeight;
        raycaster.set(currentOrigin, down);
        const currentIntersects = raycaster.intersectObjects(
            worldObjects,
            true,
        );

        let currentGroundHeight = originalPosition.y - 1;
        if (currentIntersects.length > 0) {
            currentGroundHeight =
                currentOrigin.y - currentIntersects[0].distance;
        }

        const nextOrigin = targetPosition.clone();
        nextOrigin.y = originalPosition.y + playerHeight;

        raycaster.set(nextOrigin, down);
        const nextIntersects = raycaster.intersectObjects(worldObjects, true);

        let nextGroundHeight = currentGroundHeight;
        if (nextIntersects.length > 0) {
            nextGroundHeight = nextOrigin.y - nextIntersects[0].distance;
        }

        const heightDifference = nextGroundHeight - currentGroundHeight;

        // Horizontal collision detection - check for walls/obstacles at player level
        const movementDirection = new THREE.Vector3().subVectors(targetPosition, originalPosition).normalize();
        const horizontalOrigin = originalPosition.clone();
        horizontalOrigin.y += playerHeight + 0.2;

        raycaster.set(horizontalOrigin, movementDirection);
        raycaster.far = COLLISION_RADIUS;
        const horizontalIntersects = raycaster.intersectObjects(worldObjects, true);
        raycaster.far = Infinity;

        let hitWall = false;
        if (horizontalIntersects.length > 0) {
            const hitDistance = horizontalIntersects[0].distance;
            if (hitDistance < COLLISION_RADIUS) {
                hitWall = true;
            }
        }

        let hitAnimal = false;
        const animalCollisionRadius = 0.8;
        const combinedRadius = COLLISION_RADIUS + animalCollisionRadius;

        for (const animal of animals) {
            const futureDistance = targetPosition.distanceTo(animal.position);
            if (futureDistance < combinedRadius) {
                hitAnimal = true;
                break;
            }
        }

        // Check collision with spiders
        let hitSpider = false;
        let collidedSpider: SpiderInstance | null = null;
        const spiderCombinedRadius = COLLISION_RADIUS + SPIDER_COLLISION_RADIUS;

        for (const spider of spiders) {
            const futureDistance = targetPosition.distanceTo(spider.model.position);
            if (futureDistance < spiderCombinedRadius) {
                hitSpider = true;
                collidedSpider = spider;
                break;
            }
        }

        // Check collision with bees
        let hitBee = false;
        let collidedBee: BeeInstance | null = null;
        const beeCombinedRadius = COLLISION_RADIUS + BEE_COLLISION_RADIUS;

        for (const bee of bees) {
            // Check 3D distance for bees
            const futureDistance = targetPosition.distanceTo(bee.model.position);
            if (futureDistance < beeCombinedRadius) {
                hitBee = true;
                collidedBee = bee;
                break;
            }
        }

        if (heightDifference > MAX_STEP_HEIGHT || hitWall || hitAnimal || hitSpider || hitBee) {
            const failedMovementVector = targetPosition
                .clone()
                .sub(originalPosition);

            // Bump player back in opposite direction
            tempBumpVector
                .copy(failedMovementVector)
                .negate()
                .normalize()
                .multiplyScalar(0);

            targetPosition.x = originalPosition.x + tempBumpVector.x;
            targetPosition.z = originalPosition.z + tempBumpVector.z;

            moving = false;

            // Handle bee collision - player falls
            if (hitBee) {
                // Make player fall
                triggerPlayerFall();

                // Make bee retreat
                if (collidedBee && !collidedBee.isRetreating) {
                    collidedBee.isRetreating = true;
                    collidedBee.retreatEndTime = clock.getElapsedTime() + 5.0; // 5 second retreat
                    collidedBee.isAttacking = false; // Stop any active attack dash
                    collidedBee.isChasing = false;
                    collidedBee.wanderTarget = null; // Force new wander target on next wander

                    // Switch animations
                    if (collidedBee.attackAction && collidedBee.attackAction.isRunning()) {
                        collidedBee.attackAction.stop();
                    }
                    if (collidedBee.flyAction && !collidedBee.flyAction.isRunning()) {
                        collidedBee.flyAction.reset().play();
                    }
                }

                // Play hit sound
                if (biteSound && !biteSound.isPlaying) {
                    biteSound.play();
                }
            }
            // Handle spider collision - player falls
            else if (hitSpider) {
                // Make player fall
                triggerPlayerFall();

                // Trigger spider attack animation and jump back
                if (collidedSpider) {
                    triggerSpiderAttack(collidedSpider);
                }

                // Play hit sound
                if (biteSound && !biteSound.isPlaying) {
                    biteSound.play();
                }
            }
            // Handle animal collision - just block movement, no animation or sound
            else if (hitAnimal) {
                // Animals just act as obstacles, no special effects
            }
            // Handle wall/obstacle collision
            else {
                // For walls/obstacles, play bump sound only once per collision
                if (bumpSound && !bumpSoundPlayed) {
                    bumpSound.play();
                    bumpSoundPlayed = true;
                }
            }
        } else {
            // Reset bump sound flag when not colliding with anything
            bumpSoundPlayed = false;
        }
    }

    playerModel.position.x = targetPosition.x;
    playerModel.position.z = targetPosition.z;


    const finalOrigin = playerModel.position.clone();
    finalOrigin.y += playerHeight;

    raycaster.set(finalOrigin, down);

    const intersects = raycaster.intersectObjects(worldObjects, true);

    let isWater = false;
    let groundHeight = 0;
    let playerHeightOffset = 0;

    if (intersects.length > 0) {
        const distanceToGround = intersects[0].distance;
        groundHeight = finalOrigin.y - distanceToGround;

        const hitObject = intersects[0].object as THREE.Mesh;
        isWater = isWaterSurface(hitObject);

        playerHeightOffset = isWater ? WATER_SINK_DEPTH : 0;

        // Handle jumping physics
        if (isJumping) {
            jumpVelocity += JUMP_GRAVITY * 0.016; // Apply gravity (assuming ~60fps)
            playerModel.position.y += jumpVelocity * 0.016;

            // Check if landed on ground
            if (playerModel.position.y <= groundHeight + playerHeightOffset) {
                playerModel.position.y = groundHeight + playerHeightOffset;

                // Check if landing in water - spawn big splash and play sound
                if (isWater && wasJumping) {
                    spawnBigSplash(playerModel.position);

                    // Play water splash sound

                    if (waterSplashSound) {
                        waterSplashSound.stop();
                        waterSplashSound.play();
                    }
                }

                isJumping = false;
                jumpVelocity = 0;
                jumpAnimationPlayed = false;
                jumpsRemaining = MAX_JUMPS;

                // Stop jump animation when landing
                if (jumpAction && jumpAction.isRunning()) {
                    jumpAction.stop();
                }
            }
            wasJumping = true; // Track that we were jumping
        } else {
            playerModel.position.y = groundHeight + playerHeightOffset;
            jumpsRemaining = MAX_JUMPS; // Reset double jump when on ground
            wasJumping = false; // Not jumping anymore
        }
    } else {
        if (playerModel.position.y > 0) {
            playerModel.position.y -= 0.1;
        }
    }

    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
        playerModel.rotation.y += rotationSpeed;
    }
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
        playerModel.rotation.y -= rotationSpeed;
    }

    let isRunning = moving;

    if (isRunning && isWater && !isJumping) {
        if (clock.getElapsedTime() > lastSplashTime + SPLASH_EMISSION_RATE) {
            if (playerModel) {
                spawnSplash(playerModel.position);
            }
            lastSplashTime = clock.getElapsedTime();
        }
    }

    if (runAction && walkAction) {
        if (!controlsLocked) {
            if (isJumping) {
                // While jumping, play jump animation only once
                if (jumpAction && !jumpAnimationPlayed) {
                    if (runAction.isRunning()) runAction.stop();
                    if (walkAction.isRunning()) walkAction.stop();
                    jumpAction.reset().play();
                    jumpAnimationPlayed = true;
                }

                // Stop movement sounds while jumping
                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
                }
                if (waterSound && waterSound.isPlaying) {
                    waterSound.stop();
                }
            } else if (isRunning) {
                if (isWater) {
                    moveSpeed = WALK_SPEED;

                    if (!walkAction.isRunning()) {
                        runAction.fadeOut(0.2);
                        walkAction.reset().fadeIn(0.2).play();
                    }

                    if (waterSound && !waterSound.isPlaying) {
                        waterSound.play();
                    }
                    if (runningSound && runningSound.isPlaying) {
                        runningSound.stop();
                    }
                } else {
                    if (keys["Shift"]) {
                        moveSpeed = RUN_SPEED * 2;
                        if (runAction) runAction.timeScale = 2.0; // Speed up animation
                        if (runningSound) runningSound.setPlaybackRate(2.0); // Speed up sound
                    } else {
                        moveSpeed = RUN_SPEED;
                        if (runAction) runAction.timeScale = 1.0; // Normal animation speed
                        if (runningSound) runningSound.setPlaybackRate(1.0); // Normal sound speed
                    }

                    if (!runAction.isRunning()) {
                        walkAction.fadeOut(0.2);
                        runAction.reset().fadeIn(0.2).play();
                    }

                    if (runningSound && !runningSound.isPlaying) {
                        runningSound.play();
                    }
                    if (waterSound && waterSound.isPlaying) {
                        waterSound.stop();
                    }
                }
            } else {
                if (runAction.isRunning()) {
                    runAction.stop();
                    if (runAction) runAction.timeScale = 1.0;
                }
                if (walkAction.isRunning()) {
                    walkAction.stop();
                }

                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
                    if (runningSound) runningSound.setPlaybackRate(1.0);
                }
                if (waterSound && waterSound.isPlaying) {
                    waterSound.stop();
                }
            }
        } else {
            if (runAction && runAction.isRunning()) runAction.stop();
            if (walkAction && walkAction.isRunning()) walkAction.stop();
        }
    } else {
        if (!controlsLocked) {
            if (isJumping) {
                // While jumping, play jump animation only once
                if (jumpAction && !jumpAnimationPlayed) {
                    jumpAction.reset().play();
                    jumpAnimationPlayed = true;
                }

                // Stop movement sounds while jumping
                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
                }
                if (waterSound && waterSound.isPlaying) {
                    waterSound.stop();
                }
            } else if (isRunning) {
                if (isWater) {
                    moveSpeed = WALK_SPEED;
                    if (waterSound && !waterSound.isPlaying) {
                        waterSound.play();
                    }
                    if (runningSound && runningSound.isPlaying) {
                        runningSound.stop();
                    }
                } else {
                    moveSpeed = RUN_SPEED;
                    if (runningSound && !runningSound.isPlaying) {
                        runningSound.play();
                    }
                    if (waterSound && waterSound.isPlaying) {
                        waterSound.stop();
                    }
                }
            } else {
                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
                }
                if (waterSound && waterSound.isPlaying) {
                    waterSound.stop();
                }
            }
        }
    }
}

/**
 * Spawns a single 2D firework burst on the win screen.
 */
function spawn2DFirework() {
    const winScreen = document.getElementById('win-screen');
    if (!winScreen) return; // Don't spawn if screen isn't up

    if (fireworkBuffer && listener) {
        const sound = new THREE.Audio(listener);
        sound.setBuffer(fireworkBuffer);
        sound.setVolume(0.5 + Math.random() * 0.3); // Vary volume
        sound.setPlaybackRate(0.8 + Math.random() * 1); // Vary pitch
        sound.play();
    }

    const burst = document.createElement('div');
    burst.style.position = 'absolute';
    // Random position on screen
    burst.style.left = `${Math.random() * 100}%`;
    burst.style.top = `${Math.random() * 100}%`;
    // We need to set width/height to 0 so particles expand from a point
    burst.style.width = '1px';
    burst.style.height = '1px';

    winScreen.appendChild(burst);

    const particleCount = 40 + Math.floor(Math.random() * 30); // 40-70 particles
    const colors = ['#FF4136', '#FF851B', '#FFDC00', '#2ECC40', '#0074D9', '#B10DC9', '#FFFFFF'];
    const burstColor = colors[Math.floor(Math.random() * colors.length)];

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        // Start at center
        particle.style.left = '0';
        particle.style.top = '0';

        // --- Random size ---
        const size = 2 + Math.random() * 2; // 2px to 4px
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        // --- End Random size ---

        particle.style.backgroundColor = burstColor;
        particle.style.borderRadius = '50%';

        // CSS Custom Properties for dynamic animation
        const angle = Math.random() * 360;
        const distance = Math.random() * 150 + 80; // 80 to 230px
        const finalX = Math.cos(angle * (Math.PI / 180)) * distance;
        const finalY = Math.sin(angle * (Math.PI / 180)) * distance;

        particle.style.setProperty('--final-x', `${finalX}px`);
        particle.style.setProperty('--final-y', `${finalY}px`);

        // Add a random delay to make the burst look more "twinkly"
        const delay = Math.random() * 200; // 0-200ms delay

        // --- Random duration ---
        const duration = 1.0 + Math.random() * 0.5;

        // Set animation
        particle.style.animation = `firework-burst ${duration}s ease-out forwards`;
        particle.style.animationDelay = `${delay}ms`;

        burst.appendChild(particle);
    }

    // Clean up the burst container after the animation
    setTimeout(() => {
        burst.remove();
    }, 1800); // 1.5s max animation + 0.2s max delay + buffer
}

/**
 * Displays a win screen and locks the game.
 */
function showWinScreen() {
    controlsLocked = true;
    stopPlayerActions();

    if (equationElement) {
        equationElement.style.display = 'none';
    }

    if (backgroundMusic && backgroundMusic.isPlaying) {
        backgroundMusic.stop();
    }
    if (successSound) {
        successSound.stop();
        successSound.play();
    }

    const winScreen = document.createElement('div');
    winScreen.id = 'win-screen';
    winScreen.style.position = 'absolute';
    winScreen.style.top = '0';
    winScreen.style.left = '0';
    winScreen.style.width = '100%';
    winScreen.style.height = '100%';
    winScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    winScreen.style.zIndex = '2000';
    winScreen.style.display = 'flex';
    winScreen.style.alignItems = 'center';
    winScreen.style.justifyContent = 'center';
    winScreen.style.color = 'white';
    winScreen.style.fontSize = '3em';
    winScreen.style.fontFamily = 'Arial, sans-serif';
    winScreen.style.textAlign = 'center';
    winScreen.style.whiteSpace = 'pre-wrap'; // To allow line breaks
    winScreen.style.overflow = 'hidden'; // Prevent particles from causing scrollbars
    winScreen.textContent = `Gratulacje!\nRozwiązałeś ${TOTAL_EQUATIONS_TO_SOLVE} działań!`;

    document.body.appendChild(winScreen);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes firework-burst {
            0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
            }
            80% {
                opacity: 1;
            }
            100% {
                transform: translate(var(--final-x), var(--final-y)) scale(0);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    spawn2DFirework();
    for (let i=0; i<10; i++) {
        setInterval(spawn2DFirework, 500 + Math.random() * 1000);
    }
}

function checkCrystalCollection() {
    if (!playerModel) return;

    const playerPos = playerModel.position;

    // Iterate backwards so we can safely remove items from the arrays
    for (let i = crystals.length - 1; i >= 0; i--) {
        const crystal = crystals[i];
        const crystalPos = crystal.position;

        const distance = playerPos.distanceTo(crystalPos);

        if (distance < CRYSTAL_COLLECT_RADIUS) {

            const collectedValue = crystal.userData.crystalValue as number | undefined;

            if (collectedValue === undefined) {
                console.warn("Collected crystal has no value!");
                continue; // Sprawdź następny kryształ
            }

            // --- Check if it's the CORRECT crystal ---
            if (collectedValue === currentTargetNumber) {
                // 1. Get crystal color for the effect
                let crystalColor = new THREE.Color(0x00aaff); // Default color
                crystal.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                        if (material && material.emissive) {
                            crystalColor.copy(material.emissive);
                        }
                    }
                });

                // 2. Play success sound
                if (successSound) {
                    successSound.stop();
                    successSound.play();
                }

                // 3. Spawn particle effect
                spawnCrystalCollectEffect(crystalPos, crystalColor);

                // 4. Update UI Counter & Add Crystal Icon
                collectedCrystals++; // Increment score
                const crystalIndex = collectedCrystals - 1; // 0-based index

                if (uiCrystalCountElement) {
                    uiCrystalCountElement.textContent = `${collectedCrystals} / ${TOTAL_EQUATIONS_TO_SOLVE}`;
                    // Add "pop" animation
                    uiCrystalCountElement.classList.add('collected');
                    setTimeout(() => uiCrystalCountElement?.classList.remove('collected'), 300);
                }

                // Add the new crystal to the UI
                if (uiCrystalTemplate && uiCrystalScene && uiCrystalCamera) {
                    const newUICrystal = uiCrystalTemplate.clone();

                    // Set its color
                    newUICrystal.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            const mesh = child as THREE.Mesh;
                            if (mesh.material) {
                                // We must clone the material to have unique colors
                                const newMaterial = (mesh.material as THREE.MeshStandardMaterial).clone();
                                newMaterial.emissive = new THREE.Color(crystalColor);
                                newMaterial.emissiveIntensity = 0.75;
                                mesh.material = newMaterial;
                            }
                        }
                    });

                    // Calculate its position
                    const rendererWidth = UI_CRYSTAL_SIZE * TOTAL_CRYSTALS;
                    const camHeight = UI_CRYSTAL_CAM_HEIGHT;
                    const camWidth = camHeight * (rendererWidth / UI_CRYSTAL_SIZE);
                    const spacing = camWidth / TOTAL_CRYSTALS;

                    newUICrystal.position.x = (-camWidth / 2) + (spacing / 2) + (crystalIndex * spacing) + 0.5;
                    newUICrystal.position.y = -1.3;

                    // Add to scene and array
                    uiCrystalScene.add(newUICrystal);
                    uiCrystalModels.push(newUICrystal);
                }

                // --- 5. Check for Win Condition ---
                if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
                    clearAllCrystals();
                    showWinScreen();
                } else {
                    // --- 6. Generate next puzzle ---
                    // This is async, but we don't need to await it here
                    // We must return from the function immediately
                    generateNewEquationAndRespawnCrystals();
                }

                // IMPORTANT: Stop iterating because the arrays are now modified
                return;

            } else {
                // --- Player collected the WRONG crystal ---

                // 1. Trigger penalty (fall)
                //triggerPlayerFall(500); // Short 0.5 sec fall

                // 2. Play "error" sound
                if (errorSound) {
                    errorSound.stop();
                    errorSound.play();
                }

                // 3. Do NOT remove the crystal, do not increment score.
            }

            // We can 'break' here since we processed a collision
            // (prevents hitting multiple wrong crystals in one frame)
            break;
        }
    }
}

function updateCameraPosition(instant: boolean = false) {
    if (!playerModel) return;

    const offset = new THREE.Vector3(0, 3, -7);
    const targetPosition = new THREE.Vector3();

    // Apply the offset in the player's local coordinate system
    offset.applyQuaternion(playerModel.quaternion);
    targetPosition.copy(playerModel.position).add(offset);

    if (instant) {
        // Instant setting (for game start)
        camera.position.copy(targetPosition);
    } else {
        // Smooth camera follow (linear interpolation - lerp)
        camera.position.lerp(targetPosition, 0.05);
    }

    // Camera always looks at the player (or a point above them)
    const lookAtPoint = playerModel.position
        .clone()
        .add(new THREE.Vector3(0, 3, 0)); // Look at center/head
    camera.lookAt(lookAtPoint);
}

window.addEventListener("keydown", (event) => {
    // Stop all input if the game is won
    if (collectedCrystals === TOTAL_EQUATIONS_TO_SOLVE) {
        keys[event.key] = false;
        return;
    }

    // Ignore movement keys if controls are locked, but allow rotation
    if (
        controlsLocked &&
        (event.key === "w" ||
            event.key === "W" ||
            event.key === "ArrowUp" ||
            event.key === "s" ||
            event.key === "S" ||
            event.key === "ArrowDown")
    ) {
        return;
    }

    // Handle jump
    if ((event.key === " " || event.key === "Spacebar") && jumpsRemaining > 0 && !controlsLocked) {
        isJumping = true;
        jumpVelocity = JUMP_FORCE;
        jumpsRemaining--;
    }

    keys[event.key] = true;
});

window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
});

function setupFpsCounter() {
    fpsElement = document.createElement('div');
    fpsElement.id = 'fps-counter';
    fpsElement.textContent = 'FPS: --';
    document.body.appendChild(fpsElement);
}

function setupLoadingBar() {
    const container = document.createElement('div');
    container.id = 'loading-container';
    container.innerHTML = `
        <div id="loading-text">Loading Game Assets...</div>
        <div id="loading-bar-bg">
            <div id="loading-bar-fill"></div>
        </div>
        <div id="loading-percentage">0%</div>
    `;
    document.body.appendChild(container);
}

/**
 * Sets up the UI for displaying collected crystals.
 */
function setupCrystalUI() {
    // Create the main UI container
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

    // Create the text element for the count
    uiCrystalCountElement = document.createElement('span');
    uiCrystalCountElement.id = 'crystal-count-text';
    uiCrystalCountElement.textContent = `0 / ${TOTAL_EQUATIONS_TO_SOLVE}`;
    uiCrystalCountElement.style.color = 'white';
    uiCrystalCountElement.style.fontSize = '24px';
    uiCrystalCountElement.style.marginRight = '12px';
    container.appendChild(uiCrystalCountElement);

    // Create the 3D renderer for the crystal icons
    const rendererWidth = UI_CRYSTAL_SIZE * TOTAL_CRYSTALS;
    const rendererHeight = UI_CRYSTAL_SIZE;

    uiCrystalRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    uiCrystalRenderer.setSize(rendererWidth, rendererHeight);
    container.appendChild(uiCrystalRenderer.domElement);

    // Create the scene for the UI renderer
    uiCrystalScene = new THREE.Scene();

    // Create the Orthographic camera for the UI renderer
    const camHeight = UI_CRYSTAL_CAM_HEIGHT;
    const camWidth = camHeight * (rendererWidth / rendererHeight);

    uiCrystalCamera = new THREE.OrthographicCamera(
        -camWidth / 2, camWidth / 2, // left, right
        camHeight / 2, -camHeight / 2, // top, bottom
        0.1,
        100
    );
    uiCrystalCamera.position.z = 10;

    // Add lighting to the UI scene
    const uiLight = new THREE.DirectionalLight(0xffffff, 2.5);
    uiLight.position.set(1, 1, 1);
    uiCrystalScene.add(uiLight);
    const uiAmbient = new THREE.AmbientLight(0xffffff, 1.5);
    uiCrystalScene.add(uiAmbient);
}

/**
 * Sets up the UI for displaying the current equation.
 */
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

/**
 * Updates the equation UI text.
 */
function updateEquationUI() {
    if (equationElement) {
        equationElement.textContent = `Rozwiąż działanie: ${currentEquation}`;
        // Add "pop" animation (reuses .collected style)
        equationElement.classList.add('collected');
        setTimeout(() => equationElement?.classList.remove('collected'), 300);
    }
}

function updateLoadingBar(progress: number, text: string = 'Loading Game Assets...') {
    const container = document.getElementById('loading-container');
    const fill = document.getElementById('loading-bar-fill');
    const percentage = document.getElementById('loading-percentage');
    const loadingText = document.getElementById('loading-text');

    if (fill) fill.style.width = `${progress}%`;
    if (percentage) percentage.textContent = `${Math.round(progress)}%`;
    if (loadingText) loadingText.textContent = text;

    if (progress >= 100 && container) {
        setTimeout(() => {
            container.classList.add('hidden');
            setTimeout(() => {
                container.remove();
            }, 500);
        }, 300);
    }
}

let totalLoadingSteps = 0;
let completedLoadingSteps = 0;

function initializeLoading(steps: number) {
    totalLoadingSteps = steps;
    completedLoadingSteps = 0;
    updateLoadingBar(0, 'Loading Game Assets...');
}

function incrementLoadingProgress(stepName: string) {
    completedLoadingSteps++;
    const progress = (completedLoadingSteps / totalLoadingSteps) * 100;
    updateLoadingBar(progress, stepName);
}

setupFpsCounter();
setupLoadingBar();
setupCrystalUI(); // Set up the UI elements before loading starts
setupEquationUI(); // Set up the new equation UI

const animalCount = 10;
const spiderCount = 3;
const beeCount = 3;

// Initialize loading with total steps: sun (1) + clouds (1) + player (2 steps) + world (2 steps) + animals + spiders + bees + crystals + UI
initializeLoading(1 + 1 + 2 + 2 + animalCount + spiderCount + beeCount + TOTAL_CRYSTALS + 1);

createSun().then(() => {
    return createClouds();
}).then(() => {
    return createPlayer();
}).then(() => {
    return createWorld();
}).then(() => {
    return spawnAnimals(animalCount);
}).then(() => {
    return spawnSpiders(spiderCount);
}).then(() => {
    return spawnBees(beeCount); // Add spawnBees to the chain
}).then(() => {
    return loadUICrystalTemplate(); // Load UI template first
}).then(() => {
    // Generate first equation and spawn first set of crystals
    return generateNewEquationAndRespawnCrystals();
});

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const elapsed = now - then;

    if (elapsed > interval) {
        then = now - (elapsed % interval);

        frameCount++;
        if (now > lastTime + fpsInterval) {
            const fps = Math.round((frameCount * 1000) / (now - lastTime));
            if (fpsElement) {
                fpsElement.textContent = `FPS: ${fps}`;
            }
            lastTime = now;
            frameCount = 0;
        }

        const delta = clock.getDelta();
        if (mixer) {
            mixer.update(delta);
        }

        // Update animal animations
        const currentTime = clock.getElapsedTime();
        for (const animalInstance of animalInstances) {
            if (animalInstance.mixer) {
                animalInstance.mixer.update(delta);
            }

            // Check if it's time to change animation
            if (currentTime >= animalInstance.nextAnimationChangeTime) {
                changeAnimalAnimation(animalInstance);
            }

            // Update animal movement
            updateAnimalMovement(animalInstance);
        }

        // Update spiders
        for (const spider of spiders) {
            if (spider.mixer) {
                spider.mixer.update(delta);
            }
            updateSpiderAI(spider);
            updateSpiderJumpBack(spider);
        }

        // Update bees
        for (const bee of bees) {
            if (bee.mixer) {
                bee.mixer.update(delta);
            }
            updateBeeAI(bee);
        }

        handlePlayerMovement();
        // Only check for collection if controls are not locked (prevents multiple triggers during 'fall')
        if (!controlsLocked) {
            checkCrystalCollection();
        }
        updateSplashes(delta);

        for (const crystal of crystals) {
            crystal.rotation.y += 0.01;
        }

        updateCameraPosition();

        if (playerModel) {
            const playerX = playerModel.position.x;
            const playerZ = playerModel.position.z;

            dirLight.target.position.set(playerX, 0, playerZ);

            const offsetX = 50;
            const offsetY = 50;
            const offsetZ = 50;

            dirLight.position.set(
                playerX + offsetX,
                offsetY,
                playerZ + offsetZ,
            );

            dirLight.target.updateMatrixWorld();
        }

        // Update and render minimap
        updateAndRenderMinimap();

        // Render main scene
        renderer.render(scene, camera);

        // Update and render Crystal UI
        if (uiCrystalRenderer && uiCrystalScene && uiCrystalCamera) {
            // Slowly rotate all collected crystals
            for (const model of uiCrystalModels) {
                model.rotation.y += 0.01;
            }
            uiCrystalRenderer.render(uiCrystalScene, uiCrystalCamera);
        }
    }
}

animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});