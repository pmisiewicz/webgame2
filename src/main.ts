import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 100)

const listener = new THREE.AudioListener()
camera.add(listener)

const audioLoader = new THREE.AudioLoader()

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x33ff77, 1.2)
hemiLight.position.set(0, 1000, 0)
scene.add(hemiLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
dirLight.position.set(0, 50, 0)
dirLight.castShadow = true
const shadowSize = 50
dirLight.shadow.camera.left = -shadowSize
dirLight.shadow.camera.right = shadowSize
dirLight.shadow.camera.top = shadowSize
dirLight.shadow.camera.bottom = -shadowSize
dirLight.shadow.camera.near = 1
dirLight.shadow.camera.far = 150
dirLight.shadow.mapSize.width = 2048
dirLight.shadow.mapSize.height = 2048
scene.add(dirLight)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(5000, 5000),
  new THREE.MeshStandardMaterial({ color: 0x47A24C })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const loader = new GLTFLoader()

let runningSound: THREE.PositionalAudio | null = null

let playerModel: THREE.Group | null = null
const moveSpeed = 1.2
const rotationSpeed = 0.015
const MAX_STEP_HEIGHT = 0.66
const keys: { [key: string]: boolean } = {}

const raycaster = new THREE.Raycaster()
const down = new THREE.Vector3(0, -1, 0)

const worldObjects: THREE.Mesh[] = []

let mixer: THREE.AnimationMixer | null = null
let runAction: THREE.AnimationAction | null = null
const clock = new THREE.Clock()

async function loadModel(name: string): Promise<{ model: THREE.Group, animations: THREE.AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    loader.load(
      `/models/${name}`,
      (gltf) => {
        const model = gltf.scene
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })
        resolve({ model, animations: gltf.animations })
      },
      undefined,
      (err) => reject(err)
    )
  })
}

async function createWorld() {
  try {
    const { model } = await loadModel("Nature.glb")
    model.scale.setScalar(50)
    model.position.set(0, 10, 0)

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
          worldObjects.push(child as THREE.Mesh)
      }
    })

    scene.add(model)
  } catch (err) {
    console.warn("Błąd ładowania modelu Nature.glb:", err)
  }
}

function loadAudio() {
    if (!playerModel) return

    runningSound = new THREE.PositionalAudio(listener)

    // Load the audio file
    audioLoader.load('/public/running-on-the-floor-359909.mp3', function(buffer) {
        if (runningSound) {
            runningSound.setBuffer(buffer)
            runningSound.setLoop(true) // Loop the sound for continuous running
            runningSound.setVolume(0.5) // Adjust volume as needed (0.0 to 1.0)
            runningSound.setRefDistance(10) // Sound volume drops off after this distance
        }
    },
    undefined,
    (err) => {
        console.error('Błąd ładowania dźwięku:', err)
    })

    // Attach the audio source to the player model
    playerModel.add(runningSound)
}

async function createPlayer() {
  try {
    const { model, animations } = await loadModel("Steve.glb")
    playerModel = model

    loadAudio()

    playerModel.scale.setScalar(0.75)
    playerModel.position.set(5, 7, 8)

    scene.add(playerModel)

    if (animations && animations.length > 0) {
        mixer = new THREE.AnimationMixer(playerModel)

        const runClip = animations.find(clip => clip.name === 'CharacterArmature|CharacterArmature|CharacterArmature|Run')

        if (runClip) {
            runAction = mixer.clipAction(runClip)
            runAction.setLoop(THREE.LoopRepeat, Infinity)
        } else {
            console.warn("Nie znaleziono klipu animacji 'run'. Dostępne klipy:", animations.map(c => c.name))
        }
    } else {
        console.warn("Model Steve.glb nie zawiera animacji.")
    }

    updateCameraPosition(true)
  } catch (err) {
    console.warn("Błąd ładowania modelu Steve.glb:", err)
  }
}

