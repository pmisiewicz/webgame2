import * as THREE from "three";
import {type GLTF, GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {acceleratedRaycast, MeshBVH} from "three-mesh-bvh";

import runningSoundUrl from "/src/sfx/running-in-grass-6237.mp3";
import waterSoundUrl from "/src/sfx/walking-in-water-199418.mp3";
import bumpSoundUrl from "/src/sfx/boing2-418548.mp3";
import forestAtmosphereUrl from "/src/sfx/forest-atmosphere-001localization-poland-329745.mp3";
import animalHitSoundUrl from "/src/sfx/small-monster-attack-195712.mp3";
import waterSplashSoundUrl from "/src/sfx/water-splash-02-352021.mp3";

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

// Minimap setup - 3D renderer with top-down view
const MINIMAP_SIZE = 200;
const minimapRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
minimapRenderer.setSize(MINIMAP_SIZE, MINIMAP_SIZE);
minimapRenderer.domElement.style.position = 'absolute';
minimapRenderer.domElement.style.bottom = '20px';
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
    new THREE.MeshBasicMaterial({ color: 0xffffff })
);
minimapPlayerArrow.rotation.x = Math.PI / 2; // Point the cone forward

// Wrap arrow in a group so we can rotate on Y axis properly
const minimapPlayerMarker = new THREE.Group();
minimapPlayerMarker.add(minimapPlayerArrow);
minimapPlayerMarker.position.y = 50; // High above terrain
minimapScene.add(minimapPlayerMarker);

// Spider markers (no animal markers)
const minimapSpiderMarkers: THREE.Mesh[] = [];

// Crystal markers
const minimapCrystalMarkers: THREE.Mesh[] = [];

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

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshStandardMaterial({color: 0x47a24c}),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();

let runningSound: THREE.PositionalAudio | null = null;
let waterSound: THREE.PositionalAudio | null = null;
let bumpSound: THREE.PositionalAudio | null = null;
let backgroundMusic: THREE.Audio | null = null;
let animalHitSound: THREE.PositionalAudio | null = null;
let waterSplashSound: THREE.PositionalAudio | null = null;

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
function getGroundHeight(position: THREE.Vector3, raycastHeight: number = 10): { groundY: number; hitObject: THREE.Mesh } | null {
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
    stopPlayerActions();

    // Play fall animation
    if (fallAction) {
        fallAction.reset().play();
    }

    // Lock controls temporarily
    controlsLocked = true;
    setTimeout(() => {
        controlsLocked = false;
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
            `/src/models/${name}`,
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
    const areaSize = 220;
    const spawnAttempts = 15;
    const MIN_DISTANCE_FROM_PLAYER = 50; // Minimum distance from player spawn point
    const playerStartPos = new THREE.Vector3(5, 0, 8); // Player starting position (y doesn't matter for distance check)

    for (let i = 0; i < count; i++) {
        try {
            const {model, animations} = await loadModel("Spider.glb");

            incrementLoadingProgress(`Loading Spiders... (${i + 1}/${count})`);

            // Spider scale
            const scaleFactor = 0.5;
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

// Crystal system
const crystals: THREE.Group[] = [];

async function spawnCrystals(count: number) {
    const areaSize = 250;
    const spawnAttempts = 20;
    const MIN_DISTANCE_FROM_PLAYER = 20; // Minimum distance from player spawn point
    const playerStartPos = new THREE.Vector3(5, 0, 8);

    for (let i = 0; i < count; i++) {
        try {
            const {model} = await loadModel("Crystal.glb");

            incrementLoadingProgress(`Loading Crystals... (${i + 1}/${count})`);

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
                    if (!isWater && slopeDot >= minSlopeDot && hasClearance) {
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
                0xff8800, // Orange
                0xaa00ff  // Purple
            ];
            const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    if (mesh.material) {
                        const material = mesh.material as THREE.MeshStandardMaterial;
                        material.emissive = new THREE.Color(randomColor);
                        material.emissiveIntensity = 1;
                    }
                }
            });

            scene.add(model);
            crystals.push(model);
        } catch (err) {
            console.warn(`Failed to load crystal model:`, err);
        }
    }

    console.log(`Spawned ${crystals.length} crystals on the map`);
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

    // Load animal hit sound
    animalHitSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        animalHitSoundUrl,
        function (buffer) {
            if (animalHitSound) {
                animalHitSound.setBuffer(buffer);
                animalHitSound.setLoop(false);
                animalHitSound.setVolume(1);
                animalHitSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Error loading animal hit sound:", err);
        },
    );
    playerModel.add(animalHitSound);

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
                if (animalHitSound && !animalHitSound.isPlaying) {
                    animalHitSound.play();
                }
            }
        } else {
            // Move towards player if not in attack range
            const moveVector = direction.multiplyScalar(spider.moveSpeed);
            const newPosition = spiderPos.clone().add(moveVector);

            // Check ground height at new position
            const groundResult = getGroundHeight(newPosition);

            if (groundResult) {
                const { groundY, hitObject } = groundResult;

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
                    const { groundY, hitObject } = groundResult;

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

function handlePlayerMovement() {
    if (!playerModel) return;

    if (controlsLocked) {
        if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
            playerModel.rotation.y += rotationSpeed;
        }
        if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
            playerModel.rotation.y -= rotationSpeed;
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

        if (heightDifference > MAX_STEP_HEIGHT || hitWall || hitAnimal || hitSpider) {
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

            // Handle spider collision - player falls
            if (hitSpider) {
                // Make player fall
                triggerPlayerFall();

                // Trigger spider attack animation and jump back
                if (collidedSpider) {
                    triggerSpiderAttack(collidedSpider);
                }

                // Play hit sound
                if (animalHitSound && !animalHitSound.isPlaying) {
                    animalHitSound.play();
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
                    moveSpeed = RUN_SPEED;

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
                }
                if (walkAction.isRunning()) {
                    walkAction.stop();
                }

                if (runningSound && runningSound.isPlaying) {
                    runningSound.stop();
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

// Initialize loading with total steps: sun (1) + clouds (1) + player (2 steps) + world (2 steps) + 20 animals + 5 spiders + 10 crystals
initializeLoading(1 + 1 + 2 + 2 + 20 + 5 + 10);

createSun().then(() => {
    return createClouds();
}).then(() => {
    return createPlayer();
}).then(() => {
    return createWorld();
}).then(() => {
    return spawnAnimals(20);
}).then(() => {
    return spawnSpiders(5);
}).then(() => {
    return spawnCrystals(10);
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

        handlePlayerMovement();
        updateSplashes(delta);

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

        renderer.render(scene, camera);
    }
}

animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});
