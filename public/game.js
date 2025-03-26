// Import map creation functions
import { createMapElements } from './map.js';
// Import zombie-related functions
import { createZombieMesh, animateZombies, removeZombie, handleZombieHit } from './zombies.js';

// Connect to Socket.IO server
const socket = io();

// Game variables
let scene, camera, renderer;
let players = {};
let projectiles = {};
let zombies = {}; // Add zombies object
let ammoPickups = {}; // Add ammo pickups object
let localPlayer = null;
let roomId = null;
let mapContainer = null;
let mapBoundaries = null; // Add reference to map boundaries visualization
let crosshair = null; // Add reference to player's crosshair

// Add ammo tracking variables
let playerAmmo = 7; // Default starting ammo
let currentWeapon = 'pistol'; // Default weapon
let canFire = true; // Flag to prevent multiple shots while waiting for server response

// Constants
const MAP_SIZE = 50; // Should match server-side MAP_SIZE

const CROSSHAIR_DISTANCE = 4;

// Movement controls
const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

// Player settings
const PLAYER_SPEED = 0.1;
const PLAYER_SIZE = 1;
const PLAYER_HEIGHT = 1.8;

// Game state
let gameActive = false;
let playerHealth = 100;

// Add new global variable for mouse position
let mousePosition = new THREE.Vector2();
let groundMousePosition = new THREE.Vector3();

// Add performance monitoring variables
let serverPerformance = {
  maxLoopTime: 0
};

// Client-side performance monitoring
const clientPerformance = {
  frames: 0,
  lastFpsUpdate: performance.now(),
  fps: 0,
  updateTimes: {}, // Store times for different update functions
  functionMaxTimes: {}, // Store max times for each function during last second
  lastResetTime: performance.now() // Time of last performance metrics reset
};

// Add a variable to track the last mouse position
let lastMouseGroundPosition = new THREE.Vector3();
let mouseHasMoved = false;

// Add variables for fog of war visualization
let fogOfWarMesh = null;
const FOG_COLOR = 0x000000; // Black fog
const FOG_OPACITY = 0.5;    // Semi-transparent
const FOG_HEIGHT = 0.2;     // Just above ground level

// Function to measure execution time of a function
function measureExecutionTime(funcName, func, ...args) {
  const startTime = performance.now();
  const result = func(...args);
  const endTime = performance.now();
  const executionTime = endTime - startTime;
  
  // Store execution time
  if (!clientPerformance.updateTimes[funcName]) {
    clientPerformance.updateTimes[funcName] = [];
  }
  clientPerformance.updateTimes[funcName].push(executionTime);
  
  // Update max time if this execution was slower
  if (!clientPerformance.functionMaxTimes[funcName] || executionTime > clientPerformance.functionMaxTimes[funcName]) {
    clientPerformance.functionMaxTimes[funcName] = executionTime;
  }
  
  return result;
}

// Initialize Three.js scene
function initThree() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  
  // Create flat orthographic camera isometric angle
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 15;
  camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,   // left
    frustumSize * aspect / 2,    // right,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
  );
  
  // Position camera for isometric view
  // Use classic isometric angle (approx 45° horizontally, 35° vertically)
  camera.position.set(20, 15, 20);
  camera.lookAt(0, 0, 0);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // Add directional light for shadows
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  scene.add(directionalLight);
  
  // Create ground plane
  const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3a9d23,  // Green
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Add a grid for reference (limited to the map size)
  const gridHelper = new THREE.GridHelper(MAP_SIZE * 2, 100, 0x000000, 0x000000);
  gridHelper.position.y = 0.01; // Just above the ground
  scene.add(gridHelper);
  
  // Add map boundary visualization
  createMapBoundaries();
  
  // Add fog of war (simple distance-based fog)
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    console.log('Window resized');
    if (camera && renderer) {
      // Update renderer size
      renderer.setSize(window.innerWidth, window.innerHeight);
      
      // Update orthographic camera parameters
      const aspect = window.innerWidth / window.innerHeight;
      const frustumSize = 15; // Same as in initialization
      
      camera.left = frustumSize * aspect / -2;
      camera.right = frustumSize * aspect / 2;
      camera.top = frustumSize / 2;
      camera.bottom = frustumSize / -2;
      
      camera.updateProjectionMatrix();
      console.log('Camera and renderer updated');
    } else {
      console.error('Camera or renderer is not initialized');
    }
  });
  
  // Add event listeners for controls
  setupControls();
}

// Create visual boundary markers for the map
function createMapBoundaries() {
  const boundaryGroup = new THREE.Group();
  
  // Create a wireframe box that represents the boundaries
  const geometry = new THREE.BoxGeometry(MAP_SIZE * 2, 10, MAP_SIZE * 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  });
  
  const boundaryBox = new THREE.Mesh(geometry, material);
  boundaryBox.position.y = 5; // Half the height
  boundaryGroup.add(boundaryBox);
  
  // Add corner posts for added visibility
  const postGeometry = new THREE.BoxGeometry(1, 10, 1);
  const postMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  
  // Create 4 corner posts
  const cornerPositions = [
    [MAP_SIZE, 0, MAP_SIZE],
    [MAP_SIZE, 0, -MAP_SIZE],
    [-MAP_SIZE, 0, MAP_SIZE],
    [-MAP_SIZE, 0, -MAP_SIZE]
  ];
  
  cornerPositions.forEach(pos => {
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(pos[0], 5, pos[2]);
    boundaryGroup.add(post);
  });
  
  scene.add(boundaryGroup);
  mapBoundaries = boundaryGroup;
}

// Set up keyboard and mouse controls
function setupControls() {
  // Keyboard movement - using KeyboardEvent.code for layout independence
  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = true;
        break;
      case 'KeyF': // Press F to toggle fog of war visualization
        if (gameActive) toggleFogOfWar();
        break;
    }
    
    // Remove reload key handler
  });
  
  document.addEventListener('keyup', (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = false;
        break;
    }
  });
  
  // Track mouse movement for sight controller
  document.addEventListener('mousemove', (event) => {
    // Update the mouse position
    mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Calculate intersection with ground
    updateGroundMousePosition();
    
    // Set flag that mouse has moved
    mouseHasMoved = true;
    
    // Update player sight direction if the player exists
    if (localPlayer && gameActive) {
      updatePlayerSight();
    }
  });
  
  // Mouse click for shooting
  document.addEventListener('click', (event) => {
    if (!gameActive || !localPlayer) return;
    
    // IMPORTANT: Check local ammo count before sending shoot event
    if (playerAmmo <= 0 || !canFire) {
      // Show visual feedback that player is out of ammo
      console.log('Cannot shoot: Out of ammo or waiting for server response');
      showAmmoWarning();
      return;
    }
    
    // Set canFire to false until we get server response
    canFire = false;
    
    // Calculate direction from player to target
    const direction = new THREE.Vector3()
      .subVectors(groundMousePosition, localPlayer.position)
      .normalize();
    
    // Emit shoot event to server
    socket.emit('shoot', {
      position: {
        x: localPlayer.position.x,
        y: 0.5, // Slightly above ground
        z: localPlayer.position.z
      },
      direction: {
        x: direction.x,
        y: 0, // Keep projectiles level with ground
        z: direction.z
      }
    });
    
    // We no longer create projectile immediately - rely on server confirmation
    // The server will emit projectileCreated after validating ammo
    
    // Decrement local ammo as prediction (will be corrected by server if needed)
    updateAmmoDisplay(playerAmmo - 1);
  });
}

// Show a visual warning when player is out of ammo
function showAmmoWarning() {
  const ammoDisplay = document.getElementById('ammo-display');
  if (ammoDisplay) {
    ammoDisplay.classList.add('warning');
    setTimeout(() => {
      ammoDisplay.classList.remove('warning');
    }, 500);
  }
}

