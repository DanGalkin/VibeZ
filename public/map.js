/**
 * Map generation module for the game client
 * Handles creation of all map elements from server data
 */

// Import Three.js if needed (commented out since it's globally available in this application)
// import * as THREE from 'three';

/**
 * Create all map elements from server data
 * @param {Object} map - Map data from server
 * @returns {THREE.Group} - Group containing all map elements
 */
export function createMapElements(map) {
  const mapContainer = new THREE.Group();

  // Generate roads first
  const roadNetwork = createRoadsFromData(map.roads, map.size || 100);
  mapContainer.add(roadNetwork);

  // Process buildings from server data
  map.buildings.forEach(building => {
    const buildingMesh = createBuilding(building);
    mapContainer.add(buildingMesh);
  });

  // Process walls from server data
  createWallsFromData(map.walls, mapContainer);

  // Process trees from server data
  map.trees.forEach(tree => {
    const treeMesh = createTree(tree);
    mapContainer.add(treeMesh);
  });

  // Add park decorations if any exist
  if (map.decorations) {
    map.decorations.forEach(decoration => {
      if (decoration.type === 'rocks') {
        createRockFormation(decoration, mapContainer);
      } else if (decoration.type === 'flowers') {
        createFlowerBed(decoration, mapContainer);
      }
    });
  }
  
  // Process cars if they exist
  if (map.cars && map.cars.length > 0) {
    map.cars.forEach(car => {
      const carMesh = createCar(car);
      mapContainer.add(carMesh);
    });
  }

  return mapContainer;
}

/**
 * Create a building with optional architectural elements
 * @param {Object} building - Building data from server
 * @returns {THREE.Group} - Group containing the building and its elements
 */
function createBuilding(building) {
  const buildingGroup = new THREE.Group();
  
  // Create main building structure
  const buildingGeometry = new THREE.BoxGeometry(
    building.dimensions.width,
    building.dimensions.height,
    building.dimensions.depth
  );
  
  // Convert color string from server to hex number
  const colorHex = typeof building.color === 'string' ? 
    parseInt(building.color.replace('#', '0x')) : 0x999999;
    
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.7
  });
  
  const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  
  // Add windows - ensure they're at proper height
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x87CEEB, // Sky blue
    emissive: 0x3366FF,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.8
  });
  
  // Add windows proportional to building size
  const floors = building.floors || Math.floor(building.dimensions.height / 3);
  const buildingWidth = building.dimensions.width;
  const buildingDepth = building.dimensions.depth;
  const buildingBottom = -building.dimensions.height / 2;
  
  // Only add windows if the building is large enough
  if (buildingWidth > 2 && buildingDepth > 2 && floors > 0) {
    for (let floor = 0; floor < floors; floor++) {
      const windowHeight = 1.5; // Height of window
      const floorHeight = 3; // Height between floors
      const windowY = buildingBottom + (floor * floorHeight) + floorHeight/2; // Center window vertically on the floor
      
      // Make sure window is above ground
      if (windowY - windowHeight/2 < -building.dimensions.height/2) continue;
      
      // Front windows
      for (let i = 0; i < buildingWidth - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
        window1.position.set(i - buildingWidth/2 + 1.5, windowY, buildingDepth/2 + 0.01);
        buildingGroup.add(window1);
      }
      
      // Back windows
      for (let i = 0; i < buildingWidth - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
        window2.position.set(i - buildingWidth/2 + 1.5, windowY, -buildingDepth/2 - 0.01);
        window2.rotation.y = Math.PI;
        buildingGroup.add(window2);
      }
      
      // Side windows
      for (let i = 0; i < buildingDepth - 2; i += 2) {
        const windowGeometry = new THREE.PlaneGeometry(1, windowHeight);
        
        const window3 = new THREE.Mesh(windowGeometry, windowMaterial);
        window3.position.set(buildingWidth/2 + 0.01, windowY, i - buildingDepth/2 + 1.5);
        window3.rotation.y = Math.PI / 2;
        buildingGroup.add(window3);
        
        const window4 = new THREE.Mesh(windowGeometry, windowMaterial);
        window4.position.set(-buildingWidth/2 - 0.01, windowY, i - buildingDepth/2 + 1.5);
        window4.rotation.y = -Math.PI / 2;
        buildingGroup.add(window4);
      }
    }
  }
  
  // Add the building to the group
  buildingGroup.add(buildingMesh);
  buildingGroup.position.set(
    building.position.x, 
    building.position.y, 
    building.position.z
  );
  
  return buildingGroup;
}

