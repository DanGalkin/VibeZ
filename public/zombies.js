/**
 * Zombie management module for VibeZ game
 * Handles zombie creation, rendering and animation
 */

// Create a zombie mesh
export function createZombieMesh(zombie) {
  // Create a group for the zombie
  const zombieGroup = new THREE.Group();
  
  // Define materials - green for zombies
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2AB54B, // Zombie green
    roughness: 0.8
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x1A9639, // Slightly darker green for head
    roughness: 0.7
  });
  
  // Body - similar to player but slightly hunched
  const bodyGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.9;
  body.rotation.x = 0.2; // Slight hunch
  body.castShadow = true;
  zombieGroup.add(body);
  
  // Head - like player but with no face details
  const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.7;
  head.castShadow = true;
  zombieGroup.add(head);
  
  // Add glowing red eyes to zombie
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000, // Bright red
    emissive: 0xff0000, // Make them glow
    emissiveIntensity: 0.7
  });
  
  // Left eye
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMaterial);
  leftEye.position.set(0.12, 0, 0.28); // Position on face
  head.add(leftEye);
  
  // Right eye
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMaterial);
  rightEye.position.set(-0.12, 0, 0.28); // Position on face
  head.add(rightEye);
  
  // Arms - using pivot points for proper shoulder rotation
  
  // Left arm pivot at shoulder
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.3, 1.2, 0); // Position at left shoulder joint
  zombieGroup.add(leftShoulder);
  
  // Left arm geometry positioned to extend from shoulder
  const leftArmGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  const leftArm = new THREE.Mesh(leftArmGeometry, bodyMaterial);
  // Position arm so top aligns with pivot point
  leftArm.position.set(0, -0.4, 0); // Center of arm is 0.4 units below shoulder (half of 0.8 height)
  leftArm.castShadow = true;
  leftShoulder.add(leftArm);
  
  // Rotate the shoulder to position arm forward (not backward)
  leftShoulder.rotation.z = Math.PI / 12; // Slight outward angle
  leftShoulder.rotation.x = -Math.PI / 3; // Forward reach - CHANGED to negative to extend forward
  
  // Right arm pivot at shoulder
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(-0.3, 1.2, 0); // Position at right shoulder joint
  zombieGroup.add(rightShoulder);
  
  // Right arm geometry positioned to extend from shoulder
  const rightArmGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  const rightArm = new THREE.Mesh(rightArmGeometry, bodyMaterial);
  // Position arm so top aligns with pivot point
  rightArm.position.set(0, -0.4, 0); // Center of arm is 0.4 units below shoulder
  rightArm.castShadow = true;
  rightShoulder.add(rightArm);
  
  // Rotate the shoulder to position arm forward (not backward)
  rightShoulder.rotation.z = -Math.PI / 12; // Slight outward angle (opposite direction)
  rightShoulder.rotation.x = -Math.PI / 3; // Forward reach - CHANGED to negative to extend forward
  
  // Legs
  const legGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  
  // Left leg
  const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  leftLeg.position.set(0.15, 0.4, 0);
  leftLeg.castShadow = true;
  zombieGroup.add(leftLeg);
  
  // Right leg
  const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  rightLeg.position.set(-0.15, 0.4, 0);
  rightLeg.castShadow = true;
  zombieGroup.add(rightLeg);
  
  // Position the zombie
  zombieGroup.position.set(
    zombie.position.x,
    zombie.position.y, // Use the server-provided Y position for rising animation
    zombie.position.z
  );
  
  // Set rotation
  zombieGroup.rotation.y = zombie.rotation;
  
  // Store animation state and zombie state
  zombieGroup.userData = {
    id: zombie.id,
    animationTime: Math.random() * 100, // Random start phase
    walkSpeed: 3 + Math.random() * 2, // Slightly randomized walk speed
    state: zombie.state || 'idle',
    isMoving: zombie.state === 'chasing', // Only animate when chasing
    risingStartTime: zombie.state === 'rising' ? Date.now() : null
  };
  
  // Add dirt particle effect for rising zombies
  if (zombie.state === 'rising') {
    addRisingEffect(zombieGroup);
  }
  
  return zombieGroup;
}

// Function to add dirt particle effect when zombie rises from ground
function addRisingEffect(zombieGroup) {
  // Create a simple particle system for dirt/soil effect
  const particleCount = 20;
  const particles = new THREE.Group();
  
  // Create individual dirt particles
  for (let i = 0; i < particleCount; i++) {
    // Simple brown cube for dirt particles
    const size = 0.05 + Math.random() * 0.1;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x8B4513, // Brown dirt color
      transparent: true,
      opacity: 0.8 
    });
    
    const particle = new THREE.Mesh(geometry, material);
    
    // Random position around the zombie's feet
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.3 + Math.random() * 0.3;
    particle.position.set(
      Math.cos(angle) * radius,
      -0.4 + Math.random() * 0.2, // Near ground level
      Math.sin(angle) * radius
    );
    
    // Store velocity for animation
    particle.userData = {
      velocity: {
        x: (Math.random() - 0.5) * 0.02,
        y: 0.01 + Math.random() * 0.02,
        z: (Math.random() - 0.5) * 0.02
      },
      rotation: {
        x: (Math.random() - 0.5) * 0.1,
        y: (Math.random() - 0.5) * 0.1,
        z: (Math.random() - 0.5) * 0.1
      },
      lifetime: 1 + Math.random() * 0.5, // Seconds
      age: 0
    };
    
    particles.add(particle);
  }
  
  // Add particles group to the zombie
  zombieGroup.add(particles);
  zombieGroup.userData.particles = particles;
}

