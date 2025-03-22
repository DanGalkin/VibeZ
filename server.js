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

// Check collision between player and map elements with improved detection
function checkMapCollisions(player, map, movement) {
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle player joining a room
  socket.on('joinRoom', (roomId, roomName) => {
    // Create room if it doesn't exist
    if (!roomId) {
      roomId = uuidv4();
      rooms[roomId] = {
        players: {},
        projectiles: [],
        enemies: [],
        roomName: roomName || `Game ${roomId.substring(0, 6)}`,
        map: generateMap() // Using imported map generation function
      };
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
    
    // Update player rotation
    player.rotation = movement.rotation;
    
    // Broadcast movement to other players
    socket.to(socket.roomId).emit('playerMoved', {
      id: socket.id,
      position: player.position,
      rotation: player.rotation
    });
  });
  
  // Handle shooting
  socket.on('shoot', (data) => {
    if (!socket.roomId || !rooms[socket.roomId]) return;
    
    const projectileId = uuidv4();
    const projectile = {
      id: projectileId,
      ownerId: socket.id,
      position: data.position,
      direction: data.direction,
      speed: 0.5 // Adjust as needed
    };
    
    // Add projectile to room state
    rooms[socket.roomId].projectiles.push(projectile);
    
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
      io.to(roomId).emit('gameStateUpdate', {
        players: room.players,
        projectiles: room.projectiles
      });
    }
  }
}, TICK_RATE);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});