// Update the ammo display
function updateAmmoDisplay(ammo) {
  playerAmmo = ammo;
  const ammoDisplay = document.getElementById('ammo-display');
  if (ammoDisplay) {
    ammoDisplay.innerText = `${playerAmmo}`;
    
    // Visual cue for low ammo
    if (playerAmmo <= 0) {
      ammoDisplay.classList.add('no-ammo');
      ammoDisplay.classList.remove('low-ammo');
    } else if (playerAmmo <= 2) {
      ammoDisplay.classList.add('low-ammo');
      ammoDisplay.classList.remove('no-ammo');
    } else {
      ammoDisplay.classList.remove('low-ammo');
      ammoDisplay.classList.remove('no-ammo');
    }
  }
}

// Calculate the intersection of mouse pointer with the ground plane
function updateGroundMousePosition() {
  if (!camera) return;
  
  // Create a ray from the camera
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mousePosition, camera);
  
  // Calculate the intersection with the ground plane
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const previousGroundPosition = groundMousePosition.clone();
  raycaster.ray.intersectPlane(groundPlane, groundMousePosition);
  
  // Set mouseHasMoved flag based on if the ground position changed significantly
  if (lastMouseGroundPosition.distanceToSquared(groundMousePosition) > 0.01) {
    mouseHasMoved = true;
  }
}

// Update player sight direction based on mouse position
function updatePlayerSight() {
  if (!localPlayer || !groundMousePosition) return;
  
  // If the mouse hasn't moved, don't change the sight direction
  if (!mouseHasMoved) return;
  
  // Calculate direction from player to mouse position
  const dx = groundMousePosition.x - localPlayer.position.x;
  const dz = groundMousePosition.z - localPlayer.position.z;
  
  // Calculate angle for player sight
  const targetSightAngle = Math.atan2(dx, dz);
  
  // Get current rotation
  const currentRotation = localPlayer.rotation.y;
  
  // Interpolate rotation at 2x slower speed (divide by 2)
  const newRotation = interpolateAngle(currentRotation, targetSightAngle, 0.5);
  
  // Apply the interpolated rotation to the player body
  localPlayer.rotation.y = newRotation;
  
  // Send sight direction to server
  socket.emit('playerSight', {
    angle: newRotation
  });
  
  // Update crosshair position
  updateCrosshairPosition();
  
  // Store current ground position for comparison
  lastMouseGroundPosition.copy(groundMousePosition);
  mouseHasMoved = false;
}

// Helper function to interpolate between angles (considering the shortest path)
function interpolateAngle(currentAngle, targetAngle, speed) {
  // Normalize angles to range [-PI, PI] to find shortest path
  let delta = ((targetAngle - currentAngle + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  
  // Apply interpolation with speed factor
  return currentAngle + delta * speed;
}

// Create a player mesh styled like a Minecraft character
function createPlayerMesh(player) {
  // Create a group for the player
  const playerGroup = new THREE.Group();
  
  // Define materials
  const isLocalPlayer = player.id === socket.id;
  
  // Use player's assigned color from server if available, otherwise fallback to default colors
  const playerColor = player.color !== undefined ? player.color : (isLocalPlayer ? 0x3050CC : 0xCC3030);
  
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: playerColor, // Use the player's color
    roughness: 0.7
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFCCA0, // Keep skin color consistent
    roughness: 0.5
  });
  const limbMaterial = new THREE.MeshStandardMaterial({
    color: playerColor, // Match body color
    roughness: 0.7
  });
  
  // Body - slightly thinner than a cube
  const bodyGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.9;
  body.castShadow = true;
  playerGroup.add(body);
  
  // Head - cube, slightly larger than body width
  const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.7;
  head.castShadow = true;
  head.name = "head"; // For sight controller reference
  
  // Optional: Face details (can be enhanced with textures later)
  const faceDetails = new THREE.Group();
  
  // Eyes
  const eyeMaterial = new THREE.MeshBasicMaterial({color: 0x222222});
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), eyeMaterial);
  leftEye.position.set(0.2, 0, 0.41);
  faceDetails.add(leftEye);
  
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), eyeMaterial);
  rightEye.position.set(-0.2, 0, 0.41);
  faceDetails.add(rightEye);
  
  // Mouth
  const mouthMaterial = new THREE.MeshBasicMaterial({color: 0x333333});
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), mouthMaterial);
  mouth.position.set(0, -0.2, 0.41);
  faceDetails.add(mouth);
  
  head.add(faceDetails);
  playerGroup.add(head);
  
  // Arms
  const armGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  
  // Right arm with pistol
  const rightArm = new THREE.Mesh(armGeometry, limbMaterial);
  rightArm.position.set(-0.425, 0.9, 0);
  rightArm.castShadow = true;
  rightArm.name = "rightArm"; // For animation reference
  playerGroup.add(rightArm);
  
  // Left arm will hold the pistol
  const leftArm = new THREE.Mesh(armGeometry, limbMaterial);
  leftArm.position.set(0.425, 0.9, 0);
  leftArm.castShadow = true;
  leftArm.name = "leftArm"; // For animation reference
  
  // Create pistol
  const pistolGroup = new THREE.Group();
  
  // Gun barrel
  const barrelGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.4);
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
  const barrel = new THREE.Mesh(barrelGeometry, gunMaterial);
  barrel.position.z = 0.25;
  pistolGroup.add(barrel);
  
  // Gun handle/grip
  const handleGeometry = new THREE.BoxGeometry(0.08, 0.2, 0.12);
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x663300, roughness: 0.8 }); // Brown wooden grip
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.position.y = -0.12;
  handle.position.z = 0.1;
  pistolGroup.add(handle);
  
  // Gun trigger guard
  const guardGeometry = new THREE.BoxGeometry(0.08, 0.05, 0.12);
  const guard = new THREE.Mesh(guardGeometry, gunMaterial);
  guard.position.y = -0.05;
  guard.position.z = 0.1;
  pistolGroup.add(guard);
  
  // Position pistol at the end of the arm
  pistolGroup.position.set(0, -0.3, 0.2);
  pistolGroup.rotation.x = Math.PI / 2; // Point forward
  
  // Add pistol to left arm
  leftArm.add(pistolGroup);
  playerGroup.add(leftArm);
  
  // Legs
  const legGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  
  // Left leg - directly attached to playerGroup (not to legsGroup)
  const leftLeg = new THREE.Mesh(legGeometry, limbMaterial);
  leftLeg.position.set(0.15, 0.4, 0);
  leftLeg.castShadow = true;
  leftLeg.name = "leftLeg"; // For animation reference
  playerGroup.add(leftLeg);
  
  // Right leg - directly attached to playerGroup (not to legsGroup)
  const rightLeg = new THREE.Mesh(legGeometry, limbMaterial);
  rightLeg.position.set(-0.15, 0.4, 0);
  rightLeg.castShadow = true;
  rightLeg.name = "rightLeg"; // For animation reference
  playerGroup.add(rightLeg);
  
  // Position the player
  playerGroup.position.set(
    player.position.x,
    player.position.y,
    player.position.z
  );

  // Set initial rotation if provided
  if (player.rotation !== undefined) {
    playerGroup.rotation.y = player.rotation;
  }
  
  // Store animation state
  playerGroup.userData = {
    animationTime: 0,
    walking: player.moving === true, // Explicit check
    walkSpeed: 8, // Animation speed
    color: playerColor // Store the player's color
  };
  
  // Add to scene
  scene.add(playerGroup);
  
  return playerGroup;
}

// Create a projectile mesh
function createProjectile(projectile) {
  const geometry = new THREE.SphereGeometry(0.2, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: projectile.ownerId === socket.id ? 0x00ffff : 0xffff00,
    emissive: projectile.ownerId === socket.id ? 0x007777 : 0x777700
  });
  const mesh = new THREE.Mesh(geometry, material);
  
  mesh.position.set(
    projectile.position.x,
    projectile.position.y,
    projectile.position.z
  );
  
  scene.add(mesh);
  
  // Store the projectile
  projectiles[projectile.id] = {
    mesh: mesh,
    data: projectile
  };
}