/**
 * Create a tree based on the specified type
 * @param {Object} tree - Tree data from server
 * @returns {THREE.Group} - Group containing the tree mesh
 */
function createTree(tree) {
  const treeType = tree.treeType || 'pine';
  
  switch (treeType) {
    case 'pine':
      return createPineTree(tree);
    case 'oak':
      return createOakTree(tree);
    case 'maple':
      return createMapleTree(tree);
    case 'willow':
      return createWillowTree(tree);
    default:
      return createPineTree(tree);
  }
}

/**
 * Create a pine tree
 * @param {Object} tree - Tree data from server
 * @returns {THREE.Group} - Group containing the tree mesh
 */
function createPineTree(tree) {
  const treeGroup = new THREE.Group();
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(
    tree.dimensions.radius * 0.2,
    tree.dimensions.radius * 0.3,
    tree.dimensions.height * 0.5,
    8
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = tree.dimensions.height * 0.25;
  trunk.castShadow = true;
  treeGroup.add(trunk);
  
  // Multiple layers of foliage for pine tree
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const layerSize = tree.dimensions.radius * (1 - i * 0.2);
    const layerHeight = tree.dimensions.height * 0.2;
    const yPos = tree.dimensions.height * (0.4 + i * 0.2);
    
    const foliageGeometry = new THREE.ConeGeometry(layerSize, layerHeight, 8);
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x2E8B57,
      roughness: 0.8
    });
    
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = yPos;
    foliage.castShadow = true;
    treeGroup.add(foliage);
  }
  
  treeGroup.position.set(tree.position.x, 0, tree.position.z);
  return treeGroup;
}

/**
 * Create an oak-like tree
 * @param {Object} tree - Tree data from server
 * @returns {THREE.Group} - Group containing the tree mesh
 */
function createOakTree(tree) {
  const treeGroup = new THREE.Group();
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(
    tree.dimensions.radius * 0.3,
    tree.dimensions.radius * 0.5,
    tree.dimensions.height * 0.6,
    8
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = tree.dimensions.height * 0.3;
  trunk.castShadow = true;
  treeGroup.add(trunk);
  
  // Foliage as a sphere for oak tree
  const foliageGeometry = new THREE.SphereGeometry(
    tree.dimensions.radius * 1.5,
    8,
    8
  );
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x228B22,
    roughness: 0.8
  });
  const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
  foliage.position.y = tree.dimensions.height * 0.7;
  foliage.castShadow = true;
  treeGroup.add(foliage);
  
  treeGroup.position.set(tree.position.x, 0, tree.position.z);
  return treeGroup;
}

/**
 * Create a maple-like tree with red/orange foliage
 * @param {Object} tree - Tree data from server
 * @returns {THREE.Group} - Group containing the tree mesh
 */
function createMapleTree(tree) {
  const treeGroup = new THREE.Group();
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(
    tree.dimensions.radius * 0.25,
    tree.dimensions.radius * 0.4,
    tree.dimensions.height * 0.6,
    8
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, 
    roughness: 0.9
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = tree.dimensions.height * 0.3;
  trunk.castShadow = true;
  treeGroup.add(trunk);
  
  // Multiple smaller foliage clusters for maple
  const foliageCount = 3 + Math.floor(Math.random() * 3);
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0xdd2200, // Red/orange for maple
    roughness: 0.8
  });
  
  for (let i = 0; i < foliageCount; i++) {
    const foliageSize = tree.dimensions.radius * (0.9 + Math.random() * 0.4);
    const foliageGeometry = new THREE.SphereGeometry(foliageSize, 8, 6);
    
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    
    // Position foliage with some randomness
    const angle = Math.random() * Math.PI * 2;
    const distance = tree.dimensions.radius * 0.6 * Math.random();
    foliage.position.x = Math.cos(angle) * distance;
    foliage.position.z = Math.sin(angle) * distance;
    foliage.position.y = tree.dimensions.height * (0.6 + Math.random() * 0.2);
    
    foliage.castShadow = true;
    treeGroup.add(foliage);
  }
  
  treeGroup.position.set(tree.position.x, 0, tree.position.z);
  return treeGroup;
}

