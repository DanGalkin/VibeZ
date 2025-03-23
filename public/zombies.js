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
    zombie.position.y,
    zombie.position.z
  );
  
  // Set rotation
  zombieGroup.rotation.y = zombie.rotation;
  
  // Store animation state
  zombieGroup.userData = {
    id: zombie.id,
    animationTime: Math.random() * 100, // Random start phase
    walkSpeed: 3 + Math.random() * 2, // Slightly randomized walk speed
    state: zombie.state || 'idle'
  };
  
  return zombieGroup;
}

// Animate zombies
export function animateZombies(zombies, deltaTime) {
  for (const id in zombies) {
    const zombie = zombies[id];
    if (!zombie.mesh || !zombie.mesh.userData) continue;
    
    // Always animate zombies since they're always in motion
    zombie.mesh.userData.animationTime += deltaTime * zombie.mesh.userData.walkSpeed;
    
    // Find limbs - different structure now with shoulder groups
    const leftShoulder = zombie.mesh.children[2]; // Left shoulder group
    const rightShoulder = zombie.mesh.children[3]; // Right shoulder group
    const leftLeg = zombie.mesh.children[4]; // leftLeg
    const rightLeg = zombie.mesh.children[5]; // rightLeg
    
    if (!leftShoulder || !rightShoulder || !leftLeg || !rightLeg) continue;
    
    // Zombie animation is more shuffling/staggered than player animation
    const swingBase = Math.sin(zombie.mesh.userData.animationTime) * 0.25;
    
    // Subtle arm swaying - primarily in the forward direction
    // with very limited side-to-side movement
    const armSwing = Math.sin(zombie.mesh.userData.animationTime * 1.3) * 0.1;
    
    // Animate shoulders for proper arm movement - using negative values for forward reach
    leftShoulder.rotation.x = -Math.PI / 3 + armSwing; // CHANGED to negative for forward extension
    rightShoulder.rotation.x = -Math.PI / 3 - armSwing; // CHANGED to negative for forward extension
    
    // Very subtle side-to-side movement
    leftShoulder.rotation.z = Math.PI / 12 + Math.cos(zombie.mesh.userData.animationTime) * 0.03;
    rightShoulder.rotation.z = -Math.PI / 12 - Math.cos(zombie.mesh.userData.animationTime) * 0.03;
    
    // Legs move in shuffling motion
    leftLeg.rotation.x = swingBase;
    rightLeg.rotation.x = -swingBase;
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
