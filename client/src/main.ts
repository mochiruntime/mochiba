import * as THREE from 'three';
import { LaneMap } from './render/LaneMap.js';
import { CameraController } from './camera/CameraController.js';
import { ClickIndicator } from './render/ClickIndicator.js';
import {
  EPFL_DIAGONALE_MAP,
  clampToLane,
  clampRayToLane,
  NetworkMessage,
  ServerMessage,
  ClientMessage,
  ChampionState
} from '@mochiba/shared';

const container = document.getElementById('canvas-container')!;
const statusEl = document.getElementById('status')!;

// 1. Three.js Scene, Sky & Lighting
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xa8c8e8);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(0xa8c8e8, 0.0025);

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xeef6ff, 0x3d6639, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
sunLight.position.set(100, 180, 70);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 400;
const d = 160;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.2));

// 2. Map & Camera Controller
const laneMap = new LaneMap(EPFL_DIAGONALE_MAP);
scene.add(laneMap.group);

const cameraController = new CameraController(camera);

// 3. State & Mesh Registries
let myPlayerId: string | null = null;
let currentPing = 0;
const championMeshes = new Map<string, THREE.Group>();
const latestChampionStates = new Map<string, ChampionState>();
let clickIndicators: ClickIndicator[] = [];

// 4. WebSocket Client (60Hz Synchronization)
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.hostname || 'localhost';
const ws = new WebSocket(`${wsProtocol}//${wsHost}:3001`);
let pingInterval: number | undefined;

ws.onopen = () => {
  pingInterval = window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const pingMsg: ClientMessage = { type: 'PING', clientTime: Date.now() };
      ws.send(JSON.stringify(pingMsg));
    }
  }, 1000);
};

ws.onmessage = (event) => {
  const msg: ServerMessage = JSON.parse(event.data);
  if (msg.type === 'HELLO') {
    myPlayerId = msg.clientId;
    syncChampions(msg.snapshot.champions);
    // Snap camera to spawned hero position
    const myChamp = msg.snapshot.champions.find((c) => c.id === myPlayerId);
    if (myChamp) {
      cameraController.focus.x = myChamp.position.x;
      cameraController.focus.z = myChamp.position.z;
    }
  } else if (msg.type === 'SNAPSHOT') {
    syncChampions(msg.snapshot.champions);
  } else if (msg.type === 'PONG') {
    currentPing = Date.now() - msg.clientTime;
  }
};

ws.onclose = () => {
  if (pingInterval) clearInterval(pingInterval);
  statusEl.innerText = 'Disconnected from server.';
};

function syncChampions(champions: ChampionState[]) {
  const seenIds = new Set<string>();

  for (const champ of champions) {
    seenIds.add(champ.id);
    latestChampionStates.set(champ.id, champ);

    let group = championMeshes.get(champ.id);
    if (!group) {
      group = createChampionMesh(champ);
      scene.add(group);
      championMeshes.set(champ.id, group);
    }
  }

  // Remove disconnected champions
  for (const [id, group] of championMeshes) {
    if (!seenIds.has(id)) {
      scene.remove(group);
      championMeshes.delete(id);
      latestChampionStates.delete(id);
    }
  }
}

function createChampionMesh(champ: ChampionState): THREE.Group {
  const group = new THREE.Group();

  // Capsule body (1.2m radius, 2.4m height)
  const bodyGeo = new THREE.CapsuleGeometry(1.0, 1.8, 8, 16);
  const isBlue = champ.team === 'BLUE';
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isBlue ? 0x2288ff : 0xff3344,
    roughness: 0.3,
    metalness: 0.2
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 1.9;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Visor / direction pointer indicating facing angle
  const visorGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.2 });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 2.2, 0.9);
  group.add(visorMesh);

  // Ground selection ring
  const ringGeo = new THREE.RingGeometry(1.2, 1.35, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isBlue ? 0x88ccff : 0xff8899,
    side: THREE.DoubleSide
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.05;
  group.add(ringMesh);

  group.position.set(champ.position.x, 0, champ.position.z);
  return group;
}

// 5. Input Handling: RTS Right Click, Free Look Mousemove, Z Lock, Scroll Zoom
let currentMouseX = window.innerWidth / 2;
let currentMouseY = window.innerHeight / 2;
const raycaster = new THREE.Raycaster();
const mouseVec2 = new THREE.Vector2();

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;
});

window.addEventListener('wheel', (e) => {
  cameraController.handleWheel(e.deltaY);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'z') {
    cameraController.toggleLock();
  }
});

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundIntersection = new THREE.Vector3();

window.addEventListener('mousedown', (e) => {
  if (e.button === 2 && ws.readyState === WebSocket.OPEN) { // Right Click: Move Command
    mouseVec2.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec2.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVec2, camera);

    const hit = raycaster.ray.intersectPlane(groundPlane, groundIntersection);
    if (hit) {
      // Find local champion position as ray origin
      const myChamp = myPlayerId ? latestChampionStates.get(myPlayerId) : undefined;
      const from = myChamp ? myChamp.position : { x: 0, z: 0 };

      // Directional ray clamping: preserves exact heading angle to pointer,
      // cutting off at the corridor boundary
      const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, from, { x: hit.x, z: hit.z });
      clickIndicators.push(new ClickIndicator(clamped.x, clamped.z, scene));

      const moveMsg: ClientMessage = {
        type: 'MOVE_COMMAND',
        target: { x: clamped.x, z: clamped.z }
      };
      ws.send(JSON.stringify(moveMsg));
    }
  }
});

// 6. Game Loop (Update & Render)
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Find local player coordinate
  const myChamp = myPlayerId ? latestChampionStates.get(myPlayerId) : undefined;
  const myPos = myChamp ? { x: myChamp.position.x, z: myChamp.position.z } : undefined;

  // Update Camera
  cameraController.update(
    dt,
    currentMouseX,
    currentMouseY,
    window.innerWidth,
    window.innerHeight,
    myPos
  );

  // Smoothly interpolate champion positions
  for (const [id, group] of championMeshes) {
    const state = latestChampionStates.get(id);
    if (state) {
      group.position.x = THREE.MathUtils.lerp(group.position.x, state.position.x, Math.min(1, dt * 25));
      group.position.z = THREE.MathUtils.lerp(group.position.z, state.position.z, Math.min(1, dt * 25));
      group.rotation.y = state.rotation;
    }
  }

  // Update active click indicators
  clickIndicators = clickIndicators.filter((ind) => ind.update(dt));

  // Update HUD
  const lockStatus = cameraController.isLocked
    ? '<span style="color:#66ff88;">Locked</span> (Press Z)'
    : '<span style="color:#ffcc66;">Free Look</span> (Press Z)';
  const zoomPct = Math.round(
    ((cameraController.currentZoom - cameraController.minZoom) /
      (cameraController.maxZoom - cameraController.minZoom)) *
      100
  );
  statusEl.innerHTML = `EPFL Diagonale MOBA (60Hz) | Ping: ${currentPing}ms | Camera: ${lockStatus} | Zoom: ${zoomPct}%`;

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
