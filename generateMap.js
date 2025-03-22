/**
 * Map generation module for the server
 * Handles procedural generation of game maps
 */

// Map element types
const MAP_ELEMENT_TYPES = {
  BUILDING: 'building',
  ROAD: 'road',
  WALL: 'wall',
  TREE: 'tree',
  CAR: 'car'
};

/**
 * Generate a map for a new room
 * @param {number} mapSize - Size of the map (default: 100)
 * @returns {Object} - The generated map object
 */
function generateMap(mapSize = 100) {
  const map = {
    size: mapSize,
    buildings: [],
    roads: [],
    walls: [],
    trees: [],
    cars: [] // Add cars array to map
  };

  // Road configuration
  const roadWidth = 8;
  const roadSpacing = 24; // Distance between roads
  const gridSize = Math.floor(mapSize / roadSpacing); // Number of grid cells along each axis

  // Generate roads grid first
  const roads = [];
  
  // Horizontal roads
  for (let i = 0; i <= gridSize; i++) {
    const z = -mapSize / 2 + i * roadSpacing;
    roads.push({
      id: `road-h-${i}`,
      type: MAP_ELEMENT_TYPES.ROAD,
      points: [
        { x: -mapSize / 2, y: 0.1, z: z },
        { x: mapSize / 2, y: 0.1, z: z }
      ],
      width: roadWidth,
      isHorizontal: true
    });
  }
  
  // Vertical roads
  for (let i = 0; i <= gridSize; i++) {
    const x = -mapSize / 2 + i * roadSpacing;
    roads.push({
      id: `road-v-${i}`,
      type: MAP_ELEMENT_TYPES.ROAD,
      points: [
        { x: x, y: 0.1, z: -mapSize / 2 },
        { x: x, y: 0.1, z: mapSize / 2 }
      ],
      width: roadWidth,
      isVertical: true
    });
  }
  
  map.roads = roads;
  
  // Calculate grid cell boundaries (taking road width into account)
  const gridCells = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cellX = -mapSize / 2 + i * roadSpacing + roadSpacing / 2;
      const cellZ = -mapSize / 2 + j * roadSpacing + roadSpacing / 2;
      
      // Calculate cell boundaries, leaving room for roads
      const halfRoadWidth = roadWidth / 2;
      const cellSize = roadSpacing - roadWidth;
      
      gridCells.push({
        center: { x: cellX, z: cellZ },
        min: { 
          x: cellX - cellSize / 2 + halfRoadWidth / 2, 
          z: cellZ - cellSize / 2 + halfRoadWidth / 2 
        },
        max: { 
          x: cellX + cellSize / 2 - halfRoadWidth / 2, 
          z: cellZ + cellSize / 2 - halfRoadWidth / 2 
        },
        size: cellSize
      });
    }
  }
  
  // Distribute content types to grid cells (70% buildings, 20% parks, 10% empty)
  gridCells.forEach(cell => {
    const random = Math.random();
    
    // 70% chance for buildings
    if (random < 0.7) {
      // 60% of building cells get two buildings
      const twoBuildings = Math.random() < 0.6;
      
      if (twoBuildings) {
        // Generate two smaller buildings in this cell
        generateMultipleBuildings(cell, map, 2);
      } else {
        // Generate one building plus additional elements
        generateSingleBuildingWithExtras(cell, map);
      }
    }
    // 20% chance for parks
    else if (random < 0.9) {
      generatePark(cell, map);
    }
    // 10% remains empty
  });
  
  // Generate cars after road network is complete
  generateCars(map);

  return map;
}

// Generate multiple buildings in a cell
function generateMultipleBuildings(cell, map, count = 2) {
  // Split the cell into sections
  const sections = splitCellIntoSections(cell, count);
  
  // Generate a building in each section with additional spacing to avoid collisions
  sections.forEach((section, index) => {
    // Add a safety margin to avoid buildings touching each other
    const safetyMargin = 1.2;
    const safeSection = {
      center: section.center,
      min: { 
        x: section.min.x + safetyMargin, 
        z: section.min.z + safetyMargin 
      },
      max: { 
        x: section.max.x - safetyMargin, 
        z: section.max.z - safetyMargin 
      },
      size: section.size - (safetyMargin * 2) // Reduced size with margins
    };
    
    generateBuilding(safeSection, map, true);
  });
}

