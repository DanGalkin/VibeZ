// Player logic module for zVibe game

// Constants for the player
const PLAYER_SPEED = 5.0; // Units per second (server-controlled speed)
const DEFAULT_AMMO_AMOUNT = 7; // Default ammo count for pistol

/**
 * Helper function to generate a random color in hex format
 * @returns {number} A color in hex format
 */
function getRandomColor() {
  // Generate vibrant colors by using higher values in RGB
  const r = Math.floor(Math.random() * 155) + 100; // 100-255
  const g = Math.floor(Math.random() * 155) + 100; // 100-255
  const b = Math.floor(Math.random() * 155) + 100; // 100-255
  return (r << 16) | (g << 8) | b;
}

/**
 * Generates a spawn position at the edge of the map
 * @param {number} mapSize - The half-width/height of the map
 * @returns {Object} Position object with x, y, z coordinates
 */
function generateEdgeSpawnPosition(mapSize = 50) {
  // Set a smaller edge margin to ensure players spawn closer to the edge
  const edgeMargin = 2;
  
  // Always spawn at edge (forced spawn at edges)
  const edge = Math.floor(Math.random() * 4);
  let position = { x: 0, y: 0, z: 0 };
  
  // Fixed spawn positions at edges
  switch (edge) {
    case 0: // Top edge
      position.x = (Math.random() * 2 - 1) * mapSize;
      position.z = -mapSize + edgeMargin;
      break;
    case 1: // Right edge
      position.x = mapSize - edgeMargin;
      position.z = (Math.random() * 2 - 1) * mapSize;
      break;
    case 2: // Bottom edge
      position.x = (Math.random() * 2 - 1) * mapSize;
      position.z = mapSize - edgeMargin;
      break;
    case 3: // Left edge
      position.x = -mapSize + edgeMargin;
      position.z = (Math.random() * 2 - 1) * mapSize;
      break;
  }

  // Keep y position at ground level
  position.y = 0;
  
  // Force position to be exactly at edge
  if (Math.abs(position.x) > mapSize - edgeMargin) {
    position.x = Math.sign(position.x) * (mapSize - edgeMargin);
  }
  if (Math.abs(position.z) > mapSize - edgeMargin) {
    position.z = Math.sign(position.z) * (mapSize - edgeMargin);
  }

  return position;
}

/**
 * Creates a new player object
 * @param {string} socketId - The socket ID of the player
 * @param {number} mapSize - The half-width/height of the map
 * @returns {Object} A new player object
 */
function createPlayer(socketId, mapSize = 50) {
  const spawnPosition =  { x: 0, y: 0, z: 0 } //generateSpawnPosition(mapSize);
  console.log(`Creating a player at: ${JSON.stringify(spawnPosition)}`);
  return {
    id: socketId,
    position: spawnPosition,
    rotation: 0,
    sightAngle: 0,
    moving: false,
    health: 100,
    color: getRandomColor(),
    speed: PLAYER_SPEED,
    lastUpdateTime: Date.now(),
    weapon: 'pistol', // Default weapon
    ammo: DEFAULT_AMMO_AMOUNT // Default ammo count for pistol
  };
}

/**
 * Handles player movement based on client input
 * @param {Object} player - The player object
 * @param {Object} movement - Movement data from client
 * @param {Function} checkMapCollisions - Collision detection function
 * @param {Object} map - The game map
 * @param {Function} isWithinMapBoundaries - Function to check map boundaries
 * @param {Function} clampToMapBoundaries - Function to restrict position to map boundaries
 * @returns {Object} Updated player position
 */
function handlePlayerMovement(player, movement, checkMapCollisions, map, isWithinMapBoundaries, clampToMapBoundaries) {
  const prevPosition = { ...player.position };
  
  // Calculate movement based on time elapsed
  const currentTime = Date.now();
  const deltaTime = (currentTime - player.lastUpdateTime) / 1000; // Convert ms to seconds
  player.lastUpdateTime = currentTime;
  
  // Cap delta time to prevent teleporting after connection issues
  const cappedDeltaTime = Math.min(deltaTime, 0.2);
  
  if (movement.moving && movement.direction) {
    // Normalize direction vector
    const length = Math.sqrt(movement.direction.x * movement.direction.x + movement.direction.z * movement.direction.z);
    if (length > 0) {
      const normalizedDir = {
        x: movement.direction.x / length,
        z: movement.direction.z / length
      };
      
      // Calculate new position based on direction and speed
      const newX = player.position.x + normalizedDir.x * player.speed * cappedDeltaTime;
      const newZ = player.position.z + normalizedDir.z * player.speed * cappedDeltaTime;
      
      // Update player position with server-calculated values
      player.position = {
        x: newX,
        y: player.position.y,
        z: newZ
      };
    }
  }
  
  // Update player rotation from client input
  player.rotation = movement.rotation;
  player.moving = movement.moving === true; // Force to boolean
  
  // Check collisions
  const collisionResult = checkMapCollisions(player, map, null);
  
  if (collisionResult.collision) {
    // Collision detected, use corrected position from collision response
    player.position = collisionResult.position;
  }
  
  // Double-check to make sure player is within map boundaries
  if (!isWithinMapBoundaries(player.position)) {
    player.position = clampToMapBoundaries(player.position);
  }
  
  return player.position;
}

