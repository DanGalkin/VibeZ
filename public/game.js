// Connect to Socket.IO server
const socket = io();

// Game variables
let scene, camera, renderer;
let players = {};
let projectiles = {};
let localPlayer = null;
let roomId = null;

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

// Initialize Three.js scene
function initThree() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  
  // Create flat orthographic camera isometric angle
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 20;
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
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3a9d23,  // Green
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Add a grid for reference
  const gridHelper = new THREE.GridHelper(100, 100, 0x000000, 0x000000);
  gridHelper.position.y = 0.01; // Just above the ground
  scene.add(gridHelper);
  
  // Add fog of war (simple distance-based fog)
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Add event listeners for controls
  setupControls();
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
  
  // Mouse click for shooting
  document.addEventListener('click', (event) => {
    if (!gameActive || !localPlayer) return;
    
    // Calculate direction from camera to click point
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    
    // Create a ray from the camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate the intersection with the ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, targetPoint);
    
    // Calculate direction from player to target
    const direction = new THREE.Vector3()
      .subVectors(targetPoint, localPlayer.position)
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

// Create a player mesh
function createPlayerMesh(player) {
  // Create player body
  const bodyGeometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, PLAYER_SIZE);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: player.id === socket.id ? 0x0000ff : 0xff0000
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  
  // Create player head
  const headGeometry = new THREE.SphereGeometry(PLAYER_SIZE / 2, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: player.id === socket.id ? 0x0088ff : 0xff8800
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = PLAYER_HEIGHT / 2 + 0.2;
  head.castShadow = true;
  
  // Create player group
  const playerMesh = new THREE.Group();
  playerMesh.add(body);
  playerMesh.add(head);
  
  // Position the player
  playerMesh.position.set(
    player.position.x,
    player.position.y + PLAYER_HEIGHT / 2,
    player.position.z
  );
  
  // Add to scene
  scene.add(playerMesh);
  
  return playerMesh;
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

// Update player movement
function updateMovement() {
  if (!localPlayer || !gameActive) return;
  
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
  
  // Normalize if moving diagonally
  if (moveDirection.length() > 0) {
    moveDirection.normalize();
    
    // Update local player position
    localPlayer.position.x += moveDirection.x * PLAYER_SPEED;
    localPlayer.position.z += moveDirection.z * PLAYER_SPEED;
    
    // Calculate rotation based on movement direction
    const angle = Math.atan2(moveDirection.x, moveDirection.z);
    localPlayer.rotation.y = angle;
    
    // Tell server about movement
    socket.emit('playerMove', {
      position: {
        x: localPlayer.position.x - PLAYER_SIZE / 2,
        y: 0, // Ground level
        z: localPlayer.position.z - PLAYER_SIZE / 2
      },
      rotation: angle
    });
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

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  updateMovement();
  updateProjectiles();
  
  // Update camera to follow local player
  if (localPlayer && gameActive) {
    // Position camera at isometric angle relative to player
    camera.position.x = localPlayer.position.x + 20;
    camera.position.y = localPlayer.position.y + 15;
    camera.position.z = localPlayer.position.z + 20;
    camera.lookAt(localPlayer.position);
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

// Generate a city-style road network
function generateCityRoads(mapSize) {
  const roadGroup = new THREE.Group();
  
  // Road configuration
  const roadWidth = 8;  // All roads 8 units wide
  const roadSpacing = 24; // At least 24 units between intersections
  
  // Road surface material (asphalt)
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,  // Dark gray
    roughness: 0.8,
    metalness: 0.1
  });
  
  // Road marking material (white lines)
  const markingMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.2
  });
  
  // Generate grid of roads
  for (let z = -mapSize / 2 + roadSpacing; z < mapSize / 2; z += roadSpacing) {
    createRoadWithDashedLines(-mapSize / 2, z, mapSize / 2, z, roadWidth, roadMaterial, markingMaterial, roadGroup);
  }
  
  for (let x = -mapSize / 2 + roadSpacing; x < mapSize / 2; x += roadSpacing) {
    createRoadWithDashedLines(x, -mapSize / 2, x, mapSize / 2, roadWidth, roadMaterial, markingMaterial, roadGroup);
  }
  
  return roadGroup;
}

// Create a road with dashed line markings
function createRoadWithDashedLines(x1, z1, x2, z2, width, roadMaterial, markingMaterial, parentGroup) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  
  // Create road surface
  const roadGeometry = new THREE.PlaneGeometry(width, length);
  const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.rotation.z = angle;
  roadMesh.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  roadMesh.receiveShadow = true;
  parentGroup.add(roadMesh);
  
  // Create dashed center line
  createDashedLine((x1 + x2) / 2, (z1 + z2) / 2, length, angle, 2, 2, 0.3, markingMaterial, parentGroup);
}

// Create a dashed line
function createDashedLine(x, z, length, angle, dashLength, gapLength, width, material, parentGroup) {
  const totalLength = dashLength + gapLength;
  const numDashes = Math.floor(length / totalLength);
  
  for (let i = 0; i < numDashes; i++) {
    // Create a dash
    const dashGeometry = new THREE.PlaneGeometry(width, dashLength);
    const dashMesh = new THREE.Mesh(dashGeometry, material);
    
    // Position along the line
    const offset = -length / 2 + totalLength * i + dashLength / 2;
    const dashX = x + Math.sin(angle) * offset;
    const dashZ = z + Math.cos(angle) * offset;
    
    dashMesh.position.set(dashX, 0.02, dashZ); // Slightly above road surface
    dashMesh.rotation.x = -Math.PI / 2;
    dashMesh.rotation.z = angle;
    
    parentGroup.add(dashMesh);
  }
}

// Create map elements
function createMapElements(map) {
  const mapContainer = new THREE.Group();
  scene.add(mapContainer);

  // Generate roads first
  const roadNetwork = generateCityRoads(map.size || 100);
  mapContainer.add(roadNetwork);

  // Get road positions for collision detection
  const roadPositions = [];
  for (let z = -map.size / 2 + 24; z < map.size / 2; z += 24) {
    for (let x = -map.size / 2; x <= map.size / 2; x++) {
      roadPositions.push({ x, z, width: 8 });
    }
  }
  for (let x = -map.size / 2 + 24; x < map.size / 2; x += 24) {
    for (let z = -map.size / 2; z <= map.size / 2; z++) {
      roadPositions.push({ x, z, width: 8 });
    }
  }

  // Generate custom buildings
  const buildingCount = 20;
  const buildingColors = [0x999999, 0xE6B800, 0xFFC0CB, 0x8B4513]; // grey, yellow, pink, brown
  const buildingProps = [];

  for (let i = 0; i < buildingCount; i++) {
    // Generate random properties
    const colorIndex = Math.floor(Math.random() * buildingColors.length);
    const floors = Math.floor(Math.random() * 2) + 1;
    const hasPitchedRoof = Math.random() > 0.5;
    const width = Math.floor(Math.random() * 9) + 8; // 8-16
    const depth = Math.floor(Math.random() * 9) + 8; // 8-16
    const height = floors * 3 + (hasPitchedRoof ? 2 : 0);
    
    // Find a position that doesn't overlap with roads
    let x, z, isValidPosition;
    let attempts = 0;
    
    do {
      attempts++;
      isValidPosition = true;
      x = Math.random() * (map.size - width) - map.size/2 + width/2;
      z = Math.random() * (map.size - depth) - map.size/2 + depth/2;
      
      // Check if position overlaps with road
      for (const road of roadPositions) {
        const roadMinX = road.x - road.width/2;
        const roadMaxX = road.x + road.width/2;
        const roadMinZ = road.z - road.width/2;
        const roadMaxZ = road.z + road.width/2;
        
        const buildingMinX = x - width/2;
        const buildingMaxX = x + width/2;
        const buildingMinZ = z - depth/2;
        const buildingMaxZ = z + depth/2;
        
        // Detect collision with a road + buffer zone
        const buffer = 1; // Buffer zone around roads
        if (
          buildingMaxX + buffer > roadMinX && 
          buildingMinX - buffer < roadMaxX && 
          buildingMaxZ + buffer > roadMinZ && 
          buildingMinZ - buffer < roadMaxZ
        ) {
          isValidPosition = false;
          break;
        }
      }
      
      // Also check collision with other buildings
      if (isValidPosition) {
        for (const building of buildingProps) {
          const dist = Math.sqrt(
            Math.pow(x - building.position.x, 2) + 
            Math.pow(z - building.position.z, 2)
          );
          if (dist < (width + building.width) / 2) {
            isValidPosition = false;
            break;
          }
        }
      }
    } while (!isValidPosition && attempts < 100);
    
    // If we can't find a valid position after 100 attempts, skip this building
    if (!isValidPosition) continue;
    
    buildingProps.push({
      position: { x, y: height/2, z },
      width,
      depth,
      height,
      color: buildingColors[colorIndex],
      floors,
      hasPitchedRoof
    });
  }

  // Create building meshes
  buildingProps.forEach(building => {
    const buildingGroup = new THREE.Group();
    
    // Create main building structure
    const buildingGeometry = new THREE.BoxGeometry(
      building.width,
      building.height - (building.hasPitchedRoof ? 2 : 0),
      building.depth
    );
    const buildingMaterial = new THREE.MeshStandardMaterial({
      color: building.color,
      roughness: 0.7
    });
    const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    
    // If pitched roof, add a roof that covers the entire building
    if (building.hasPitchedRoof) {
      // Use custom geometry for pitched roof to ensure it covers the whole building
      const roofHeight = 2;
      const halfWidth = building.width / 2;
      const halfDepth = building.depth / 2;
      
      const roofGeometry = new THREE.BufferGeometry();
      
      // Define vertices for a pyramid
      const vertices = new Float32Array([
        // Base (4 corners)
        -halfWidth, 0, -halfDepth,
        halfWidth, 0, -halfDepth,
        halfWidth, 0, halfDepth,
        -halfWidth, 0, halfDepth,
        // Top point
        0, roofHeight, 0
      ]);
      
      // Define faces (triangles)
      const indices = [
        // Four triangular faces
        0, 1, 4, // front
        1, 2, 4, // right
        2, 3, 4, // back
        3, 0, 4, // left
      ];
      
      roofGeometry.setIndex(indices);
      roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      roofGeometry.computeVertexNormals();
      
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x880000, // Dark red roof
        roughness: 0.6
      });
      
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.y = building.height / 2 - 1; // Position at top of building
      roof.castShadow = true;
      buildingGroup.add(roof);
    }
    
    // Add windows - ensure they're at proper height
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB, // Sky blue
      emissive: 0x3366FF,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8
    });
    
    // Add windows to each floor, making sure they're above ground
    const buildingBottom = -building.height / 2;
    for (let floor = 0; floor < building.floors; floor++) {
      const windowHeight = 1.5; // Height of window
      const floorHeight = 3; // Height between floors
      const windowY = buildingBottom + (floor * floorHeight) + floorHeight/2; // Center window vertically on the floor
      
      // Make sure window is above ground
      if (windowY - windowHeight/2 < -building.height/2) continue;
      
      // Front windows
      for (let i = 0; i < building.width - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
        window1.position.set(i - building.width/2 + 1.5, windowY, building.depth/2 + 0.01);
        buildingGroup.add(window1);
      }
      
      // Back windows
      for (let i = 0; i < building.width - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
        window2.position.set(i - building.width/2 + 1.5, windowY, -building.depth/2 - 0.01);
        window2.rotation.y = Math.PI;
        buildingGroup.add(window2);
      }
      
      // Side windows
      for (let i = 0; i < building.depth - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        
        const window3 = new THREE.Mesh(windowGeometry, windowMaterial);
        window3.position.set(building.width/2 + 0.01, windowY, i - building.depth/2 + 1.5);
        window3.rotation.y = Math.PI / 2;
        buildingGroup.add(window3);
        
        const window4 = new THREE.Mesh(windowGeometry, windowMaterial);
        window4.position.set(-building.width/2 - 0.01, windowY, i - building.depth/2 + 1.5);
        window4.rotation.y = -Math.PI / 2;
        buildingGroup.add(window4);
      }
    }
    
    // Add the building to the group
    buildingGroup.add(buildingMesh);
    buildingGroup.position.set(building.position.x, building.position.y, building.position.z);
    mapContainer.add(buildingGroup);
  });

  map.walls.forEach(wall => {
    const geometry = new THREE.BoxGeometry(
      wall.dimensions.length,
      wall.dimensions.height,
      wall.dimensions.width
    );
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(wall.position.x, wall.position.y, wall.position.z);
    mesh.rotation.y = wall.rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mapContainer.add(mesh);
  });

  map.trees.forEach(tree => {
    const treeGroup = new THREE.Group();
    const trunkGeometry = new THREE.CylinderGeometry(
      tree.dimensions.radius * 0.3,
      tree.dimensions.radius * 0.5,
      tree.dimensions.height * 0.5,
      8
    );
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = tree.dimensions.height * 0.25;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const foliageGeometry = new THREE.ConeGeometry(
      tree.dimensions.radius,
      tree.dimensions.height * 0.7,
      8
    );
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = tree.dimensions.height * 0.6;
    foliage.castShadow = true;
    treeGroup.add(foliage);

    treeGroup.position.set(tree.position.x, 0, tree.position.z);
    mapContainer.add(treeGroup);
  });

  return mapContainer;
}