/**
 * Create a willow-like tree with drooping branches
 * @param {Object} tree - Tree data from server
 * @returns {THREE.Group} - Group containing the tree mesh
 */
function createWillowTree(tree) {
  const treeGroup = new THREE.Group();
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(
    tree.dimensions.radius * 0.3,
    tree.dimensions.radius * 0.5,
    tree.dimensions.height * 0.7,
    8
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x5A4D41, 
    roughness: 0.9 
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = tree.dimensions.height * 0.35;
  trunk.castShadow = true;
  treeGroup.add(trunk);
  
  // Base foliage
  const foliageGeometry = new THREE.SphereGeometry(
    tree.dimensions.radius * 1.8,
    8, 8
  );
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x91BD59, // Light green
    roughness: 0.8,
    transparent: true,
    opacity: 0.9
  });
  const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
  foliage.position.y = tree.dimensions.height * 0.7;
  foliage.castShadow = true;
  treeGroup.add(foliage);
  
  // Create drooping branches
  const branchCount = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < branchCount; i++) {
    // Create a curved branch shape
    const branchCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1 * (Math.random() - 0.5), -0.5, 1 * (Math.random() - 0.5)),
      new THREE.Vector3(2 * (Math.random() - 0.5), -1.5, 2 * (Math.random() - 0.5)),
      new THREE.Vector3(3 * (Math.random() - 0.5), -3, 3 * (Math.random() - 0.5))
    );
    
    const points = branchCurve.getPoints(10);
    const branchGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const branchMaterial = new THREE.LineBasicMaterial({ 
      color: 0x91BD59, 
      linewidth: 1 
    });
    
    const branch = new THREE.Line(branchGeometry, branchMaterial);
    branch.position.y = tree.dimensions.height * 0.7;
    
    // Rotate branch randomly around the trunk
    branch.rotateY(i * (Math.PI * 2 / branchCount));
    treeGroup.add(branch);
  }
  
  treeGroup.position.set(tree.position.x, 0, tree.position.z);
  return treeGroup;
}

/**
 * Create roads from server data
 * @param {Array} roads - Road data from server
 * @param {number} mapSize - Size of the map
 * @returns {THREE.Group} - Group containing all road elements
 */
function createRoadsFromData(roads, mapSize) {
  const roadGroup = new THREE.Group();
  
  // Road surface material (asphalt)
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,  // Dark gray
    roughness: 0.8,
    metalness: 0.1
  });
  
  // Park path material (lighter color)
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0x9B7653,  // Brown/tan color
    roughness: 0.9,
    metalness: 0.0
  });
  
  // Road marking material (white lines)
  const markingMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xFFFFFF,
    emissiveIntensity: 0.2
  });
  
  roads.forEach(road => {
    if (road.isParkPath) {
      // Create curvy park path
      createCurvyParkPath(road, pathMaterial, roadGroup);
    } else if (road.points && road.points.length === 2) {
      // Regular road with lane markings
      createRoadWithDashedLines(
        road.points[0].x, road.points[0].z, 
        road.points[1].x, road.points[1].z, 
        road.width, 
        roadMaterial, 
        markingMaterial, 
        roadGroup
      );
    }
  });
  
  return roadGroup;
}

/**
 * Create a road with dashed line markings
 * @param {number} x1 - Start X coordinate
 * @param {number} z1 - Start Z coordinate
 * @param {number} x2 - End X coordinate
 * @param {number} z2 - End Z coordinate
 * @param {number} width - Road width
 * @param {THREE.Material} roadMaterial - Road material
 * @param {THREE.Material} markingMaterial - Line marking material
 * @param {THREE.Group} parentGroup - Parent group to add road to
 */