/**
 * Handle damage to a player and check for death
 * @param {Object} player - The player that was hit
 * @param {Object} room - The game room the player is in
 * @param {Object} io - Socket.io instance for emitting events
 * @param {number} damage - Amount of damage to deal (default: 10)
 * @param {string} [sourceType] - Source of damage ("zombie", "player", "projectile")
 * @param {string} [sourceId] - ID of the entity that caused the damage
 * @returns {boolean} - Returns true if player died
 */
function handlePlayerHit(player, room, io, damage = 10, sourceType = null, sourceId = null) {
  player.health -= damage;
  const isDead = player.health <= 0;

  const hitData = {
    playerId: player.id,
    health: player.health,
    sourceType,
    sourceId,
    isDead
  };

  io.to(room.id).emit('playerHit', hitData);

  if (isDead) {
    player.health = 0;
    player.state = 'dead';
    player.deathTime = Date.now();

    io.to(room.id).emit('playerDeath', {
      playerId: player.id,
      position: player.position,
      state: player.state,
    });

    schedulePlayerRespawn(player, room, io);
    return true;
  }

  return false;
}

/**
 * Schedule player respawn after death
 * @param {Object} player - The player to respawn
 * @param {Object} room - The game room
 * @param {Object} io - Socket.io instance
 * @param {number} delay - Respawn delay in ms (default: 5000)
 */
function schedulePlayerRespawn(player, room, io, delay = 5000) {
  setTimeout(() => {
    if (!room || !room.players[player.id]) return;

    player.health = 100;
    player.state = 'alive';
    player.position = generateEdgeSpawnPosition(room.mapSize);
    player.ammo = DEFAULT_AMMO_AMOUNT; // Reset ammo to default value

    io.to(player.id).emit('playerRespawn', {
      health: player.health,
      position: player.position,
      ammo: player.ammo,
      state: player.state,
    });

    io.to(room.id).emit('playerRespawned', {
      playerId: player.id,
      position: player.position
    });
  }, delay);
}

/**
 * Find a safe position to spawn player away from zombies and other players
 * @param {Object} room - The game room
 * @returns {Object} - Safe spawn position {x, y, z}
 */
function findSafeSpawnPosition(room) {
  const mapSize = room.map.size || 50;
  const MIN_ZOMBIE_DISTANCE = 15;
  const MIN_PLAYER_DISTANCE = 10;

  for (let attempt = 0; attempt < 50; attempt++) {
    const position = {
      x: (Math.random() * 1.8 - 0.9) * mapSize,
      y: 0,
      z: (Math.random() * 1.8 - 0.9) * mapSize
    };

    let tooCloseToZombie = room.zombies.some(zombie => {
      const dx = position.x - zombie.position.x;
      const dz = position.z - zombie.position.z;
      return dx * dx + dz * dz < MIN_ZOMBIE_DISTANCE * MIN_ZOMBIE_DISTANCE;
    });

    if (tooCloseToZombie) continue;

    let tooCloseToPlayer = Object.values(room.players).some(otherPlayer => {
      if (otherPlayer.state === 'dead') return false;
      const dx = position.x - otherPlayer.position.x;
      const dz = position.z - otherPlayer.position.z;
      return dx * dx + dz * dz < MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE;
    });

    if (tooCloseToPlayer) continue;

    const collisionResult = room.checkMapCollisions({ position, radius: 0.5 }, room.map);
    if (collisionResult.collision) continue;

    return position;
  }

  return { x: 0, y: 0, z: 0 };
}

module.exports = {
  PLAYER_SPEED,
  getRandomColor,
  createPlayer,
  generateEdgeSpawnPosition, // Export the new function
  handlePlayerMovement,
  handlePlayerHit,
  schedulePlayerRespawn,
  findSafeSpawnPosition
};