// Remove a projectile
function removeProjectile(projectileId) {
  if (projectiles[projectileId]) {
    scene.remove(projectiles[projectileId].mesh);
    delete projectiles[projectileId];
  }
}

// Update player movement with animation and boundary check - completely rewritten
function updateMovement(deltaTime) {
  if (!gameActive || !localPlayer) return;
  
  // Calculate movement direction relative to camera view
  const moveDirection = new THREE.Vector3(0, 0, 0);
  
  // Create direction vectors aligned with the camera view
  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  cameraForward.y = 0; // Keep movement on the xz plane
  cameraForward.normalize();
  
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  cameraRight.y = 0; // Keep movement on the xz plane
  cameraRight.normalize();
  
  // Add movement based on key presses, relative to camera orientation
  if (keys.forward) moveDirection.add(cameraForward);
  if (keys.backward) moveDirection.sub(cameraForward);
  if (keys.right) moveDirection.add(cameraRight);
  if (keys.left) moveDirection.sub(cameraRight);
  
  // Determine if player is walking
  const isWalking = moveDirection.length() > 0;
  
  // Update animation state
  if (localPlayer.userData) {
    localPlayer.userData.walking = isWalking;
  }
  
  // Client-side prediction
  if (isWalking) {
    moveDirection.normalize();
    
    // Get player speed from server data
    const playerSpeed = players[socket.id]?.data?.speed || 5.0;
    
    // Store previous position
    const prevPosition = {
      x: localPlayer.position.x,
      z: localPlayer.position.z
    };
    
    // Predict new position (will be corrected by server if needed)
    const newX = prevPosition.x + moveDirection.x * playerSpeed * deltaTime;
    const newZ = prevPosition.z + moveDirection.z * playerSpeed * deltaTime;
    
    // Update local position for smooth movement
    localPlayer.position.x = newX;
    localPlayer.position.z = newZ;
    
    // Send movement input to server along with direction vector
    socket.emit('playerMove', {
      direction: { 
        x: moveDirection.x, 
        z: moveDirection.z 
      },
      position: { x: newX, y: 0, z: newZ },
      rotation: localPlayer.rotation.y,
      moving: true
    });
  } else if (localPlayer.userData?.walking) {
    // Player stopped moving
    socket.emit('playerMove', {
      direction: { x: 0, z: 0 },
      position: {
        x: localPlayer.position.x,
        y: 0,
        z: localPlayer.position.z
      },
      rotation: localPlayer.rotation.y,
      moving: false
    });
    
    localPlayer.userData.walking = false;
  }
}

// Update projectile positions (client prediction)
function updateProjectiles() {
  for (const id in projectiles) {
    const projectile = projectiles[id];
    
    // Move projectile
    projectile.mesh.position.x += projectile.data.direction.x * projectile.data.speed;
    projectile.mesh.position.z += projectile.data.direction.z * projectile.data.speed;
    
    // Remove projectiles that have traveled too far
    const distanceTraveled = Math.sqrt(
      Math.pow(projectile.mesh.position.x, 2) + 
      Math.pow(projectile.mesh.position.z, 2)
    );
    
    if (distanceTraveled > 50) {
      // Only remove client-side predicted projectiles
      if (id.startsWith('temp-')) {
        removeProjectile(id);
      }
    }
  }
}

// Simple animation function for all players
function animatePlayers(deltaTime) {
  // Animate each player based on their walking state
  for (const id in players) {
    const player = players[id];
    if (!player.mesh || !player.mesh.userData) continue;
    
    // Get walking state
    const isWalking = player.mesh.userData.walking === true;
    
    // Find limbs
    const leftArm = player.mesh.getObjectByName("leftArm");
    const rightArm = player.mesh.getObjectByName("rightArm");
    const leftLeg = player.mesh.getObjectByName("leftLeg");
    const rightLeg = player.mesh.getObjectByName("rightLeg");
    
    if (!leftArm || !rightArm || !leftLeg || !rightLeg) continue;
    
    if (isWalking) {
      // Update animation time
      player.mesh.userData.animationTime += deltaTime * player.mesh.userData.walkSpeed;
      
      // Calculate swing angle
      const swingAngle = Math.sin(player.mesh.userData.animationTime) * 0.5;
      const reverseSwingAngle = -swingAngle;
      
      // Apply leg and arm animation
      rightArm.rotation.x = swingAngle;
      leftArm.rotation.x = reverseSwingAngle;
      leftLeg.rotation.x = swingAngle;
      rightLeg.rotation.x = reverseSwingAngle;
    } else {
      // Reset all rotations when not moving
      player.mesh.userData.animationTime = 0;
      rightArm.rotation.x = 0;
      leftArm.rotation.x = 0;
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
    }
  }
}

// Reset player limbs to default position
function resetPlayerLimbs(playerMesh) {
  const limbs = ["rightArm", "leftArm", "leftLeg", "rightLeg"];
  limbs.forEach(limbName => {
    const limb = playerMesh.getObjectByName(limbName);
    if (limb) {
      limb.rotation.x = 0;
    }
  });
}

// Create a ammo pickup mesh
function createAmmoPickupMesh(pickup) {
  const pickupGroup = new THREE.Group();
  
  // Create box for the ammo box
  const boxGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.3);
  const boxMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Brown box
    roughness: 0.7, 
    metalness: 0.1 
  });
  const box = new THREE.Mesh(boxGeometry, boxMaterial);
  pickupGroup.add(box);
  
  // Add lid with slightly different color
  const lidGeometry = new THREE.BoxGeometry(0.7, 0.1, 0.35);
  const lidMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x654321, // Darker brown
    roughness: 0.6, 
    metalness: 0.2 
  });
  const lid = new THREE.Mesh(lidGeometry, lidMaterial);
  lid.position.y = 0.25; // Position on top of the box
  pickupGroup.add(lid);
  
  // Add bullet icon
  const bulletGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
  const bulletMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700, // Gold
    roughness: 0.3, 
    metalness: 0.8 
  });
  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
  bullet.position.set(0, 0.4, 0);
  bullet.rotation.x = Math.PI / 2;
  pickupGroup.add(bullet);
  
  // Add floating animation
  pickupGroup.userData = {
    floatHeight: 0.5,
    floatSpeed: 1.5,
    rotateSpeed: 0.5,
    initialY: pickup.position.y,
    timeOffset: Math.random() * Math.PI * 2
  };
  
  // Position the pickup
  pickupGroup.position.set(
    pickup.position.x,
    pickup.position.y,
    pickup.position.z
  );
  
  // Add to scene
  scene.add(pickupGroup);
  
  return pickupGroup;
}

// Remove an ammo pickup
function removeAmmoPickup(pickupId) {
  if (ammoPickups[pickupId]) {
    scene.remove(ammoPickups[pickupId].mesh);
    delete ammoPickups[pickupId];
  }
}

// Animate ammo pickups (floating and rotation)
function animateAmmoPickups(deltaTime) {
  for (const id in ammoPickups) {
    const pickup = ammoPickups[id];
    if (!pickup.mesh || !pickup.mesh.userData) continue;
    
    const userData = pickup.mesh.userData;
    const time = performance.now() * 0.001 + userData.timeOffset;
    
    // Floating motion
    const floatOffset = Math.sin(time * userData.floatSpeed) * 0.2;
    pickup.mesh.position.y = userData.initialY + floatOffset;
    
    // Rotation
    pickup.mesh.rotation.y += userData.rotateSpeed * deltaTime;
  }
}

// Animation loop with timing for animations
let lastUpdateTime = performance.now(); // Track the last update time

