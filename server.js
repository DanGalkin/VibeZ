const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import the map generation module
const { generateMap, MAP_ELEMENT_TYPES } = require('./generateMap');

// Import zombie logic
const zombieLogic = require('./zombieLogic');

// Import player logic
const playerLogic = require('./playerLogic');

// Import weapon logic
const weaponLogic = require('./weaponLogic');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Add performance monitoring variables
const performanceMetrics = {
  lastSecondLoopTimes: [], // Stores loop execution times during last second
  maxLoopTime: 0, // Maximum loop time in the last reporting interval
  lastReportTime: Date.now() // Last time we sent metrics to clients
};

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Add endpoint to get available rooms
app.get('/api/rooms', (req, res) => {
  const availableRooms = {};
  
  for (const roomId in rooms) {
    availableRooms[roomId] = {
      playerCount: Object.keys(rooms[roomId].players).length,
      roomName: rooms[roomId].roomName || `Game ${roomId.substring(0, 6)}`
    };
  }
  
  res.json(availableRooms);
});

// Game state
const gameState = {
  players: {},
  projectiles: [],
  enemies: [] // For PvE elements
};

// Rooms/lobbies for multiple game instances
const rooms = {};

// Constants for the game
const MAP_SIZE = 50; // Half-width/height of the map (total size is 100x100)
const PLAYER_SPEED = playerLogic.PLAYER_SPEED; // Use player speed from playerLogic
const AMMO_PICKUP_AMOUNT = 7; // Amount of ammo to add when pickup is collected
const MAX_AMMO_PICKUPS = 7; // Number of ammo pickups on the map
const AMMO_PICKUP_RADIUS = 0.7; // Collision radius for ammo pickups

// Check if a position is within map boundaries
function isWithinMapBoundaries(position) {
  // Check if position is within the square map boundaries
  return Math.abs(position.x) <= MAP_SIZE && Math.abs(position.z) <= MAP_SIZE;
}

// Apply map boundaries to a position (clamp to map edges)
function clampToMapBoundaries(position) {
  return {
    x: Math.max(-MAP_SIZE, Math.min(MAP_SIZE, position.x)),
    y: position.y,
    z: Math.max(-MAP_SIZE, Math.min(MAP_SIZE, position.z))
  };
}