function createRoadWithDashedLines(x1, z1, x2, z2, width, roadMaterial, markingMaterial, parentGroup) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  
  // Create road surface
  const roadGeometry = new THREE.PlaneGeometry(width, length);
  const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.rotation.z = angle;
  roadMesh.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  roadMesh.receiveShadow = true;
  parentGroup.add(roadMesh);
  
  // Create dashed center line
  createDashedLine((x1 + x2) / 2, (z1 + z2) / 2, length, angle, 2, 2, 0.3, markingMaterial, parentGroup);
}

/**
 * Create a dashed line for road markings
 * @param {number} x - Center X coordinate
 * @param {number} z - Center Z coordinate
 * @param {number} length - Line length
 * @param {number} angle - Line angle
 * @param {number} dashLength - Length of each dash
 * @param {number} gapLength - Length of gap between dashes
 * @param {number} width - Line width
 * @param {THREE.Material} material - Line material
 * @param {THREE.Group} parentGroup - Parent group to add line to
 */
function createDashedLine(x, z, length, angle, dashLength, gapLength, width, material, parentGroup) {
  const totalLength = dashLength + gapLength;
  const numDashes = Math.floor(length / totalLength);
  
  for (let i = 0; i < numDashes; i++) {
    // Create a dash
    const dashGeometry = new THREE.PlaneGeometry(width, dashLength);
    const dashMesh = new THREE.Mesh(dashGeometry, material);
    
    // Position along the line
    const offset = -length / 2 + totalLength * i + dashLength / 2;
    const dashX = x + Math.sin(angle) * offset;
    const dashZ = z + Math.cos(angle) * offset;
    
    dashMesh.position.set(dashX, 0.02, dashZ); // Slightly above road surface
    dashMesh.rotation.x = -Math.PI / 2;
    dashMesh.rotation.z = angle;
    
    parentGroup.add(dashMesh);
  }
}

/**
 * Create a curvy park path
 * @param {Object} road - Path data
 * @param {THREE.Material} material - Path material
 * @param {THREE.Group} parentGroup - Parent group to add path to
 */
function createCurvyParkPath(road, material, parentGroup) {
  if (!road.points || road.points.length < 2) return;
  
  const points = road.points;
  const width = road.width;
  
  // For each path segment between points
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    
    // Create path segment
    const pathGeometry = new THREE.PlaneGeometry(width, length);
    const pathMesh = new THREE.Mesh(pathGeometry, material);
    pathMesh.rotation.x = -Math.PI / 2;
    pathMesh.rotation.z = angle;
    pathMesh.position.set((start.x + end.x) / 2, 0.02, (start.z + end.z) / 2);
    pathMesh.receiveShadow = true;
    
    parentGroup.add(pathMesh);
  }
}

/**
 * Create walls from server data
 * @param {Array} walls - Wall data from server
 * @param {THREE.Group} mapContainer - Parent group to add walls to
 */
function createWallsFromData(walls, mapContainer) {
  if (!walls) return;
  
  walls.forEach(wall => {
    if (wall.type === 'bench') {
      const benchMesh = createBench(wall);
      mapContainer.add(benchMesh);
    } else if (wall.isFence) {
      const fenceMesh = createFence(wall);
      mapContainer.add(fenceMesh);
    } else {
      const wallMesh = createRegularWall(wall);
      mapContainer.add(wallMesh);
    }
  });
}

/**
 * Create a regular wall
 * @param {Object} wall - Wall data
 * @returns {THREE.Mesh} - Wall mesh
 */