// Split a cell into smaller sections for multiple buildings
function splitCellIntoSections(cell, count) {
  const sections = [];
  
  if (count === 2) {
    // For two buildings, split either horizontally or vertically
    const splitHorizontal = Math.random() > 0.5;
    
    if (splitHorizontal) {
      // Split horizontally (top and bottom)
      // Add a gap between sections to prevent buildings from touching
      const gapSize = 2.0; // 2 unit gap between sections
      
      sections.push({
        center: { 
          x: cell.center.x, 
          z: cell.center.z - cell.size * 0.25 - gapSize/2
        },
        min: { 
          x: cell.min.x, 
          z: cell.min.z 
        },
        max: { 
          x: cell.max.x, 
          z: cell.center.z - gapSize
        },
        size: cell.size * 0.8 // Slightly smaller to ensure separation
      });
      
      sections.push({
        center: { 
          x: cell.center.x, 
          z: cell.center.z + cell.size * 0.25 + gapSize/2
        },
        min: { 
          x: cell.min.x, 
          z: cell.center.z + gapSize
        },
        max: { 
          x: cell.max.x, 
          z: cell.max.z 
        },
        size: cell.size * 0.8 // Slightly smaller to ensure separation
      });
    } else {
      // Split vertically (left and right)
      const gapSize = 2.0; // 2 unit gap between sections
      
      sections.push({
        center: { 
          x: cell.center.x - cell.size * 0.25 - gapSize/2, 
          z: cell.center.z 
        },
        min: { 
          x: cell.min.x, 
          z: cell.min.z 
        },
        max: { 
          x: cell.center.x - gapSize, 
          z: cell.max.z 
        },
        size: cell.size * 0.8 // Slightly smaller to ensure separation
      });
      
      sections.push({
        center: { 
          x: cell.center.x + cell.size * 0.25 + gapSize/2, 
          z: cell.center.z 
        },
        min: { 
          x: cell.center.x + gapSize, 
          z: cell.min.z 
        },
        max: { 
          x: cell.max.x, 
          z: cell.max.z 
        },
        size: cell.size * 0.8 // Slightly smaller to ensure separation
      });
    }
  }
  
  return sections;
}

// Generate a single building with additional environmental elements
function generateSingleBuildingWithExtras(cell, map) {
  // Generate the main building - keeping it smaller than the cell
  const buildingSize = 0.5; // Use only 50% of the cell for the building
  const subCell = {
    center: cell.center,
    min: {
      x: cell.center.x - (cell.size * buildingSize) / 2,
      z: cell.center.z - (cell.size * buildingSize) / 2
    },
    max: {
      x: cell.center.x + (cell.size * buildingSize) / 2,
      z: cell.center.z + (cell.size * buildingSize) / 2
    },
    size: cell.size * buildingSize
  };
  
  generateBuilding(subCell, map, false);
  
  // Add trees around the building instead of fences
  addTreesAroundBuilding(cell, subCell, map);
}

// Check if two rectangles intersect (AABB collision detection)
function checkRectIntersection(rect1, rect2) {
  // Expand rectangles slightly for a safety margin
  const margin = 0.5; // 0.5 unit safety margin
  
  // Get min/max points for rect1
  const r1MinX = rect1.position.x - rect1.dimensions.width/2 - margin;
  const r1MaxX = rect1.position.x + rect1.dimensions.width/2 + margin;
  const r1MinZ = rect1.position.z - rect1.dimensions.depth/2 - margin;
  const r1MaxZ = rect1.position.z + rect1.dimensions.depth/2 + margin;
  
  // Get min/max points for rect2
  let r2Width = rect2.dimensions.width || rect2.dimensions.length;
  let r2Depth = rect2.dimensions.depth || rect2.dimensions.width;
  
  const r2MinX = rect2.position.x - r2Width/2 - margin;
  const r2MaxX = rect2.position.x + r2Width/2 + margin;
  const r2MinZ = rect2.position.z - r2Depth/2 - margin;
  const r2MaxZ = rect2.position.z + r2Depth/2 + margin;
  
  // Check for no intersection
  return !(r1MaxX < r2MinX || r1MinX > r2MaxX || r1MaxZ < r2MinZ || r1MinZ > r2MaxZ);
}

// Check if object collides with any existing map element
function checkMapCollisions(newObject, map) {
  // Check collision with buildings
  for (const building of map.buildings) {
    if (checkRectIntersection(newObject, building)) {
      return true;
    }
  }
  
  // Check collision with cars
  for (const car of map.cars) {
    if (checkRectIntersection(newObject, car)) {
      return true;
    }
  }
  
  return false;
}

