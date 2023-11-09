let jbeamData = null
let currentPartName = null
let linesObject

let lineGeometry

let beamCache
let positions = []
let alphas = [];
let colors = [];

let selectedBeamIndices = null

function updateBeamViz() {
  positions = []
  beamCache = []
  let beamNodesCounter = 0
  for (let partName in jbeamData) {
    if(currentPartName && partName !== currentPartName) continue
    let part = jbeamData[partName]

    if(part.hasOwnProperty('beams')) {
      for (let beamId in part.beams) {
        let beam = part.beams[beamId];
        //console.log(">beam>", beam, part.nodes[beam['id1:']])
        if (part.nodes && beam['id1:'] in part.nodes && beam['id2:'] in part.nodes) {
          let node1 = part.nodes[beam['id1:']]
          beam.node1 = node1
          let node2 = part.nodes[beam['id2:']]
          beam.node2 = node2
      
          if (node1 && node2) {
            beam.nodePos1 = new THREE.Vector3(node1.pos[0], node1.pos[1], node1.pos[2])
            beamCache.push(beam)
            beamNodesCounter+=2
            positions.push(node1.pos[0])
            positions.push(node1.pos[1])
            positions.push(node1.pos[2])
            positions.push(node2.pos[0])
            positions.push(node2.pos[1])
            positions.push(node2.pos[2])
          }
        }
      }
    }
  }

  // beams
  if(linesObject) {
  //  if (linesObject.geometry) linesObject.geometry.dispose();
  //  if (linesObject.material) linesObject.material.dispose();
    scene.remove(linesObject);
  }

  // Fill arrays with data for each node
  for (let i = 0; i < beamNodesCounter; i++) {
    alphas.push(0.5)
    colors.push(0, 1, 0)
  }
  if(lineGeometry) {
    lineGeometry.dispose()
  }

  lineGeometry = new THREE.BufferGeometry()

  let positionsBuffer = lineGeometry.getAttribute('position')
  if(positionsBuffer) {
    positionsBuffer.array = new Float32Array(positions)
    positionsBuffer.needsUpdate = true
  } else {
    positionsBuffer = new THREE.BufferAttribute(new Float32Array(positions), 3)
    //positionsBuffer.setUsage(THREE.DynamicDrawUsage)
    lineGeometry.setAttribute('position', positionsBuffer)
  }

  let alphaBuffer = lineGeometry.getAttribute('alpha')
  if(alphaBuffer) {
    alphaBuffer.array = new Float32Array(alphas)
    alphaBuffer.needsUpdate = true
  } else {
    alphaBuffer = new THREE.BufferAttribute(new Float32Array(alphas), 1)
    alphaBuffer.setUsage(THREE.DynamicDrawUsage)
    lineGeometry.setAttribute('alpha', alphaBuffer)
  }

  let colorBuffer = lineGeometry.getAttribute('color')
  if(colorBuffer) {
    colorBuffer.array = new Float32Array(colors)
    colorBuffer.needsUpdate = true
  } else {
    colorBuffer = new THREE.BufferAttribute(new Float32Array(colors), 3)
    colorBuffer.setUsage(THREE.DynamicDrawUsage)
    lineGeometry.setAttribute('color', colorBuffer)
  }

  let lineMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float alpha;
      attribute vec3 color;
      varying float vAlpha;
      varying vec3 vColor;

      void main() {
        vAlpha = alpha;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
    transparent: true,
    //depthTest: true,
    //side: THREE.DoubleSide
  });

  linesObject = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(linesObject);
}

//const beamColorActive = new THREE.Color(0x00ff00);
const beamColorInative = new THREE.Color(0x88dd88);