function createRegularWall(wall) {
  const geometry = new THREE.BoxGeometry(
    wall.dimensions.length,
    wall.dimensions.height,
    wall.dimensions.width
  );
  
  const material = new THREE.MeshStandardMaterial({ 
    color: 0xcccccc, 
    roughness: 0.8,
    metalness: 0.2
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wall.position.x, wall.position.y, wall.position.z);
  mesh.rotation.y = wall.rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  return mesh;
}

/**
 * Create a fence
 * @param {Object} fence - Fence data
 * @returns {THREE.Group} - Fence group
 */
function createFence(fence) {
  // Main fence structure (horizontal beam)
  const fenceMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Brown wood color
    roughness: 1.0,
    metalness: 0.0
  });
  
  const geometry = new THREE.BoxGeometry(
    fence.dimensions.length,
    fence.dimensions.height / 3, // Thinner horizontal beam
    fence.dimensions.width
  );
  
  const fenceMesh = new THREE.Mesh(geometry, fenceMaterial);
  
  // Position horizontal beam slightly higher
  const beamY = fence.position.y + fence.dimensions.height * 0.3; // Shift up by 30% of height
  fenceMesh.position.set(fence.position.x, beamY, fence.position.z);
  fenceMesh.rotation.y = fence.rotation;
  fenceMesh.castShadow = true;
  fenceMesh.receiveShadow = true;
  
  // Create fence posts
  const postCount = Math.max(2, Math.floor(fence.dimensions.length / 2));
  const postSpacing = fence.dimensions.length / (postCount - 1);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4226, // Darker brown for posts
    roughness: 1.0,
    metalness: 0.0
  });
  
  const fenceGroup = new THREE.Group();
  fenceGroup.add(fenceMesh);
  
  // Add posts
  for (let i = 0; i < postCount; i++) {
    // Create post
    const postHeight = fence.dimensions.height;
    const postWidth = fence.dimensions.width * 1.5;
    const postGeometry = new THREE.BoxGeometry(postWidth, postHeight, postWidth);
    const post = new THREE.Mesh(postGeometry, postMaterial);
    
    // Position along fence length
    const offset = -fence.dimensions.length / 2 + i * postSpacing;
    
    // Position depends on fence direction
    if (Math.abs(fence.rotation - Math.PI/2) < .1) {
      // X-axis aligned fence (north/south sides)
      post.position.set(offset, fence.dimensions.height/2, 0);
    } else {
      // Z-axis aligned fence (east/west sides)
      post.position.set(0, fence.dimensions.height/2, offset);
    }
    
    fenceGroup.add(post);
  }
  
  // Set fence group position and rotation
  fenceGroup.position.set(fence.position.x, fence.position.y, fence.position.z);
  fenceGroup.rotation.y = fence.rotation;
  
  return fenceGroup;
}

/**
 * Create a bench
 * @param {Object} bench - Bench data
 * @returns {THREE.Group} - Bench group
 */
function createBench(bench) {
  const benchGroup = new THREE.Group();
  
  // Seat
  const seatGeometry = new THREE.BoxGeometry(bench.dimensions.length, bench.dimensions.height * 0.3, bench.dimensions.width);
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
  const seat = new THREE.Mesh(seatGeometry, seatMaterial);
  seat.position.y = bench.dimensions.height * 0.15;
  seat.castShadow = true;
  benchGroup.add(seat);
  
  // Backrest
  const backrestGeometry = new THREE.BoxGeometry(bench.dimensions.length, bench.dimensions.height * 0.7, bench.dimensions.width * 0.2);
  const backrest = new THREE.Mesh(backrestGeometry, seatMaterial);
  backrest.position.y = bench.dimensions.height * 0.65;
  backrest.position.z = -bench.dimensions.width * 0.4;
  backrest.castShadow = true;
  benchGroup.add(backrest);
  
  // Legs
  const legGeometry = new THREE.BoxGeometry(bench.dimensions.width * 0.2, bench.dimensions.height * 0.7, bench.dimensions.width * 0.2);
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.7 });
  
  // Front legs
  const frontLegLeft = new THREE.Mesh(legGeometry, legMaterial);
  frontLegLeft.position.set(bench.dimensions.length * 0.4, bench.dimensions.height * -0.15, bench.dimensions.width * 0.3);
  frontLegLeft.castShadow = true;
  benchGroup.add(frontLegLeft);
  
  const frontLegRight = new THREE.Mesh(legGeometry, legMaterial);
  frontLegRight.position.set(bench.dimensions.length * -0.4, bench.dimensions.height * -0.15, bench.dimensions.width * 0.3);
  frontLegRight.castShadow = true;
  benchGroup.add(frontLegRight);
  
  // Back legs
  const backLegLeft = new THREE.Mesh(legGeometry, legMaterial);
  backLegLeft.position.set(bench.dimensions.length * 0.4, bench.dimensions.height * -0.15, bench.dimensions.width * -0.3);
  backLegLeft.castShadow = true;
  benchGroup.add(backLegLeft);
  
  const backLegRight = new THREE.Mesh(legGeometry, legMaterial);
  backLegRight.position.set(bench.dimensions.length * -0.4, bench.dimensions.height * -0.15, bench.dimensions.width * -0.3);
  backLegRight.castShadow = true;
  benchGroup.add(backLegRight);
  
  // Position and rotate entire bench
  benchGroup.position.set(bench.position.x, bench.position.y, bench.position.z);
  benchGroup.rotation.y = bench.rotation;
  
  return benchGroup;
}

