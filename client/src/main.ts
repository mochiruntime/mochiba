import * as THREE from 'three';
import { LaneMap } from './render/LaneMap.js';
import { CameraController } from './camera/CameraController.js';
import { ClickIndicator } from './render/ClickIndicator.js';
import { HealthBarRenderer } from './render/HealthBarRenderer.js';
import { ProjectileRenderer } from './render/ProjectileRenderer.js';
import { SkillHUD } from './ui/SkillHUD.js';
import {
  EPFL_DIAGONALE_MAP,
  clampRayToLane,
  NetworkMessage,
  ServerMessage,
  ClientMessage,
  ChampionState,
  getChampionDefinition
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

// 2. Map, Camera & Combat Renderers
const laneMap = new LaneMap(EPFL_DIAGONALE_MAP);
scene.add(laneMap.group);

const cameraController = new CameraController(camera);
const projectileRenderer = new ProjectileRenderer(scene);
const skillHUD = new SkillHUD();

// 3. State & Mesh Registries
let myPlayerId: string | null = null;
let currentPing = 0;
const championMeshes = new Map<string, THREE.Group>();
const championHealthBars = new Map<string, HealthBarRenderer>();
const championBodyMeshes = new Map<THREE.Mesh, string>(); // Mesh -> championId for raycasting
let cachedBodyMeshes: THREE.Mesh[] = [];
const latestChampionStates = new Map<string, ChampionState>();
let clickIndicators: ClickIndicator[] = [];

function rebuildCachedBodyMeshes() {
  cachedBodyMeshes = Array.from(championBodyMeshes.keys());
}

function disposeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  });
}

// 4. WebSocket Client (60Hz Synchronization)
const urlParams = new URLSearchParams(window.location.search);
const requestedChampion = urlParams.get('champion') || 'kitsune';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.hostname || 'localhost';
const ws = new WebSocket(`${wsProtocol}//${wsHost}:3001?champion=${requestedChampion}`);
let pingInterval: number | undefined;
let currentChampionId: string | null = null;

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
    projectileRenderer.sync(msg.snapshot.projectiles);

    // Snap camera to spawned hero position
    const myChamp = msg.snapshot.champions.find((c) => c.id === myPlayerId);
    if (myChamp) {
      cameraController.focus.x = myChamp.position.x;
      cameraController.focus.z = myChamp.position.z;
    }
  } else if (msg.type === 'SNAPSHOT') {
    syncChampions(msg.snapshot.champions);
    projectileRenderer.sync(msg.snapshot.projectiles);
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
  const myChamp = myPlayerId ? champions.find((c) => c.id === myPlayerId) : undefined;
  const myTeam = myChamp?.team;

  if (myChamp && myChamp.championId !== currentChampionId) {
    currentChampionId = myChamp.championId;
    const def = getChampionDefinition(currentChampionId);
    skillHUD.setChampion(def);
  }

  for (const champ of champions) {
    seenIds.add(champ.id);
    latestChampionStates.set(champ.id, champ);

    let group = championMeshes.get(champ.id);
    let healthBar = championHealthBars.get(champ.id);

    if (!group || group.userData.championId !== champ.championId) {
      if (group) {
        scene.remove(group);
        disposeHierarchy(group);
        for (const [m, id] of championBodyMeshes) {
          if (id === champ.id) championBodyMeshes.delete(m);
        }
        rebuildCachedBodyMeshes();
      }
      group = createChampionMesh(champ);
      group.userData.championId = champ.championId;
      scene.add(group);
      championMeshes.set(champ.id, group);
    }

    if (!healthBar) {
      const isAllied = myTeam ? champ.team === myTeam : champ.id === myPlayerId;
      healthBar = new HealthBarRenderer(isAllied, champ.name);
      scene.add(healthBar.group);
      championHealthBars.set(champ.id, healthBar);
    }

    // Hide champion model if dead
    group.visible = champ.isAlive;

    // Health bar stays visible even during death to show respawn timer
    healthBar.group.visible = true;
    healthBar.update(champ, group.position, camera);
  }

  // Remove disconnected champions
  for (const [id, group] of championMeshes) {
    if (!seenIds.has(id)) {
      scene.remove(group);
      disposeHierarchy(group);
      championMeshes.delete(id);
      for (const [m, cId] of championBodyMeshes) {
        if (cId === id) championBodyMeshes.delete(m);
      }
      rebuildCachedBodyMeshes();
      const hpBar = championHealthBars.get(id);
      if (hpBar) {
        scene.remove(hpBar.group);
        hpBar.dispose();
        championHealthBars.delete(id);
      }
      latestChampionStates.delete(id);
    }
  }
}

