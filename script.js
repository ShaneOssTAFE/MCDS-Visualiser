fetch('schema.json')
  .then(response => response.json())
  .then(schema => {
    const { nodes, links } = processSchema(schema);
    initGraph(nodes, links);
  })
  .catch(error => console.error('Error loading schema:', error));

function processSchema(schema) {
  const nodes = [];
  const links = [];
  const seenNodes = new Set();

  Object.entries(schema.properties).forEach(([id, entity]) => {
    addNode(id, entity, 'entity');
  });

  Object.entries(schema.definitions).forEach(([id, definition]) => {
    addNode(id, definition, 'definition');
  });

  nodes.forEach(node => {
    const schemaNode = node.type === 'entity' 
      ? schema.properties[node.id]
      : schema.definitions[node.id];
    traverseProperties(schemaNode, node.id);
  });

  function addNode(id, data, type) {
    if (!seenNodes.has(id)) {
      nodes.push({
        id,
        name: data.title || id,
        type,
        description: data.description || '',
        group: type === 'entity' ? 0 : 1,
        size: type === 'entity' ? 8 : 6
      });
      seenNodes.add(id);
    }
  }

  function traverseProperties(obj, sourceId) {
    if (!obj || typeof obj !== 'object') return;
    Object.entries(obj).forEach(([key, value]) => {
      if (key === '$ref') {
        const targetId = value.replace('#/definitions/', '');
        if (seenNodes.has(targetId)) {
          links.push({ source: sourceId, target: targetId });
        }
      } else if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(item => traverseProperties(item, sourceId));
        } else {
          traverseProperties(value, sourceId);
        }
      }
    });
  }

  return { nodes, links };
}

function initGraph(nodes, links) {
  // Precompute shared geometry and materials
  const sphereGeometry = new THREE.SphereGeometry(1, 8, 8); // Lower resolution for performance
  const entityMaterial = new THREE.MeshBasicMaterial({ color: '#00FFFF', transparent: true, opacity: 0.9 });
  const defMaterial = new THREE.MeshBasicMaterial({ color: '#FF00FF', transparent: true, opacity: 0.9 });
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(15 * 3); // Reduced to 15 particles
  for (let i = 0; i < 15; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 8 + Math.random() * 2;
    particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    particlePositions[i * 3 + 2] = r * Math.cos(phi);
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const entityParticleMat = new THREE.PointsMaterial({ color: '#00FFFF', size: 1.5, transparent: true, opacity: 0.5 });
  const defParticleMat = new THREE.PointsMaterial({ color: '#FF00FF', size: 1.5, transparent: true, opacity: 0.5 });

  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel(node => `
      <strong>${node.name}</strong><br/>
      <em>${node.type}</em><br/>
      ${node.description || ''}
    `)
    .nodeAutoColorBy('group')
    .nodeOpacity(0.9)
    .nodeThreeObject(node => {
      const group = new THREE.Group();
      const material = node.group === 0 ? entityMaterial : defMaterial;
      const sphere = new THREE.Mesh(sphereGeometry, material);
      sphere.scale.setScalar(node.size); // Scale instead of new geometry
      group.add(sphere);
      const particleMat = node.group === 0 ? entityParticleMat : defParticleMat;
      const particles = new THREE.Points(particleGeometry, particleMat);
      group.add(particles);
      return group;
    })
    .linkWidth(0.5)
    .linkColor(() => '#FFFFFF')
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowRelPos(1)
    .linkCurvature(0.25)
    .linkDirectionalParticles(1) // Reduced to 1 particle
    .linkDirectionalParticleSpeed(0.01)
    .linkDirectionalParticleWidth(1)
    .linkOpacity(0.7)
    .backgroundColor('#1a1a1a')
    .onEngineTick(() => {
      // Throttle particle rotation (every 5th frame)
      if (performance.now() % 5 < 1) {
        Graph.scene().children.forEach(obj => {
          if (obj.type === 'Points' && obj.parent.type === 'Group') {
            obj.rotation.y += 0.01;
          }
        });
      }
    })
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      if (node) {
        tooltip.style.left = `${event.clientX + 10}px`;
        tooltip.style.top = `${event.clientY + 10}px`;
        tooltip.innerHTML = `
          <strong>${node.name}</strong><br/>
          <em>Type:</em> ${node.type}<br/>
          <em>Description:</em> ${node.description || 'N/A'}
        `;
      }
    })
    .onNodeClick(node => {
      Graph.centerAt(node.x, node.y, node.z, 1000);
      Graph.zoom(2, 2000);
      node.__threeObj.children[0].material.color.set('#FFFFFF');
      setTimeout(() => node.__threeObj.children[0].material.color.set(node.group === 0 ? '#00FFFF' : '#FF00FF'), 2000);
    });

  // Optimized starry background
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(500 * 3); // Reduced to 500 stars
  for (let i = 0; i < 500; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 2000;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 2000;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
  const stars = new THREE.Points(starGeo, starMat);
  Graph.scene().add(stars);

  // Cache visibility states
  let visibilityCache = new Map();
  function updateVisibility(filterFn) {
    nodes.forEach(node => {
      const shouldBeVisible = filterFn(node);
      if (visibilityCache.get(node.id) !== shouldBeVisible) {
        visibilityCache.set(node.id, shouldBeVisible);
        Graph.nodeVisibility({ id: node.id }, shouldBeVisible);
      }
    });
  }

  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    updateVisibility(node => node.name.toLowerCase().includes(term));
  });

  document.getElementById('filterEntities').addEventListener('click', () => {
    updateVisibility(node => node.type === 'entity');
  });

  document.getElementById('filterDefs').addEventListener('click', () => {
    updateVisibility(node => node.type === 'definition');
  });

  document.getElementById('resetView').addEventListener('click', () => {
    Graph.cameraPosition({ x: 0, y: 0, z: 1000 }, null, 1000);
    Graph.zoomToFit(1000, 100);
    updateVisibility(() => true);
    document.getElementById('search').value = '';
  });

  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  window.addEventListener('mousedown', () => isDragging = true);
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    Graph.cameraPosition({
      x: Graph.cameraPosition().x - deltaX * 2,
      y: Graph.cameraPosition().y + deltaY * 2
    });
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('wheel', e => {
    const zoom = Graph.zoom() * (e.deltaY > 0 ? 0.9 : 1.1);
    Graph.zoom(Math.max(0.5, Math.min(5, zoom)), 200);
  });

  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth);
    Graph.height(window.innerHeight);
  });
}