// Generate a building in a grid cell
function generateBuilding(cell, map, isMultiBuilding = false) {
  // Calculate random building size, but keep it smaller than the cell
  const maxWidth = cell.size * 0.8;
  const maxDepth = cell.size * 0.8;
  
  // Use 'let' instead of 'const' so we can modify these values later
  let width = Math.floor(Math.random() * (maxWidth * 0.6) + maxWidth * 0.4); // 40-100% of max width
  let depth = Math.floor(Math.random() * (maxDepth * 0.6) + maxDepth * 0.4); // 40-100% of max depth
  
  // Maximum of 3 floors for all buildings
  const maxFloors = 3;
  const floorHeight = 3;
  const floors = Math.floor(Math.random() * maxFloors) + 1; // 1-3 floors
  let height = floors * floorHeight;
  
  // Try different positions to avoid collisions
  let validPosition = false;
  let x, z, offsetX, offsetZ;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!validPosition && attempts < maxAttempts) {
    // Position within cell, with some variation
    offsetX = (Math.random() - 0.5) * (cell.size - width) * 0.5;
    offsetZ = (Math.random() - 0.5) * (cell.size - depth) * 0.5;
    
    x = cell.center.x + offsetX;
    z = cell.center.z + offsetZ;
    
    // Create a temporary building object to check for collisions
    const tempBuilding = {
      position: { x, y: height / 2, z },
      dimensions: { width, height, depth }
    };
    
    // Check for collisions with existing map elements
    validPosition = !checkMapCollisions(tempBuilding, map);
    attempts++;
  }
  
  // If we couldn't find a valid position after max attempts, make the building smaller
  if (!validPosition) {
    // Reduce size by 30%
    const scaleFactor = 0.7;
    width *= scaleFactor;
    depth *= scaleFactor;
    height *= scaleFactor; // Also scale height for proper proportion
  }
  
  // Building colors with weights
  const buildingColors = [
    '#A9A9A9', '#A9A9A9', '#A9A9A9', // Gray (more common)
    '#D3D3D3', '#D3D3D3', // Light Gray (common)
    '#CD853F', '#CD853F', // Tan/Brown (common)
    '#8B4513', // Brown (less common)
    '#FFF8DC', // Cream (less common)
    '#FFE4B5', // Moccasin (less common)
    '#E6B800' // Yellow (rare)
  ];
  
  const colorIndex = Math.floor(Math.random() * buildingColors.length);
  const buildingId = `building-${map.buildings.length}`;
  
  map.buildings.push({
    id: buildingId,
    type: MAP_ELEMENT_TYPES.BUILDING,
    position: { x, y: height / 2, z },
    dimensions: { width, height, depth },
    color: buildingColors[colorIndex],
    floors: floors
  });
  
  // Add architectural elements (less common in multi-building cells)
  if (!isMultiBuilding && Math.random() < 0.3) {
    const elementHeight = Math.random() * 1.5 + 1;
    const elementWidth = Math.random() * (width * 0.5) + width * 0.2;
    const elementDepth = Math.random() * (depth * 0.5) + depth * 0.2;
    
    // Position the architectural element on top of the building
    const elementX = x + (Math.random() - 0.5) * (width - elementWidth) * 0.8;
    const elementZ = z + (Math.random() - 0.5) * (depth - elementDepth) * 0.8;
    
    map.buildings.push({
      id: `${buildingId}-element`,
      type: MAP_ELEMENT_TYPES.BUILDING,
      position: { 
        x: elementX,
        y: height + elementHeight / 2,
        z: elementZ
      },
      dimensions: { width: elementWidth, height: elementHeight, depth: elementDepth },
      color: buildingColors[colorIndex]
    });
  }
}