// Check collision between player and map elements with improved detection
function checkMapCollisions(player, map, movement) {
  // First check map boundaries
  if (!isWithinMapBoundaries(player.position)) {
    return {
      collision: true,
      position: clampToMapBoundaries(player.position)
    };
  }

  const playerRadius = 0.5; // Player collision radius
  
  // Store collision data to calculate proper response
  let collision = false;
  let nearestIntersection = null;
  let minDistance = Infinity;
  
  // Check collisions with buildings
  for (const building of map.buildings) {
    const halfWidth = building.dimensions.width / 2;
    const halfDepth = building.dimensions.depth / 2;
    
    // Calculate the closest point on the building box to the player
    const closestX = Math.max(building.position.x - halfWidth, 
                     Math.min(player.position.x, building.position.x + halfWidth));
    const closestZ = Math.max(building.position.z - halfDepth, 
                     Math.min(player.position.z, building.position.z + halfDepth));
    
    // Calculate distance from closest point to player
    const dx = player.position.x - closestX;
    const dz = player.position.z - closestZ;
    const distanceSquared = dx * dx + dz * dz;
    
    if (distanceSquared < playerRadius * playerRadius) {
      collision = true;
      
      // Record this collision if it's closer than previous ones
      if (distanceSquared < minDistance) {
        minDistance = distanceSquared;
        nearestIntersection = { x: closestX, z: closestZ };
      }
    }
  }
  
  // Check collisions with trees
  for (const tree of map.trees) {
    const dx = player.position.x - tree.position.x;
    const dz = player.position.z - tree.position.z;
    const distanceSquared = dx * dx + dz * dz;
    const combinedRadius = playerRadius + tree.dimensions.radius * 0.5;
    
    if (distanceSquared < combinedRadius * combinedRadius) {
      collision = true;
      
      if (distanceSquared < minDistance) {
        minDistance = distanceSquared;
        nearestIntersection = { x: tree.position.x, z: tree.position.z };
      }
    }
  }
  
  // Check collisions with walls and benches
  for (const wall of map.walls) {
    // Handle regular walls
    if (wall.type !== 'bench') {
      const halfLength = wall.dimensions.length / 2;
      const halfWidth = wall.dimensions.width / 2;
      const relX = player.position.x - wall.position.x;
      const relZ = player.position.z - wall.position.z;
      const cosA = Math.cos(-wall.rotation);
      const sinA = Math.sin(-wall.rotation);
      const rotX = relX * cosA - relZ * sinA;
      const rotZ = relX * sinA + relZ * cosA;
      
      // Calculate the closest point on the wall to the player
      const closestX = Math.max(-halfLength, Math.min(rotX, halfLength));
      const closestZ = Math.max(-halfWidth, Math.min(rotZ, halfWidth));
      
      // Transform closest point back to world space
      const worldClosestX = closestX * cosA + closestZ * sinA + wall.position.x;
      const worldClosestZ = -closestX * sinA + closestZ * cosA + wall.position.z;
      
      const dx = player.position.x - worldClosestX;
      const dz = player.position.z - worldClosestZ;
      const distanceSquared = dx * dx + dz * dz;
      
      if (distanceSquared < playerRadius * playerRadius) {
        collision = true;
        
        if (distanceSquared < minDistance) {
          minDistance = distanceSquared;
          nearestIntersection = { x: worldClosestX, z: worldClosestZ };
        }
      }
    }
    // Handle benches with a simple circle collider
    else {
      const dx = player.position.x - wall.position.x;
      const dz = player.position.z - wall.position.z;
      const distanceSquared = dx * dx + dz * dz;
      const benchRadius = Math.max(wall.dimensions.length, wall.dimensions.width) / 2;
      
      if (distanceSquared < (playerRadius + benchRadius) * (playerRadius + benchRadius)) {
        collision = true;
        
        if (distanceSquared < minDistance) {
          minDistance = distanceSquared;
          nearestIntersection = { x: wall.position.x, z: wall.position.z };
        }
      }
    }
  }
  
  // Check collisions with cars - complete rewrite with debug logging
  for (const car of map.cars) {
    // Debug info
    const carDebug = {id: car.id, rotation: car.rotation};
    
    // Get car dimensions - ensure we're using the correct dimensions
    const carLength = car.dimensions.length;
    const carWidth = car.dimensions.width;
    
    // Create a bounding box in car's local space
    const halfLength = carLength / 2;
    const halfWidth = carWidth / 2;
    
    // Convert player position to car's local coordinate system
    // We need to translate and then rotate
    const dx = player.position.x - car.position.x;
    const dz = player.position.z - car.position.z;
    
    // Apply inverse rotation matrix
    const rot = car.rotation; // Car's rotation angle in radians
    const localX = dx * Math.cos(-rot) - dz * Math.sin(-rot);
    const localZ = dx * Math.sin(-rot) + dz * Math.cos(-rot);
    
    // Find closest point on AABB in local space
    // IMPORTANT: In car's local space, length is along X-axis, width is along Z-axis
    const closestX = Math.max(-halfLength, Math.min(localX, halfLength));
    const closestZ = Math.max(-halfWidth, Math.min(localZ, halfWidth));
    
    // Convert closest point back to world coordinates
    // Apply rotation and then translation
    const worldX = closestX * Math.cos(rot) - closestZ * Math.sin(rot) + car.position.x;
    const worldZ = closestX * Math.sin(rot) + closestZ * Math.cos(rot) + car.position.z;
    
    // Calculate distance from player to closest point
    const dist = Math.sqrt(
      Math.pow(player.position.x - worldX, 2) +
      Math.pow(player.position.z - worldZ, 2)
    );
    
    // Check if there's a collision
    if (dist < playerRadius) {
      collision = true;
      
      // Store collision point if it's the closest one so far
      if (dist < minDistance) {
        minDistance = dist;
        nearestIntersection = { x: worldX, z: worldZ };
      }
    }
  }
  
  // If we have a collision, calculate collision response
  if (collision && nearestIntersection) {
    // Calculate push-out vector
    const dx = player.position.x - nearestIntersection.x;
    const dz = player.position.z - nearestIntersection.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > 0) {
      // Normalize the direction
      const nx = dx / distance;
      const nz = dz / distance;
      
      // Calculate how much to push the player out
      const pushDistance = playerRadius - distance;
      
      if (pushDistance > 0) {
        // Return position with collision adjustment
        return { 
          collision: true, 
          position: {
            x: player.position.x + nx * pushDistance,
            y: player.position.y,
            z: player.position.z + nz * pushDistance
          }
        };
      }
    }
  }
  
  // No collision or no adjustment needed
  return { collision: collision, position: player.position };
}

