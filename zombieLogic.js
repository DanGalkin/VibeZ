const { v4: uuidv4 } = require('uuid');

// Constants for zombie enemies
const MAX_ZOMBIES = 100;
const ZOMBIE_SPEED = 2.0; // Units per second - distance a zombie walks in one second
const ZOMBIE_DAMAGE = 5;
const ZOMBIE_HEALTH = 100;
const ZOMBIE_UPDATE_INTERVAL = 30; // ms - how often to update zombie positions
const ZOMBIE_ATTACK_RANGE = 1.2;
const ZOMBIE_DETECTION_RANGE = 15; // This is still used for when zombies know player is there
const ZOMBIE_SIGHT_RANGE = 10; // New constant for initial detection distance
const ZOMBIE_SIGHT_ANGLE = Math.PI / 2; // 90 degrees in radians (PI/2)
const ZOMBIE_AWARENESS_ANGLE = Math.PI; // 180 degrees in radians for hearing/awareness
const ZOMBIE_TURN_SPEED = 0.4; // Radians per second - how quickly zombies can turn
const ZOMBIE_COLLISION_RADIUS = 0.4;

// Constants for idle behavior
const IDLE_STATES = ['standing', 'turning', 'wandering'];
const IDLE_MIN_DURATION = 5000; // 5 seconds
const IDLE_MAX_DURATION = 10000; // 10 seconds
const IDLE_TURN_SPEED = 0.2; // radians per second
const IDLE_WALK_SPEED = 0.6; // units per second - slower than chase speed