/**
 * Create a car
 * @param {Object} carData - Car data
 * @returns {THREE.Group} - Car group
 */
function createCar(carData) {
  const carGroup = new THREE.Group();
  
  // Convert color string from server to hex number
  const colorHex = typeof carData.color === 'string' ? 
    parseInt(carData.color.replace('#', '0x')) : 0xff0000; // Default red
  
  // Create car body as a single simple box
  const { width, height, length } = carData.dimensions;
  
  // Add some texture/roughness to make it look damaged
  const carMaterial = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.8 + Math.random() * 0.2, // Very rough for worn look
    metalness: 0.1 + Math.random() * 0.3, // Low metalness
    flatShading: true // For a more crude look
  });
  
  // Just a simple box for all cars
  const bodyGeometry = new THREE.BoxGeometry(width, height, length);
  const body = new THREE.Mesh(bodyGeometry, carMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  carGroup.add(body);
  
  // Add simple black rectangles for windows
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.5,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7
  });
  
  // Add simple windows as planes (optional)
  if (Math.random() > 0.4) { // Some cars missing windows
    // Side windows
    const windowHeight = height * 0.4;
    const windowLength = length * 0.5;
    const windowGeometry = new THREE.PlaneGeometry(windowLength, windowHeight);
    
    // Left window
    const windowLeft = new THREE.Mesh(windowGeometry, windowMaterial);
    windowLeft.position.set(-width/2 - 0.01, height * 0.1, 0);
    windowLeft.rotation.y = Math.PI / 2;
    carGroup.add(windowLeft);
    
    // Right window
    const windowRight = new THREE.Mesh(windowGeometry, windowMaterial);
    windowRight.position.set(width/2 + 0.01, height * 0.1, 0);
    windowRight.rotation.y = -Math.PI / 2;
    carGroup.add(windowRight);
  }
  
  // Add simple wheels if car isn't flipped
  if (!carData.isFlipped) {
    const wheelRadius = 0.3;
    const wheelThickness = 0.2;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 8);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111, // Black wheels
      roughness: 0.9
    });
    
    // Rotate cylinder to be parallel to car
    wheelGeometry.rotateZ(Math.PI / 2);
    
    // Four wheels
    const wheelPositions = [
      { x: -width/2 + 0.2, y: -height/2 + wheelRadius * 0.5, z: length/3 },
      { x: width/2 - 0.2, y: -height/2 + wheelRadius * 0.5, z: length/3 },
      { x: -width/2 + 0.2, y: -height/2 + wheelRadius * 0.5, z: -length/3 },
      { x: width/2 - 0.2, y: -height/2 + wheelRadius * 0.5, z: -length/3 }
    ];
    
    wheelPositions.forEach((pos, index) => {
      // Skip wheels randomly for damaged look
      if (Math.random() > 0.2) { // 20% chance to miss a wheel
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(pos.x, pos.y, pos.z);
        carGroup.add(wheel);
      }
    });
  } else {
    // If car is flipped, rotate it
    body.rotation.z = Math.PI; // Flip it upside down
    
    // Maybe add some debris/glass under flipped car
    if (Math.random() > 0.5) {
      const debrisGeometry = new THREE.BufferGeometry();
      const debrisVertices = [];
      
      // Generate random debris points
      for (let i = 0; i < 20; i++) {
        const spread = 1.2;
        debrisVertices.push(
          Math.random() * width * spread - width * spread/2,
          0.01, // Just above ground
          Math.random() * length * spread - length * spread/2
        );
      }
      
      debrisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(debrisVertices, 3));
      const debrisMaterial = new THREE.PointsMaterial({ color: 0x888888, size: 0.1 });
      const debris = new THREE.Points(debrisGeometry, debrisMaterial);
      carGroup.add(debris);
    }
  }
  
  // Set car position and rotation
  carGroup.position.set(
    carData.position.x,
    carData.position.y,
    carData.position.z
  );
  carGroup.rotation.y = carData.rotation;
  
  return carGroup;
}

