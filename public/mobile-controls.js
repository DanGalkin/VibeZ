/**
 * Mobile controls implementation using nippleJS
 */

let joystick = null;
let joystickContainer = null;

// Function to detect if the device is mobile
function isMobileDevice() {
  return (
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    (window.innerWidth <= 1024 || ('orientation' in window))
  );
}

// Initialize mobile controls if needed
export function initMobileControls(keys) {
  // Only initialize on mobile devices
  if (!isMobileDevice()) return;
  
  // Load nippleJS dynamically
  loadNippleJS().then(() => {
    createJoystickContainer();
    setupJoystick(keys);
  }).catch(err => {
    console.error('Failed to load nippleJS:', err);
  });
  
  // Handle orientation changes and resizing
  window.addEventListener('resize', () => {
    if (isMobileDevice()) {
      if (!joystickContainer) {
        createJoystickContainer();
        setupJoystick(keys);
      }
    } else {
      destroyJoystick();
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

// Create the joystick container
function createJoystickContainer() {
  if (joystickContainer) return;
  
  // Create the container element
  joystickContainer = document.createElement('div');
  joystickContainer.id = 'joystick-container';
  
  // Style the container
  joystickContainer.style.cssText = `
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
  
  document.body.appendChild(joystickContainer);
}

// Set up joystick with nippleJS
function setupJoystick(keys) {
  if (!window.nipplejs || !joystickContainer) return;
  
  if (joystick) {
    joystick.destroy();
  }
  
  // Create nippleJS joystick
  joystick = nipplejs.create({
    zone: joystickContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 100,
    lockX: false,
    lockY: false,
    dynamicPage: true
  });
  
  // Handle joystick movement
  joystick.on('move', (evt, data) => {
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
  
  // Handle joystick release
  joystick.on('end', () => {
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
  });
  
  // Show mobile controls instructions
  // showMobileInstructions(); // dont show them yet, annoying
}

// Clean up joystick
function destroyJoystick() {
  if (joystick) {
    joystick.destroy();
    joystick = null;
  }
  
  if (joystickContainer && joystickContainer.parentNode) {
    joystickContainer.parentNode.removeChild(joystickContainer);
    joystickContainer = null;
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
    <p>Use the joystick on the left to move</p>
    <p>Tap anywhere to shoot</p>
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
