// Player logic module for zVibe game

// Constants for the player
const PLAYER_SPEED = 5.0; // Units per second (server-controlled speed)

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
 * Creates a new player object
 * @param {string} socketId - The socket ID of the player
 * @returns {Object} A new player object
 */
function createPlayer(socketId) {
  return {
    id: socketId,
    position: { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5 },
    rotation: 0,
    sightAngle: 0,
    moving: false,
    health: 100,
    color: getRandomColor(),
    speed: PLAYER_SPEED,
    lastUpdateTime: Date.now(),
    weapon: 'pistol', // Default weapon
    ammo: 7 // Default ammo count for pistol
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

module.exports = {
  PLAYER_SPEED,
  getRandomColor,
  createPlayer,
  handlePlayerMovement
};
