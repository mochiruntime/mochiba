import * as THREE from 'three';
import { LaneMap } from './render/LaneMap.js';
import { CameraController } from './camera/CameraController.js';
import { ChampionRenderer } from './render/ChampionRenderer.js';
import { ProjectileRenderer } from './render/ProjectileRenderer.js';
import { registerKitsuneProjectileVisuals } from './champions/kitsune/kitsuneProjectileVisuals.js';
import { SkillHUD } from './ui/SkillHUD.js';
import { InputController } from './input/InputController.js';
import { NetworkClient } from './net/NetworkClient.js';
import { EPFL_DIAGONALE_MAP, ChampionState, getChampionDefinition } from '@mochiba/shared';

const container = document.getElementById('canvas-container')!;
const statusEl = document.getElementById('status')!;

// 1. Three.js Scene, Camera & Lighting Setup
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xa8c8e8);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(0xa8c8e8, 0.0025);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xeef6ff, 0x3d6639, 0.85);
const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
sunLight.position.set(100, 180, 70);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const d = 160;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(hemiLight, sunLight, new THREE.AmbientLight(0xffffff, 0.2));

// 2. Subsystems Instantiation
const laneMap = new LaneMap(EPFL_DIAGONALE_MAP);
scene.add(laneMap.group);

const cameraController = new CameraController(camera);
const championRenderer = new ChampionRenderer(scene);
const projectileRenderer = new ProjectileRenderer(scene);
registerKitsuneProjectileVisuals(projectileRenderer);
const skillHUD = new SkillHUD();

let currentChampionId: string | null = null;
function handleSnapshotChampions(champions: ChampionState[]) {
  championRenderer.sync(champions, networkClient.myPlayerId);
  const myChamp = networkClient.myPlayerId ? champions.find((c) => c.id === networkClient.myPlayerId) : undefined;
  if (myChamp && myChamp.championId !== currentChampionId) {
    currentChampionId = myChamp.championId;
    skillHUD.setChampion(getChampionDefinition(currentChampionId));
  }
}

// 3. Network Client
const networkClient = new NetworkClient({
  onHello: (msg) => {
    handleSnapshotChampions(msg.snapshot.champions);
    projectileRenderer.sync(msg.snapshot.projectiles);
    const myChamp = msg.snapshot.champions.find((c: ChampionState) => c.id === msg.clientId);
    if (myChamp) {
      cameraController.focus.x = myChamp.position.x;
      cameraController.focus.z = myChamp.position.z;
    }
  },
  onSnapshot: (snapshot) => {
    handleSnapshotChampions(snapshot.champions);
    projectileRenderer.sync(snapshot.projectiles);
  },
  onPong: () => {},
  onDisconnect: (errorText) => {
    statusEl.innerText = errorText;
  }
});

// 4. Input Controller
const inputController = new InputController(camera, scene, championRenderer, {
  onMove: (target) => networkClient.send({ type: 'MOVE_COMMAND', target }),
  onAttack: (targetId) => networkClient.send({ type: 'ATTACK_TARGET', targetId }),
  onCastSpell: (spell, target) => networkClient.send({ type: 'CAST_SPELL', spell, target }),
  onToggleCameraLock: () => cameraController.toggleLock(),
  onZoom: (deltaY) => cameraController.handleWheel(deltaY),
  getMyPosition: () => {
    const myChamp = networkClient.myPlayerId ? championRenderer.getLatestState(networkClient.myPlayerId) : undefined;
    return myChamp ? myChamp.position : { x: 0, z: 0 };
  },
  getMyPlayerId: () => networkClient.myPlayerId,
  isNetworkReady: () => networkClient.isOpen()
});

const requestedChampion = new URLSearchParams(window.location.search).get('champion') || 'kitsune';
networkClient.connect(requestedChampion);

// 5. 60 FPS Game Loop
const clock = new THREE.Clock();
let lastStatusText = '';

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  const myChamp = networkClient.myPlayerId ? championRenderer.getLatestState(networkClient.myPlayerId) : undefined;
  const myPos = myChamp ? { x: myChamp.position.x, z: myChamp.position.z } : undefined;

  cameraController.update(
    dt,
    inputController.currentMouseX,
    inputController.currentMouseY,
    window.innerWidth,
    window.innerHeight,
    myPos
  );
  championRenderer.update(dt, camera);
  skillHUD.update(myChamp);
  inputController.update(dt);

  // Status Bar Diffing
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
  const newStatusText = `EPFL Diagonale MOBA (60Hz) | Hero: ${champTag} | Ping: ${networkClient.currentPing}ms | Camera: ${lockStatus} | Zoom: ${zoomPct}%`;

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