function handlePlayerMovement() {
  if (!playerModel) return

  const originalPosition = playerModel.position.clone()
  let moving = false
  let targetPosition = playerModel.position.clone()

  if (keys['w'] || keys['W'] || keys['ArrowUp']) {
    const forwardVector = new THREE.Vector3(0, 0, -0.1)
    forwardVector.applyQuaternion(playerModel.quaternion)
    targetPosition.addScaledVector(forwardVector, -moveSpeed)
    moving = true
  }
  if (keys['s'] || keys['S'] || keys['ArrowDown']) {
    const backwardVector = new THREE.Vector3(0, 0, -0.1)
    backwardVector.applyQuaternion(playerModel.quaternion)
    targetPosition.addScaledVector(backwardVector, moveSpeed)
    moving = true
  }

  if (moving) {
    const currentOrigin = originalPosition.clone()
    currentOrigin.y += 20
    raycaster.set(currentOrigin, down)
    const currentIntersects = raycaster.intersectObjects(worldObjects, true)

    let currentGroundHeight = originalPosition.y - 1 // Domyślna minimalna wysokość, jeśli raycast zawiedzie
    if (currentIntersects.length > 0) {
        currentGroundHeight = currentOrigin.y - currentIntersects[0].distance
    }

    // Sprawdź potencjalną pozycję (X i Z z targetPosition, ale Y wysoko)
    const nextOrigin = targetPosition.clone()
    nextOrigin.y = originalPosition.y + 20 // Ustaw wysoko dla raycasta

    raycaster.set(nextOrigin, down)
    const nextIntersects = raycaster.intersectObjects(worldObjects, true)

    let nextGroundHeight = currentGroundHeight // Jeśli brak terenu, przyjmij obecną wysokość
    if (nextIntersects.length > 0) {
        nextGroundHeight = nextOrigin.y - nextIntersects[0].distance
    }

    // Sprawdź, czy różnica wysokości jest zbyt duża
    const heightDifference = nextGroundHeight - currentGroundHeight

    if (heightDifference > MAX_STEP_HEIGHT) {
        // Zatrzymanie ruchu: potencjalna pozycja Z i X jest ignorowana
        // targetPosition pozostaje taka sama jak originalPosition (oprócz Y)
        targetPosition.x = originalPosition.x
        targetPosition.z = originalPosition.z
        moving = false // Zatrzymanie animacji biegu
    }
  }

  // 2. Faktyczne przesunięcie po weryfikacji
  playerModel.position.x = targetPosition.x
  playerModel.position.z = targetPosition.z

  // 3. Raycasting w dół, aby ustawić wysokość Y w NOWEJ pozycji (targetPosition/originalPosition)
  const finalOrigin = playerModel.position.clone()
  finalOrigin.y += 20

  raycaster.set(finalOrigin, down)

  const intersects = raycaster.intersectObjects(worldObjects, true)

  if (intersects.length > 0) {
      const distanceToGround = intersects[0].distance
      const groundHeight = finalOrigin.y - distanceToGround
      const playerHeightOffset = 0

      playerModel.position.y = groundHeight + playerHeightOffset
  } else {
      // Jeśli nie ma terenu, ustaw na stałą wysokość minimalną lub zaimplementuj spadanie
      if (playerModel.position.y > 0) {
          playerModel.position.y -= 0.1 // Prosta grawitacja
      }
  }

  if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
    playerModel.rotation.y += rotationSpeed
  }
  if (keys['d'] || keys['D'] || keys['ArrowRight']) {
    playerModel.rotation.y -= rotationSpeed
  }

  if (runAction) {
     if (moving) {
         if (!runAction.isRunning()) {
             runAction.play()
         }
         if (runningSound && !runningSound.isPlaying) {
             runningSound.play()
         }
     } else {
         runAction.stop()
         if (runningSound && runningSound.isPlaying) {
             runningSound.stop()
         }
     }
   }
}

// Funkcja do aktualizacji pozycji kamery (widok TPP)
function updateCameraPosition(instant: boolean = false) {
    if (!playerModel) return

    const offset = new THREE.Vector3(0, 3, -7) // Przesunięcie kamery (x, y, z) względem gracza
    const targetPosition = new THREE.Vector3()

    // Ustawienie offsetu w lokalnym układzie współrzędnych gracza
    offset.applyQuaternion(playerModel.quaternion)
    targetPosition.copy(playerModel.position).add(offset)

    if (instant) {
        // Ustawienie natychmiastowe (dla startu gry)
        camera.position.copy(targetPosition)
    } else {
        // Płynne podążanie kamery (interpolacja liniowa - lerp)
        camera.position.lerp(targetPosition, 0.05)
    }

    // Kamera zawsze patrzy na gracza (lub punkt nad nim)
    const lookAtPoint = playerModel.position.clone().add(new THREE.Vector3(0, 3, 0)) // Patrz na środek/głowę
    camera.lookAt(lookAtPoint)
}

window.addEventListener('keydown', (event) => {
    keys[event.key] = true
})

window.addEventListener('keyup', (event) => {
    keys[event.key] = false
})

createWorld()
createPlayer()

function animate() {
  requestAnimationFrame(animate)

  const delta = clock.getDelta()
  if (mixer) {
      mixer.update(delta)
  }

  handlePlayerMovement()
  updateCameraPosition()

  renderer.render(scene, camera)
}

animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})