// Create initial ammo pickup positions
function createAmmoPickups(mapSize) {
  const pickups = [];
  for (let i = 0; i < MAX_AMMO_PICKUPS; i++) {
    pickups.push(generateRandomAmmoPickup(mapSize));
  }
  return pickups;
}

// Generate a single ammo pickup at a random position
function generateRandomAmmoPickup(mapSize) {
  const margin = 5; // Keep away from map edges
  return {
    id: uuidv4(),
    position: {
      x: Math.random() * (mapSize * 2 - margin * 2) - mapSize + margin,
      y: 0.5, // Slightly above ground
      z: Math.random() * (mapSize * 2 - margin * 2) - mapSize + margin
    },
    createdAt: Date.now()
  };
}

// Check if a player has collected an ammo pickup
function checkAmmoPickupCollisions(player, ammoPickups) {
  const playerRadius = 0.5; // Player collision radius
  const collectedPickups = [];

  for (const pickup of ammoPickups) {
    const dx = player.position.x - pickup.position.x;
    const dz = player.position.z - pickup.position.z;
    const distanceSquared = dx * dx + dz * dz;
    const combinedRadius = playerRadius + AMMO_PICKUP_RADIUS;
    
    if (distanceSquared < combinedRadius * combinedRadius) {
      collectedPickups.push(pickup);
    }
  }
  
  return collectedPickups;
}

// Helper function to generate a random color in hex format
function getRandomColor() {
  // Generate vibrant colors by using higher values in RGB
  const r = Math.floor(Math.random() * 155) + 100; // 100-255
  const g = Math.floor(Math.random() * 155) + 100; // 100-255
  const b = Math.floor(Math.random() * 155) + 100; // 100-255
  return (r << 16) | (g << 8) | b;
}

