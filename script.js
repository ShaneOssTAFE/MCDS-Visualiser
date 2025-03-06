fetch('schema.json')
  .then(response => response.json())
  .then(schema => {
    const { nodes, links, stats } = processSchema(schema);
    initGraph(nodes, links);
    showStats(stats);
  })
  .catch(error => console.error('Error loading schema:', error));

function processSchema(schema) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  const stats = {
    entities: 0,
    definitions: 0,
    relationships: 0,
    documentTypes: new Set(),
    academicChains: []
  };

  // Process main entities from properties
  Object.entries(schema.properties).forEach(([id, entity]) => {
    addNode(id, entity, 'entity', stats);
    if(entity.title.includes('container')) stats.entities++;
  });

  // Process definitions
  Object.entries(schema.definitions).forEach(([id, definition]) => {
    addNode(id, definition, 'definition', stats);
    stats.definitions++;
  });

  // Create relationships with schema-specific handling
  nodes.forEach(node => {
    const schemaNode = node.type === 'entity' 
      ? schema.properties[node.id] 
      : schema.definitions[node.id];
    
    traverseSchema(schemaNode, node.id, stats);
    
    // Track academic pathways
    if(node.id.toLowerCase().includes('programme') || node.id.toLowerCase().includes('unit')) {
      stats.academicChains.push(node.id);
    }
  });

  function addNode(id, data, type, stats) {
    if (!nodeMap.has(id)) {
      const title = data.title || id; // Fallback to ID if title missing
      const description = data.description || '';
      
      const newNode = {
        id,
        name: title,
        type,
        description,
        group: type === 'entity' ? 0 : 1,
        links: 0,
        // Fixed category detection with null checks
        category: title.includes('Document') ? 'document' : 
                 title.includes('Academic') ? 'academic' :
                 (data?.awardType ? 'award' : 'general')
      };
  
      if(newNode.category === 'document') {
        stats.documentTypes.add(title.replace('container', '').trim());
      }
      
      nodes.push(newNode);
      nodeMap.set(id, newNode);
    }
  }

  function traverseSchema(obj, sourceId, stats) {
    if (!obj || typeof obj !== 'object') return;

    // Handle arrays and their items
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if(item?.$ref) handleRef(item.$ref, sourceId, stats);
        traverseSchema(item, sourceId, stats);
      });
      return;
    }

    // Process object properties
    Object.entries(obj).forEach(([key, value]) => {
      if (key === '$ref') {
        handleRef(value, sourceId, stats);
      } 
      else if (key === 'items' && value?.$ref) {
        handleRef(value.$ref, sourceId, stats);
      }
      else if (typeof value === 'object') {
        traverseSchema(value, sourceId, stats);
      }
    });
  }

  function handleRef(ref, sourceId, stats) {
    const targetId = ref.replace('#/definitions/', '');
    if (nodeMap.has(targetId)) {
      links.push({
        source: sourceId,
        target: targetId,
        value: 3,
        type: determineLinkType(sourceId, targetId)
      });
      nodeMap.get(sourceId).links++;
      stats.relationships++;
    }
  }

  function determineLinkType(sourceId, targetId) {
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    
    if(sourceNode.category === 'document' || targetNode.category === 'document') 
      return 'documentation';
    if(sourceNode.category === 'academic' || targetNode.category === 'academic')
      return 'academic';
    return 'general';
  }

  return { nodes, links, stats };
}

function initGraph(nodes, links) {
  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel(node => `
      <strong>${node.name}</strong><br>
      <em>${node.type.toUpperCase()}</em><br>
      ${node.description || 'No description'}<br>
      Connections: ${node.links}
    `)
    .nodeAutoColorBy('category')
    .nodeValence(node => node.links * 1.5)
    .nodeResolution(16)
    .linkDirectionalArrowLength(6)
    .linkDirectionalArrowRelPos(1)
    .linkCurvature(0.25)
    .linkWidth(0.8)
    .linkColor(link => {
      switch(link.type) {
        case 'documentation': return '#FFA500';
        case 'academic': return '#00BFFF';
        default: return 'rgba(200,200,200,0.6)';
      }
    })
    .onNodeHover(node => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = node ? 'block' : 'none';
      tooltip.innerHTML = node ? `
        <strong>${node.name}</strong><br>
        Type: ${node.type}<br>
        Category: ${node.category}<br>
        Connections: ${node.links}<br>
        ${node.description || ''}
      ` : '';
    })
    .onNodeClick(node => {
      Graph.centerAt(node.x, node.y, node.z, 1000);
      Graph.zoom(4, 2000);
    });

  // Physics configuration for student lifecycle relationships
  Graph.d3Force('charge').strength(-150)
    .d3Force('link').distance(link => {
      if(link.type === 'academic') return 200;
      if(link.type === 'documentation') return 300;
      return 150;
    });

  // Enhanced search
  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Graph.nodeVisibility(node => 
      node.name.toLowerCase().includes(term) ||
      node.description.toLowerCase().includes(term) ||
      links.some(l => 
        (l.source === node.id || l.target === node.id) && 
        nodes.find(n => n.id === (l.source === node.id ? l.target : l.source))
          ?.name.toLowerCase().includes(term)
      )
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

function showStats(stats) {
  const statsDiv = document.createElement('div');
  statsDiv.className = 'stats-panel';
  statsDiv.innerHTML = `
    <h3>MCDS Schema Analysis</h3>
    <div class="stat-item">
      <span class="stat-label">Core Entities:</span>
      <span class="stat-value">${stats.entities}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Definitions:</span>
      <span class="stat-value">${stats.definitions}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Relationships:</span>
      <span class="stat-value">${stats.relationships}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Document Types:</span>
      <span class="stat-value">${[...stats.documentTypes].join(', ')}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Academic Pathways:</span>
      <span class="stat-value">${stats.academicChains.join(' → ')}</span>
    </div>
  `;
  
  // Add styles dynamically
  const style = document.createElement('style');
  style.textContent = `
    .stats-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,0.8);
      padding: 15px;
      border-radius: 8px;
      color: white;
      max-width: 300px;
      font-family: 'Overpass', sans-serif;
    }
    .stat-item {
      margin: 10px 0;
      display: flex;
      justify-content: space-between;
    }
    .stat-label {
      font-weight: 600;
      margin-right: 15px;
    }
    .stat-value {
      color: #00d1b2;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(statsDiv);
}