// Function to create a new zombie enemy (with map size constraint)
function createZombie(mapSize = 50) {
  const idleState = IDLE_STATES[Math.floor(Math.random() * IDLE_STATES.length)];
  const idleDuration = IDLE_MIN_DURATION + Math.random() * (IDLE_MAX_DURATION - IDLE_MIN_DURATION);
  
  return {
    id: uuidv4(),
    position: {
      // Random position within the map (slightly inset from edges)
      x: (Math.random() * 1.9 - 0.95) * mapSize,
      y: -0.8, // Start below ground
      z: (Math.random() * 1.9 - 0.95) * mapSize
    },
    rotation: Math.random() * Math.PI * 2,
    health: ZOMBIE_HEALTH,
    target: null, // Current player target
    state: 'rising', // rising, idle, investigating, chasing, attacking, investigating_last_position
    risingStartTime: Date.now(), // Track when rising started
    risingDuration: 1000, // Rising animation lasts 1 second
    idleState: idleState, // standing, turning, wandering
    idleStateStartTime: Date.now(),
    idleStateDuration: idleDuration,
    lastAttack: 0,
    awarenessTarget: null, // For tracking a player in the wider 180-degree awareness range
    lastKnownPlayerPos: null, // Store last known position of a player that went out of sight
    investigationStartTime: null, // When the zombie started investigating a position
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

// Check if there's a clear line of sight between two positions
function hasLineOfSight(fromPosition, toPosition, map, checkMapCollisions) {
  // Direction vector from zombie to player
  const dx = toPosition.x - fromPosition.x;
  const dz = toPosition.z - fromPosition.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  // If they're very close, consider line of sight clear
  if (distance < 1.0) return true;
  
  // Normalize direction
  const dirX = dx / distance;
  const dirZ = dz / distance;
  
  // Number of steps to check (more steps = more precise but slower)
  const steps = Math.ceil(distance * 2); // Check twice per unit distance
  const stepSize = distance / steps;
  
  // Check points along the line
  for (let i = 1; i < steps; i++) {
    // Calculate test point (slightly above ground to avoid terrain issues)
    const testPoint = {
      position: {
        x: fromPosition.x + dirX * stepSize * i,
        y: 0.5, // Slightly above ground
        z: fromPosition.z + dirZ * stepSize * i
      },
      radius: 0.2 // Small radius for obstacle detection
    };
    
    // Check for collisions at this test point
    const collision = checkMapCollisions(testPoint, map);
    
    // If there's a collision, line of sight is blocked
    if (collision.collision) {
      return false;
    }
  }
  
  // If we got here, no obstacles were found
  return true;
}

// Find the closest player to a zombie based on field of view
function findClosestPlayer(zombie, players, map, checkMapCollisions) {
  let closestPlayer = null;
  let minDistance = Infinity;
  let investigatePlayer = null;
  let investigateDistance = Infinity;
  let lastKnownPosition = null;
  
  // First check if we have a last known position to investigate
  if (zombie.lastKnownPlayerPos && zombie.state === 'investigating_last_position') {
    // Calculate distance to last known position
    const dx = zombie.lastKnownPlayerPos.x - zombie.position.x;
    const dz = zombie.lastKnownPlayerPos.z - zombie.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // If we're close enough to the last known position, clear it
    if (distance < 1.0) {
      zombie.lastKnownPlayerPos = null;
      zombie.investigationStartTime = null;
      // Transition to idle state once we've reached the investigation point
      zombie.state = 'idle';
      return { player: null, type: null };
    } else {
      // Return the last known position as a special "player" for the zombie to move towards
      return { 
        player: { 
          position: zombie.lastKnownPlayerPos,
          id: 'last_position'
        }, 
        type: 'investigate_last_position' 
      };
    }
  }
  
  for (const playerId in players) {
    const player = players[playerId];
    const dx = player.position.x - zombie.position.x;
    const dz = player.position.z - zombie.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Is player already detected? Continue tracking if possible
    if (zombie.target === player.id && distance < ZOMBIE_DETECTION_RANGE) {
      // Check if we still have line of sight to the player
      const canSeePlayer = hasLineOfSight(zombie.position, player.position, map, checkMapCollisions);
      
      // If we have line of sight or player is very close, maintain tracking
      if (canSeePlayer || distance < ZOMBIE_ATTACK_RANGE * 1.5) {
        if (distance < minDistance) {
          minDistance = distance;
          closestPlayer = player;
        }
      } else {
        // Lost visual contact with player - remember last known position
        zombie.lastKnownPlayerPos = { ...player.position };
        zombie.investigationStartTime = Date.now();
        zombie.state = 'investigating_last_position';
        
        // Return immediately to start investigating
        return { 
          player: { 
            position: zombie.lastKnownPlayerPos,
            id: 'last_position'
          }, 
          type: 'investigate_last_position' 
        };
      }
      continue;
    }
    
    // Is player within attack range? Detect regardless of FOV
    if (distance < ZOMBIE_ATTACK_RANGE) {
      // Even at close range, check line of sight
      if (hasLineOfSight(zombie.position, player.position, map, checkMapCollisions)) {
        if (distance < minDistance) {
          minDistance = distance;
          closestPlayer = player;
        }
      }
      continue;
    }
    
    if (distance <= ZOMBIE_SIGHT_RANGE) {
      // Calculate angle between zombie's forward direction and direction to player
      const zombieForwardX = Math.sin(zombie.rotation);
      const zombieForwardZ = Math.cos(zombie.rotation);
      
      // Normalize the direction vector to the player
      const dirLength = Math.sqrt(dx * dx + dz * dz);
      const normalizedDirX = dx / dirLength;
      const normalizedDirZ = dz / dirLength;
      
      // Calculate dot product (gives cosine of angle between vectors)
      const dotProduct = zombieForwardX * normalizedDirX + zombieForwardZ * normalizedDirZ;
      
      // For direct sight - check within 90-degree cone of vision
      const cosHalfAngle = Math.cos(ZOMBIE_SIGHT_ANGLE / 2);
      
      if (dotProduct > cosHalfAngle) {
        // Check if there's a clear line of sight
        if (hasLineOfSight(zombie.position, player.position, map, checkMapCollisions)) {
          // Player is within zombie's field of vision, detection range, and line of sight
          if (distance < minDistance) {
            minDistance = distance;
            closestPlayer = player;
            // Clear investigating state if we can directly see the player
            investigatePlayer = null;
          }
        }
      }
      // For wider awareness (hearing/peripheral vision) - check 180-degree area
      else if (dotProduct > Math.cos(ZOMBIE_AWARENESS_ANGLE / 2)) {
        // For peripheral vision, also check line of sight
        if (hasLineOfSight(zombie.position, player.position, map, checkMapCollisions)) {
          // If no direct visual target yet, and this player is closest for investigation
          if (distance < investigateDistance) {
            investigateDistance = distance;
            investigatePlayer = player;
          }
        }
      }
    }
  }
  
  // If we found a player to directly chase, return them
  if (closestPlayer) {
    return { player: closestPlayer, type: 'chase' };
  }
  
  // If we lost track of our target, prioritize investigating the last known position
  if (lastKnownPosition && zombie.target) {
    return { 
      player: { 
        position: lastKnownPosition,
        id: 'last_position'
      }, 
      type: 'investigate_last_position' 
    };
  }
  
  // If we found a player to investigate, return them with the investigate type
  if (investigatePlayer) {
    return { player: investigatePlayer, type: 'investigate' };
  }
  
  // No player found
  return { player: null, type: null };
}

// Function to initialize zombies for a room
function initializeZombiesForRoom(room, checkMapCollisions) {
  // Store the collision function in the room for later use
  room.checkMapCollisions = checkMapCollisions;
  
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
  
  const now = Date.now();
  // Calculate delta time in seconds since last update
  const deltaTime = (now - (room.lastZombieUpdate || now)) / 1000;
  room.lastZombieUpdate = now; // Store current time for next update
  
  // Cap delta time to avoid big jumps if server had a lag spike
  const cappedDeltaTime = Math.min(deltaTime, 0.2);
  
  // Update each zombie
  for (let i = 0; i < room.zombies.length; i++) {
    const zombie = room.zombies[i];
    const previousState = zombie.state;
    const previousIdleState = zombie.idleState;
    
    // Handle rising animation
    if (zombie.state === 'rising') {
      const elapsedTime = now - zombie.risingStartTime;
      
      // Calculate Y position based on elapsed time
      const progress = Math.min(1.0, elapsedTime / zombie.risingDuration);
      zombie.position.y = -0.8 + progress * 0.8; // Rise from -0.8 to 0
      
      // If rising animation is complete, transition to idle state
      if (progress >= 1.0) {
        zombie.state = 'idle';
        zombie.position.y = 0; // Ensure position is exactly at ground level
      }
      
      // Skip other behavior processing during rising
      continue;
    }
    
    // Find closest player (now using FOV-based detection with line of sight)
    const { player: targetPlayer, type: detectionType } = findClosestPlayer(zombie, room.players, room.map, checkMapCollisions);
    
    if (targetPlayer) {
      // Calculate direction vector
      const dx = targetPlayer.position.x - zombie.position.x;
      const dz = targetPlayer.position.z - zombie.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Only update rotation to face target direction if chase or attack (NOT for investigate)
      if (detectionType === 'chase') {
        zombie.rotation = Math.atan2(dx, dz);
      }
      
      if (detectionType === 'chase') {
        // Remember we're chasing a real player
        zombie.target = targetPlayer.id;
        
        // Check if close enough to attack
        if (distance < ZOMBIE_ATTACK_RANGE) {
          // We have a target - but we're in attack range so we stop to attack
          zombie.target = targetPlayer.id;
          zombie.state = 'attacking';
          
          // Attack player every second
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
          zombie.state = 'chasing';
          zombie.awarenessTarget = null; // Clear any investigation target
          
          // Calculate movement distance based on speed and elapsed time
          const moveDistance = zombie.speed * cappedDeltaTime;
          const normalizedX = dx / distance;
          const normalizedZ = dz / distance;
          
          // Store previous position
          const prevPosition = { ...zombie.position };
          
          // Update position with time-based movement
          zombie.position.x += normalizedX * moveDistance;
          zombie.position.z += normalizedZ * moveDistance;
          
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
          zombie.awarenessTarget = null;
        }
      } else if (detectionType === 'investigate_last_position') {
        // We're investigating the last known position of a player we lost sight of
        zombie.state = 'investigating_last_position';
        
        // If we don't have an investigation start time, set one
        if (!zombie.investigationStartTime) {
          zombie.investigationStartTime = now;
          zombie.lastKnownPlayerPos = targetPlayer.position;
        }
        
        // Check if we've been investigating too long (10 seconds max)
        if (now - zombie.investigationStartTime > 10000) {
          // Give up investigation
          zombie.state = 'idle';
          zombie.lastKnownPlayerPos = null;
          zombie.investigationStartTime = null;
          zombie.target = null;
        } else {
          // Move toward the last known position with time-based movement
          const moveDistance = zombie.speed * 0.7 * cappedDeltaTime; // 70% of normal speed when investigating
          const normalizedX = dx / distance;
          const normalizedZ = dz / distance;
          
          // Store previous position
          const prevPosition = { ...zombie.position };
          
          // Update position with time-based movement
          zombie.position.x += normalizedX * moveDistance;
          zombie.position.z += normalizedZ * moveDistance;
          
          // Check for collisions and adjust position
          if (!isWithinMapBoundaries(zombie.position)) {
            zombie.position = clampToMapBoundaries(zombie.position);
          }
          
          // Check for collisions with map elements
          const collisionResult = checkZombieMapCollisions(zombie, room.map, checkMapCollisions);
          if (collisionResult.collision) {
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
          
          // Occasionally look around while investigating
          if (Math.random() < 0.05) {
            // Slightly adjust rotation to "look around"
            zombie.rotation += (Math.random() - 0.5) * 0.5;
          }
        }
      } else if (detectionType === 'investigate') {
        // Player detected in awareness range but not in direct sight
        // Turn toward the player and investigate
        zombie.state = 'investigating';
        zombie.awarenessTarget = targetPlayer.id;
        
        // Calculate target rotation to face the player
        const targetRotation = Math.atan2(dx, dz);
        
        // Turn gradually toward the player
        // Handle the case where we need to cross the 0/2π boundary
        let rotationDiff = targetRotation - zombie.rotation;
        
        // Normalize the difference to be between -π and π
        if (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
        if (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
        
        // Apply turn with limited speed (using deltaTime)
        if (Math.abs(rotationDiff) > 0.05) { // Small threshold to avoid jittering
          // Scale turn speed by deltaTime for consistent turning speed regardless of frame rate
          zombie.rotation += Math.sign(rotationDiff) * Math.min(ZOMBIE_TURN_SPEED * cappedDeltaTime, Math.abs(rotationDiff));
          
          // Normalize rotation to be between 0 and 2π
          if (zombie.rotation < 0) zombie.rotation += 2 * Math.PI;
          if (zombie.rotation > 2 * Math.PI) zombie.rotation -= 2 * Math.PI;
        } else {
          // We've turned to face the direction, but don't see the player yet
          // This can happen if there's an obstacle, so pause briefly
          // The next cycle will either detect the player in view or continue turning
          
          // Still can't directly see them - investigate by moving slowly forward
          // Scale movement by deltaTime for consistent speed
          const moveDistance = zombie.speed * 0.4 * cappedDeltaTime; // 40% of normal speed
          const zombieForwardX = Math.sin(zombie.rotation);
          const zombieForwardZ = Math.cos(zombie.rotation);
          
          // Store previous position
          const prevPosition = { ...zombie.position };
          
          // Move forward with time-based movement
          zombie.position.x += zombieForwardX * moveDistance;
          zombie.position.z += zombieForwardZ * moveDistance;
          
          // Check for collisions and adjust position
          if (!isWithinMapBoundaries(zombie.position)) {
            zombie.position = clampToMapBoundaries(zombie.position);
          }
          
          // Check for collisions with map elements
          const collisionResult = checkZombieMapCollisions(zombie, room.map, checkMapCollisions);
          if (collisionResult.collision) {
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
      }
    } else {
      // No players in range - idle behavior
      zombie.state = 'idle';
      zombie.target = null;
      zombie.awarenessTarget = null;
      zombie.lastKnownPlayerPos = null;
      zombie.investigationStartTime = null;
      
      // Check if it's time to transition to a new idle state
      if (now - zombie.idleStateStartTime > zombie.idleStateDuration) {
        // Choose a new idle state (different from current)
        const availableIdleStates = IDLE_STATES.filter(state => state !== zombie.idleState);
        zombie.idleState = availableIdleStates[Math.floor(Math.random() * availableIdleStates.length)];
        zombie.idleStateStartTime = now;
        zombie.idleStateDuration = IDLE_MIN_DURATION + Math.random() * (IDLE_MAX_DURATION - IDLE_MIN_DURATION);
      }
      
      // Handle idle behavior based on current idle state
      switch (zombie.idleState) {
        case 'standing':
          // Do nothing, zombie stands still
          break;
          
        case 'turning':
          // Slowly turn in place (using deltaTime for consistent speed)
          zombie.rotation += IDLE_TURN_SPEED * cappedDeltaTime;
          if (zombie.rotation > Math.PI * 2) {
            zombie.rotation -= Math.PI * 2;
          }
          break;
          
        case 'wandering':
          // Move slowly in current direction
          // Store previous position
          const prevPosition = { ...zombie.position };
          
          // Calculate direction vector from rotation
          const dirX = Math.sin(zombie.rotation);
          const dirZ = Math.cos(zombie.rotation);
          
          // Update position with time-based movement
          zombie.position.x += dirX * IDLE_WALK_SPEED * cappedDeltaTime;
          zombie.position.z += dirZ * IDLE_WALK_SPEED * cappedDeltaTime;
          
          // Check map boundaries
          if (!isWithinMapBoundaries(zombie.position)) {
            zombie.position = clampToMapBoundaries(zombie.position);
            // Change direction when hitting boundary
            zombie.rotation = Math.random() * Math.PI * 2;
          }
          
          // Check for collisions with map elements
          const collisionResult = checkZombieMapCollisions(zombie, room.map, checkMapCollisions);
          if (collisionResult.collision) {
            // Use adjusted position from collision response
            zombie.position = collisionResult.position;
            // Change direction when hitting an obstacle
            zombie.rotation = Math.random() * Math.PI * 2;
          }
          
          // Check for collisions with other zombies
          for (let j = 0; j < room.zombies.length; j++) {
            if (i !== j && checkZombieZombieCollision(zombie, room.zombies[j])) {
              zombie.position = prevPosition;
              // Change direction when colliding with another zombie
              zombie.rotation = Math.random() * Math.PI * 2;
              break;
            }
          }
          break;
      }
    }
    
    // If state or idle state changed, ensure it gets sent to clients
    if (previousState !== zombie.state || previousIdleState !== zombie.idleState) {
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
          // Use the collision function stored in the room object
          spawnNewZombie(room, io, room.checkMapCollisions);
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

// Function to spawn a new zombie at a valid position
function spawnNewZombie(room, io, checkMapCollisions) {
  // Maximum attempts to find a valid spawn position
  const MAX_SPAWN_ATTEMPTS = 50;
  
  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
    // Create a new zombie with random position
    const newZombie = createZombie(room.map.size || 50);
    
    // Check if position is valid (no collisions with map elements)
    // We need to temporarily set y to 0 for collision check, then restore to -0.8 for rising animation
    const tempY = newZombie.position.y;
    newZombie.position.y = 0;
    
    const collisionResult = checkZombieMapCollisions(newZombie, room.map, checkMapCollisions);
    
    // Restore Y position for rising animation
    newZombie.position.y = tempY;
    
    // Skip if collision detected
    if (collisionResult.collision) {
      continue; // Try again with a new position
    }
    
    // Check for collisions with other zombies
    let zombieCollision = false;
    for (let i = 0; i < room.zombies.length; i++) {
      if (checkZombieZombieCollision(newZombie, room.zombies[i])) {
        zombieCollision = true;
        break;
      }
    }
    
    if (zombieCollision) {
      continue; // Try again with a new position
    }
    
    // Check if too close to players (avoid spawning right next to players)
    let tooCloseToPlayer = false;
    const MIN_PLAYER_DISTANCE = 10; // Minimum distance from players to spawn
    
    for (const playerId in room.players) {
      const player = room.players[playerId];
      const dx = newZombie.position.x - player.position.x;
      const dz = newZombie.position.z - player.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < MIN_PLAYER_DISTANCE) {
        tooCloseToPlayer = true;
        break;
      }
    }
    
    if (tooCloseToPlayer) {
      continue; // Try again with a new position
    }
    
    // If we got here, position is valid - add the zombie to the room
    room.zombies.push(newZombie);
    
    // Notify players about new zombie
    io.to(room.id).emit('zombieCreated', newZombie);
    
    return newZombie; // Successfully spawned
  }
  
  // If we get here, we couldn't find a valid position after MAX_SPAWN_ATTEMPTS
  console.log('Failed to find valid position for new zombie after', MAX_SPAWN_ATTEMPTS, 'attempts');
  
  // Fall back to just adding the zombie at a random position without checks
  const fallbackZombie = createZombie(room.map.size || 50);
  room.zombies.push(fallbackZombie);
  io.to(room.id).emit('zombieCreated', fallbackZombie);
  
  return fallbackZombie;
}

module.exports = {
  MAX_ZOMBIES,
  ZOMBIE_SPEED,
  ZOMBIE_DAMAGE,
  ZOMBIE_HEALTH,
  ZOMBIE_UPDATE_INTERVAL,
  ZOMBIE_ATTACK_RANGE,
  ZOMBIE_DETECTION_RANGE,
  ZOMBIE_SIGHT_RANGE,
  ZOMBIE_SIGHT_ANGLE,
  ZOMBIE_AWARENESS_ANGLE,
  ZOMBIE_TURN_SPEED,
  ZOMBIE_COLLISION_RADIUS,
  IDLE_STATES,
  createZombie,
  checkZombieMapCollisions,
  checkZombiePlayerCollision,
  checkZombieZombieCollision,
  findClosestPlayer,
  initializeZombiesForRoom,
  updateZombies,
  handleZombieHit,
  spawnNewZombie,
  hasLineOfSight
};
