let camera
let cameraPersp
let orthoCamera
let cameraIsPersp = true
let orbitControls
let selectedViewName = 'Front'
let scene = null
let renderer
let vscode
let meshFilenameLookupLibrary = {}
let meshLibraryFull = {}
let meshFolderCache = {}
let daeLoadingCounter = 0
let daeLoadingCounterFull = 0
let loadedMeshes = []
let meshLoadingEnabled = false

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

let ctx = {}

const faceColors = {
  Top: 0xff0000,     // Red
  Bottom: 0x0000ff,  // Blue
  Left: 0x00ff00,    // Green
  Right: 0xffff00,   // Yellow
  Front: 0xff00ff,   // Magenta
  Back: 0x00ffff     // Cyan
}

function interpolateColor(color1, color2, factor) {
  return color1.lerp(color2, factor)
}

function getContrastingColor(hexcolor) {
  const r = parseInt(hexcolor.slice(1, 3), 16)
  const g = parseInt(hexcolor.slice(3, 5), 16)
  const b = parseInt(hexcolor.slice(5, 7), 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return (yiq >= 128) ? 'black' : 'white'
}

function roundNumber(num) {
  return (Math.round(num * 100) / 100).toFixed(2);
}

let gridXY
function updateGrid(scene, env) {
  let size = Math.round(env?.planeWidth);
  let divisions = size;
  //console.log('updateGrid', size, divisions)

  const colorFront = new THREE.Color(0xaaaaaa);
  const colorBack = new THREE.Color(0x808080);

  // Grid for the XZ plane (Right-Left)
  let gridXZ = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridXZ.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);  // Rotate around the X-axis to lay it flat
  gridXZ.material.opacity = 0.5;
  gridXZ.material.transparent = true;
  gridXZ.name = 'gridXZ'
  //scene.add(gridXZ);

  // Grid for the XY plane (Top-Bottom) - this is the ground plane grid
  if(gridXY) scene.remove(gridXY)
  gridXY = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridXY.material.opacity = 0.5;
  gridXY.material.transparent = true;
  gridXY.name = 'gridXY'
  scene.add(gridXY);

  // Grid for the YZ plane (Front-Back)
  let gridYZ = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridYZ.material.opacity = 0.5;
  gridYZ.material.transparent = true;
  gridYZ.rotateOnAxis(new THREE.Vector3(0, 0, 1), Math.PI / 2);  // Rotate around the Z-axis to make it vertical
  gridYZ.name = 'gridYZ'
  //scene.add(gridYZ);
}

function createDome(scene) {
  // Create a half-sphere geometry (dome)
  const domeRadius = 500; // Should be large enough to encompass your entire scene
  const domeWidthSegments = 60; // Adjust for more detail
  const domeHeightSegments = 40; // Adjust for more detail
  const domePhiStart = 0; // Starting angle
  const domePhiLength = Math.PI * 2; // Full circle
  const domeThetaStart = 0; // Starting height
  const domeThetaLength = Math.PI * 0.5; // Half-circle to make a dome

  const domeGeometry = new THREE.SphereGeometry(
    domeRadius,
    domeWidthSegments,
    domeHeightSegments,
    domePhiStart,
    domePhiLength,
    domeThetaStart,
    domeThetaLength
  );

  // Create a material with a solid color
  const domeMaterial = new THREE.MeshBasicMaterial({
    color: 0x808080, // Light blue color, for example
    side: THREE.BackSide // Render on the inside of the dome
  });

  // Create a mesh with the geometry and material
  const domeMesh = new THREE.Mesh(domeGeometry, domeMaterial);

  // Optionally, you may want to position the dome so that its bottom aligns with the ground level
  domeMesh.position.set(0, 0, 0); // Adjust as necessary

  // Add the dome to the scene
  domeMesh.name = 'domeMesh'
  scene.add(domeMesh);
}

// Map 3D coordinates to the 2D canvas
function map3Dto2D(point3D, env) {
  const normalizedX = (point3D.x - env.planeOrigin.x + env.planeWidth / 2) / env.planeWidth
  const normalizedZ = (point3D.z - env.planeOrigin.z + env.planeHeight / 2) / env.planeHeight
  const canvasX = normalizedX * env.canvasWidth
  const canvasY = normalizedZ * env.canvasHeight
  return {x: canvasX, y: canvasY};
}