function getColorFromDistance(distance, maxDistance) {
  let clampedDistance = Math.min(distance, maxDistance);
  let normalizedDistance = clampedDistance / maxDistance;
  let color = new THREE.Color(0x00ff00);
  color.lerp(beamColorInative, normalizedDistance); 
  return color;
}

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  if(!beamCache) return

  raycaster.setFromCamera(mouse, camera)

  const alphasAttribute = lineGeometry.getAttribute('alpha')
  const colorsAttribute = lineGeometry.getAttribute('color')
  
  let maxDistance = 1 // Maximum distance to affect the alpha
  
  for (let i = 0; i < beamCache.length; i++) {
    if(selectedBeamIndices && selectedBeamIndices.includes(i)) continue
    const distance = raycaster.ray.distanceToPoint(beamCache[i].nodePos1);

    // Normalize the distance based on a predefined maximum distance
    let normalizedDistance = distance / maxDistance
    normalizedDistance = THREE.MathUtils.clamp(normalizedDistance, 0, 1) // Ensure it's between 0 and 1

    // Set alpha based on distance (closer points are less transparent)
    alphasAttribute.setX(i*2  , 1.0 - (normalizedDistance * 0.6))
    alphasAttribute.setX(i*2+1, 1.0 - (normalizedDistance * 0.6))

    let color = getColorFromDistance(distance, maxDistance)
    colorsAttribute.setXYZ(i*2  , color.r, color.g, color.b)
    colorsAttribute.setXYZ(i*2+1, color.r, color.g, color.b)
  }
  alphasAttribute.needsUpdate = true
  colorsAttribute.needsUpdate = true
}

function focusBeams(beamsArrToFocus, triggerEditor = true) {
  if (!beamsArrToFocus) return
    
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  let beamCounter = 0

  //console.log('hit node:', node)
  selectedBeamIndices = beamsArrToFocus

  // color the node properly
  const alphasAttribute = lineGeometry.getAttribute('alpha');
  const colorsAttribute = lineGeometry.getAttribute('color');
  for (let i = 0; i < beamCache.length; i++) {
    const beam = beamCache[i]
    if(selectedBeamIndices.includes(i)) {
      alphasAttribute.setX(i*2, 1)
      alphasAttribute.setX(i*2 + 1, 1)
      colorsAttribute.setXYZ(i*2, 1, 0, 1)
      colorsAttribute.setXYZ(i*2 + 1, 1, 0, 1)
      sumX += beam.node1.pos[0]
      sumY += beam.node1.pos[1]
      sumZ += beam.node1.pos[2]
      sumX += beam.node2.pos[0]
      sumY += beam.node2.pos[1]
      sumZ += beam.node2.pos[2]
      beamCounter += 2 // because of 2 nodes
      continue
    }
    alphasAttribute.setX(i*2, 0.1)
    alphasAttribute.setX(i*2 + 1, 0.1)
    colorsAttribute.setXYZ(i*2, 0, 1, 0);
    colorsAttribute.setXYZ(i*2 + 1, 0, 1, 0);
  }
  alphasAttribute.needsUpdate = true;
  colorsAttribute.needsUpdate = true;

  if(selectedBeamIndices == []) selectedBeamIndices = null
  // TODO:
  //if(triggerEditor) {
  //  highlightNodeinTextEditor()
  //}

  if(beamCounter > 0) {
    let beamCenterPos = new THREE.Vector3(sumX / beamCounter, sumY / beamCounter, sumZ / beamCounter)
    moveCameraCenter(beamCenterPos)
  }
}

function onCursorChangeEditor(message) {
  if(!beamCache) return

  // figure out what part we are in
  let partNameFound = null
  for (let partName in jbeamData || {}) {
    if (message.range[0] >= jbeamData[partName].__range[0] && message.range[0] <= jbeamData[partName].__range[2]) {
      partNameFound = partName
      break
    }
  }
  if(partNameFound !== currentPartName) {
    currentPartName = partNameFound
    updateBeamViz()
  }
  
  let beamsFound = []
  // Helper function to check if the cursor is within a given range
  const cursorInRange = (range) => {
    // only check the lines for now
    return range[0] >= message.range[0] && range[0] <= message.range[2]
  };

  for (let i = 0; i < beamCache.length; i++) {
    if (cursorInRange(beamCache[i].__range)) {
      beamsFound.push(i)
    }
  }

  focusBeams(beamsFound, false)
}

function onReceiveMessage(event) {
  //console.log(">>> onReceiveMessage >>>", event)
  const message = event.data;
  switch (message.command) {
    case 'jbeamData':
      jbeamData = message.data
      selectedBeamIndices = null
      currentPartName = null
      updateBeamViz()
      break;
    case 'cursorChanged':
      onCursorChangeEditor(message)
      break      
  }
}

export function init() {
  window.addEventListener('message', onReceiveMessage);
  window.addEventListener('mousemove', onMouseMove, false); 
}


export function animate(time) {
  if(jbeamData === null) return
}