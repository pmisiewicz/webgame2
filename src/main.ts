import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

import runningSoundUrl from "/public/running-on-the-floor-359909.mp3";
import waterSoundUrl from "/public/walking-in-water-199418.mp3";
import bumpSoundUrl from "/public/manbonk-357114.mp3";

const scene = new THREE.Scene();
const skyColor = 0x87ceeb; // Define a variable for the sky color
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2);
hemiLight.position.set(0, 100, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 50, 50);
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
    new THREE.MeshStandardMaterial({ color: 0x47a24c }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();

let runningSound: THREE.PositionalAudio | null = null;
let waterSound: THREE.PositionalAudio | null = null;
let bumpSound: THREE.PositionalAudio | null = null;

let playerModel: THREE.Group | null = null;
const RUN_SPEED = 0.5;
const WALK_SPEED = 0.25;
let moveSpeed = RUN_SPEED;
const rotationSpeed = 0.015;
const MAX_STEP_HEIGHT = 0.66;
const BUMP_DISTANCE = 2;
const keys: { [key: string]: boolean } = {};
let controlsLocked: boolean = false;

const tempBumpVector = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

const worldObjects: THREE.Mesh[] = [];

const clouds: THREE.Group[] = [];

let mixer: THREE.AnimationMixer | null = null;
let runAction: THREE.AnimationAction | null = null;
let walkAction: THREE.AnimationAction | null = null;
let fallAction: THREE.AnimationAction | null = null;
const clock = new THREE.Clock();

// --- FPS Counter Variables ---
let fpsElement: HTMLElement | null = null;
let frameCount = 0;
let lastTime = performance.now();
const fpsInterval = 1000; // Update every second (1000ms)
// -----------------------------

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
                resolve({ model, animations: gltf.animations });
            },
            undefined,
            (err: unknown) => reject(err),
        );
    });
}

function createSun() {
    const sunGroup = new THREE.Group();

    // Main sun sphere - bright yellow/orange
    const sunGeometry = new THREE.SphereGeometry(8, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xfdb813, // Warm golden golden yellow
        transparent: false,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sunGroup.add(sun);

    // Inner glow layer
    const glowGeometry1 = new THREE.SphereGeometry(9.5, 32, 32);
    const glowMaterial1 = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.3,
    });
    const glow1 = new THREE.Mesh(glowGeometry1, glowMaterial1);
    sunGroup.add(glow1);

    // Outer glow layer
    const glowGeometry2 = new THREE.SphereGeometry(11, 32, 32);
    const glowMaterial2 = new THREE.MeshBasicMaterial({
        color: 0xffe4b5,
        transparent: true,
        opacity: 0.2,
    });
    const glow2 = new THREE.Mesh(glowGeometry2, glowMaterial2);
    sunGroup.add(glow2);

    // Outermost glow layer
    const glowGeometry3 = new THREE.SphereGeometry(13, 32, 32);
    const glowMaterial3 = new THREE.MeshBasicMaterial({
        color: 0xffffe0,
        transparent: true,
        opacity: 0.1,
    });
    const glow3 = new THREE.Mesh(glowGeometry3, glowMaterial3);
    sunGroup.add(glow3);

    // Position the sun in the sky
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

        sphere.castShadow = true;
        cloud.add(sphere);
    }

    return cloud;
}

function createClouds() {
    const cloudCount = 100;
    const areaSize = 500; // Define the horizontal area for clouds
    const altitude = 25; // Define the base altitude for clouds

    for (let i = 0; i < cloudCount; i++) {
        // Randomize horizontal position within the area
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;
        // Slightly vary the altitude
        const y = altitude + Math.random() * 20;

        const cloud = createCloud();

        const scaleFactor = Math.random() * 1 + 1;
        cloud.scale.setScalar(scaleFactor);

        // Set the final position of the entire cloud group
        cloud.position.set(x, y, z);

        scene.add(cloud);
        clouds.push(cloud);
    }
}

function isMesh(child: THREE.Object3D): child is THREE.Mesh {
    return (child as THREE.Mesh).isMesh === true && 'geometry' in child;
}

async function createWorld() {
    try {
        const { model } = await loadModel("Nature.glb");
        model.scale.setScalar(50);
        model.position.set(0, 10, 0);

        model.traverse((child) => {
            // Check if the child is a Mesh and has a geometry property
            if (isMesh(child)) {
                worldObjects.push(child);

                // Use BufferGeometry to access computeVertexNormals
                const geometry = child.geometry as THREE.BufferGeometry;

                if (geometry.isBufferGeometry) {
                    // Ensures the raycaster can return a 'face' and 'face.normal' - this fixes shadows!
                    geometry.computeVertexNormals();

                    // Create and assign MeshBVH to the geometry (required for accelerated raycasting)
                    (geometry as any).boundsTree = new MeshBVH(geometry);
                    child.raycast = acceleratedRaycast;
                }
            }
        });

        scene.add(model);
    } catch (err) {
        console.warn("Błąd ładowania modelu Nature.glb:", err);
    }
}

