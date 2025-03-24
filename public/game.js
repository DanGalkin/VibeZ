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
let localPlayer = null;
let roomId = null;
let mapContainer = null;
let mapBoundaries = null; // Add reference to map boundaries visualization

// Constants
const MAP_SIZE = 50; // Should match server-side MAP_SIZE

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
    }
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
    
    // Update player sight direction if the player exists
    if (localPlayer && gameActive) {
      updatePlayerSight();
    }
  });
  
  // Mouse click for shooting
  document.addEventListener('click', (event) => {
    if (!gameActive || !localPlayer) return;
    
    // We already have the mouse position from mousemove events
    // Use groundMousePosition for shooting direction
    
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
    
    // Client-side prediction - create projectile immediately
    createProjectile({
      id: 'temp-' + Date.now(),
      ownerId: socket.id,
      position: {
        x: localPlayer.position.x,
        y: 0.5,
        z: localPlayer.position.z
      },
      direction: {
        x: direction.x,
        y: 0,
        z: direction.z
      },
      speed: 0.5
    });
  });
}

// Calculate the intersection of mouse pointer with the ground plane
function updateGroundMousePosition() {
  if (!camera) return;
  
  // Create a ray from the camera
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mousePosition, camera);
  
  // Calculate the intersection with the ground plane
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  raycaster.ray.intersectPlane(groundPlane, groundMousePosition);
}

// Update player sight direction based on mouse position
function updatePlayerSight() {
  if (!localPlayer || !groundMousePosition) return;
  
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

// Animation loop with timing for animations
let lastUpdateTime = performance.now(); // Track the last update time

function animate(time) {
  const deltaTime = (time - lastUpdateTime) / 1000; // Convert ms to seconds
  lastUpdateTime = time;
  
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
  
  // Update movement with delta time
  updateMovement(cappedDeltaTime);
  updateProjectiles();
  animatePlayers(cappedDeltaTime);
  animateZombies(zombies, cappedDeltaTime);
  
  // Update camera to follow local player
  if (localPlayer && gameActive) {
    // Position camera at isometric angle relative to player
    camera.position.x = localPlayer.position.x + 20;
    camera.position.y = localPlayer.position.y + 15;
    camera.position.z = localPlayer.position.z + 20;
    camera.lookAt(localPlayer.position);
    
    // Update player sight after camera moves
    updatePlayerSight();
  }
  
  renderer.render(scene, camera);
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
  });
  
  // Join existing game by ID
  joinRoomBtn.addEventListener('click', () => {
    const enteredRoomId = roomIdInput.value.trim();
    if (enteredRoomId) {
      socket.emit('joinRoom', enteredRoomId);
      joinGameDiv.style.display = 'none';
      gameActive = true;
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
  });
  
  // New player joined
  socket.on('playerJoined', (player) => {
    console.log('Player joined:', player.id);
    console.log('Player color:', player.color); // Log the player's color
    players[player.id] = {
      mesh: createPlayerMesh(player),
      data: {
        ...player,
        moving: false // Explicitly initialize as not moving
      }
    };
    
    // Ensure the mesh userData has correct walking state
    players[player.id].mesh.userData.walking = false;
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
  
  // New projectile created
  socket.on('projectileCreated', (projectile) => {
    // Don't create duplicates for client-predicted projectiles
    for (const id in projectiles) {
      if (id.startsWith('temp-') && projectiles[id].data.ownerId === projectile.ownerId) {
        // Replace the temporary client-predicted projectile with the server version
        scene.remove(projectiles[id].mesh);
        delete projectiles[id];
        break;
      }
    }
    
    createProjectile(projectile);
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
    for (const zombie of updatedZombies) {
      if (zombies[zombie.id]) {
        // Update position and rotation
        zombies[zombie.id].mesh.position.set(
          zombie.position.x,
          zombie.position.y || 0,
          zombie.position.z
        );
        zombies[zombie.id].mesh.rotation.y = zombie.rotation;
        
        // Update state
        zombies[zombie.id].mesh.userData.state = zombie.state;
        zombies[zombie.id].data = zombie;
      } else {
        // Create if doesn't exist
        const zombieMesh = createZombieMesh(zombie);
        scene.add(zombieMesh); // Add the mesh to the scene
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
  
  // Update game state from server - fix animation bug for other players
  socket.on('gameStateUpdate', (state) => {
    // Update player positions based on server state
    for (const playerId in state.players) {
      if (playerId !== socket.id && players[playerId]) {
        const serverPlayer = state.players[playerId];
        
        // Only update the walking state if we have mesh and userData
        if (players[playerId].mesh && players[playerId].mesh.userData) {
          // Explicitly check for server's moving flag to be true
          players[playerId].mesh.userData.walking = serverPlayer.moving === true;
        }
        
        // Update the rest of the player data
        players[playerId].data = serverPlayer;
      }
    }
    
    // Update zombie positions if needed
    if (state.zombies) {
      for (const zombie of state.zombies) {
        if (zombies[zombie.id]) {
          // Update existing zombie's data
          zombies[zombie.id].data = zombie;
        } else {
          // Create new zombie if it doesn't exist
          const zombieMesh = createZombieMesh(zombie);
          scene.add(zombieMesh); // Add the mesh to the scene
          zombies[zombie.id] = {
            mesh: zombieMesh,
            data: zombie
          };
        }
      }
      
      // Remove zombies that no longer exist
      for (const zombieId in zombies) {
        if (!state.zombies.some(z => z.id === zombieId)) {
          removeZombie(zombieId, zombies, scene);
        }
      }
    }
    
    // Update projectile positions based on server state
    for (const projectile of state.projectiles) {
      if (projectiles[projectile.id]) {
        projectiles[projectile.id].data = projectile;
        projectiles[projectile.id].mesh.position.set(
          projectile.position.x,
          projectile.position.y,
          projectile.position.z
        );
      }
    }
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
    } else {
      // Store the target for smooth interpolation in the animation loop
      localPlayer.userData.targetPosition = targetPos;
      localPlayer.userData.positionCorrectionTime = performance.now();
    }
    
    // Update movement state
    localPlayer.userData.walking = data.moving === true;
  });
}

// Initialize game
function init() {
  initThree();
  const ui = setupUI();
  setupSocketEvents(ui);
  animate(0); // Start with time 0
}

// Start the game when page loads
window.addEventListener('load', init);