// Add this function after other utility functions
function calculateVisibility(player, room) {
  // Constants for visibility
  const VISIBILITY_ANGLE = Math.PI * (120/180); // 120 degrees in radians
  const VISIBILITY_DISTANCE = 15; // Units of visibility in direction of sight
  const CLOSE_VISIBILITY_RADIUS = 3; // Units of visibility all around the player
  
  // Ensure player has a position and sight angle
  if (!player.position || player.sightAngle === undefined) return;
  
  // Helper function to check if an entity is visible to the player
  function isEntityVisible(entityPosition) {
    // Calculate distance between player and entity
    const dx = entityPosition.x - player.position.x;
    const dz = entityPosition.z - player.position.z;
    const distanceSquared = dx * dx + dz * dz;
    
    // Always visible if within close radius
    if (distanceSquared <= CLOSE_VISIBILITY_RADIUS * CLOSE_VISIBILITY_RADIUS) {
      return true;
    }
    
    // Check if within max visibility distance
    if (distanceSquared <= VISIBILITY_DISTANCE * VISIBILITY_DISTANCE) {
      // Calculate angle between player's sight direction and entity
      const angleToEntity = Math.atan2(dx, dz);
      
      // Get the difference between angles (normalize to [-PI, PI])
      let angleDiff = angleToEntity - player.sightAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      // Check if entity is within the visibility cone
      return Math.abs(angleDiff) <= VISIBILITY_ANGLE / 2;
    }
    
    return false;
  }
  
  // Check visibility for all other players
  for (const otherPlayerId in room.players) {
    if (otherPlayerId === player.id) continue; // Skip self
    
    const otherPlayer = room.players[otherPlayerId];
    
    // Initialize visibleTo array if needed
    if (!otherPlayer.visibleTo) otherPlayer.visibleTo = {};
    
    // Check if other player is visible to this player
    otherPlayer.visibleTo[player.id] = isEntityVisible(otherPlayer.position);
  }
  
  // Check visibility for all zombies
  for (const zombie of room.zombies) {
    // Initialize visibleTo array if needed
    if (!zombie.visibleTo) zombie.visibleTo = {};
    
    // Check if zombie is visible to this player
    zombie.visibleTo[player.id] = isEntityVisible(zombie.position);
  }
  
  // Check visibility for all ammo pickups
  for (const pickup of room.ammoPickups) {
    // Initialize visibleTo array if needed
    if (!pickup.visibleTo) pickup.visibleTo = {};
    
    // Check if pickup is visible to this player
    pickup.visibleTo[player.id] = isEntityVisible(pickup.position);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle player joining a room
  socket.on('joinRoom', (roomId, roomName) => {
    // Create room if it doesn't exist
    if (!roomId) {
      roomId = uuidv4();
      const generatedMap = generateMap();
      rooms[roomId] = {
        id: roomId, // Add id to room object for easier access
        players: {},
        projectiles: [],
        enemies: [],
        zombies: [], // Initialize zombies array
        roomName: roomName || `Game ${roomId.substring(0, 6)}`,
        map: generatedMap,
        mapSize: MAP_SIZE, // Store map size for boundary checks
        lastZombieUpdate: Date.now(), // Initialize timestamp for zombie movement calculations
        ammoPickups: createAmmoPickups(MAP_SIZE) // Initialize ammo pickups
      };
      
      // Initialize zombies for the new room
      zombieLogic.initializeZombiesForRoom(rooms[roomId], checkMapCollisions);
    } else if (!rooms[roomId]) {
      // Room doesn't exist anymore
      socket.emit('roomNotFound');
      return;
    }
    
    // Join the room
    socket.join(roomId);
    
    // Create player using playerLogic
    const player = playerLogic.createPlayer(socket.id);
    
    // Initialize visibility for existing entities in the room
    if (rooms[roomId].zombies) {
      for (const zombie of rooms[roomId].zombies) {
        if (!zombie.visibleTo) zombie.visibleTo = {};
      }
    }
    
    if (rooms[roomId].ammoPickups) {
      for (const pickup of rooms[roomId].ammoPickups) {
        if (!pickup.visibleTo) pickup.visibleTo = {};
      }
    }
    
    rooms[roomId].players[socket.id] = player;
    
    // Send current room state to the new player
    socket.emit('gameState', rooms[roomId]);
    
    // Also explicitly send initial ammo state
    socket.emit('ammoUpdate', { 
      ammo: player.ammo, 
      weapon: player.weapon 
    });
    
    // Notify other players about the new player
    socket.to(roomId).emit('playerJoined', player);
    
    // Store room ID in socket for reference
    socket.roomId = roomId;
    
    console.log(`Player ${socket.id} joined room ${roomId}`);
    
    // Broadcast updated room list to all clients
    io.emit('roomsUpdated');
  });
  
  // Handle player movement
  socket.on('playerMove', (movement) => {
    if (!socket.roomId || !rooms[socket.roomId] || !rooms[socket.roomId].players[socket.id]) return;
    
    const room = rooms[socket.roomId];
    const player = room.players[socket.id];
    
    // Use playerLogic to handle movement
    playerLogic.handlePlayerMovement(
      player, 
      movement, 
      checkMapCollisions, 
      room.map, 
      isWithinMapBoundaries, 
      clampToMapBoundaries
    );
    
    // Check for ammo pickup collisions
    const collectedPickups = checkAmmoPickupCollisions(player, room.ammoPickups);
    
    if (collectedPickups.length > 0) {
      for (const pickup of collectedPickups) {
        // Add ammo to player without cap
        player.ammo += AMMO_PICKUP_AMOUNT;
        
        // Notify player about ammo update
        socket.emit('ammoUpdate', {
          ammo: player.ammo,
          weapon: player.weapon
        });
        
        // Remove collected pickup
        room.ammoPickups = room.ammoPickups.filter(p => p.id !== pickup.id);
        
        // Create a new pickup
        room.ammoPickups.push(generateRandomAmmoPickup(room.mapSize));
        
        // Notify all clients about the collected pickup and new pickup
        io.to(socket.roomId).emit('ammoPickupCollected', {
          id: pickup.id,
          playerId: socket.id,
          newAmmo: player.ammo
        });
        
        // Send updated pickups to all clients
        io.to(socket.roomId).emit('ammoPickupsUpdate', room.ammoPickups);
      }
    }

    // Send corrected position back to the client who moved
    socket.emit('playerPositionCorrection', {
      position: player.position,
      moving: player.moving
    });
    
    // Broadcast movement to other players
    socket.to(socket.roomId).emit('playerMoved', {
      id: socket.id,
      position: player.position,
      rotation: player.rotation,
      moving: player.moving
    });
  });
  
  // Handle player sight direction
  socket.on('playerSight', (data) => {
    if (!socket.roomId || !rooms[socket.roomId] || !rooms[socket.roomId].players[socket.id]) return;
    
    // Update player sight direction
    const room = rooms[socket.roomId];
    const player = room.players[socket.id];
    player.sightAngle = data.angle;
    
    // Broadcast sight direction to other players
    socket.to(socket.roomId).emit('playerSightUpdated', {
      id: socket.id,
      angle: data.angle
    });
  });
  
  // Handle shooting
  socket.on('shoot', (data) => {
    if (!socket.roomId || !rooms[socket.roomId]) return;
    
    const room = rooms[socket.roomId];
    const player = room.players[socket.id];
    
    if (!player) {
      console.log('Player not found for shooting event');
      return;
    }
    
    // IMPORTANT: Check if player has ammo - if zero, block shooting completely
    if (typeof player.ammo !== 'number' || player.ammo <= 0) {
      console.log(`BLOCKED: Player ${socket.id} attempted to shoot with ${player.ammo} ammo`);
      socket.emit('noAmmo', { weapon: player.weapon });
      return;
    }
    
    console.log(`Shoot attempt from player ${socket.id}. Current ammo: ${player.ammo}`);
    
    // Consume ammo FIRST before creating projectile
    player.ammo -= 1;
    console.log(`Player ${player.id} ammo reduced to: ${player.ammo}`);
    
    // Create projectile using weaponLogic
    const projectile = weaponLogic.createProjectile(socket.id, data.position, data.direction);
    
    // Add projectile to room state
    room.projectiles.push(projectile);
    
    // Broadcast new projectile to all players in the room
    io.to(socket.roomId).emit('projectileCreated', projectile);
    
    // Update the player about their current ammo
    socket.emit('ammoUpdate', { 
      ammo: player.ammo, 
      weapon: player.weapon 
    });
  });
  
  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.roomId && rooms[socket.roomId]) {
      // Remove player from room state
      delete rooms[socket.roomId].players[socket.id];
      
      // Notify other players about the disconnected player
      socket.to(socket.roomId).emit('playerLeft', socket.id);
      
      // Clean up empty rooms
      if (Object.keys(rooms[socket.roomId].players).length === 0) {
        delete rooms[socket.roomId];
        console.log(`Room ${socket.roomId} was deleted (empty)`);
      }
      
      // Broadcast updated room list to all clients
      io.emit('roomsUpdated');
    }
  });

  // Update the code where handleZombieHit is called
  // Find the section handling projectile hits on zombies, likely in a socket event handler:

  socket.on('projectileHit', (data) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    
    weaponLogic.handleProjectileHit(data, room, io, zombieLogic, checkMapCollisions);
  });
});

