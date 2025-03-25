const { v4: uuidv4 } = require('uuid');

// Constants for weapons and projectiles
const PROJECTILE_SPEED = 0.5;
const PROJECTILE_MAX_DISTANCE = 50;
const PROJECTILE_DAMAGE = 10;
const PROJECTILE_COLLISION_RADIUS = 1;

// Create a new projectile
function createProjectile(ownerId, position, direction) {
  return {
    id: uuidv4(),
    ownerId,
    position: { ...position },  // Make a copy to avoid reference issues
    initialPosition: { ...position }, // Store initial position for distance calculation
    direction,
    speed: PROJECTILE_SPEED
  };
}

// Update projectiles in a room (movement, collisions, etc.)
function updateProjectiles(room, io, zombieLogic, checkMapCollisions) {
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const projectile = room.projectiles[i];
    
    // Move projectile
    projectile.position.x += projectile.direction.x * projectile.speed;
    projectile.position.z += projectile.direction.z * projectile.speed;
    
    // Check for collisions with players
    let hitSomething = false;
    for (const playerId in room.players) {
      // Skip the owner of the projectile
      if (playerId === projectile.ownerId) continue;
      
      const player = room.players[playerId];
      
      // Simple distance-based collision check
      const dx = player.position.x - projectile.position.x;
      const dz = player.position.z - projectile.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < PROJECTILE_COLLISION_RADIUS) {
        // Player hit!
        player.health -= PROJECTILE_DAMAGE;
        
        // Notify players about the hit
        io.to(room.id).emit('playerHit', {
          playerId: playerId,
          health: player.health
        });
        
        // Remove projectile
        room.projectiles.splice(i, 1);
        io.to(room.id).emit('projectileDestroyed', projectile.id);
        
        hitSomething = true;
        break;
      }
    }
    
    // Check for collisions with zombies if nothing was hit yet
    if (!hitSomething && room.zombies && room.zombies.length > 0) {
      for (let j = 0; j < room.zombies.length; j++) {
        const zombie = room.zombies[j];
        
        // Distance-based collision check
        const dx = zombie.position.x - projectile.position.x;
        const dz = zombie.position.z - projectile.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Use the zombie collision radius constant directly from zombieLogic
        if (distance < zombieLogic.ZOMBIE_COLLISION_RADIUS) {
          // Zombie hit - handle zombie damage directly here
          const destroyed = zombieLogic.handleZombieHit(zombie, room, io, PROJECTILE_DAMAGE, checkMapCollisions);
          
          // Remove projectile
          room.projectiles.splice(i, 1);
          io.to(room.id).emit('projectileDestroyed', projectile.id);
          hitSomething = true;
          break;
        }
      }
    }
    
    // Remove projectiles that have traveled too far
    if (!hitSomething) {
      const distanceTraveled = Math.sqrt(
        Math.pow(projectile.position.x - projectile.initialPosition.x, 2) + 
        Math.pow(projectile.position.z - projectile.initialPosition.z, 2)
      );
      
      if (distanceTraveled > PROJECTILE_MAX_DISTANCE) {
        room.projectiles.splice(i, 1);
        io.to(room.id).emit('projectileDestroyed', projectile.id);
      }
    }
  }
}

// Handle projectile hit (for when clients report hits)
function handleProjectileHit(data, room, io, zombieLogic, checkMapCollisions) {
  if (data.type === 'zombie' && data.targetId) {
    const zombie = room.zombies.find(z => z.id === data.targetId);
    if (zombie) {
      const destroyed = zombieLogic.handleZombieHit(zombie, room, io, PROJECTILE_DAMAGE, checkMapCollisions);
      
      // Find and remove the corresponding projectile
      if (data.projectileId) {
        const projectileIndex = room.projectiles.findIndex(p => p.id === data.projectileId);
        if (projectileIndex !== -1) {
          room.projectiles.splice(projectileIndex, 1);
          io.to(room.id).emit('projectileDestroyed', data.projectileId);
        }
      }
    }
  }
}

module.exports = {
  createProjectile,
  updateProjectiles,
  handleProjectileHit,
  PROJECTILE_SPEED,
  PROJECTILE_MAX_DISTANCE,
  PROJECTILE_DAMAGE,
  PROJECTILE_COLLISION_RADIUS
};
