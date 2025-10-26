import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls' // Usunięte lub zakomentowane

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)
// camera.position.set(0, 50, 100) // Początkowa pozycja kamery zostanie ustawiona po załadowaniu gracza

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

// ... (pozostała konfiguracja świateł i podłoża bez zmian) ...

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x33ff77, 1.8)
hemiLight.position.set(0, 1000, 0)
scene.add(hemiLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 1.8) // Zwiększona siła do 1.8
dirLight.position.set(50, 50, 50)
dirLight.castShadow = true
const shadowSize = 50 // Rozmiar obszaru cieni wokół gracza
dirLight.shadow.camera.left = -shadowSize
dirLight.shadow.camera.right = shadowSize
dirLight.shadow.camera.top = shadowSize
dirLight.shadow.camera.bottom = -shadowSize
dirLight.shadow.camera.near = 1 // Bliska płaszczyzna przycinania
dirLight.shadow.camera.far = 150 // Daleka płaszczyzna (odległość, na którą cienie będą widoczne)
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

// Zmienna do przechowywania referencji do modelu gracza
let playerModel: THREE.Group | null = null
const moveSpeed = 0.5 // Prędkość ruchu postaci
const rotationSpeed = 0.01 // Prędkość obrotu
const keys: { [key: string]: boolean } = {} // Mapa przechowująca stany klawiszy

// Nowe zmienne dla animacji
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
        resolve({ model, animations: gltf.animations }) // Zwraca model i animacje
      },
      undefined,
      (err) => reject(err)
    )
  })
}

async function createWorld() {
  try {
    const { model } = await loadModel("Nature.glb") // Pomijamy animacje dla świata
    model.scale.setScalar(50)
    model.position.set(0, 10, 0)

    scene.add(model)
  } catch (err) {
    console.warn("Błąd ładowania modelu Nature.glb:", err)
  }
}

async function createPlayer() {
  try {
    const { model, animations } = await loadModel("Steve.glb")
    playerModel = model // Zapisanie referencji

    playerModel.scale.setScalar(1)
    playerModel.position.set(5, 7, 8)

    scene.add(playerModel)

    if (animations && animations.length > 0) {
        mixer = new THREE.AnimationMixer(playerModel)

        const runClip = animations.find(clip => clip.name === 'CharacterArmature|CharacterArmature|CharacterArmature|Walk')

        if (runClip) {
            runAction = mixer.clipAction(runClip)
            runAction.setLoop(THREE.LoopRepeat, Infinity)
            // runAction.play() // Nie uruchamiamy od razu, tylko w ruchu
        } else {
            console.warn("Nie znaleziono klipu animacji 'run'. Dostępne klipy:", animations.map(c => c.name))
        }
    } else {
        console.warn("Model Steve.glb nie zawiera animacji.")
    }

    // Ustawienie początkowej pozycji kamery za graczem
    updateCameraPosition(true)
  } catch (err) {
    console.warn("Błąd ładowania modelu Steve.glb:", err)
  }
}

// Funkcja do obsługi ruchu postaci
function handlePlayerMovement() {
  if (!playerModel) return

  // Kierunek ruchu
  let moving = false
  if (keys['w'] || keys['W'] || keys['ArrowUp']) {
    // Poruszanie do przodu (w kierunku, w którym postać jest obrócona)
    const forwardVector = new THREE.Vector3(0, 0, -0.1)
    forwardVector.applyQuaternion(playerModel.quaternion)
    playerModel.position.addScaledVector(forwardVector, -moveSpeed) // Odwrotnie, bo GLTF często jest skierowany wzdłuż ujemnej osi Z
    moving = true
  }
  if (keys['s'] || keys['S'] || keys['ArrowDown']) {
    // Poruszanie do tyłu
    const backwardVector = new THREE.Vector3(0, 0, -0.1)
    backwardVector.applyQuaternion(playerModel.quaternion)
    playerModel.position.addScaledVector(backwardVector, moveSpeed)
    moving = true
  }

  // Obrót
  if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
    // Obrót w lewo (wokół osi Y)
    playerModel.rotation.y += rotationSpeed
    // Obrót nie jest traktowany jako ruch dla animacji run, ale można to zmienić
    //moving = true // Opcjonalnie: traktuj obrót jako ruch (jeśli model jest animowany również przy obrocie)
  }
  if (keys['d'] || keys['D'] || keys['ArrowRight']) {
    // Obrót w prawo (wokół osi Y)
    playerModel.rotation.y -= rotationSpeed
    // Obrót nie jest traktowany jako ruch dla animacji run
    //moving = true // Opcjonalnie: traktuj obrót jako ruch
  }

  // Ograniczenie wysokości, aby nie przeniknąć przez ziemię
  if (playerModel.position.y < 7) {
      playerModel.position.y = 7
  }

  // KONTROLA ANIMACJI
  if (runAction) {
      if (moving) {
          if (!runAction.isRunning()) {
              runAction.play()
          }
      } else {
          // Aby animacja zatrzymywała się płynnie, możemy użyć fadeOut
          //runAction.fadeOut(0.5) // Płynne zatrzymanie
          runAction.stop() // Natychmiastowe zatrzymanie
      }
  }
}

// Funkcja do aktualizacji pozycji kamery (widok TPP)
function updateCameraPosition(instant: boolean = false) {
    if (!playerModel) return

    const offset = new THREE.Vector3(0, 5, -10) // Przesunięcie kamery (x, y, z) względem gracza
    const targetPosition = new THREE.Vector3()

    // Ustawienie offsetu w lokalnym układzie współrzędnych gracza
    offset.applyQuaternion(playerModel.quaternion)
    targetPosition.copy(playerModel.position).add(offset)

    if (instant) {
        // Ustawienie natychmiastowe (dla startu gry)
        camera.position.copy(targetPosition)
    } else {
        // Płynne podążanie kamery (interpolacja liniowa - lerp)
        camera.position.lerp(targetPosition, 0.02)
    }

    // Kamera zawsze patrzy na gracza (lub punkt nad nim)
    const lookAtPoint = playerModel.position.clone().add(new THREE.Vector3(0, 3, 0)) // Patrz na środek/głowę
    camera.lookAt(lookAtPoint)
}


// Nasłuchiwanie zdarzeń klawiatury
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

  // AKTUALIZACJA MIXERA ANIMACJI
  const delta = clock.getDelta()
  if (mixer) {
      mixer.update(delta)
  }

  handlePlayerMovement() // Obsługa ruchu
  updateCameraPosition() // Aktualizacja kamery

  // controls.update() // Usunięte
  renderer.render(scene, camera)
}

animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})