function loadAudio() {
    if (!playerModel) return;

    // Setup for Running Sound (Grass)
    runningSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        // Use the imported URL
        runningSoundUrl,
        function (buffer) {
            if (runningSound) {
                runningSound.setBuffer(buffer);
                runningSound.setLoop(true);
                runningSound.setVolume(0.5);
                runningSound.setRefDistance(10);
            }
        },
        undefined,
        (err) => {
            console.error("Błąd ładowania dźwięku trawy:", err);
        },
    );
    playerModel.add(runningSound);

    // Setup for Water Sound
    waterSound = new THREE.PositionalAudio(listener);
    audioLoader.load(
        // Use the imported URL
        waterSoundUrl,
        function (buffer) {
            if (waterSound) {
                waterSound.setBuffer(buffer);
                waterSound.setLoop(true);
                waterSound.setVolume(0.5); // Set volume
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
        // Use the imported URL
        bumpSoundUrl,
        function (buffer) {
            if (bumpSound) {
                bumpSound.setBuffer(buffer);
                bumpSound.setLoop(false);
                bumpSound.setVolume(1.0);
                bumpSound.setRefDistance(5);
            }
        },
        undefined,
        (err) => {
            console.error("Błąd ładowania dźwięku uderzenia:", err);
        },
    );
    playerModel.add(bumpSound);
}

async function createPlayer() {
    try {
        const { model, animations } = await loadModel("Animated Platformer Character.glb");
        playerModel = model;

        loadAudio();

        playerModel.scale.setScalar(0.5);
        playerModel.position.set(5, 7, 8);

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

            if (mixer) {
                mixer.addEventListener("finished", (e) => {
                    if (e.action === fallAction) {
                        // Once the fall action is done, make it instantly stop holding the pose
                        fallAction.stop();
                    }
                });
            }
        } else {
            console.warn("Model Steve.glb nie zawiera animacji.");
        }

        updateCameraPosition(true);
    } catch (err) {
        console.warn("Błąd ładowania modelu Steve.glb:", err);
    }
}

