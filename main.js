import * as THREE from "three";
import Ammo from "ammojs-typed";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// --------------------
// Variables globales
// --------------------
let scene, camera, renderer, controls;
let physicsWorld, dispatcher, tmpTrans, AmmoLib;

let rigidBodies = [];
let mainBallBody = null;

// Movimiento FPS
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let explosiveTargets = []; // SOLO explosivas

// --------------------
// Inicializar Ammo.js
// --------------------
Ammo().then((ammo) => {
  AmmoLib = ammo;
  initPhysics();
  initGraphics();
  animate();
});

// --------------------
// INIT PHYSICS
// --------------------
function initPhysics() {
  const config = new AmmoLib.btSoftBodyRigidBodyCollisionConfiguration();
  dispatcher = new AmmoLib.btCollisionDispatcher(config);
  const broadphase = new AmmoLib.btDbvtBroadphase();
  const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
  const softSolver = new AmmoLib.btDefaultSoftBodySolver();

  physicsWorld = new AmmoLib.btSoftRigidDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    config,
    softSolver
  );

  physicsWorld.setGravity(new AmmoLib.btVector3(0, -9.8, 0));
  physicsWorld.getWorldInfo().set_m_gravity(new AmmoLib.btVector3(0, -9.8, 0));

  tmpTrans = new AmmoLib.btTransform();
}

// ---------------------------------------
// CREAR RIGID BODY (mesh + física)
// ---------------------------------------
function createRigidBody(mesh, physicsShape, mass, pos, quat) {
  mesh.position.copy(pos);
  mesh.quaternion.copy(quat);
  scene.add(mesh);

  const transform = new AmmoLib.btTransform();
  transform.setIdentity();
  transform.setOrigin(new AmmoLib.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(
    new AmmoLib.btQuaternion(quat.x, quat.y, quat.z, quat.w)
  );

  const motionState = new AmmoLib.btDefaultMotionState(transform);
  const localInertia = new AmmoLib.btVector3(0, 0, 0);

  if (mass > 0) physicsShape.calculateLocalInertia(mass, localInertia);

  const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(
    mass,
    motionState,
    physicsShape,
    localInertia
  );

  const body = new AmmoLib.btRigidBody(rbInfo);

  body.setRestitution(0.3);
  body.setFriction(0.2);
  body.setRollingFriction(0.1);

  if (mass > 0) {
    rigidBodies.push(mesh);
    mesh.userData.physicsBody = body;
  }

  physicsWorld.addRigidBody(body);
  return body;
}

// ---------------------------------------
// Diana explosiva
// ---------------------------------------
function createExplosiveTarget(position) {
  const geo = new THREE.BoxGeometry(0.5, 4, 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);

  const shape = new AmmoLib.btBoxShape(new AmmoLib.btVector3(0.5, 0.5, 0.5));
  createRigidBody(mesh, shape, 0, position, new THREE.Quaternion());

  explosiveTargets.push({ mesh, destroyed: false });
}

// ---------------------------------------
// Crear un bolo físico
// ---------------------------------------
function createPin(position) {
  const geo = new THREE.CylinderGeometry(0.25, 0.15, 1, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geo, mat);

  const shape = new AmmoLib.btCylinderShape(
    new AmmoLib.btVector3(0.25, 0.5, 0.25)
  );

  createRigidBody(mesh, shape, 1, position, new THREE.Quaternion());
}

// ---------------------------------------
// Crear bola frente a la cámara
// ---------------------------------------
function spawnBall() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x0044ff })
  );

  const shape = new AmmoLib.btSphereShape(0.6);

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const startPos = camera.position.clone().add(camDir.multiplyScalar(2));

  mainBallBody = createRigidBody(
    mesh,
    shape,
    5,
    startPos,
    new THREE.Quaternion()
  );
}