// Draw an arrow between two points
let drawPrimitives = {}
drawPrimitives['arrow'] = function(context, env, arrow) {
  arrow.start2d = map3Dto2D(arrow.start, env);
  arrow.end2d = map3Dto2D(arrow.end, env);

  // Calculate the angle of the line
  const angle = Math.atan2(arrow.end2d.y - arrow.start2d.y, arrow.end2d.x - arrow.start2d.x);

  // Set the context font and calculate text width
  context.font = arrow.font
  const textWidth = context.measureText(arrow.label).width;

  // Calculate the position to draw the text so that it's centered along the line
  const textMidX = (arrow.start2d.x + arrow.end2d.x) / 2;
  const textMidY = (arrow.start2d.y + arrow.end2d.y) / 2;

  // Text padding from the line
  const textPadding = 10; // You can adjust this value as needed

  const lineLength = Math.sqrt(Math.pow(arrow.end2d.x - arrow.start2d.x, 2) + Math.pow(arrow.end2d.y - arrow.start2d.y, 2));

  // Calculate start and end points for the line segments
  // Create a gap for the text based on its width
  let gap = (textWidth / 2) + textPadding;
  if(gap * 2 > lineLength * 0.8) {
    gap = 0
  }
  let overSizedText = (textWidth > lineLength * 0.7) || lineLength > 400 // can text fit on the line?

  const startGapX = textMidX - gap * Math.cos(angle);
  const startGapY = textMidY - gap * Math.sin(angle);
  const endGapX = textMidX + gap * Math.cos(angle);
  const endGapY = textMidY + gap * Math.sin(angle);

  // Calculate the end points for the line to avoid overlapping with arrowheads
  const arrowSize = arrow.width * 3; // Size of the arrowhead
  const endLineX = arrow.end2d.x - arrowSize * Math.cos(angle);
  const endLineY = arrow.end2d.y - arrowSize * Math.sin(angle);
  const startLineX = arrow.start2d.x + arrowSize * Math.cos(angle);
  const startLineY = arrow.start2d.y + arrowSize * Math.sin(angle);

  // Draw the first line segment
  context.beginPath();
  context.moveTo(startLineX, startLineY);
  context.lineTo(startGapX, startGapY);
  context.strokeStyle = arrow.color;
  context.lineWidth = arrow.width; // Line thickness
  context.stroke();

  // Draw the second line segment
  context.beginPath();
  context.moveTo(endGapX, endGapY);
  context.lineTo(endLineX, endLineY);
  context.stroke();

  // Right arrowhead
  context.beginPath();
  context.moveTo(arrow.end2d.x, arrow.end2d.y);
  context.lineTo(arrow.end2d.x - arrowSize * Math.cos(angle - Math.PI / 6), arrow.end2d.y - arrowSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(arrow.end2d.x - arrowSize * Math.cos(angle + Math.PI / 6), arrow.end2d.y - arrowSize * Math.sin(angle + Math.PI / 6));
  context.lineTo(arrow.end2d.x, arrow.end2d.y);
  context.fillStyle = arrow.color;
  context.fill();

  // Left arrowhead
  context.beginPath();
  context.moveTo(arrow.start2d.x, arrow.start2d.y);
  context.lineTo(arrow.start2d.x + arrowSize * Math.cos(angle - Math.PI / 6), arrow.start2d.y + arrowSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(arrow.start2d.x + arrowSize * Math.cos(angle + Math.PI / 6), arrow.start2d.y + arrowSize * Math.sin(angle + Math.PI / 6));
  context.lineTo(arrow.start2d.x, arrow.start2d.y);
  context.fill();

  // Save the context's current state
  context.save();

  // Translate and rotate the canvas to draw the text along the line angle
  context.translate(textMidX, textMidY);
  context.rotate(angle);

  // Draw the text
  context.fillStyle = arrow.color
  context.textAlign = 'center'
  context.textBaseline = overSizedText ? 'bottom' : 'middle'

  context.fillText(arrow.label, 0, 0); // Draw the text at the new (0, 0)

  // Restore the context to its original state
  context.restore();
}

// Function to draw 2D text
drawPrimitives['text'] = function(context, env, item) {
  const pos2D = map3Dto2D(item.position, env)
  context.fillStyle = item.color // Set the text color
  context.font = item.font // Set the font (including size and style)
  context.textAlign = item.textAlign || 'center'
  context.textBaseline = item.textBaseline || 'middle'
  context.fillText(item.text, pos2D.x, pos2D.y);
}

drawPrimitives['line3d'] = function(context, env, item) {
  // Create the line geometry from the provided points
  const points = []
  points.push(item.pos1)
  points.push(item.pos2)
  const geometry = new THREE.BufferGeometry().setFromPoints(points)

  const material = new THREE.LineDashedMaterial({
    color: item.color || 0xffffff,
    linewidth: item.linewidth || 1,
    dashSize: item.dashSize || 3,
    gapSize: item.gapSize || 1,
  })
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances()
  line.name = 'drawPrimitives_line3d'
  return [line]
}

// Create a mesh with all arrows drawn on a canvas
let groundPlaneMesh = null
let groundPlaneTexture = null
let groundPlaneMaterial = null

function updateProjectionPlane(scene, items, _env = {}) {
  const env = {
    planeOrigin: {x: 0, y: 0, z: 0},
    planeWidth: 10, // Width of the plane in 3D units
    planeHeight: 10, // Height of the plane in 3D units
    canvasWidth: 8192, // Width of the canvas in pixels
    canvasHeight: 8192, // Height of the canvas in pixels
  }
  Object.assign(env, _env)
  console.log('Ground plane constructing with: ', env)
  let canvas = document.getElementById('canvas2DGroundplane')
  // remove canvas if it exists
  if(canvas) {
    canvas.remove();
  }
  if(!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = env.canvasWidth;
    canvas.height = env.canvasHeight;  
  }
  const context = canvas.getContext('2d');

  // Fill the canvas with blue for testing
  //context.fillStyle = 'blue';
  //context.fillRect(0, 0, env.canvasWidth, env.canvasHeight);

  // Draw each arrow on the canvas
  let objects = []
  items.forEach((item) => {
    let res = drawPrimitives[item.type](context, env, item)
    if(res) objects = objects.concat(res)
  });

  // Create texture and material from the canvas
  if(groundPlaneTexture) groundPlaneTexture.dispose()
  groundPlaneTexture = new THREE.CanvasTexture(canvas);
  groundPlaneTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  
  if(groundPlaneMaterial) groundPlaneMaterial.dispose()
  groundPlaneMaterial = new THREE.MeshBasicMaterial({ map: groundPlaneTexture, transparent: true, side: THREE.DoubleSide });

  if(groundPlaneMesh) {
    scene.remove(groundPlaneMesh)
    groundPlaneMesh = null
  }
  const planeGeometry = new THREE.PlaneGeometry(env.planeWidth, env.planeHeight);
  groundPlaneMesh = new THREE.Mesh(planeGeometry, groundPlaneMaterial);

  // Position the plane according to the 3D space
  groundPlaneMesh.position.set(env.planeOrigin.x, env.planeOrigin.y, env.planeOrigin.z);
  groundPlaneMesh.rotation.x = -Math.PI / 2;
  groundPlaneMesh.position.y = 0.01

  for(let o of objects) {
    groundPlaneMesh.add(o)
  }

  groundPlaneMesh.name = 'groundPlaneMesh'
  scene.add(groundPlaneMesh)
}

function moveCameraCenter(pos) {
  const offset = new THREE.Vector3().subVectors(pos, orbitControls.target);
  const newCameraPosition = new THREE.Vector3().addVectors(camera.position, offset);
  new Tween(orbitControls.target)
    .to(pos, 120)
    .easing(Easing.Quadratic.Out)
    .start()
    
  new Tween(camera.position)
    .to(newCameraPosition, 120)
    .easing(Easing.Quadratic.Out)
    .start()
}

/*
updateVertexBuffer(geometry, attributeName, items, itemSize)

Updates or creates a vertex attribute buffer associated with the provided geometry.

Parameters:
- geometry (THREE.BufferGeometry): The geometry to which the vertex attribute belongs.
- attributeName (String): The name of the attribute to update or create.
- items (Array or TypedArray): The new set of data to be used for the vertex attribute.
- itemSize (Number): The number of values per vertex that are stored in the array.

Behavior:
- If the attribute specified by attributeName does not exist or if its current array's length does not match the length of the items provided, a new THREE.BufferAttribute is created and assigned to the geometry.
- If the attribute exists and its size matches the provided items array, the existing buffer's array is updated with the new items.

Notes:
- The function ensures that the GPU memory is freed if a new buffer is created by disposing of the old buffer attribute.
- The usage of the buffer is set to THREE.DynamicDrawUsage, indicating that the data will change frequently and should be drawn dynamically.
- The buffer is flagged to update if only the values change without a change in the length of the array.

Example Usage:
updateVertexBuffer(mesh.geometry, 'position', newPositionsArray, 3);

This will update the 'position' buffer of mesh.geometry with newPositionsArray, where each vertex is represented by 3 values (x, y, z).
*/
function updateVertexBuffer(geometry, attributeName, items, itemSize) {
  let buffer = geometry.getAttribute(attributeName);
  if (!buffer || buffer.array.length !== items.length) {
    if (buffer) {
      geometry.deleteAttribute(attributeName)
      if (buffer.array) buffer.array = null
    }
    buffer = new THREE.Float32BufferAttribute(items, itemSize)
    buffer.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute(attributeName, buffer)
  } else {
    buffer.array.set(items)
    buffer.needsUpdate = true
  }
}

function getColorFromDistance(distance, maxDistance, colorHexA, colorHexB) {
  let clampedDistance = Math.min(distance, maxDistance);
  let normalizedDistance = clampedDistance / maxDistance;
  let color = new THREE.Color(colorHexB);
  color.lerp(new THREE.Color(colorHexA), normalizedDistance); 
  return color;
}

// special keys that should be ignored in the data
const excludedMagicKeys = ['__range', '__isarray', '__isNamed'];
