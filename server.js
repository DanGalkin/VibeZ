const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import the map generation module
const { generateMap, MAP_ELEMENT_TYPES } = require('./generateMap');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// Constants for zombie enemies
const MAX_ZOMBIES = 100;
const ZOMBIE_SPEED = 0.08;
const ZOMBIE_DAMAGE = 5;
const ZOMBIE_HEALTH = 30;
const ZOMBIE_UPDATE_INTERVAL = 100; // ms - how often to update zombie positions
const ZOMBIE_ATTACK_RANGE = 1.2;
const ZOMBIE_DETECTION_RANGE = 15;
const ZOMBIE_COLLISION_RADIUS = 0.4;

// Function to create a new zombie enemy (with map size constraint)
function createZombie(mapSize = MAP_SIZE) {
  return {
    id: uuidv4(),
    position: {
      // Random position within the map (slightly inset from edges)
      x: (Math.random() * 1.9 - 0.95) * mapSize,
      y: 0,
      z: (Math.random() * 1.9 - 0.95) * mapSize
    },
    rotation: Math.random() * Math.PI * 2,
    health: ZOMBIE_HEALTH,
    target: null, // Current player target
    state: 'idle', // idle, chasing, attacking
    lastAttack: 0,
    speed: ZOMBIE_SPEED
  };
}

// Function to check collisions between zombies and map elements
function checkZombieMapCollisions(zombie, map) {
  return checkMapCollisions({
    position: zombie.position,
    radius: ZOMBIE_COLLISION_RADIUS
  }, map, null);
}

// Function to check collisions between zombies and players
function checkZombiePlayerCollision(zombie, player) {
  const dx = zombie.position.x - player.position.x;
  const dz = zombie.position.z - player.position.z;
  const distanceSquared = dx * dx + dz * dz;
  const collisionDistance = ZOMBIE_COLLISION_RADIUS + 0.5; // player radius
  
  return distanceSquared < (collisionDistance * collisionDistance);
}

// Function to check collisions between zombies and other zombies
function checkZombieZombieCollision(zombie1, zombie2) {
  const dx = zombie1.position.x - zombie2.position.x;
  const dz = zombie1.position.z - zombie2.position.z;
  const distanceSquared = dx * dx + dz * dz;
  const collisionDistance = ZOMBIE_COLLISION_RADIUS * 2;
  
  return distanceSquared < (collisionDistance * collisionDistance);
}

// Find the closest player to a zombie
function findClosestPlayer(zombie, players) {
  let closestPlayer = null;
  let minDistance = ZOMBIE_DETECTION_RANGE;
  
  for (const playerId in players) {
    const player = players[playerId];
    const dx = zombie.position.x - player.position.x;
    const dz = zombie.position.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPlayer = player;
    }
  }
  
  return closestPlayer;
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
        players: {},
        projectiles: [],
        enemies: [],
        zombies: [], // Add zombies array
        roomName: roomName || `Game ${roomId.substring(0, 6)}`,
        map: generatedMap,
        mapSize: MAP_SIZE // Store map size for boundary checks
      };
      
      // Generate zombies for the new room
      for (let i = 0; i < MAX_ZOMBIES; i++) {
        const zombie = createZombie(generatedMap.size || 50);
        
        // Check for collisions with map elements and reposition if needed
        const collisionResult = checkZombieMapCollisions(zombie, rooms[roomId].map);
        if (collisionResult.collision) {
          // Try a different position if collision detected
          i--; // Retry
          continue;
        }
        
        // Add zombie to room
        rooms[roomId].zombies.push(zombie);
      }
    } else if (!rooms[roomId]) {
      // Room doesn't exist anymore
      socket.emit('roomNotFound');
      return;
    }
    
    // Join the room
    socket.join(roomId);
    
    // Add player to room state
    const player = {
      id: socket.id,
      position: { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5 },
      rotation: 0,
      sightAngle: 0, // Add initial sight angle
      moving: false, // Explicitly set as not moving initially
      health: 100
    };
    
    rooms[roomId].players[socket.id] = player;
    
    // Send current room state to the new player
    socket.emit('gameState', rooms[roomId]);
    
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
    
    // Update player position
    const room = rooms[socket.roomId];
    const player = room.players[socket.id];
    const prevPosition = { ...player.position };
    
    // Update position temporarily for collision check
    player.position = movement.position;
    
    // Check collisions with improved function
    const collisionResult = checkMapCollisions(player, room.map, movement);
    
    if (collisionResult.collision) {
      // Collision detected, use corrected position from collision response
      player.position = collisionResult.position;
      
      // Tell client about corrected position
      socket.emit('playerCollision', { position: player.position });
    }
    
    // Double-check to make sure player is within map boundaries
    if (!isWithinMapBoundaries(player.position)) {
      player.position = clampToMapBoundaries(player.position);
      socket.emit('playerCollision', { position: player.position });
    }
    
    // Update player rotation and movement status
    player.rotation = movement.rotation;
    player.moving = movement.moving === true; // Force to boolean
    
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
    
    // Create projectile using player's position and direction data
    const projectileId = uuidv4();
    const projectile = {
      id: projectileId,
      ownerId: socket.id,
      position: data.position,
      direction: data.direction,
      speed: 0.5 // Adjust as needed
    };
    
    // Add projectile to room state
    room.projectiles.push(projectile);
    
    // Broadcast new projectile to all players in the room
    io.to(socket.roomId).emit('projectileCreated', projectile);
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
});