// Set up Socket.IO event handlers
function setupSocketEvents(ui) {
  // Initial game state from server
  socket.on('gameState', (state) => {
    roomId = socket.roomId;
    if (state.map) createMapElements(state.map);
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
    
    // Create meshes for all existing projectiles
    for (const projectile of state.projectiles) {
      createProjectile(projectile);
    }
  });
  
  // New player joined
  socket.on('playerJoined', (player) => {
    console.log('Player joined:', player.id);
    players[player.id] = {
      mesh: createPlayerMesh(player),
      data: player
    };
  });
  
  // Player left
  socket.on('playerLeft', (playerId) => {
    console.log('Player left:', playerId);
    if (players[playerId]) {
      scene.remove(players[playerId].mesh);
      delete players[playerId];
    }
  });
  
  // Player moved
  socket.on('playerMoved', (data) => {
    if (players[data.id]) {
      // Update player position smoothly (could add interpolation for smoother movement)
      players[data.id].mesh.position.set(
        data.position.x,
        PLAYER_HEIGHT / 2,
        data.position.z
      );
      
      // Update player rotation
      players[data.id].mesh.rotation.y = data.rotation;
      
      // Update data
      players[data.id].data.position = data.position;
      players[data.id].data.rotation = data.rotation;
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
  
  // Game state update from server
  socket.on('gameStateUpdate', (state) => {
    // Update player positions based on server state
    for (const playerId in state.players) {
      if (playerId !== socket.id && players[playerId]) {
        const serverPlayer = state.players[playerId];
        players[playerId].data = serverPlayer;
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
      localPlayer.position.set(data.position.x, localPlayer.position.y, data.position.z);
    }
  });
}

// Initialize game
function init() {
  initThree();
  const ui = setupUI();
  setupSocketEvents(ui);
  animate();
}

// Start the game when page loads
window.addEventListener('load', init);