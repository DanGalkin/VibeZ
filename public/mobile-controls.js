/**
 * Mobile controls implementation using nippleJS
 */

let leftJoystick = null;
let rightJoystick = null;
let leftJoystickContainer = null;
let rightJoystickContainer = null;

// Function to detect if the device is mobile
function isMobileDevice() {
  return (
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    (window.innerWidth <= 1024 || ('orientation' in window))
  );
}

// Initialize mobile controls if needed
export function initMobileControls(keys, updateSightCallback) {
  // Only initialize on mobile devices
  if (!isMobileDevice()) return;
  
  // Load nippleJS dynamically
  loadNippleJS().then(() => {
    createJoystickContainers();
    setupJoysticks(keys, updateSightCallback);
  }).catch(err => {
    console.error('Failed to load nippleJS:', err);
  });
  
  // Handle orientation changes and resizing
  window.addEventListener('resize', () => {
    if (isMobileDevice()) {
      if (!leftJoystickContainer || !rightJoystickContainer) {
        destroyJoysticks();
        createJoystickContainers();
        setupJoysticks(keys, updateSightCallback);
      }
    } else {
      destroyJoysticks();
    }
  });
}

// Dynamically load nippleJS library
function loadNippleJS() {
  return new Promise((resolve, reject) => {
    if (window.nipplejs) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/nipplejs@0.10.1/dist/nipplejs.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Create the joystick containers
function createJoystickContainers() {
  // Create left joystick container (movement)
  if (!leftJoystickContainer) {
    leftJoystickContainer = document.createElement('div');
    leftJoystickContainer.id = 'left-joystick-container';
    
    leftJoystickContainer.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 100px;
      width: 120px;
      height: 120px;
      pointer-events: auto;
      z-index: 2000;
      opacity: 0.7;
      user-select: none;
      touch-action: none;
    `;
    
    document.body.appendChild(leftJoystickContainer);
  }
  
  // Create right joystick container (aiming)
  if (!rightJoystickContainer) {
    rightJoystickContainer = document.createElement('div');
    rightJoystickContainer.id = 'right-joystick-container';
    
    rightJoystickContainer.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 100px;
      width: 120px;
      height: 120px;
      pointer-events: auto;
      z-index: 2000;
      opacity: 0.7;
      user-select: none;
      touch-action: none;
    `;
    
    document.body.appendChild(rightJoystickContainer);
  }
}

// Set up joysticks with nippleJS
function setupJoysticks(keys, updateSightCallback) {
  if (!window.nipplejs || !leftJoystickContainer || !rightJoystickContainer) return;
  
  // Clear existing joysticks
  if (leftJoystick) leftJoystick.destroy();
  if (rightJoystick) rightJoystick.destroy();
  
  // Create left joystick (movement)
  leftJoystick = nipplejs.create({
    zone: leftJoystickContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 100,
    lockX: false,
    lockY: false,
    dynamicPage: true
  });
  
  // Create right joystick (aiming)
  rightJoystick = nipplejs.create({
    zone: rightJoystickContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 100,
    lockX: false,
    lockY: false,
    dynamicPage: true
  });
  
  // Handle left joystick movement (player movement)
  leftJoystick.on('move', (evt, data) => {
    const angle = data.angle.radian;
    const force = Math.min(data.force, 1.0);
    
    // Only apply movement if force is above threshold
    if (force > 0.1) {
      // Reset all keys first
      keys.forward = false;
      keys.backward = false;
      keys.left = false;
      keys.right = false;
      
      // Convert angle to key presses
      // Forward/backward (y axis)
      if (angle > Math.PI * 13 / 8 || angle < Math.PI * 3 / 8) {
        // Moving right
        keys.right = true;
      } else if (angle > Math.PI * 5 / 8 && angle < Math.PI * 11 / 8) {
        // Moving left
        keys.left = true;
      }
      
      if (angle > Math.PI * 1 / 8 && angle < Math.PI * 7 / 8) {
        // Moving up
        keys.forward = true;
      } else if (angle > Math.PI * 9 / 8 && angle < Math.PI * 15 / 8) {
        // Moving down
        keys.backward = true;
      }
    }
  });
  
  // Handle left joystick release
  leftJoystick.on('end', () => {
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
  });
  
  // Handle right joystick movement (aiming)
  rightJoystick.on('move', (evt, data) => {
    if (typeof updateSightCallback === 'function') {
      const angle = data.angle.radian;
      const gameAngle = Math.PI * 3 / 4 + angle; // Convert angle to match game coordinate system
      updateSightCallback(gameAngle);
    }
  });

  // Add an 'end' event handler for the right joystick
  rightJoystick.on('end', () => {
    // Set a flag to indicate the joystick is not being used
    window.joystickAimActive = false;

    // Optional: Maintain the last joystick angle
    if (typeof updateSightCallback === 'function') {
      updateSightCallback(null, true); // Second parameter indicates "maintain current angle"
    }
  });
  
  // Show mobile controls instructions
  showMobileInstructions();
}

// Clean up joysticks
function destroyJoysticks() {
  if (leftJoystick) {
    leftJoystick.destroy();
    leftJoystick = null;
  }
  
  if (rightJoystick) {
    rightJoystick.destroy();
    rightJoystick = null;
  }
  
  if (leftJoystickContainer && leftJoystickContainer.parentNode) {
    leftJoystickContainer.parentNode.removeChild(leftJoystickContainer);
    leftJoystickContainer = null;
  }
  
  if (rightJoystickContainer && rightJoystickContainer.parentNode) {
    rightJoystickContainer.parentNode.removeChild(rightJoystickContainer);
    rightJoystickContainer = null;
  }
}

// Show mobile instructions briefly
function showMobileInstructions() {
  // Only show instructions once
  if (localStorage.getItem('seenMobileInstructions')) return;
  
  const instructions = document.createElement('div');
  instructions.className = 'mobile-instructions';
  instructions.innerHTML = `
    <h3>Mobile Controls</h3>
    <p>Use the LEFT joystick to move</p>
    <p>Use the RIGHT joystick to aim</p>
    <p>Tap anywhere else to shoot</p>
  `;
  
  // Style the instructions
  instructions.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    z-index: 3000;
    max-width: 90%;
  `;
  
  document.body.appendChild(instructions);
  
  // Set flag to prevent showing again
  localStorage.setItem('seenMobileInstructions', 'true');
  
  // Remove after 5 seconds
  setTimeout(() => {
    if (instructions.parentNode) {
      instructions.style.opacity = '0';
      instructions.style.transition = 'opacity 0.5s ease-out';
      setTimeout(() => {
        if (instructions.parentNode) {
          instructions.parentNode.removeChild(instructions);
        }
      }, 500);
    }
  }, 5000);
}

// Add mobile-specific CSS
function addMobileStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Only apply on mobile devices */
    @media (pointer: coarse), (max-width: 1024px) {
      /* Increase UI element sizes for better touch targets */
      #health-container {
        padding: 15px !important;
        font-size: 18px !important;
      }
      
      #weapon-container {
        padding: 15px 25px !important;
      }
      
      #weapon-icon {
        font-size: 32px !important;
      }
      
      #ammo-display {
        font-size: 28px !important;
      }
      
      /* Animation for mobile instructions */
      .mobile-instructions {
        opacity: 1;
        transition: opacity 0.5s ease-out;
      }
      
      /* Style for joysticks */
      #left-joystick-container .nipple .front,
      #right-joystick-container .nipple .front {
        background-color: rgba(255, 255, 255, 0.8) !important;
      }
      
      #left-joystick-container .nipple .back {
        background-color: rgba(0, 100, 255, 0.3) !important;
        border: 1px solid rgba(0, 100, 255, 0.5) !important;
      }
      
      #right-joystick-container .nipple .back {
        background-color: rgba(255, 50, 50, 0.3) !important;
        border: 1px solid rgba(255, 50, 50, 0.5) !important;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Export the function to add mobile styles
export function enableMobileStyles() {
  if (isMobileDevice()) {
    addMobileStyles();
  }
}