/**
 * Create a rock formation
 * @param {Object} decoration - Rock decoration data
 * @param {THREE.Group} parentGroup - Parent group to add decoration to
 */
function createRockFormation(decoration, parentGroup) {
  const rockGroup = new THREE.Group();
  
  // Create 3-7 rocks of varying sizes
  const rockCount = 3 + Math.floor(Math.random() * 5);
  
  for (let i = 0; i < rockCount; i++) {
    // Create random sized rock
    const size = 0.3 + Math.random() * 1.2;
    // Use slightly different geometry for variation
    const geometry = Math.random() > 0.5 ? 
      new THREE.DodecahedronGeometry(size, 0) : 
      new THREE.IcosahedronGeometry(size, 0);
      
    // Rock material
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const rock = new THREE.Mesh(geometry, rockMaterial);
    
    // Position with some randomness around the center
    const radius = decoration.radius || 2;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    rock.position.set(
      Math.cos(angle) * distance, 
      size * 0.5, // Half height above ground
      Math.sin(angle) * distance
    );
    
    // Rotate randomly for more natural look
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    
    rock.castShadow = true;
    rock.receiveShadow = true;
    rockGroup.add(rock);
  }
  
  rockGroup.position.set(
    decoration.position.x,
    decoration.position.y || 0,
    decoration.position.z
  );
  
  parentGroup.add(rockGroup);
}

/**
 * Create a flower bed
 * @param {Object} decoration - Flower decoration data
 * @param {THREE.Group} parentGroup - Parent group to add decoration to
 */
function createFlowerBed(decoration, parentGroup) {
  const flowerGroup = new THREE.Group();
  
  // Create base soil/mulch
  const baseRadius = decoration.radius || 3;
  const baseGeometry = new THREE.CircleGeometry(baseRadius, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x5C4033, // Brown soil
    roughness: 1.0
  });
  
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.rotation.x = -Math.PI / 2; // Flat on ground
  base.position.y = 0.01; // Just above ground
  flowerGroup.add(base);
  
  // Add flowers
  const flowerCount = Math.floor((baseRadius * baseRadius) * 2) + 5; // Scale with area
  const flowerColors = [
    0xFF0000, // Red
    0xFFFF00, // Yellow
    0xFFC0CB, // Pink
    0x800080, // Purple
    0xFF8C00  // Orange
  ];
  
  for (let i = 0; i < flowerCount; i++) {
    // Create flower stem and petal
    const stemHeight = 0.3 + Math.random() * 0.5;
    const stemGeometry = new THREE.CylinderGeometry(0.03, 0.03, stemHeight, 8);
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22 // Green
    });
    
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    
    // Flower petals/head
    const petalSize = 0.15 + Math.random() * 0.15;
    const petalGeometry = new THREE.SphereGeometry(petalSize, 8, 8);
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
      roughness: 0.8,
      emissive: 0x111111,
      emissiveIntensity: 0.1
    });
    
    const petals = new THREE.Mesh(petalGeometry, petalMaterial);
    petals.position.y = stemHeight / 2;
    
    // Combine into a flower
    const flower = new THREE.Group();
    flower.add(stem);
    flower.add(petals);
    
    // Position flower randomly within the flowerbed
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * baseRadius * 0.9; // Keep inside the bed radius
    
    flower.position.set(
      Math.cos(angle) * distance,
      stemHeight / 2, // Half the stem height above ground
      Math.sin(angle) * distance
    );
    
    // Slight random tilt
    flower.rotation.x = (Math.random() - 0.5) * 0.3;
    flower.rotation.z = (Math.random() - 0.5) * 0.3;
    
    flowerGroup.add(flower);
  }
  
  flowerGroup.position.set(
    decoration.position.x,
    decoration.position.y || 0,
    decoration.position.z
  );
  
  parentGroup.add(flowerGroup);
}