// --------------------
// INIT GRAPHICS
// --------------------
function initGraphics() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202020);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  camera.position.set(-25, 2, 0); // inicio del jugador
  camera.lookAt(0, 1, 0); // mirar hacia la pista

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  document.addEventListener("click", () => controls.lock());

  // Luces
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(20, 30, 10);
  scene.add(dirLight);

  createExplosiveTarget(new THREE.Vector3(25, 15, 0));

  // -----------------------
  // PISTA
  // -----------------------
  const laneLength = 60;
  const laneWidth = 6;
  const laneHeight = 1;

  const laneMesh = new THREE.Mesh(
    new THREE.BoxGeometry(laneLength, laneHeight, laneWidth),
    new THREE.MeshStandardMaterial({ color: 0x705030 })
  );

  const laneShape = new AmmoLib.btBoxShape(
    new AmmoLib.btVector3(laneLength / 2, laneHeight / 2, laneWidth / 2)
  );

  createRigidBody(
    laneMesh,
    laneShape,
    0,
    new THREE.Vector3(0, -laneHeight / 2, 0),
    new THREE.Quaternion()
  );

  // -----------------------
  // RIELES
  // -----------------------
  const gutterHeight = 2.5;
  const gutterThickness = 0.5;

  function createRail(zPos) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(laneLength, gutterHeight, gutterThickness),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );

    const shape = new AmmoLib.btBoxShape(
      new AmmoLib.btVector3(
        laneLength / 2,
        gutterHeight / 2,
        gutterThickness / 2
      )
    );

    mesh.rotation.x = -0.02;

    createRigidBody(
      mesh,
      shape,
      0,
      new THREE.Vector3(0, gutterHeight / 2 - laneHeight / 2, zPos),
      new THREE.Quaternion()
    );
  }

  createRail(-(laneWidth / 2 + gutterThickness / 2));
  createRail(laneWidth / 2 + gutterThickness / 2);

  // -----------------------
  // BOLOS
  // -----------------------
  const spacing = 1.1;
  const xPos = laneLength / 2 - 5;

  createPin(new THREE.Vector3(xPos, 0.5, 0));
  createPin(new THREE.Vector3(xPos - spacing, 0.5, spacing / 2));
  createPin(new THREE.Vector3(xPos - spacing, 0.5, -spacing / 2));
  createPin(new THREE.Vector3(xPos - spacing * 2, 0.5, spacing));
  createPin(new THREE.Vector3(xPos - spacing * 2, 0.5, 0));
  createPin(new THREE.Vector3(xPos - spacing * 2, 0.5, -spacing));
  createPin(new THREE.Vector3(xPos - spacing * 3, 0.5, spacing * 1.5));
  createPin(new THREE.Vector3(xPos - spacing * 3, 0.5, spacing * 0.5));
  createPin(new THREE.Vector3(xPos - spacing * 3, 0.5, -spacing * 0.5));
  createPin(new THREE.Vector3(xPos - spacing * 3, 0.5, -spacing * 1.5));

  window.addEventListener("resize", onResize);
}

// --------------------
// CONTROL TECLADO
// --------------------
document.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "KeyW":
      moveForward = true;
      break;
    case "KeyS":
      moveBackward = true;
      break;
    case "KeyA":
      moveLeft = true;
      break;
    case "KeyD":
      moveRight = true;
      break;
    case "Space":
      spawnBall();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const impulse = new AmmoLib.btVector3(
        dir.x * 300,
        dir.y * 300,
        dir.z * 300
      );
      mainBallBody.activate(true);
      mainBallBody.applyCentralImpulse(impulse);
      break;
  }
});

document.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW":
      moveForward = false;
      break;
    case "KeyS":
      moveBackward = false;
      break;
    case "KeyA":
      moveLeft = false;
      break;
    case "KeyD":
      moveRight = false;
      break;
  }
});

// --------------------------------------------------
// Detectar impacto con diana explosiva
// --------------------------------------------------
function checkBallImpact() {
  if (!mainBallBody) return;

  const ballMesh = rigidBodies.find(
    (o) => o.userData.physicsBody === mainBallBody
  );
  if (!ballMesh) return;

  const ballPos = ballMesh.position;

  explosiveTargets.forEach((target) => {
    if (!target.destroyed && ballPos.distanceTo(target.mesh.position) < 3) {
      explodeTarget(target);
      target.destroyed = true;
    }
  });
}

// --------------------
// Diana explota
// --------------------
function explodeTarget(target) {
  const pos = target.mesh.position.clone();

  scene.remove(target.mesh);

  for (let i = 0; i < 6; i++) {
    const frag = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff6666 })
    );

    const shape = new AmmoLib.btBoxShape(
      new AmmoLib.btVector3(0.15, 0.15, 0.15)
    );

    const body = createRigidBody(
      frag,
      shape,
      1,
      pos.clone(),
      new THREE.Quaternion()
    );

    const impulse = new AmmoLib.btVector3(
      (Math.random() - 0.5) * 20,
      Math.random() * 15,
      (Math.random() - 0.5) * 20
    );

    body.applyCentralImpulse(impulse);

    setTimeout(() => {
      scene.remove(frag);
    }, 3000);
  }
}

// --------------------
// LOOP
// --------------------
function animate() {
  requestAnimationFrame(animate);

  physicsWorld.stepSimulation(1 / 60, 10);

  for (let obj of rigidBodies) {
    const body = obj.userData.physicsBody;
    const motionState = body.getMotionState();
    if (motionState) {
      motionState.getWorldTransform(tmpTrans);
      const p = tmpTrans.getOrigin();
      const q = tmpTrans.getRotation();
      obj.position.set(p.x(), p.y(), p.z());
      obj.quaternion.set(q.x(), q.y(), q.z(), q.w());
    }
  }

  if (controls.isLocked) {
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    controls.moveForward(direction.z * 0.3);
    controls.moveRight(direction.x * 0.3);
  }

  checkBallImpact();
  renderer.render(scene, camera);
}

// --------------------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