// Game loop (runs at 60 FPS)
const TICK_RATE = 1000 / 60;
setInterval(() => {
  // Update each room
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Update projectiles
    for (let i = room.projectiles.length - 1; i >= 0; i--) {
      const projectile = room.projectiles[i];
      
      // Move projectile
      projectile.position.x += projectile.direction.x * projectile.speed;
      projectile.position.z += projectile.direction.z * projectile.speed;
      
      // Check for collisions with players
      let hitPlayer = false;
      for (const playerId in room.players) {
        // Skip the owner of the projectile
        if (playerId === projectile.ownerId) continue;
        
        const player = room.players[playerId];
        
        // Simple distance-based collision check
        const dx = player.position.x - projectile.position.x;
        const dz = player.position.z - projectile.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 1) { // Adjust collision radius as needed
          // Player hit!
          player.health -= 10; // Adjust damage as needed
          
          // Notify players about the hit
          io.to(roomId).emit('playerHit', {
            playerId: playerId,
            health: player.health
          });
          
          // Remove projectile
          room.projectiles.splice(i, 1);
          io.to(roomId).emit('projectileDestroyed', projectile.id);
          
          hitPlayer = true;
          break;
        }
      }
      
      // Check for collisions with zombies if no player was hit
      if (!hitPlayer) {
        for (let j = 0; j < room.zombies.length; j++) {
          const zombie = room.zombies[j];
          
          // Distance-based collision check
          const dx = zombie.position.x - projectile.position.x;
          const dz = zombie.position.z - projectile.position.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          
          if (distance < ZOMBIE_COLLISION_RADIUS) {
            // Zombie hit!
            zombie.health -= 10;
            
            // Check if zombie died
            if (zombie.health <= 0) {
              // Remove zombie
              const deadZombieId = zombie.id;
              room.zombies.splice(j, 1);
              // Notify players about zombie death
              io.to(roomId).emit('zombieDestroyed', deadZombieId);
              
              // Spawn a new zombie after some delay
              setTimeout(() => {
                if (rooms[roomId]) { // Make sure room still exists
                  const newZombie = createZombie(room.map.size || 50);
                  room.zombies.push(newZombie);
                  io.to(roomId).emit('zombieCreated', newZombie);
                }
              }, 5000);
            } else {
              // Just notify about zombie being hit
              io.to(roomId).emit('zombieHit', {
                id: zombie.id,
                health: zombie.health
              });
            }
            
            // Remove projectile
            room.projectiles.splice(i, 1);
            io.to(roomId).emit('projectileDestroyed', projectile.id);
            hitPlayer = true; // Use as "hit something" flag
            break;
          }
        }
      }
      
      // Remove projectiles that have traveled too far
      if (!hitPlayer) {
        const distanceTraveled = Math.sqrt(
          Math.pow(projectile.position.x, 2) + 
          Math.pow(projectile.position.z, 2)
        );
        
        if (distanceTraveled > 50) { // Adjust max distance as needed
          room.projectiles.splice(i, 1);
          io.to(roomId).emit('projectileDestroyed', projectile.id);
        }
      }
    }
    
    // Send updated game state to all players in the room (less frequently)
    if (Math.random() < 0.1) { // 10% chance, so roughly 6 times per second
      // Make sure all player state properties are properly included
      const cleanState = {
        players: Object.fromEntries(
          Object.entries(room.players).map(([id, player]) => [
            id,
            {
              ...player,
              // Explicitly ensure moving is a boolean
              moving: player.moving === true
            }
          ])
        ),
        projectiles: room.projectiles,
        zombies: room.zombies
      };
      
      io.to(roomId).emit('gameStateUpdate', cleanState);
    }
  }
}, TICK_RATE);

