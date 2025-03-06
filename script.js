document.addEventListener('DOMContentLoaded', () => {
  fetch('schema.json')
    .then(response => response.json())
    .then(schema => {
      const { nodes, links } = processSchema(schema);
      initGraph(nodes, links, schema);
    })
    .catch(error => console.error('Error loading schema:', error));
});

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
    if (!seenNodes.has(id) && (data.properties || type === 'entity')) { // Exclude primitive types
      const properties = data.properties 
        ? Object.entries(data.properties).map(([propName, prop]) => ({
            name: propName,
            type: prop.type || (prop['$ref'] ? prop['$ref'].split('/').pop() : 'unknown'),
            description: prop.description || ''
          }))
        : [];
      nodes.push({
        id,
        name: data.title || id,
        type,
        description: data.description || '',
        group: type === 'entity' ? 0 : 1,
        size: type === 'entity' ? 8 : 6,
        properties
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
        if (key.endsWith('ID') && targetId.endsWith('ID')) {
          const entityName = targetId.replace('ID', 's');
          if (seenNodes.has(entityName)) {
            links.push({ source: sourceId, target: entityName });
          }
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

function initGraph(nodes, links, schema) {
  const Graph = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes, links })
    .nodeLabel('') // No default tooltip
    .nodeColor(node => node.group === 0 ? '#00FFFF' : '#FF00FF') // Teal for entities, magenta for definitions
    .nodeVal(node => node.size) // Size based on entity/definition
    .nodeOpacity(0.9)
    .linkColor(() => '#FFFFFF') // Straight white links
    .linkWidth(0.5)
    .linkOpacity(0.7)
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowRelPos(1)
    .backgroundColor('#1a1a1a');

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  Graph.onNodeHover(node => {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.display = node ? 'block' : 'none';
    if (node) {
      tooltip.style.left = `${mouseX + 10}px`;
      tooltip.style.top = `${mouseY + 10}px`;
      const propList = node.properties.length > 0 
        ? node.properties.map(p => `${p.name}: ${p.type}${p.description ? ' - ' + p.description : ''}`).join('<br/>')
        : 'None';
      tooltip.innerHTML = `
        <strong>${node.name}</strong><br/>
        <em>Type:</em> ${node.type}<br/>
        <em>Description:</em> ${node.description || 'N/A'}<br/>
        <em>Properties:</em><br/>${propList}
      `;
    }
  })
  .onNodeClick(node => {
    Graph.cameraPosition(
      { x: node.x, y: node.y, z: node.z + 300 },
      node,
      1000
    );
  });

  let visibilityCache = new Map();
  function updateVisibility(filterFn) {
    nodes.forEach(node => {
      const shouldBeVisible = filterFn(node);
      if (visibilityCache.get(node.id) !== shouldBeVisible) {
        visibilityCache.set(node.id, shouldBeVisible);
        node.visible = shouldBeVisible;
      }
    });
    Graph.graphData({ nodes: nodes.filter(n => n.visible !== false), links });
  }

  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    updateVisibility(node => node.name.toLowerCase().includes(term));
  });

  const filterEntitiesBtn = document.getElementById('filterEntities');
  filterEntitiesBtn.addEventListener('click', () => {
    updateVisibility(node => node.type === 'entity');
  });

  const filterDefsBtn = document.getElementById('filterDefs');
  filterDefsBtn.addEventListener('click', () => {
    updateVisibility(node => node.type === 'definition');
  });

  const resetViewBtn = document.getElementById('resetView');
  resetViewBtn.addEventListener('click', () => {
    Graph.cameraPosition({ x: 0, y: 0, z: 1000 }, null, 1000);
    Graph.zoomToFit(1000, 100);
    updateVisibility(() => true);
    searchInput.value = '';
    resetViewBtn.blur();
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
    const currentDistance = Graph.cameraDistance();
    const newDistance = currentDistance * (e.deltaY > 0 ? 1.1 : 0.9);
    Graph.cameraDistance(Math.max(200, Math.min(2000, newDistance)), 200);
  });

  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth);
    Graph.height(window.innerHeight);
  });
}