// Add trees around a building in a cell
function addTreesAroundBuilding(cellOuter, cellInner, map) {
  const treeCount = Math.floor(Math.random() * 6) + 4; // 4-9 trees
  const minDistance = 1.0; // Minimum distance between trees
  
  for (let i = 0; i < treeCount * 3; i++) { // Multiple attempts to place trees
    if (map.trees.filter(tree => 
      tree.position.x >= cellOuter.min.x && 
      tree.position.x <= cellOuter.max.x &&
      tree.position.z >= cellOuter.min.z && 
      tree.position.z <= cellOuter.max.z
    ).length >= treeCount) break;
    
    // Random position in the cell but outside the building
    let x, z;
    let isInsideBuilding = true;
    let attempts = 0;
    
    while (isInsideBuilding && attempts < 10) {
      x = Math.random() * (cellOuter.max.x - cellOuter.min.x) + cellOuter.min.x;
      z = Math.random() * (cellOuter.max.z - cellOuter.min.z) + cellOuter.min.z;
      
      // Check if outside building
      isInsideBuilding = (
        x >= cellInner.min.x && x <= cellInner.max.x &&
        z >= cellInner.min.z && z <= cellInner.max.z
      );
      
      attempts++;
    }
    
    if (isInsideBuilding) continue; // Couldn't find a valid position
    
    // Check distance to other trees
    let tooClose = false;
    const existingTrees = map.trees.filter(tree => 
      tree.position.x >= cellOuter.min.x && 
      tree.position.x <= cellOuter.max.x &&
      tree.position.z >= cellOuter.min.z && 
      tree.position.z <= cellOuter.max.z
    );
    
    for (const tree of existingTrees) {
      const dist = Math.sqrt(Math.pow(x - tree.position.x, 2) + Math.pow(z - tree.position.z, 2));
      if (dist < minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (tooClose) continue;
    
    // Create tree
    const height = Math.random() * 1.5 + 2.2; // 2.2-3.7 units tall (slightly smaller than park trees)
    const radius = Math.random() * 0.3 + 0.5; // 0.5-0.8 unit radius
    const treeType = Math.random() < 0.5 ? 'pine' : 'oak';
    
    map.trees.push({
      id: `tree-${map.trees.length}`,
      type: MAP_ELEMENT_TYPES.TREE,
      position: { x: x, y: height / 2, z: z },
      dimensions: { height, radius },
      treeType
    });
  }
}

// Generate a park with trees in a grid cell
function generatePark(cell, map) {
  const parkSize = cell.size * 0.9; // Use most of the cell for the park
  const halfParkSize = parkSize / 2;
  
  // Create a curvy walking path through the park
  const pathWidth = 2;
  const pathType = Math.random() > 0.5 ? 'curved' : 'straight';
  
  // Path coordinates and control points for curves
  let path = {
    points: [],
    width: pathWidth
  };
  
  if (pathType === 'curved') {
    // Create a curved path with multiple segments
    const segmentCount = Math.floor(Math.random() * 2) + 2; // 2-3 segments
    const startPoint = {
      x: cell.center.x - halfParkSize + (Math.random() * parkSize * 0.3),
      z: cell.center.z - halfParkSize + (Math.random() * parkSize * 0.3)
    };
    
    let currentPoint = { ...startPoint };
    path.points.push({ x: currentPoint.x, y: 0.05, z: currentPoint.z });
    
    for (let i = 0; i < segmentCount; i++) {
      // Calculate next point with some constraints to keep path within park
      const remainingX = (cell.center.x + halfParkSize - currentPoint.x) * 0.8;
      const remainingZ = (cell.center.z + halfParkSize - currentPoint.z) * 0.8;
      
      // Ensure path moves somewhat toward opposite corner
      const nextPoint = {
        x: currentPoint.x + (remainingX * (0.3 + Math.random() * 0.4)),
        z: currentPoint.z + (remainingZ * (0.3 + Math.random() * 0.4))
      };
      
      // Add some randomness to avoid straight lines
      nextPoint.x += (Math.random() - 0.5) * parkSize * 0.2;
      nextPoint.z += (Math.random() - 0.5) * parkSize * 0.2;
      
      // Ensure the point stays within park bounds
      nextPoint.x = Math.max(cell.center.x - halfParkSize + pathWidth, 
                      Math.min(nextPoint.x, cell.center.x + halfParkSize - pathWidth));
      nextPoint.z = Math.max(cell.center.z - halfParkSize + pathWidth, 
                      Math.min(nextPoint.z, cell.center.z + halfParkSize - pathWidth));
      
      path.points.push({ x: nextPoint.x, y: 0.05, z: nextPoint.z });
      currentPoint = nextPoint;
    }
  } else {
    // Create a straight path with a slight variation
    const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
    
    if (orientation === 'horizontal') {
      // Horizontal path with some randomness
      const zVariation = (Math.random() - 0.5) * (parkSize * 0.4);
      const startX = cell.center.x - halfParkSize;
      const endX = cell.center.x + halfParkSize;
      const midX = (startX + endX) / 2;
      const midZVariation = (Math.random() - 0.5) * (parkSize * 0.3);
      
      path.points = [
        { x: startX, y: 0.05, z: cell.center.z + zVariation },
        { x: midX, y: 0.05, z: cell.center.z + zVariation + midZVariation },
        { x: endX, y: 0.05, z: cell.center.z + zVariation }
      ];
    } else {
      // Vertical path with some randomness
      const xVariation = (Math.random() - 0.5) * (parkSize * 0.4);
      const startZ = cell.center.z - halfParkSize;
      const endZ = cell.center.z + halfParkSize;
      const midZ = (startZ + endZ) / 2;
      const midXVariation = (Math.random() - 0.5) * (parkSize * 0.3);
      
      path.points = [
        { x: cell.center.x + xVariation, y: 0.05, z: startZ },
        { x: cell.center.x + xVariation + midXVariation, y: 0.05, z: midZ },
        { x: cell.center.x + xVariation, y: 0.05, z: endZ }
      ];
    }
  }
  
  // Add path to map
  map.roads.push({
    id: `park-path-${map.roads.length}`,
    type: 'path',
    points: path.points,
    width: pathWidth,
    isParkPath: true
  });
  
  // Generate trees with high density
  const treeCount = Math.floor(Math.random() * 15) + 35; // 35-50 trees per park (high density)
  const minTreeDistance = 1.0; // Minimum distance between trees
  
  const treesPlaced = [];
  
  // Function to check distance to path segments
  function distanceToPath(x, z, pathPoints, pathWidth) {
    let minDist = Infinity;
    
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dist = distancePointToSegment(
        x, z,
        pathPoints[i].x, pathPoints[i].z,
        pathPoints[i + 1].x, pathPoints[i + 1].z
      );
      minDist = Math.min(minDist, dist);
    }
    
    return minDist;
  }
  
  // Try to place trees
  for (let i = 0; i < treeCount * 3; i++) { // Try more times than needed to ensure density
    if (treesPlaced.length >= treeCount) break;
    
    // Random position within park bounds
    const x = cell.center.x + (Math.random() - 0.5) * parkSize * 0.9;
    const z = cell.center.z + (Math.random() - 0.5) * parkSize * 0.9;
    
    // Check distance to path
    const distToPath = distanceToPath(x, z, path.points, pathWidth);
    if (distToPath < pathWidth * 1.2) continue; // Too close to path
    
    // Check distance to other trees
    let tooClose = false;
    for (const tree of treesPlaced) {
      const dist = Math.sqrt(Math.pow(x - tree.x, 2) + Math.pow(z - tree.z, 2));
      if (dist < minTreeDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (tooClose) continue;
    
    // Tree passed all checks, add it
    treesPlaced.push({ x, z });
  }
  
  // Create trees based on positions
  for (const treePos of treesPlaced) {
    // Vary tree sizes slightly
    const height = Math.random() * 1.5 + 3; // 3-4.5 units tall
    const radius = Math.random() * 0.3 + 0.6; // 0.6-0.9 unit radius
    
    // Only pine and oak trees
    const treeType = Math.random() < 0.5 ? 'pine' : 'oak';
    
    map.trees.push({
      id: `tree-${map.trees.length}`,
      type: MAP_ELEMENT_TYPES.TREE,
      position: { x: treePos.x, y: height / 2, z: treePos.z },
      dimensions: { height, radius },
      treeType
    });
  }
}

// Generate cars placed chaotically around roads (zombie apocalypse style)
function generateCars(map) {
  // Determine number of cars (more cars for apocalypse scenario)
  const carCount = Math.floor(map.size / 8) + 10; // More cars for apocalypse feeling
  
  // Car colors (add some apocalyptic colors - burned, rusted, etc.)
  const carColors = [
    '#FF0000', // Red
    '#0000FF', // Blue
    '#FFFF00', // Yellow
    '#00FF00', // Green
    '#000000', // Black
    '#FFFFFF', // White
    '#808080', // Gray
    '#8B4513', // Brown/rust color
    '#696969', // Darker gray (damaged)
    '#A52A2A',  // Brown
    '#D2691E', // Chocolate (rusty)
    '#708090', // Slate gray (dirty)
  ];
  
  // Helper function to check proximity to a road
  function isNearRoad(x, z, maxDist) {
    for (const road of map.roads) {
      // Skip park paths
      if (road.isParkPath) continue;
      
      // Only check main roads
      if (road.points && road.points.length >= 2) {
        // For each segment of the road
        for (let i = 0; i < road.points.length - 1; i++) {
          const start = road.points[i];
          const end = road.points[i + 1];
          
          // Calculate distance from point to road segment
          const dist = distancePointToSegment(x, z, start.x, start.z, end.x, end.z);
          
          if (dist <= maxDist) {
            // Return road info
            const angle = Math.atan2(end.x - start.x, end.z - start.z);
            return { 
              nearRoad: true,
              angle: angle
            };
          }
        }
      }
    }
    return { nearRoad: false };
  }
  
  // Place cars chaotically near roads
  let carsPlaced = 0;
  let totalAttempts = 0;
  const maxTotalAttempts = carCount * 5; // Limit total attempts to avoid infinite loops
  
  while (carsPlaced < carCount && totalAttempts < maxTotalAttempts) {
    totalAttempts++;
    
    // Generate random position within map
    const x = (Math.random() * 2 - 1) * map.size / 2;
    const z = (Math.random() * 2 - 1) * map.size / 2;
    
    // Check if position is somewhat near a road (within 15 units)
    const roadCheck = isNearRoad(x, z, 15);
    
    if (!roadCheck.nearRoad) continue;
    
    // Select random car dimensions (make it one basic shape with different scales)
    const length = 3.5 + Math.random() * 2;  // 3.5-5.5 length
    const width = 1.6 + Math.random() * 0.8; // 1.6-2.4 width
    const height = 1.3 + Math.random() * 0.7; // 1.3-2.0 height
    
    // Select random color
    const colorIndex = Math.floor(Math.random() * carColors.length);
    
    // Decide if car is flipped
    const isFlipped = Math.random() < 0.25; // 25% chance
    
    // Add chaos to positioning
    // Maybe put car off the road completely
    let offsetX = (Math.random() * 8) - 4; // -4 to 4 units offset
    let offsetZ = (Math.random() * 8) - 4; // -4 to 4 units offset
    
    // Randomize rotation (chaotic parking/crashes)
    const randomRotation = roadCheck.angle + (Math.random() * Math.PI - Math.PI/2);
    
    // Create temporary car for collision check
    const tempCar = {
      position: { 
        x: x + offsetX, 
        y: isFlipped ? height/2 * 0.3 : height/2, // Lower height if flipped
        z: z + offsetZ
      },
      dimensions: { 
        width: width, 
        length: length, // Note: using length for cars
        depth: length   // Using length as depth for collision checks
      }
    };
    
    // Check if car collides with buildings or other cars
    if (checkMapCollisions(tempCar, map)) {
      continue; // Skip if collision detected
    }
    
    // Add car to map
    map.cars.push({
      id: `car-${map.cars.length}`,
      type: MAP_ELEMENT_TYPES.CAR,
      position: tempCar.position,
      dimensions: tempCar.dimensions,
      rotation: randomRotation,
      color: carColors[colorIndex],
      isFlipped: isFlipped
    });
    
    carsPlaced++;
  }
  
  console.log(`Generated ${carsPlaced} cars out of ${carCount} requested`);
}

// Helper function to determine tree type (simplified to only pine and oak)
function determineTreeType() {
  return Math.random() < 0.5 ? 'pine' : 'oak';
}

// Helper function to get distance from point to line segment
function distancePointToSegment(px, pz, x1, z1, x2, z2) {
  const A = px - x1;
  const B = pz - z1;
  const C = x2 - x1;
  const D = z2 - z1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, zz;

  if (param < 0) {
    xx = x1;
    zz = z1;
  } else if (param > 1) {
    xx = x2;
    zz = z2;
  } else {
    xx = x1 + param * C;
    zz = z1 + param * D;
  }

  const dx = px - xx;
  const dz = pz - zz;
  
  return Math.sqrt(dx * dx + dz * dz);
}

// Helper function to get a point along a path
function getPointAlongPath(path, t) {
  return {
    x: path.start.x + (path.end.x - path.start.x) * t,
    z: path.start.z + (path.end.z - path.start.z) * t
  };
}

// Helper function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Export the generateMap function and MAP_ELEMENT_TYPES
module.exports = {
  generateMap,
  MAP_ELEMENT_TYPES
};
