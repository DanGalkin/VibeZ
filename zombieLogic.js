const { v4: uuidv4 } = require('uuid');

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
function createZombie(mapSize = 50) {
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
function checkZombieMapCollisions(zombie, map, checkMapCollisions) {
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

// Function to initialize zombies for a room
function initializeZombiesForRoom(room, checkMapCollisions) {
  room.zombies = []; // Initialize zombies array
  
  // Generate zombies for the room
  for (let i = 0; i < MAX_ZOMBIES; i++) {
    const zombie = createZombie(room.map.size || 50);
    
    // Check for collisions with map elements and reposition if needed
    const collisionResult = checkZombieMapCollisions(zombie, room.map, checkMapCollisions);
    if (collisionResult.collision) {
      // Try a different position if collision detected
      i--; // Retry
      continue;
    }
    
    // Add zombie to room
    room.zombies.push(zombie);
  }
  
  return room.zombies;
}

// Function to update zombies for a room
function updateZombies(room, io, isWithinMapBoundaries, clampToMapBoundaries, checkMapCollisions) {
  // Skip rooms with no players
  if (Object.keys(room.players).length === 0) return;
  
  // Update each zombie
  for (let i = 0; i < room.zombies.length; i++) {
    const zombie = room.zombies[i];
    const previousState = zombie.state;
    
    // Find closest player
    const targetPlayer = findClosestPlayer(zombie, room.players);
    
    if (targetPlayer) {
      // Calculate direction vector
      const dx = targetPlayer.position.x - zombie.position.x;
      const dz = targetPlayer.position.z - zombie.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Update zombie rotation to face player
      zombie.rotation = Math.atan2(dx, dz);
      
      // Check if close enough to attack
      if (distance < ZOMBIE_ATTACK_RANGE) {
        // We have a target - but we're in attack range so we stop to attack
        zombie.target = targetPlayer.id;
        zombie.state = 'attacking';
        
        // Attack player every second
        const now = Date.now();
        if (now - zombie.lastAttack > 1000) { // 1 second cooldown
          zombie.lastAttack = now;
          
          // Deal damage to player
          targetPlayer.health -= ZOMBIE_DAMAGE;
          
          // Notify players about the hit
          io.to(room.id).emit('playerHit', {
            playerId: targetPlayer.id,
            health: targetPlayer.health
          });
        }
      } else if (distance < ZOMBIE_DETECTION_RANGE) {
        // We are in range but not close enough to attack - chase the player
        zombie.target = targetPlayer.id;
        zombie.state = 'chasing';
        
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
        const collisionResult = checkZombieMapCollisions(zombie, room.map, checkMapCollisions);
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
      } else {
        // Target is too far away - go back to idle
        zombie.state = 'idle';
        zombie.target = null;
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
    
    // If state changed, ensure it gets sent to clients
    if (previousState !== zombie.state) {
      // State change gets sent automatically in zombiesUpdate broadcast
    }
  }
  
  // Return updated zombies
  return room.zombies;
}

// Function to handle projectile hits on zombies
function handleZombieHit(zombie, room, io, damage = 10) {
  zombie.health -= damage;
  
  // Check if zombie died
  if (zombie.health <= 0) {
    // Find zombie index
    const index = room.zombies.findIndex(z => z.id === zombie.id);
    
    if (index !== -1) {
      // Remove zombie
      const deadZombieId = zombie.id;
      room.zombies.splice(index, 1);
      
      // Notify players about zombie death
      io.to(room.id).emit('zombieDestroyed', deadZombieId);
      
      // Spawn a new zombie after some delay
      setTimeout(() => {
        if (room) { // Make sure room still exists
          const newZombie = createZombie(room.map.size || 50);
          room.zombies.push(newZombie);
          io.to(room.id).emit('zombieCreated', newZombie);
        }
      }, 5000);
      
      return true; // zombie was destroyed
    }
  } else {
    // Just notify about zombie being hit
    io.to(room.id).emit('zombieHit', {
      id: zombie.id,
      health: zombie.health
    });
    
    return false; // zombie was hit but not destroyed
  }
}

module.exports = {
  MAX_ZOMBIES,
  ZOMBIE_SPEED,
  ZOMBIE_DAMAGE,
  ZOMBIE_HEALTH,
  ZOMBIE_UPDATE_INTERVAL,
  ZOMBIE_ATTACK_RANGE,
  ZOMBIE_DETECTION_RANGE,
  ZOMBIE_COLLISION_RADIUS,
  createZombie,
  checkZombieMapCollisions,
  checkZombiePlayerCollision,
  checkZombieZombieCollision,
  findClosestPlayer,
  initializeZombiesForRoom,
  updateZombies,
  handleZombieHit
};
