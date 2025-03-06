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
      <strong>${node.name}</strong><br/>
      <em>${node.type}</em><br/>
      ${node.description || ''}
    `)
    .nodeAutoColorBy('group')
    .nodeResolution(16)
    .nodeOpacity(0.9)
    .linkWidth(2)  // Increased visibility
    .linkDirectionalArrowLength(6)  // Arrow size
    .linkDirectionalArrowRelPos(1)
    .linkCurvature(0.25)  // Curved links
    .linkDirectionalParticles(2)  // Flow indication
    .linkDirectionalParticleSpeed(0.005)
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      if (node) {
        tooltip.innerHTML = `
          <strong>${node.name}</strong><br/>
          <em>Type:</em> ${node.type}<br/>
          <em>Description:</em> ${node.description || 'N/A'}
        `;
        tooltip.style.left = `${event.pageX + 10}px`;
        tooltip.style.top = `${event.pageY + 10}px`;
      }
    })
    .onNodeClick(node => {
      // Zoom with animation
      Graph.zoomToFit(1000, 200, node => node.id === node.id);
    })
    // Physics configuration
    .d3Force('link', d3.forceLink().id(d => d.id).distance(150))
    .d3Force('charge', d3.forceManyBody().strength(-1000));

  // Working search
  document.getElementById('search').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    Graph.nodeVisibility(node => 
      node.name.toLowerCase().includes(searchTerm) || 
      node.description.toLowerCase().includes(searchTerm)
    );
  });

  // Working filter buttons
  document.getElementById('filterEntities').addEventListener('click', () => {
    Graph.nodeVisibility(node => node.type === 'entity');
    Graph.linkVisibility(link => 
      nodes.find(n => n.id === link.source.id)?.type === 'entity' &&
      nodes.find(n => n.id === link.target.id)?.type === 'entity'
    );
  });

  document.getElementById('filterDefs').addEventListener('click', () => {
    Graph.nodeVisibility(node => node.type === 'definition');
    Graph.linkVisibility(link => 
      nodes.find(n => n.id === link.source.id)?.type === 'definition' &&
      nodes.find(n => n.id === link.target.id)?.type === 'definition'
    );
  });

  // Camera controls
  let isDragging = false;
  let currentRotation = { x: 0, y: 0 };
  
  window.addEventListener('mousedown', () => {
    isDragging = true;
    currentRotation = Graph.cameraRotation();
  });
  
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.movementX;
    const deltaY = e.movementY;
    
    Graph.cameraRotation({
      x: currentRotation.x + deltaX * 0.005,
      y: currentRotation.y + deltaY * 0.005
    });
  });

  // Zoom controls
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const newZoom = Graph.zoom() + (e.deltaY < 0 ? zoomIntensity : -zoomIntensity);
    Graph.zoom(Math.min(Math.max(newZoom, 0.1), 5));
  });

  // Responsive handling
  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth);
    Graph.height(window.innerHeight);
  });

  // Initial animation
  setTimeout(() => {
    Graph.zoomToFit(2000, 200);
  }, 500);
}
