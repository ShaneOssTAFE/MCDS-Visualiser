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

  // Process properties (main entities)
  Object.entries(schema.properties).forEach(([id, entity]) => {
    addNode(id, entity, 'entity');
  });

  // Process definitions
  Object.entries(schema.definitions).forEach(([id, definition]) => {
    addNode(id, definition, 'definition');
  });

  // Create links between nodes
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
        group: type === 'entity' ? 0 : 1
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
      }
      else if (value && typeof value === 'object') {
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
  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel(node => `
      <strong>${node.name}</strong><br/>
      <em>${node.type}</em><br/>
      ${node.description || ''}
    `)
    .nodeAutoColorBy('group')
    .nodeResolution(16)
    .nodeOpacity(0.9)
    .linkWidth(0.5)
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowRelPos(1)
    .linkCurvature(0.25)
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      if (node) {
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
    });

  // Search functionality
  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Graph.nodeVisibility(node => 
      node.name.toLowerCase().includes(term)
    );
  });

  // Filter controls
  document.getElementById('filterEntities').addEventListener('click', () => {
    Graph.nodeVisibility(node => node.type === 'entity');
  });

  document.getElementById('filterDefs').addEventListener('click', () => {
    Graph.nodeVisibility(node => node.type === 'definition');
  });

  // Camera controls
  let isDragging = false;
  window.addEventListener('mousedown', () => isDragging = true);
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    Graph.cameraPosition({
      x: Graph.cameraPosition().x + e.movementX * 2,
      y: Graph.cameraPosition().y - e.movementY * 2
    });
  });

  // Responsive handling
  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth);
    Graph.height(window.innerHeight);
  });
}