// Separate interval for updating zombie AI and movement (slower than main game loop)
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Skip rooms with no players
    if (Object.keys(room.players).length === 0) continue;
    
    // Update each zombie
    for (let i = 0; i < room.zombies.length; i++) {
      const zombie = room.zombies[i];
      
      // Find closest player
      const targetPlayer = findClosestPlayer(zombie, room.players);
      
      if (targetPlayer) {
        // We have a target - move zombie towards player
        zombie.target = targetPlayer.id;
        zombie.state = 'chasing';
        
        // Calculate direction vector
        const dx = targetPlayer.position.x - zombie.position.x;
        const dz = targetPlayer.position.z - zombie.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Update zombie rotation to face player
        zombie.rotation = Math.atan2(dx, dz);
        
        // Check if close enough to attack
        if (distance < ZOMBIE_ATTACK_RANGE) {
          zombie.state = 'attacking';
          
          // Attack player every second
          const now = Date.now();
          if (now - zombie.lastAttack > 1000) { // 1 second cooldown
            zombie.lastAttack = now;
            
            // Deal damage to player
            targetPlayer.health -= ZOMBIE_DAMAGE;
            
            // Notify players about the hit
            io.to(roomId).emit('playerHit', {
              playerId: targetPlayer.id,
              health: targetPlayer.health
            });
          }
        } else if (distance < ZOMBIE_DETECTION_RANGE) {
          // Move towards player
          const moveSpeed = zombie.speed;
          const normalizedX = dx / distance;
          const normalizedZ = dz / distance;
          
          // Store previous position
          const prevPosition = { ...zombie.position };
          
          // Update position
          zombie.position.x += normalizedX * moveSpeed;
          zombie.position.z += normalizedZ * moveSpeed;
          
          // Check map boundaries
          if (!isWithinMapBoundaries(zombie.position)) {
            zombie.position = clampToMapBoundaries(zombie.position);
          }
          
          // Check for collisions with map elements
          const collisionResult = checkZombieMapCollisions(zombie, room.map);
          if (collisionResult.collision) {
            // Use adjusted position from collision response
            zombie.position = collisionResult.position;
          }
          
          // Check for collisions with players
          let playerCollision = false;
          for (const playerId in room.players) {
            if (checkZombiePlayerCollision(zombie, room.players[playerId])) {
              playerCollision = true;
              break;
            }
          }
          
          // Check for collisions with other zombies
          let zombieCollision = false;
          for (let j = 0; j < room.zombies.length; j++) {
            if (i !== j && checkZombieZombieCollision(zombie, room.zombies[j])) {
              zombieCollision = true;
              break;
            }
          }
          
          // If collision detected with players or zombies, revert to previous position
          if (playerCollision || zombieCollision) {
            zombie.position = prevPosition;
          }
        }
      } else {
        // No players in range - idle behavior
        zombie.state = 'idle';
        zombie.target = null;
        
        // Occasionally change rotation when idle
        if (Math.random() < 0.02) { // 2% chance each update
          zombie.rotation = Math.random() * Math.PI * 2;
        }
      }
    }
    
    // Broadcast zombie updates to clients (if there are changes)
    io.to(roomId).emit('zombiesUpdate', room.zombies);
  }
}, ZOMBIE_UPDATE_INTERVAL);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});