function createChampionMesh(champ: ChampionState): THREE.Group {
  const group = new THREE.Group();
  group.userData.championId = champ.championId;

  const isBlue = champ.team === 'BLUE';

  // Capsule body
  const radius = 1.0;
  const height = 1.8;
  const bodyGeo = new THREE.CapsuleGeometry(radius, height, 8, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isBlue ? 0x2288ff : 0xff3344,
    roughness: 0.3,
    metalness: 0.2
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = (height / 2) + radius;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  championBodyMeshes.set(bodyMesh, champ.id);
  rebuildCachedBodyMeshes();

  // Visor / direction pointer indicating facing angle
  const visorGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.2 });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, bodyMesh.position.y + 0.3, radius * 0.9);
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

// 5. Input Handling: RTS Right Click, Ability Keys (Q, W, E, R), Camera Controls
let currentMouseX = window.innerWidth / 2;
let currentMouseY = window.innerHeight / 2;
const raycaster = new THREE.Raycaster();
const mouseVec2 = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundIntersection = new THREE.Vector3();

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;
});

window.addEventListener('wheel', (e) => {
  cameraController.handleWheel(e.deltaY);
}, { passive: true });

function getMouseGroundPoint(): THREE.Vector3 | null {
  mouseVec2.x = (currentMouseX / window.innerWidth) * 2 - 1;
  mouseVec2.y = -(currentMouseY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVec2, camera);
  return raycaster.ray.intersectPlane(groundPlane, groundIntersection);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'z') {
    cameraController.toggleLock();
    return;
  }

  // Cast spells: Q, W, E, R
  if (['q', 'w', 'e', 'r'].includes(key) && ws.readyState === WebSocket.OPEN) {
    const spellKey = key.toUpperCase() as 'Q' | 'W' | 'E' | 'R';
    const hit = getMouseGroundPoint();
    if (hit) {
      const castMsg: ClientMessage = {
        type: 'CAST_SPELL',
        spell: spellKey,
        target: { x: hit.x, z: hit.z }
      };
      ws.send(JSON.stringify(castMsg));
    }
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 2 && ws.readyState === WebSocket.OPEN) { // Right Click: Attack or Move
    mouseVec2.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec2.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVec2, camera);

    // 1. Check if clicking on an enemy champion mesh
    const champHits = raycaster.intersectObjects(cachedBodyMeshes);

    if (champHits.length > 0) {
      const clickedMesh = champHits[0].object as THREE.Mesh;
      const targetChampId = championBodyMeshes.get(clickedMesh);
      const myChamp = myPlayerId ? latestChampionStates.get(myPlayerId) : undefined;
      const targetChamp = targetChampId ? latestChampionStates.get(targetChampId) : undefined;

      // If clicked on an opposing champion, trigger Basic Attack!
      if (myChamp && targetChamp && targetChamp.team !== myChamp.team && targetChamp.isAlive) {
        clickIndicators.push(new ClickIndicator(targetChamp.position.x, targetChamp.position.z, scene));
        const attackMsg: ClientMessage = {
          type: 'ATTACK_TARGET',
          targetId: targetChamp.id
        };
        ws.send(JSON.stringify(attackMsg));
        return;
      }
    }

    // 2. Otherwise, ground move command with directional ray clamping
    const hit = raycaster.ray.intersectPlane(groundPlane, groundIntersection);
    if (hit) {
      const myChamp = myPlayerId ? latestChampionStates.get(myPlayerId) : undefined;
      const from = myChamp ? myChamp.position : { x: 0, z: 0 };

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
let lastStatusText = '';

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

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

  // Smoothly interpolate champion positions & update health bars
  for (const [id, group] of championMeshes) {
    const state = latestChampionStates.get(id);
    if (state) {
      group.position.x = THREE.MathUtils.lerp(group.position.x, state.position.x, Math.min(1, dt * 25));
      group.position.z = THREE.MathUtils.lerp(group.position.z, state.position.z, Math.min(1, dt * 25));
      group.rotation.y = state.rotation;

      const hpBar = championHealthBars.get(id);
      if (hpBar) {
        hpBar.update(state, group.position, camera);
      }
    }
  }

  // Update HUD
  skillHUD.update(myChamp);

  // Update active click indicators
  clickIndicators = clickIndicators.filter((ind) => ind.update(dt));

  // Top Status Bar
  const lockStatus = cameraController.isLocked
    ? '<span style="color:#66ff88;">Locked</span> (Press Z)'
    : '<span style="color:#ffcc66;">Free Look</span> (Press Z)';
  const zoomPct = Math.round(
    ((cameraController.currentZoom - cameraController.minZoom) /
      (cameraController.maxZoom - cameraController.minZoom)) *
      100
  );
  const myChampDef = myChamp ? getChampionDefinition(myChamp.championId) : undefined;
  const champTag = myChampDef
    ? `<span style="color:#66ffff;font-weight:bold;">${myChampDef.name}</span>`
    : '';

  const newStatusText = `EPFL Diagonale MOBA (60Hz) | Hero: ${champTag} | Ping: ${currentPing}ms | Camera: ${lockStatus} | Zoom: ${zoomPct}%`;
  if (lastStatusText !== newStatusText) {
    statusEl.innerHTML = newStatusText;
    lastStatusText = newStatusText;
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
