fetch('schema.json')
  .then(response => response.json())
  .then(schema => {
    const { nodes, links } = processSchema(schema);
    initGraph(nodes, links);
    generateStats(nodes, links);
  })
  .catch(error => console.error('Error loading schema:', error));

function processSchema(schema) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  // Process main entities
  Object.entries(schema.properties).forEach(([id, entity]) => {
    addNode(id, entity, 'entity');
  });

  // Process definitions
  Object.entries(schema.definitions).forEach(([id, definition]) => {
    addNode(id, definition, 'definition');
  });

  // Create relationships
  nodes.forEach(node => {
    const schemaNode = node.type === 'entity' 
      ? schema.properties[node.id] 
      : schema.definitions[node.id];
    
    traverseSchema(schemaNode, node.id);
  });

  function addNode(id, data, type) {
    if (!nodeMap.has(id)) {
      const newNode = {
        id,
        name: data.title || id,
        type,
        description: data.description || '',
        group: type === 'entity' ? 0 : 1,
        links: 0
      };
      nodes.push(newNode);
      nodeMap.set(id, newNode);
    }
  }

  function traverseSchema(obj, sourceId) {
    if (!obj || typeof obj !== 'object') return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach(item => traverseSchema(item, sourceId));
      return;
    }

    // Process object properties
    Object.entries(obj).forEach(([key, value]) => {
      if (key === '$ref') {
        const targetId = value.replace('#/definitions/', '');
        if (nodeMap.has(targetId)) {
          links.push({
            source: sourceId,
            target: targetId,
            value: 3
          });
          nodeMap.get(sourceId).links++;
        }
      } else {
        traverseSchema(value, sourceId);
      }
    });
  }

  return { nodes, links };
}

function initGraph(nodes, links) {
  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel(node => `
      <strong>${node.name}</strong><br>
      <em>${node.type}</em><br>
      ${node.description || 'No description'}
    `)
    .nodeAutoColorBy('group')
    .nodeValence(node => node.links * 2)
    .linkDirectionalArrowLength(5)
    .linkDirectionalArrowRelPos(1)
    .linkCurvature(0.2)
    .linkWidth(0.8)
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      tooltip.innerHTML = node ? `
        <strong>${node.name}</strong><br>
        <em>Type:</em> ${node.type}<br>
        <em>Connections:</em> ${node.links}<br>
        ${node.description || ''}
      ` : '';
    })
    .onNodeClick(node => {
      Graph.centerAt(node.x, node.y, node.z, 1000);
      Graph.zoom(4, 2000);
    });

  // Configure physics
  Graph.d3Force('charge').strength(-120)
    .d3Force('link').distance(150);

  // Search functionality
  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Graph.nodeVisibility(node => 
      node.name.toLowerCase().includes(term) ||
      node.description.toLowerCase().includes(term)
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

  return Graph;
}

function generateStats(nodes, links) {
  const stats = {
    totalNodes: nodes.length,
    totalLinks: links.length,
    entities: nodes.filter(n => n.type === 'entity').length,
    definitions: nodes.filter(n => n.type === 'definition').length,
    avgConnections: (links.length / nodes.length).toFixed(2),
    mostConnected: nodes.reduce((max, node) => node.links > max.links ? node : max, { links: 0 })
  };

  const statsDiv = document.createElement('div');
  statsDiv.className = 'stats';
  statsDiv.innerHTML = `
    <h3>Schema Statistics</h3>
    <p>Nodes: ${stats.totalNodes} (${stats.entities} entities, ${stats.definitions} definitions)</p>
    <p>Relationships: ${stats.totalLinks}</p>
    <p>Average connections: ${stats.avgConnections}</p>
    <p>Most connected: ${stats.mostConnected.name} (${stats.mostConnected.links} links)</p>
  `;
  document.body.appendChild(statsDiv);
}