function handlePlayerMovement() {
    if (!playerModel) return;

    if (controlsLocked) {
        // Still allow rotation, but block movement vectors
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

    if (keys["w"] || keys["W"] || keys["ArrowUp"]) {
        const forwardVector = new THREE.Vector3(0, 0, -0.1);
        forwardVector.applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(forwardVector, -moveSpeed);
        moving = true;
    }
    if (keys["s"] || keys["S"] || keys["ArrowDown"]) {
        const backwardVector = new THREE.Vector3(0, 0, -0.1);
        backwardVector.applyQuaternion(playerModel.quaternion);
        targetPosition.addScaledVector(backwardVector, moveSpeed);
        moving = true;
    }

    if (moving) {
        const currentOrigin = originalPosition.clone();
        currentOrigin.y += 20;
        raycaster.set(currentOrigin, down);
        const currentIntersects = raycaster.intersectObjects(
            worldObjects,
            true,
        );

        let currentGroundHeight = originalPosition.y - 1; // Domyślna minimalna wysokość, jeśli raycast zawiedzie
        if (currentIntersects.length > 0) {
            currentGroundHeight =
                currentOrigin.y - currentIntersects[0].distance;
        }

        // Sprawdź potencjalną pozycję (X i Z z targetPosition, ale Y wysoko)
        const nextOrigin = targetPosition.clone();
        nextOrigin.y = originalPosition.y + 20; // Ustaw wysoko dla raycasta

        raycaster.set(nextOrigin, down);
        const nextIntersects = raycaster.intersectObjects(worldObjects, true);

        let nextGroundHeight = currentGroundHeight; // Jeśli brak terenu, przyjmij obecną wysokość
        if (nextIntersects.length > 0) {
            nextGroundHeight = nextOrigin.y - nextIntersects[0].distance;
        }

        const heightDifference = nextGroundHeight - currentGroundHeight;

        if (heightDifference > MAX_STEP_HEIGHT) {
            // 1. Calculate the failed movement vector (target - original)
            const failedMovementVector = targetPosition
                .clone()
                .sub(originalPosition);

            // 2. Calculate the bump vector (reversed, normalized, and scaled)
            tempBumpVector
                .copy(failedMovementVector)
                .negate()
                .normalize()
                .multiplyScalar(BUMP_DISTANCE); // Use the defined BUMP_DISTANCE

            // 3. Update targetPosition to be the original position PLUS the bump.
            // This is the final X/Z position for this frame.
            targetPosition.x = originalPosition.x + tempBumpVector.x;
            targetPosition.z = originalPosition.z + tempBumpVector.z;

            // 4. Set movement flags
            moving = false; // Stop animation and cancel the main move

            // 5. New: Stop current movement animations and play fall/death action
            if (runAction) runAction.stop();
            if (walkAction) walkAction.stop();

            if (fallAction) {
                fallAction.reset().play();

                // 6. New: Lock controls for 3 seconds
                controlsLocked = true;
                setTimeout(() => {
                    controlsLocked = false;
                }, 1000); // 3000 milliseconds = 3 seconds

                // 7. New: Play bump sound
                if (bumpSound && !bumpSound.isPlaying) {
                    bumpSound.play();
                }

                // Stop continuous sounds if they are playing during the bump
                if (runningSound && runningSound.isPlaying) runningSound.stop();
                if (waterSound && waterSound.isPlaying) waterSound.stop();
            }
        }
    }

    // 2. Faktyczne przesunięcie po weryfikacji
    // This now correctly sets the position:
    // - If successful: targetPosition has the new coordinates.
    // - If blocked: targetPosition has the original coordinates + bump.
    playerModel.position.x = targetPosition.x;
    playerModel.position.z = targetPosition.z;

    // 3. Raycasting w dół, aby ustawić wysokość Y w NOWEJ pozycji (targetPosition/originalPosition + bump)
    const finalOrigin = playerModel.position.clone();
    finalOrigin.y += 20;

    raycaster.set(finalOrigin, down);

    const intersects = raycaster.intersectObjects(worldObjects, true);

    if (intersects.length > 0) {
        const distanceToGround = intersects[0].distance;
        const groundHeight = finalOrigin.y - distanceToGround;
        const playerHeightOffset = 0;

        playerModel.position.y = groundHeight + playerHeightOffset;
    } else {
        if (playerModel.position.y > 0) {
            playerModel.position.y -= 0.1; // Prosta grawitacja
        }
    }

    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
        playerModel.rotation.y += rotationSpeed;
    }
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
        playerModel.rotation.y -= rotationSpeed;
    }

    let isWater = false;

    if (intersects.length > 0) {
        const hitObject = intersects[0].object as THREE.Mesh;

        // Check the color of the hit material
        if (hitObject.material && "color" in hitObject.material) {
            const materialColor = (
                hitObject.material as THREE.MeshStandardMaterial
            ).color;

            console.log("" + materialColor.getHex().toString(16));

            if (
                materialColor.getHex() === 0x00bfd4 ||
                materialColor.getHex() === 0x81dfeb
            ) {
                isWater = true;
            }
        }
    }

    let isRunning = moving;

    if (runAction && walkAction) {
        // Animation and sound logic only runs if controls are NOT locked
        if (!controlsLocked) {
            if (isRunning) {
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
            // If controls are locked, ensure movement animations are stopped
            if (runAction && runAction.isRunning()) runAction.stop();
            if (walkAction && walkAction.isRunning()) walkAction.stop();
        }
    } else {
        // Fallback for sound control if actions are missing, also respecting control lock
        if (!controlsLocked) {
            if (isRunning) {
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

// Funkcja do aktualizacji pozycji kamery (widok TPP)
function updateCameraPosition(instant: boolean = false) {
    if (!playerModel) return;

    const offset = new THREE.Vector3(0, 3, -7); // Przesunięcie kamery (x, y, z) względem gracza
    const targetPosition = new THREE.Vector3();

    // Ustawienie offsetu w lokalnym układzie współrzędnych gracza
    offset.applyQuaternion(playerModel.quaternion);
    targetPosition.copy(playerModel.position).add(offset);

    if (instant) {
        // Ustawienie natychmiastowe (dla startu gry)
        camera.position.copy(targetPosition);
    } else {
        // Płynne podążanie kamery (interpolacja liniowa - lerp)
        camera.position.lerp(targetPosition, 0.05);
    }

    // Kamera zawsze patrzy na gracza (lub punkt nad nim)
    const lookAtPoint = playerModel.position
        .clone()
        .add(new THREE.Vector3(0, 3, 0)); // Patrz na środek/głowę
    camera.lookAt(lookAtPoint);
}

window.addEventListener("keydown", (event) => {
    // 8. New: Ignore movement keys if controls are locked, but allow rotation
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
    keys[event.key] = true;
});

window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
});

// Function to setup the FPS counter HTML element and styles
function setupFpsCounter() {
    // Inject styling for the counter
    const style = document.createElement('style');
    style.textContent = `
        #fps-counter {
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #00ff00;
            padding: 5px 10px;
            font-family: monospace;
            font-size: 14px;
            z-index: 1000;
            border-radius: 4px;
        }
    `;
    document.head.appendChild(style);

    // Create the element
    fpsElement = document.createElement('div');
    fpsElement.id = 'fps-counter';
    fpsElement.textContent = 'FPS: --';
    document.body.appendChild(fpsElement);
}

createWorld();
createSun();
createClouds();
createPlayer();
setupFpsCounter();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    frameCount++;

    // Update FPS display every second
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

    handlePlayerMovement();
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
            offsetY, // Keep light at a fixed height
            playerZ + offsetZ,
        );

        dirLight.target.updateMatrixWorld();
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});