// Game loop (runs at 60 FPS)
const TICK_RATE = 1000 / 60;
setInterval(() => {
  // Start measuring loop execution time
  const loopStartTime = performance.now();
  
  // Update each room
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Set room ID for weaponLogic to use when emitting socket events
    room.id = roomId;
    
    // Update projectiles using weaponLogic - pass zombieLogic and checkMapCollisions
    weaponLogic.updateProjectiles(room, io, zombieLogic, checkMapCollisions);
    
    // Calculate visibility for each player before sending game state updates
    for (const playerId in room.players) {
      calculateVisibility(room.players[playerId], room);
    }
    
    // Send updated game state to all players in the room (less frequently)
    if (Math.random() < 0.1) { // 10% chance, so roughly 6 times per second
      // For each player, send a personalized game state with only visible entities
      for (const playerId in room.players) {
        // Create player-specific filtered view of the game state
        const cleanState = {
          players: Object.fromEntries(
            Object.entries(room.players)
              .filter(([id, otherPlayer]) => {
                // Always include the player themselves
                if (id === playerId) return true;
                
                // Only include other players if visible to this player
                return otherPlayer.visibleTo && otherPlayer.visibleTo[playerId];
              })
              .map(([id, player]) => [
                id,
                {
                  ...player,
                  // Explicitly ensure moving is a boolean
                  moving: player.moving === true,
                  // Explicitly include weapon and ammo properties
                  weapon: player.weapon,
                  ammo: player.ammo
                }
              ])
          ),
          projectiles: room.projectiles, // Projectiles are always visible
          zombies: room.zombies.filter(zombie => zombie.visibleTo && zombie.visibleTo[playerId]),
          ammoPickups: room.ammoPickups.filter(pickup => pickup.visibleTo && pickup.visibleTo[playerId])
        };
        
        // Send personalized state update to this player
        io.to(playerId).emit('gameStateUpdate', cleanState);
      }
    }
  }
  
  // End measuring loop execution time
  const loopEndTime = performance.now();
  const loopExecutionTime = loopEndTime - loopStartTime;
  
  // Store this loop's execution time
  performanceMetrics.lastSecondLoopTimes.push(loopExecutionTime);
  
  // Update max time if this loop was slower
  if (loopExecutionTime > performanceMetrics.maxLoopTime) {
    performanceMetrics.maxLoopTime = loopExecutionTime;
  }
  
  // Send performance metrics to clients once per second
  const now = Date.now();
  if (now - performanceMetrics.lastReportTime >= 1000) {
    // Calculate max execution time from stored values
    const maxTime = performanceMetrics.maxLoopTime;
    
    // Send to all connected clients
    io.emit('serverPerformance', {
      maxLoopTime: maxTime.toFixed(2)
    });
    
    // Reset tracking for next second
    performanceMetrics.lastSecondLoopTimes = [];
    performanceMetrics.maxLoopTime = 0;
    performanceMetrics.lastReportTime = now;
  }
}, TICK_RATE);

// Separate interval for updating zombie AI and movement (slower than main game loop)
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    room.id = roomId; // Ensure room id is set for the zombie logic
    
    // Update zombies for this room
    zombieLogic.updateZombies(room, io, isWithinMapBoundaries, clampToMapBoundaries, checkMapCollisions);
    
    // Calculate visibility for each player
    for (const playerId in room.players) {
      calculateVisibility(room.players[playerId], room);
    }
    
    // Send personalized zombie updates to each player
    for (const playerId in room.players) {
      const visibleZombies = room.zombies.filter(zombie => 
        zombie.visibleTo && zombie.visibleTo[playerId]);
      
      // Only send update if there are visible zombies
      if (visibleZombies.length > 0) {
        io.to(playerId).emit('zombiesUpdate', visibleZombies);
      }
    }
  }
}, zombieLogic.ZOMBIE_UPDATE_INTERVAL);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});