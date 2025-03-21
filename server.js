const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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

// Map element types
const MAP_ELEMENT_TYPES = {
  BUILDING: 'building',
  ROAD: 'road',
  WALL: 'wall',
  TREE: 'tree'
};

// Generate a map for a new room
function generateMap(mapSize = 100) {
  const map = {
    size: mapSize,
    buildings: [],
    roads: [],
    walls: [],
    trees: []
  };

  // Generate buildings
  const buildingCount = Math.floor(Math.random() * 5) + 3;
  for (let i = 0; i < buildingCount; i++) {
    const width = Math.floor(Math.random() * 10) + 5;
    const height = Math.floor(Math.random() * 10) + 5;
    const depth = Math.floor(Math.random() * 10) + 5;
    let x, z;
    do {
      x = Math.random() * (mapSize - width) - mapSize / 2 + width / 2;
      z = Math.random() * (mapSize - depth) - mapSize / 2 + depth / 2;
    } while (Math.abs(x) < 15 && Math.abs(z) < 15);
    map.buildings.push({
      id: `building-${i}`,
      type: MAP_ELEMENT_TYPES.BUILDING,
      position: { x, y: height / 2, z },
      dimensions: { width, height, depth },
      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    });
  }

  // Generate roads
  map.roads.push({
    id: 'road-x',
    type: MAP_ELEMENT_TYPES.ROAD,
    points: [
      { x: -mapSize / 2, y: 0.1, z: 0 },
      { x: mapSize / 2, y: 0.1, z: 0 }
    ],
    width: 5
  });
  map.roads.push({
    id: 'road-z',
    type: MAP_ELEMENT_TYPES.ROAD,
    points: [
      { x: 0, y: 0.1, z: -mapSize / 2 },
      { x: 0, y: 0.1, z: mapSize / 2 }
    ],
    width: 5
  });

  // Generate walls
  const wallCount = Math.floor(Math.random() * 8) + 4;
  for (let i = 0; i < wallCount; i++) {
    const length = Math.floor(Math.random() * 15) + 5;
    const height = Math.floor(Math.random() * 3) + 1;
    const x = Math.random() * mapSize - mapSize / 2;
    const z = Math.random() * mapSize - mapSize / 2;
    const rotation = Math.floor(Math.random() * 4) * Math.PI / 2;
    map.walls.push({
      id: `wall-${i}`,
      type: MAP_ELEMENT_TYPES.WALL,
      position: { x, y: height / 2, z },
      dimensions: { length, height, width: 1 },
      rotation
    });
  }

  // Generate trees
  const treeCount = Math.floor(Math.random() * 15) + 10;
  for (let i = 0; i < treeCount; i++) {
    const height = Math.floor(Math.random() * 4) + 3;
    const radius = Math.random() + 0.5;
    let x, z;
    do {
      x = Math.random() * mapSize - mapSize / 2;
      z = Math.random() * mapSize - mapSize / 2;
    } while (Math.abs(x) < 10 && Math.abs(z) < 10);
    map.trees.push({
      id: `tree-${i}`,
      type: MAP_ELEMENT_TYPES.TREE,
      position: { x, y: height / 2, z },
      dimensions: { height, radius }
    });
  }

  return map;
}

// Check collision between player and map elements
function checkMapCollisions(player, map) {
  for (const building of map.buildings) {
    const halfWidth = building.dimensions.width / 2;
    const halfDepth = building.dimensions.depth / 2;
    if (player.position.x > building.position.x - halfWidth &&
        player.position.x < building.position.x + halfWidth &&
        player.position.z > building.position.z - halfDepth &&
        player.position.z < building.position.z + halfDepth) {
      return true;
    }
  }
  for (const wall of map.walls) {
    const halfLength = wall.dimensions.length / 2;
    const halfWidth = wall.dimensions.width / 2;
    const relX = player.position.x - wall.position.x;
    const relZ = player.position.z - wall.position.z;
    const cosA = Math.cos(-wall.rotation);
    const sinA = Math.sin(-wall.rotation);
    const rotX = relX * cosA - relZ * sinA;
    const rotZ = relX * sinA + relZ * cosA;
    if (rotX > -halfLength && rotX < halfLength &&
        rotZ > -halfWidth && rotZ < halfWidth) {
      return true;
    }
  }
  return false;
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
        map: generateMap()
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
    player.position = movement.position;
    if (checkMapCollisions(player, room.map)) {
      player.position = prevPosition;
      socket.emit('playerCollision', { position: prevPosition });
    } else {
      player.rotation = movement.rotation;
      socket.to(socket.roomId).emit('playerMoved', {
        id: socket.id,
        position: player.position,
        rotation: player.rotation
      });
    }
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