function animate(time) {
  const deltaTime = (time - lastUpdateTime) / 1000; // Convert ms to seconds
  lastUpdateTime = time;
  
  // Update FPS counter
  clientPerformance.frames++;
  if (time - clientPerformance.lastFpsUpdate >= 1000) {
    // Calculate FPS
    clientPerformance.fps = Math.round(
      (clientPerformance.frames * 1000) / (time - clientPerformance.lastFpsUpdate)
    );
    clientPerformance.frames = 0;
    clientPerformance.lastFpsUpdate = time;
    
    // Update client performance display
    updateClientPerformanceDisplay();
  }
  
  // Reset performance metrics every second
  if (time - clientPerformance.lastResetTime >= 1000) {
    clientPerformance.updateTimes = {};
    clientPerformance.functionMaxTimes = {};
    clientPerformance.lastResetTime = time;
  }
  
  const cappedDeltaTime = Math.min(deltaTime, 0.1); // Cap delta time to avoid large jumps
  
  requestAnimationFrame(animate);
  
  // Handle smooth position corrections
  if (localPlayer && localPlayer.userData && localPlayer.userData.targetPosition) {
    const elapsed = (performance.now() - localPlayer.userData.positionCorrectionTime) / 1000;
    if (elapsed < 0.1) { // Apply correction over 100ms
      const alpha = Math.min(elapsed / 0.1, 1.0);
      localPlayer.position.lerp(localPlayer.userData.targetPosition, alpha);
    } else {
      // Correction complete
      localPlayer.position.copy(localPlayer.userData.targetPosition);
      delete localPlayer.userData.targetPosition;
      delete localPlayer.userData.positionCorrectionTime;
    }
  }
  
  // Update movement with delta time - wrapped with performance measurement
  measureExecutionTime('updateMovement', updateMovement, cappedDeltaTime);
  measureExecutionTime('updateProjectiles', updateProjectiles);
  measureExecutionTime('animatePlayers', animatePlayers, cappedDeltaTime);
  measureExecutionTime('animateZombies', animateZombies, zombies, cappedDeltaTime);
  measureExecutionTime('animateAmmoPickups', animateAmmoPickups, cappedDeltaTime);
  measureExecutionTime('updateEntityFades', updateEntityFades); // Add this line
  measureExecutionTime('updateFogOfWar', updateFogOfWar); // Add this line
  
  // Update camera to follow local player
  if (localPlayer && gameActive) {
    // Position camera at isometric angle relative to player
    camera.position.x = localPlayer.position.x + 20;
    camera.position.y = localPlayer.position.y + 15;
    camera.position.z = localPlayer.position.z + 20;
    camera.lookAt(localPlayer.position);
    
    // Only update player sight if mouse has moved
    // This prevents the player from rotating when just moving with keyboard
    if (mouseHasMoved) {
      updatePlayerSight();
    } else {
      // Just update crosshair position without changing player rotation
      updateCrosshairPosition();
    }
  }
  
  // Measure render time
  measureExecutionTime('renderScene', () => {
    renderer.render(scene, camera);
  });
}

// Update the client performance display
function updateClientPerformanceDisplay() {
  const perfMonitor = document.getElementById('client-performance-monitor');
  if (!perfMonitor) return;
  
  // Get the slowest function
  let slowestFunction = 'none';
  let slowestTime = 0;
  
  for (const funcName in clientPerformance.functionMaxTimes) {
    if (clientPerformance.functionMaxTimes[funcName] > slowestTime) {
      slowestTime = clientPerformance.functionMaxTimes[funcName];
      slowestFunction = funcName;
    }
  }
  
  // Update the display
  perfMonitor.textContent = `FPS: ${clientPerformance.fps} | Slowest: ${slowestFunction} (${slowestTime.toFixed(2)}ms)`;
  
  // Visual feedback based on performance
  perfMonitor.classList.remove('warning', 'critical');
  
  // FPS-based warnings
  if (clientPerformance.fps < 50 && clientPerformance.fps >= 30) {
    perfMonitor.classList.add('warning');
  } else if (clientPerformance.fps < 30) {
    perfMonitor.classList.add('critical');
  }
  
  // Execution time warnings
  if (slowestTime > 16) { // More than one frame budget
    perfMonitor.classList.add('warning');
  }
  if (slowestTime > 33) { // More than two frame budgets
    perfMonitor.classList.add('critical');
  }
}