// Animate zombies
export function animateZombies(zombies, deltaTime) {
  for (const id in zombies) {
    const zombie = zombies[id];
    if (!zombie.mesh || !zombie.mesh.userData) continue;
    
    // Update position from server data
    zombie.mesh.position.set(
      zombie.data.position.x,
      zombie.data.position.y,
      zombie.data.position.z
    );
    
    // Update rotation from server data
    zombie.mesh.rotation.y = zombie.data.rotation;
    
    // Update state from server data
    if (zombie.mesh.userData.state !== zombie.data.state) {
      zombie.mesh.userData.state = zombie.data.state;
      
      // If transitioning into rising state, add the effect
      if (zombie.data.state === 'rising' && !zombie.mesh.userData.risingStartTime) {
        zombie.mesh.userData.risingStartTime = Date.now();
        addRisingEffect(zombie.mesh);
      }
    }
    
    // Handle rising animation particles
    if (zombie.mesh.userData.particles) {
      const particles = zombie.mesh.userData.particles;
      let allParticlesDone = true;
      
      // Update each particle
      for (let i = 0; i < particles.children.length; i++) {
        const particle = particles.children[i];
        const data = particle.userData;
        
        // Update age
        data.age += deltaTime;
        
        if (data.age < data.lifetime) {
          allParticlesDone = false;
          
          // Update particle position
          particle.position.x += data.velocity.x;
          particle.position.y += data.velocity.y;
          particle.position.z += data.velocity.z;
          
          // Update rotation
          particle.rotation.x += data.rotation.x;
          particle.rotation.y += data.rotation.y;
          particle.rotation.z += data.rotation.z;
          
          // Update opacity based on lifetime
          const progress = data.age / data.lifetime;
          particle.material.opacity = 0.8 * (1 - progress);
        } else {
          // Hide completed particles
          particle.visible = false;
        }
      }
      
      // Remove particles system after all particles are done
      if (allParticlesDone) {
        zombie.mesh.remove(particles);
        zombie.mesh.userData.particles = null;
      }
    }
    
    // Update moving state based on zombie state - also animate when wandering in idle
    zombie.mesh.userData.isMoving = 
      zombie.data.state === 'chasing' || 
      zombie.data.state === 'investigating_last_position' ||
      (zombie.data.state === 'idle' && zombie.data.idleState === 'wandering');
    
    // Find limbs - different structure now with shoulder groups
    const leftShoulder = zombie.mesh.children[2]; // Left shoulder group
    const rightShoulder = zombie.mesh.children[3]; // Right shoulder group
    const leftLeg = zombie.mesh.children[4]; // leftLeg
    const rightLeg = zombie.mesh.children[5]; // rightLeg
    
    if (!leftShoulder || !rightShoulder || !leftLeg || !rightLeg) continue;
    
    // Special animation for rising state
    if (zombie.data.state === 'rising') {
      // Arms reaching up during rising animation
      leftShoulder.rotation.x = -Math.PI / 2; // Arms reaching straight up
      rightShoulder.rotation.x = -Math.PI / 2;
      
      leftShoulder.rotation.z = Math.PI / 12;
      rightShoulder.rotation.z = -Math.PI / 12;
      
      // Legs slightly bent forward
      leftLeg.rotation.x = 0.3;
      rightLeg.rotation.x = 0.3;
      
      continue; // Skip other animations during rising
    }
    
    // Only animate if the zombie is moving (chasing state or wandering idle)
    if (zombie.mesh.userData.isMoving) {
      // Update animation time
      zombie.mesh.userData.animationTime += deltaTime * zombie.mesh.userData.walkSpeed;
      
      // Different animation speeds based on state
      let animationMultiplier = 0.5; // Default slower animation
      
      if (zombie.data.state === 'chasing') {
        animationMultiplier = 1.0; // Full speed for chasing
      } else if (zombie.data.state === 'investigating_last_position') {
        animationMultiplier = 0.7; // Medium speed for investigating last position
      }
      
      // Zombie animation is more shuffling/staggered than player animation
      const swingBase = Math.sin(zombie.mesh.userData.animationTime) * 0.25 * animationMultiplier;
      
      // Subtle arm swaying - primarily in the forward direction
      // with very limited side-to-side movement
      const armSwing = Math.sin(zombie.mesh.userData.animationTime * 1.3) * 0.1 * animationMultiplier;
      
      // Animate shoulders for proper arm movement - using negative values for forward reach
      leftShoulder.rotation.x = -Math.PI / 3 + armSwing; // CHANGED to negative for forward extension
      rightShoulder.rotation.x = -Math.PI / 3 - armSwing; // CHANGED to negative for forward extension
      
      // Very subtle side-to-side movement
      leftShoulder.rotation.z = Math.PI / 12 + Math.cos(zombie.mesh.userData.animationTime) * 0.03 * animationMultiplier;
      rightShoulder.rotation.z = -Math.PI / 12 - Math.cos(zombie.mesh.userData.animationTime) * 0.03 * animationMultiplier;
      
      // Legs move in shuffling motion
      leftLeg.rotation.x = swingBase;
      rightLeg.rotation.x = -swingBase;
    } else {
      // Reset or set to idle pose when not moving
      // Base arm position for zombie - arms forward
      leftShoulder.rotation.x = -Math.PI / 3; // Forward reach
      rightShoulder.rotation.x = -Math.PI / 3; // Forward reach
      
      // Standard side position
      leftShoulder.rotation.z = Math.PI / 12; // Slight outward angle
      rightShoulder.rotation.z = -Math.PI / 12; // Slight outward angle (mirrored)
      
      // Reset legs
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
      
      // For turning idle state, add subtle rotation
      if (zombie.data.state === 'idle' && zombie.data.idleState === 'turning') {
        // Subtle body sway for turning zombies
        const turnTime = Date.now() % 2000 / 2000; // 2-second cycle
        const turnSway = Math.sin(turnTime * Math.PI * 2) * 0.05;
        
        leftShoulder.rotation.z = Math.PI / 12 + turnSway;
        rightShoulder.rotation.z = -Math.PI / 12 - turnSway;
      }
      
      // For investigating state, add subtle "alert" animations - head and arm movement
      if (zombie.data.state === 'investigating') {
        // More pronounced movement for investigating - zombie is alert
        const investigateTime = Date.now() % 1500 / 1500; // 1.5-second cycle
        const investigateSway = Math.sin(investigateTime * Math.PI * 2) * 0.1;
        
        // More pronounced arm movement - zombie is alert and reaching
        leftShoulder.rotation.x = -Math.PI / 3 + investigateSway * 0.5;
        rightShoulder.rotation.x = -Math.PI / 3 - investigateSway * 0.5;
        
        // Slightly different side-to-side arm movement
        leftShoulder.rotation.z = Math.PI / 12 + investigateSway * 0.3;
        rightShoulder.rotation.z = -Math.PI / 12 - investigateSway * 0.3;
      }
      
      // For investigating_last_position state with special "looking around" animation
      if (zombie.data.state === 'investigating_last_position') {
        // Head movement to simulate looking around
        const lookTime = Date.now() % 3000 / 3000; // 3-second cycle
        const lookPhase = Math.sin(lookTime * Math.PI * 2);
        
        // Move head slightly to simulate looking around
        if (zombie.mesh.children[1]) { // Head is typically the second child
          zombie.mesh.children[1].rotation.y = lookPhase * 0.3;
        }
        
        // Subtle arm movement for searching behavior
        leftShoulder.rotation.x = -Math.PI / 3 - 0.2;
        rightShoulder.rotation.x = -Math.PI / 3 + 0.2;
        
        // Slightly different side-to-side arm movement
        leftShoulder.rotation.z = Math.PI / 12 + lookPhase * 0.1;
        rightShoulder.rotation.z = -Math.PI / 12 - lookPhase * 0.1;
      }
      
      // For attacking state, we could add special animation here
      if (zombie.data.state === 'attacking') {
        // Simple attack animation - arms move slightly up and down
        const attackTime = Date.now() % 1000 / 1000; // Simple 1-second cycle
        const attackAngle = Math.sin(attackTime * Math.PI * 2) * 0.2;
        
        leftShoulder.rotation.x = -Math.PI / 3 + attackAngle;
        rightShoulder.rotation.x = -Math.PI / 3 - attackAngle;
      }
    }
  }
}

// Remove zombie from scene
export function removeZombie(zombieId, zombies, scene) {
  if (zombies[zombieId]) {
    scene.remove(zombies[zombieId].mesh);
    delete zombies[zombieId];
  }
}

// Handle zombie hit visualization
export function handleZombieHit(zombie) {
  if (!zombie || !zombie.mesh || !zombie.mesh.children[0]) return;
  
  // Flash zombie red
  const bodyMaterial = zombie.mesh.children[0].material;
  const originalColor = bodyMaterial.color.clone();
  
  bodyMaterial.color.set(0xff0000); // Red
  setTimeout(() => {
    bodyMaterial.color.copy(originalColor);
  }, 100);
}
