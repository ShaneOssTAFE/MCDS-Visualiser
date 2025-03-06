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
  const nodeMap = new Map(); // More efficient than Set for lookups

  // Unified node processing with schema-specific handling
  const processNode = (id, data, type) => {
    if (!nodeMap.has(id)) {
      const title = data.title || id.replace(/([A-Z])/g, ' $1').trim(); // Convert camelCase to title
      const category = type === 'entity' ? 'Container' : 
                      id.toLowerCase().includes('id') ? 'Identifier' :
                      'Component';
      
      const node = {
        id,
        name: title,
        type,
        category,
        description: data.description || `No description for ${title}`,
        group: type === 'entity' ? 0 : 1,
        links: 0
      };
      
      nodes.push(node);
      nodeMap.set(id, node);
    }
  };

  // Process schema structure
  Object.entries(schema.properties).forEach(([id, entity]) => processNode(id, entity, 'entity'));
  Object.entries(schema.definitions).forEach(([id, def]) => processNode(id, def, 'definition'));

  // Enhanced reference detection with array handling
  const findRefs = (obj, sourceId) => {
    if (!obj || typeof obj !== 'object') return;
    
    // Handle array items first
    if (Array.isArray(obj)) {
      obj.forEach(item => findRefs(item, sourceId));
      return;
    }

    // Check for direct $ref
    if (obj.$ref) {
      const targetId = obj.$ref.replace('#/definitions/', '');
      if (nodeMap.has(targetId)) {
        links.push({ source: sourceId, target: targetId });
        nodeMap.get(sourceId).links++;
      }
    }

    // Recursive property check
    Object.values(obj).forEach(value => {
      if (typeof value === 'object') findRefs(value, sourceId);
    });
  };

  // Process relationships
  nodes.forEach(node => {
    const schemaNode = node.type === 'entity' 
      ? schema.properties[node.id] 
      : schema.definitions[node.id];
    findRefs(schemaNode, node.id);
  });

  return { nodes, links };
}

function initGraph(nodes, links) {
  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel(node => `
      <strong>${node.name}</strong><br>
      <em>${node.category}</em><br>
      ${node.description}
    `)
    .nodeAutoColorBy('category')
    .nodeValence(node => Math.min(node.links * 2, 8))
    .nodeResolution(20)
    .linkDirectionalArrowLength(6)
    .linkCurvature(0.2)
    .linkWidth(0.8)
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      tooltip.innerHTML = node ? `
        <strong>${node.name}</strong><br>
        Type: ${node.type}<br>
        Connections: ${node.links}<br>
        ${node.description}
      ` : '';
    })
    .onNodeClick(node => {
      Graph.zoomToFit(400, 1000, n => n.id === node.id);
    });

  // Physics optimization for educational schema
  Graph.d3Force('charge').strength(-100)
       .d3Force('link').distance(150)
       .d3Force('center').strength(0.05);

  // Enhanced search
  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Graph.nodeVisibility(node => 
      node.name.toLowerCase().includes(term) || 
      node.description.toLowerCase().includes(term)
    );
  });

  // Filter controls with visual feedback
  const setFilter = (type) => {
    Graph.nodeVisibility(node => node.type === type)
        .linkVisibility(link => 
          nodes[link.source].type === type || 
          nodes[link.target].type === type
        );
  };
  
  document.getElementById('filterEntities').addEventListener('click', () => setFilter('entity'));
  document.getElementById('filterDefs').addEventListener('click', () => setFilter('definition'));

  // Camera controls with inertia
  let dragTimeout;
  window.addEventListener('mousemove', e => {
    if (!dragTimeout && e.buttons === 1) {
      Graph.cameraPosition({
        x: Graph.cameraPosition().x + e.movementX,
        y: Graph.cameraPosition().y - e.movementY
      });
      dragTimeout = setTimeout(() => dragTimeout = null, 50);
    }
  });

  // Auto-fit on load
  setTimeout(() => Graph.zoomToFit(2000, 200), 500);
}