// Set up UI and game joining
function setupUI() {
  const joinGameDiv = document.getElementById('join-game');
  const createGameBtn = document.getElementById('create-game');
  const joinRoomBtn = document.getElementById('join-room');
  const roomIdInput = document.getElementById('room-id');
  const gameNameInput = document.getElementById('game-name');
  const availableRoomsDiv = document.getElementById('available-rooms');
  const refreshRoomsBtn = document.getElementById('refresh-rooms');
  const healthDisplay = document.getElementById('health');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Add weapon and ammo UI elements
  const gameUI = document.createElement('div');
  gameUI.id = 'game-ui';
  gameUI.innerHTML = `
    <div id="health-container">
      <div id="health">Health: 100</div>
    </div>
    <div id="weapon-container">
      <div id="weapon-icon">🔫</div>
      <div id="ammo-display">7</div>
    </div>
  `;
  document.body.appendChild(gameUI);
  
  // Add CSS for the weapon display
  const style = document.createElement('style');
  style.textContent = `
    #game-ui {
      position: absolute;
      bottom: 20px;
      left: 0;
      width: 100%;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }
    #health-container {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0,0,0,0.5);
      color: white;
      padding: 10px;
      border-radius: 5px;
    }
    #weapon-container {
      display: flex;
      align-items: center;
      background: rgba(0,0,0,0.5);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
    }
    #weapon-icon {
      font-size: 24px;
      margin-right: 10px;
    }
    #ammo-display {
      font-size: 20px;
      font-weight: bold;
    }
    #ammo-display.warning {
      color: red;
      animation: flash 0.5s;
    }
    #ammo-display.low-ammo {
      color: orange;
    }
    #ammo-display.no-ammo {
      color: red;
      text-decoration: line-through;
    }
    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Hide game UI initially
  gameUI.style.display = 'none';
  
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
      
      // Fetch room list if browsing tab is activated
      if (tab.dataset.tab === 'browse') {
        fetchAvailableRooms();
      }
    });
  });
  
  // Create new game
  createGameBtn.addEventListener('click', () => {
    const gameName = gameNameInput.value.trim();
    socket.emit('joinRoom', null, gameName); // null means create a new room
    joinGameDiv.style.display = 'none';
    gameActive = true;
    document.getElementById('game-ui').style.display = 'flex';
  });
  
  // Join existing game by ID
  joinRoomBtn.addEventListener('click', () => {
    const enteredRoomId = roomIdInput.value.trim();
    if (enteredRoomId) {
      socket.emit('joinRoom', enteredRoomId);
      joinGameDiv.style.display = 'none';
      gameActive = true;
      document.getElementById('game-ui').style.display = 'flex';
    }
  });
  
  // Refresh available rooms
  refreshRoomsBtn.addEventListener('click', fetchAvailableRooms);
  
  // Update health display
  function updateHealth(health) {
    playerHealth = health;
    healthDisplay.innerText = `Health: ${health}`;
  }
  
  // Fetch available rooms from server
  function fetchAvailableRooms() {
    availableRoomsDiv.innerHTML = '<p>Loading available games...</p>';
    
    fetch('/api/rooms')
      .then(response => response.json())
      .then(rooms => {
        if (Object.keys(rooms).length === 0) {
          availableRoomsDiv.innerHTML = '<p>No active games found. Create a new one!</p>';
          return;
        }
        

        let roomsHTML = '';
        for (const roomId in rooms) {
          const room = rooms[roomId];
          roomsHTML += `
            <div class="room-item">
              <div>${room.roomName} (${room.playerCount} players)</div>
              <button class="room-join-btn" data-room-id="${roomId}">Join</button>
            </div>
          `;
        }
        
        availableRoomsDiv.innerHTML = roomsHTML;
        
        // Add click event listeners to join buttons
        document.querySelectorAll('.room-join-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const roomId = btn.getAttribute('data-room-id');
            socket.emit('joinRoom', roomId);
            joinGameDiv.style.display = 'none';
            gameActive = true;
          });
        });
      })
      .catch(error => {
        availableRoomsDiv.innerHTML = '<p>Error loading games. Please try again.</p>';
        console.error('Error fetching rooms:', error);
      });
  }
  
  // Initial fetch of available rooms
  fetchAvailableRooms();
  
  return { updateHealth };
}

// Set up Socket.IO event handlers
function setupSocketEvents(ui) {
  // Initial game state from server
  socket.on('gameState', (state) => {
    roomId = socket.roomId;
    
    // Create map elements using the imported function
    if (state.map) {
      if (mapContainer) {
        scene.remove(mapContainer); // Remove existing map if any
      }
      mapContainer = createMapElements(state.map);
      scene.add(mapContainer);
    }
    
    console.log('Joined room:', roomId);
    
    // Create meshes for all existing players
    for (const playerId in state.players) {
      const player = state.players[playerId];
      players[playerId] = {
        mesh: createPlayerMesh(player),
        data: player
      };
      
      // Set local player
      if (playerId === socket.id) {
        localPlayer = players[playerId].mesh;
        
        // Create crosshair for local player only
        if (!crosshair) {
          crosshair = createCrosshairMesh();
          updateCrosshairPosition();
        }
      }
    }
    
    // Create meshes for all existing zombies
    if (state.zombies) {
      for (const zombie of state.zombies) {
        const zombieMesh = createZombieMesh(zombie);
        scene.add(zombieMesh); // Add the mesh to the scene
        zombies[zombie.id] = {
          mesh: zombieMesh,
          data: zombie
        };
      }
    }
    
    // Create meshes for all existing projectiles
    for (const projectile of state.projectiles) {
      createProjectile(projectile);
    }

    // Create meshes for all existing ammo pickups
    if (state.ammoPickups) {
      for (const pickup of state.ammoPickups) {
        if (!ammoPickups[pickup.id]) {
          const pickupMesh = createAmmoPickupMesh(pickup);
          ammoPickups[pickup.id] = {
            mesh: pickupMesh,
            data: pickup
          };
        }
      }
    }

    // If state includes player information with ammo, set it
    if (state.players && state.players[socket.id]) {
      updateAmmoDisplay(state.players[socket.id].ammo || 7);
    }
  });
  
  // New player joined
  socket.on('playerJoined', (player) => {
    // Only create if we don't already have this player
    if (!players[player.id]) {
      console.log('Player joined:', player.id);
      
      const playerMesh = createPlayerMesh(player);
      fadeInEntity(playerMesh);
      
      players[player.id] = {
        mesh: playerMesh,
        data: {
          ...player,
          moving: false // Explicitly initialize as not moving
        }
      };
      
      // Ensure the mesh userData has correct walking state
      players[player.id].mesh.userData.walking = false;
    }
  });
  
  // Player left
  socket.on('playerLeft', (playerId) => {
    console.log('Player left:', playerId);
    if (players[playerId]) {
      scene.remove(players[playerId].mesh);
      delete players[playerId];
    }
  });
  
  // Player moved event handler - ensure proper animation state
  socket.on('playerMoved', (data) => {
    if (players[data.id]) {
      // Update player position smoothly
      players[data.id].mesh.position.set(
        data.position.x,
        0, // At ground level
        data.position.z
      );
      
      // Update player rotation
      players[data.id].mesh.rotation.y = data.rotation;
      
      // CRITICAL FIX: Explicitly update the walking state with strict boolean check
      const isMoving = data.moving === true;
      
      // Update both the mesh userData and player data
      players[data.id].mesh.userData.walking = isMoving;
      players[data.id].data.moving = isMoving;
      
      if (data.movingDirection !== undefined) {
        players[data.id].data.movingDirection = data.movingDirection;
      }
      
      // Log the state (for debugging)
      console.log(`Player ${data.id} moving state: ${isMoving}`);
    }
  });
  
  // Player sight direction updated
  socket.on('playerSightUpdated', (data) => {
    if (players[data.id] && data.id !== socket.id) { // Skip for local player as we set it directly
      const playerMesh = players[data.id].mesh;
      
      // Update entire player rotation
      playerMesh.rotation.y = data.angle;
      
      // Store sight angle in player data
      players[data.id].data.sightAngle = data.angle;
    }
  });
  
  // New projectile created by server (only after ammo validation)
  socket.on('projectileCreated', (projectile) => {
    // Create the projectile in the game world
    createProjectile(projectile);
    
    // Reset canFire flag to allow shooting again
    canFire = true;
  });
  
  // No ammo event - player tried to shoot but was out of ammo
  socket.on('noAmmo', (data) => {
    console.log('Server says: No ammo!');
    updateAmmoDisplay(0); // Make sure we show 0 ammo
    showAmmoWarning(); // Visual feedback
    canFire = true; // Allow trying to shoot again
  });
  
  // Ammo update from server
  socket.on('ammoUpdate', (data) => {
    console.log('Ammo update from server:', data);
    updateAmmoDisplay(data.ammo);
    currentWeapon = data.weapon;
    canFire = true; // Reset firing flag when receiving ammo update
  });
  
  // Projectile destroyed
  socket.on('projectileDestroyed', (projectileId) => {
    removeProjectile(projectileId);
  });
  
  // Player hit
  socket.on('playerHit', (data) => {
    if (data.playerId === socket.id) {
      ui.updateHealth(data.health);
      
      // Flash screen red
      scene.background = new THREE.Color(0xff0000);
      setTimeout(() => {
        scene.background = new THREE.Color(0x87ceeb);
      }, 100);
    }
  });
  
  // New zombie created
  socket.on('zombieCreated', (zombie) => {
    const zombieMesh = createZombieMesh(zombie);
    scene.add(zombieMesh); // Add the mesh to the scene
    zombies[zombie.id] = {
      mesh: zombieMesh,
      data: zombie
    };
  });
  
  // Zombie destroyed
  socket.on('zombieDestroyed', (zombieId) => {
    removeZombie(zombieId, zombies, scene);
  });
  
  // Zombie updates
  socket.on('zombiesUpdate', (updatedZombies) => {
    // Track IDs of zombies in the update
    const updatedIds = new Set(updatedZombies.map(z => z.id));
    
    // Handle zombies that are no longer visible
    for (const zombieId in zombies) {
      if (!updatedIds.has(zombieId)) {
        fadeOutEntity(zombies[zombieId].mesh, () => {
          if (zombies[zombieId]) {
            scene.remove(zombies[zombieId].mesh);
            delete zombies[zombieId];
          }
        });
      }
    }
    
    // Update or add visible zombies
    for (const zombie of updatedZombies) {
      if (zombies[zombie.id]) {
        // Update existing zombie
        const zombieMesh = zombies[zombie.id].mesh;
        
        // Cancel any fade out in progress
        if (zombieMesh.userData.fading && zombieMesh.userData.fadeTarget === 0.0) {
          zombieMesh.userData.fading = false;
          setEntityOpacity(zombieMesh, 1.0);
        }
        
        // Update position and rotation
        zombieMesh.position.set(
          zombie.position.x,
          zombie.position.y || 0,
          zombie.position.z
        );
        zombieMesh.rotation.y = zombie.rotation;
        
        // Update state
        zombieMesh.userData.state = zombie.state;
        zombies[zombie.id].data = zombie;
      } else {
        // New visible zombie - create and fade in
        const zombieMesh = createZombieMesh(zombie);
        fadeInEntity(zombieMesh);
        scene.add(zombieMesh);
        
        zombies[zombie.id] = {
          mesh: zombieMesh,
          data: zombie
        };
      }
    }
  });
  
  // Zombie hit
  socket.on('zombieHit', (data) => {
    if (zombies[data.id]) {
      handleZombieHit(zombies[data.id]); // Using imported function
    }
  });
  
  // Ammo pickup collected
  socket.on('ammoPickupCollected', (data) => {
    // Play pickup sound effect if available
    if (window.playPickupSound) {
      window.playPickupSound();
    }
    
    // Visual effect
    if (ammoPickups[data.id] && ammoPickups[data.id].mesh) {
      // Create sparkle particle effect
      createPickupEffect(ammoPickups[data.id].mesh.position);
      
      // Remove the pickup mesh
      removeAmmoPickup(data.id);
    }
    
    // If this player collected it, show feedback
    if (data.playerId === socket.id) {
      // Flash ammo display
      const ammoDisplay = document.getElementById('ammo-display');
      if (ammoDisplay) {
        ammoDisplay.classList.add('ammo-increase');
        setTimeout(() => {
          ammoDisplay.classList.remove('ammo-increase');
        }, 1000);
      }
    }
  });
  
  // Ammo pickups update
  socket.on('ammoPickupsUpdate', (pickups) => {
    // Remove pickups that are no longer in the list
    for (const id in ammoPickups) {
      if (!pickups.find(p => p.id === id)) {
        removeAmmoPickup(id);
      }
    }
    
    // Add new pickups
    for (const pickup of pickups) {
      if (!ammoPickups[pickup.id]) {
        const pickupMesh = createAmmoPickupMesh(pickup);
        fadeInEntity(pickupMesh);
        
        ammoPickups[pickup.id] = {
          mesh: pickupMesh,
          data: pickup
        };
      }
    }
  });
  
  // Update game state from server - fix animation bug for other players
  socket.on('gameStateUpdate', (state) => {
    // Track visible player IDs to detect players that are no longer visible
    const visiblePlayerIds = Object.keys(state.players);
    
    // Handle players that are no longer visible
    for (const playerId in players) {
      // Skip local player - they're always visible
      if (playerId === socket.id) continue;
      
      // If a player is no longer in the visible list, fade them out
      if (!visiblePlayerIds.includes(playerId)) {
        fadeOutEntity(players[playerId].mesh, () => {
          // Remove the player from scene after fade out completes
          if (players[playerId] && players[playerId].mesh) {
            scene.remove(players[playerId].mesh);
            delete players[playerId];
          }
        });
      }
    }
    
    // Update or add visible players
    for (const playerId in state.players) {
      // Skip self - handled separately
      if (playerId === socket.id) continue;
      
      const serverPlayer = state.players[playerId];
      
      if (players[playerId]) {
        // Player already exists - update them
        const playerMesh = players[playerId].mesh;
        
        // If they were fading out, stop the fade
        if (playerMesh.userData.fading && playerMesh.userData.fadeTarget === 0.0) {
          playerMesh.userData.fading = false;
          setEntityOpacity(playerMesh, 1.0);
        }
        
        // Update position and rotation
        playerMesh.position.set(
          serverPlayer.position.x,
          serverPlayer.position.y || 0,
          serverPlayer.position.z
        );
        playerMesh.rotation.y = serverPlayer.rotation || 0;
        
        // Update walking state
        if (playerMesh.userData) {
          playerMesh.userData.walking = serverPlayer.moving === true;
        }
        
        // Update data
        players[playerId].data = serverPlayer;
      } else {
        // Player is newly visible - create and fade in
        const newPlayerMesh = createPlayerMesh(serverPlayer);
        fadeInEntity(newPlayerMesh);
        
        players[playerId] = {
          mesh: newPlayerMesh,
          data: serverPlayer
        };
      }
    }
    
    // Handle zombies visibility similarly
    const visibleZombieIds = state.zombies.map(z => z.id);
    
    // Fade out zombies that are no longer visible
    for (const zombieId in zombies) {
      if (!visibleZombieIds.includes(zombieId)) {
        fadeOutEntity(zombies[zombieId].mesh, () => {
          if (zombies[zombieId]) {
            scene.remove(zombies[zombieId].mesh);
            delete zombies[zombieId];
          }
        });
      }
    }
    
    // Update or add visible zombies
    for (const zombie of state.zombies) {
      if (zombies[zombie.id]) {
        // Zombie already exists - update it
        const zombieMesh = zombies[zombie.id].mesh;
        
        // If it was fading out, cancel the fade
        if (zombieMesh.userData.fading && zombieMesh.userData.fadeTarget === 0.0) {
          zombieMesh.userData.fading = false;
          setEntityOpacity(zombieMesh, 1.0);
        }
        
        // Update position and rotation
        zombieMesh.position.set(
          zombie.position.x,
          zombie.position.y || 0,
          zombie.position.z
        );
        zombieMesh.rotation.y = zombie.rotation || 0;
        
        // Update state
        zombieMesh.userData.state = zombie.state;
        zombies[zombie.id].data = zombie;
      } else {
        // New visible zombie - create and fade in
        const zombieMesh = createZombieMesh(zombie);
        fadeInEntity(zombieMesh);
        scene.add(zombieMesh);
        
        zombies[zombie.id] = {
          mesh: zombieMesh,
          data: zombie
        };
      }
    }
    
    // Handle ammo pickup visibility
    const visiblePickupIds = state.ammoPickups.map(p => p.id);
    
    // Fade out pickups that are no longer visible
    for (const pickupId in ammoPickups) {
      if (!visiblePickupIds.includes(pickupId)) {
        fadeOutEntity(ammoPickups[pickupId].mesh, () => {
          if (ammoPickups[pickupId]) {
            scene.remove(ammoPickups[pickupId].mesh);
            delete ammoPickups[pickupId];
          }
        });
      }
    }
    
    // Update or add visible pickups
    for (const pickup of state.ammoPickups) {
      if (ammoPickups[pickup.id]) {
        // Pickup already exists - update if needed
        const pickupMesh = ammoPickups[pickup.id].mesh;
        
        // If it was fading out, cancel the fade
        if (pickupMesh.userData.fading && pickupMesh.userData.fadeTarget === 0.0) {
          pickupMesh.userData.fading = false;
          setEntityOpacity(pickupMesh, 1.0);
        }
      } else {
        // New visible pickup - create and fade in
        const pickupMesh = createAmmoPickupMesh(pickup);
        fadeInEntity(pickupMesh);
        
        ammoPickups[pickup.id] = {
          mesh: pickupMesh,
          data: pickup
        };
      }
    }
    
    // ...existing code for ammo update...
  });

  // Room not found
  socket.on('roomNotFound', () => {
    alert('The room you tried to join no longer exists.');
    window.location.reload(); // Reload the page to start over
  });
  
  // Rooms updated
  socket.on('roomsUpdated', () => {
    // If we're on the browse tab, refresh the list
    if (document.querySelector('.tab[data-tab="browse"]').classList.contains('active') &&
        document.getElementById('join-game').style.display !== 'none') {
      const fetchAvailableRooms = document.getElementById('refresh-rooms').click();
    }
  });

  socket.on('playerCollision', (data) => {
    if (localPlayer) {
      // Update position based on server's collision response
      localPlayer.position.x = data.position.x;
      localPlayer.position.z = data.position.z;
      
      // Visual feedback for boundary collision
      if (Math.abs(data.position.x) >= MAP_SIZE - 0.1 || Math.abs(data.position.z) >= MAP_SIZE - 0.1) {
        // Flash map boundaries
        if (mapBoundaries) {
          mapBoundaries.children.forEach(child => {
            if (child.material) {
              child.material.color.set(0xffff00); // Yellow flash
              setTimeout(() => {
                child.material.color.set(0xff0000); // Back to red
              }, 200);
            }
          });
        }
      }
    }
  });

  // Handle server position corrections
  socket.on('playerPositionCorrection', (data) => {
    if (!localPlayer) return;
    
    // Apply position correction from server
    // Use lerp for smoother transitions when corrections are small
    const currentPos = localPlayer.position;
    const targetPos = new THREE.Vector3(data.position.x, currentPos.y, data.position.z);
    const distance = currentPos.distanceTo(targetPos);
    
    // If the correction is significant, apply it immediately
    // Otherwise, lerp over a short period for visual smoothness
    if (distance > 2.0) {
      localPlayer.position.copy(targetPos);
      // Update crosshair position immediately
      updateCrosshairPosition();
    } else {
      // Store the target for smooth interpolation in the animation loop
      localPlayer.userData.targetPosition = targetPos;
      localPlayer.userData.positionCorrectionTime = performance.now();
    }
    
    // Update movement state
    localPlayer.userData.walking = data.moving === true;
  });

  // Add handler for server performance metrics
  socket.on('serverPerformance', (data) => {
    serverPerformance = data;
    updatePerformanceDisplay();
  });
}

// Create particle effect when picking up ammo
function createPickupEffect(position) {
  const particleCount = 15;
  const particles = new THREE.Group();
  
  for (let i = 0; i < particleCount; i++) {
    const geometry = new THREE.SphereGeometry(0.05, 6, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFFD700, // Gold
      transparent: true,
      opacity: 0.8
    });
    
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    
    // Random direction
    particle.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      ),
      age: 0,
      maxAge: 0.7 + Math.random() * 0.5
    };
    
    particles.add(particle);
  }
  
  scene.add(particles);
  
  // Animate and remove after effect completes
  const startTime = performance.now();
  
  function animateParticles() {
    const now = performance.now();
    const deltaTime = (now - startTime) / 1000;
    let alive = false;
    
    particles.children.forEach((particle) => {
      if (particle.userData.age < particle.userData.maxAge) {
        // Update position
        particle.position.x += particle.userData.velocity.x * 0.1;
        particle.position.y += particle.userData.velocity.y * 0.1;
        particle.position.z += particle.userData.velocity.z * 0.1;
        
        // Apply gravity
        particle.userData.velocity.y -= 0.1;
        
        // Age the particle
        particle.userData.age += deltaTime;
        
        // Fade out
        const lifeRatio = 1 - (particle.userData.age / particle.userData.maxAge);
        particle.material.opacity = lifeRatio * 0.8;
        particle.scale.setScalar(lifeRatio);
        
        alive = true;
      }
    });
    
    if (alive) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
    }
  }
  
  animateParticles();
}

// Add CSS for ammo pickup
function addAmmoPickupStyles() {
  const style = document.createElement('style');
  style.textContent += `
    @keyframes pulseGreen {
      0% { color: white; transform: scale(1); }
      50% { color: #00FF00; transform: scale(1.2); }
      100% { color: white; transform: scale(1); }
    }
    
    #ammo-display.ammo-increase {
      animation: pulseGreen 1s;
    }
  `;
  document.head.appendChild(style);
}

// Update the performance monitor display
function updatePerformanceDisplay() {
  const perfMonitor = document.getElementById('performance-monitor');
  if (!perfMonitor) return;
  
  const maxTime = parseFloat(serverPerformance.maxLoopTime);
  perfMonitor.textContent = `Server: ${maxTime.toFixed(2)}ms`;
  
  // Visual feedback based on performance
  perfMonitor.classList.remove('warning', 'critical');
  if (maxTime > 16.67) { // More than one frame at 60fps
    perfMonitor.classList.add('warning');
  }
  if (maxTime > 33.33) { // More than two frames at 60fps
    perfMonitor.classList.add('critical');
  }
}

// Create a crosshair mesh to show player's aiming direction
function createCrosshairMesh() {
  const crosshairGroup = new THREE.Group();
  
  // Create a material for the crosshair
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  
  // Create horizontal line
  const horizontalGeometry = new THREE.BoxGeometry(0.4, 0.05, 0.05);
  const horizontalLine = new THREE.Mesh(horizontalGeometry, material);
  crosshairGroup.add(horizontalLine);
  
  // Create vertical line
  const verticalGeometry = new THREE.BoxGeometry(0.05, 0.4, 0.05);
  const verticalLine = new THREE.Mesh(verticalGeometry, material);
  crosshairGroup.add(verticalLine);
  
  // Create center dot
  const centerGeometry = new THREE.SphereGeometry(0.05, 8, 8);
  const centerDot = new THREE.Mesh(centerGeometry, material);
  crosshairGroup.add(centerDot);
  
  // Set position to default
  crosshairGroup.position.set(0, 0.5, 0);
  
  // Add to scene
  scene.add(crosshairGroup);
  return crosshairGroup;
}

// Update crosshair position based on player sight direction
function updateCrosshairPosition() {
  if (!localPlayer || !crosshair) return;
  
  // Get player's forward direction based on rotation
  const direction = new THREE.Vector3(0, 0, 1);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), localPlayer.rotation.y);
  
  // Set crosshair position 6 units in front of player
  crosshair.position.x = localPlayer.position.x + direction.x * CROSSHAIR_DISTANCE;
  crosshair.position.z = localPlayer.position.z + direction.z * CROSSHAIR_DISTANCE;
  crosshair.position.y = 0.5; // Slightly above ground
  
  // Make crosshair always face camera
  crosshair.lookAt(camera.position);
}

// Initialize game
function init() {
  initThree();
  const ui = setupUI();
  setupSocketEvents(ui);
  addAmmoPickupStyles();
  addFogOfWarDebugPanel();
  
  // Create fog of war after a brief delay to ensure all other elements are initialized
  setTimeout(() => {
    if (!fogOfWarMesh) {
      createFogOfWarVisualization();
    }
  }, 100);
  
  // Add initial setup for performance monitors
  updatePerformanceDisplay();
  updateClientPerformanceDisplay();
  
  animate(0); // Start with time 0
}

// Start the game when page loads
window.addEventListener('load', init);

// Add these functions for entity visibility management
function fadeInEntity(mesh) {
  // Set initial opacity
  setEntityOpacity(mesh, 0);
  
  // Set up fade animation
  mesh.userData.fading = true;
  mesh.userData.fadeStartTime = performance.now();
  mesh.userData.fadeDuration = 300; // milliseconds
  mesh.userData.fadeTarget = 1.0; // fully visible
  
  // Store original materials
  if (mesh.type === 'Group') {
    storeOriginalMaterials(mesh);
  }
}

function fadeOutEntity(mesh, callback) {
  // Skip if already fading or not in scene
  if (!mesh || mesh.userData.fading) return;
  
  // Set up fade out animation
  mesh.userData.fading = true;
  mesh.userData.fadeStartTime = performance.now();
  mesh.userData.fadeDuration = 300; // milliseconds
  mesh.userData.fadeTarget = 0.0; // fully transparent
  mesh.userData.fadeCallback = callback; // function to call after fade out
}

function storeOriginalMaterials(mesh) {
  mesh.userData.originalMaterials = [];
  
  // Store all materials in the mesh hierarchy
  mesh.traverse(child => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.userData.originalMaterials = [...child.material];
      } else {
        child.userData.originalMaterial = child.material;
      }
    }
  });
}

function updateEntityFades() {
  const now = performance.now();
  
  // Update player fades
  for (const playerId in players) {
    const mesh = players[playerId]?.mesh;
    if (mesh && mesh.userData.fading) {
      updateFade(mesh, now);
    }
  }
  
  // Update zombie fades
  for (const zombieId in zombies) {
    const mesh = zombies[zombieId]?.mesh;
    if (mesh && mesh.userData.fading) {
      updateFade(mesh, now);
    }
  }
  
  // Update pickup fades
  for (const pickupId in ammoPickups) {
    const mesh = ammoPickups[pickupId]?.mesh;
    if (mesh && mesh.userData.fading) {
      updateFade(mesh, now);
    }
  }
}

function updateFade(mesh, now) {
  const elapsed = now - mesh.userData.fadeStartTime;
  const progress = Math.min(elapsed / mesh.userData.fadeDuration, 1.0);
  
  // Calculate current opacity
  let currentOpacity;
  if (mesh.userData.fadeTarget === 0.0) {
    // Fading out
    currentOpacity = 1.0 - progress;
  } else {
    // Fading in
    currentOpacity = progress;
  }
  
  // Apply opacity
  setEntityOpacity(mesh, currentOpacity);
  
  // Check if fade is complete
  if (progress >= 1.0) {
    mesh.userData.fading = false;
    
    // If this was a fade out and we have a callback
    if (mesh.userData.fadeTarget === 0.0 && mesh.userData.fadeCallback) {
      mesh.userData.fadeCallback();
    }
  }
}

function setEntityOpacity(mesh, opacity) {
  if (!mesh) return;
  
  mesh.traverse(child => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => enableTransparency(mat, opacity));
      } else {
        enableTransparency(child.material, opacity);
      }
    }
  });
}

function enableTransparency(material, opacity) {
  if (!material) return;
  
  // Clone the material to avoid affecting shared materials
  if (!material._isCloned) {
    material = material.clone();
    material._isCloned = true;
  }
  
  material.transparent = true;
  material.opacity = opacity;
}

// Add a debug info panel for fog of war
function addFogOfWarDebugPanel() {
  const style = document.createElement('style');
  style.textContent = `
    #fog-of-war-info {
      position: absolute;
      top: 60px;
      left: 20px;
      background: rgba(0,0,0,0.5);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
      font-family: monospace;
    }
  `;
  document.head.appendChild(style);
  
  const infoPanel = document.createElement('div');
  infoPanel.id = 'fog-of-war-info';
  infoPanel.innerHTML = `Fog of War: Active<br>
    Visible Players: 0<br>
    Visible Zombies: 0<br>
    Visible Pickups: 0<br>
    <span style="opacity: 0.7">Press F to toggle visualization</span>`;
  document.body.appendChild(infoPanel);
  
  // Update the panel regularly with visibility stats
  setInterval(() => {
    const visiblePlayers = Object.keys(players).length - 1; // Minus self
    const visibleZombies = Object.keys(zombies).length;
    const visiblePickups = Object.keys(ammoPickups).length;
    
    const visibilityStatus = fogOfWarMesh && fogOfWarMesh.visible ? 'Active' : 'Disabled';
    
    infoPanel.innerHTML = `Fog of War: ${visibilityStatus}<br>
      Visible Players: ${visiblePlayers}<br>
      Visible Zombies: ${visibleZombies}<br>
      Visible Pickups: ${visiblePickups}<br>
      <span style="opacity: 0.7">Press F to toggle visualization</span>`;
  }, 500);
}

// Create fog of war visualization
function createFogOfWarVisualization() {
  // Create fog of war geometry - use more segments for better precision
  const fogSize = MAP_SIZE * 2 + 20; // Make it larger than the map to cover all edges
  const fogGeometry = new THREE.PlaneGeometry(fogSize, fogSize, 64, 64);
  
  // Create fog material with transparency
  const fogMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false, // Don't write to depth buffer
    depthTest: true,  // Still test against it
    side: THREE.DoubleSide,
    uniforms: {
      fogColor: { value: new THREE.Color(FOG_COLOR) },
      fogOpacity: { value: FOG_OPACITY },
      playerPos: { value: new THREE.Vector2(0, 0) },
      visibleRadius: { value: 3.0 },  // Exactly matching server's CLOSE_VISIBILITY_RADIUS
      coneDirection: { value: new THREE.Vector2(1, 0) },
      coneAngle: { value: Math.PI * (120/180) }, // Exactly matching server's angle
      coneLength: { value: 15.0 },    // Exactly matching server's VISIBILITY_DISTANCE
    },
    vertexShader: `
      varying vec2 vWorldPosition;
      
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xz; // We only need the x and z coordinates
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 fogColor;
      uniform float fogOpacity;
      uniform vec2 playerPos;
      uniform float visibleRadius;
      uniform vec2 coneDirection;
      uniform float coneAngle;
      uniform float coneLength;
      
      varying vec2 vWorldPosition;
      
      void main() {
        // Calculate vector from player to this fragment
        vec2 fragToPlayer = playerPos - vWorldPosition; // Note: direction is reversed for calculation
        float distance = length(fragToPlayer);
        
        // Start with full fog
        float visibility = 0.0;
        
        // Check if in close radius (always visible)
        if (distance < visibleRadius) {
          visibility = 1.0;
        }
        // Check if in cone and within visibility distance
        else if (distance < coneLength) {
          // Only process if we have a valid direction vector
          if (length(coneDirection) > 0.001) {
            // Normalize vectors
            vec2 toFragment = normalize(-fragToPlayer);
            vec2 playerDir = normalize(coneDirection);
            
            // Calculate dot product between direction vectors
            // This gives us cos(angle) between the vectors
            float dotProduct = dot(playerDir, toFragment);
            
            // Calculate the angle. We use acos which returns radians
            float angleBetween = acos(clamp(dotProduct, -1.0, 1.0));
            
            // Check if within the visibility cone
            if (angleBetween < coneAngle * 0.5) {
              // Inside the cone - visibility depends on distance
              float distanceRatio = distance / coneLength;
              
              // Full visibility close to player, fading out as we reach cone edge
              visibility = 1.0 - smoothstep(0.6, 0.9, distanceRatio);
              
              // Add a smoother edge as we approach the maximum angle
              float angleRatio = angleBetween / (coneAngle * 0.5);
              visibility *= 1.0 - smoothstep(0.7, 1.0, angleRatio);
            }
          }
        }
        
        // Apply final fog calculation (inverse of visibility)
        float alpha = fogOpacity * (1.0 - visibility);
        
        // Output the final color with calculated alpha
        gl_FragColor = vec4(fogColor, alpha);
      }
    `
  });

  // Create the fog mesh
  const fogMesh = new THREE.Mesh(fogGeometry, fogMaterial);
  fogMesh.rotation.x = -Math.PI / 2; // Make it horizontal
  fogMesh.position.y = 0.3; // Just above ground objects
  fogMesh.renderOrder = 999; // Ensure it renders after all world objects
  
  scene.add(fogMesh);
  fogOfWarMesh = fogMesh;
  
  return fogMesh;
}

// Update fog of war based on player position and direction
function updateFogOfWar() {
  if (!fogOfWarMesh || !localPlayer) return;
  
  // Get player position as Vector2 (x,z plane)
  const playerPos = new THREE.Vector2(localPlayer.position.x, localPlayer.position.z);
  
  // Get exact player sight direction based on rotation
  const playerAngle = localPlayer.rotation.y;
  const dirX = Math.sin(playerAngle); // Using sin for x-component
  const dirZ = Math.cos(playerAngle); // Using cos for z-component
  const direction = new THREE.Vector2(dirX, dirZ);
  
  // Update shader uniforms
  fogOfWarMesh.material.uniforms.playerPos.value.copy(playerPos);
  fogOfWarMesh.material.uniforms.coneDirection.value.copy(direction);
  
  // Make sure fog follows the player (not the camera) for accurate coverage
  fogOfWarMesh.position.x = localPlayer.position.x;
  fogOfWarMesh.position.z = localPlayer.position.z;
}

// Enhance the toggle function for better feedback
function toggleFogOfWar() {
  if (!fogOfWarMesh) return;
  
  fogOfWarMesh.visible = !fogOfWarMesh.visible;
  
  // Add visual feedback when toggling
  const flashColor = fogOfWarMesh.visible ? 0x004400 : 0x440000; // Green for on, Red for off
  scene.background = new THREE.Color(flashColor);
  setTimeout(() => {
    scene.background = new THREE.Color(0x87ceeb); // Reset to sky blue
  }, 150);
  
  // Update the debug panel text
  const infoPanel = document.getElementById('fog-of-war-info');
  if (infoPanel) {
    const status = fogOfWarMesh.visible ? 'Active' : 'Disabled';
    infoPanel.innerHTML = infoPanel.innerHTML.replace(/Active|Disabled/, status);
  }
}