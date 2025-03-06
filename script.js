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
    if (!seenNodes.has(id) && (data.properties || type === 'entity')) {
      const properties = data.properties 
        ? Object.entries(data.properties).map(([propName, prop]) => ({
            name: propName,
            type: prop.type || (prop['$ref'] ? prop['$ref'].split('/').pop() : 'unknown'),
            description: prop.description || ''
          }))
        : [];
      const hasTitle = !!data.title;
      const hasDesc = !!data.description;
      const hasProps = properties.length > 0;
      const completeness = (hasTitle + hasDesc + hasProps) / 3 * 100; // 0-100%
      nodes.push({
        id,
        name: data.title || id,
        type,
        description: data.description || '',
        group: type === 'entity' ? 0 : 1,
        size: type === 'entity' ? 8 : 6,
        properties,
        completeness,
        cluster: type === 'entity' ? id : null // Cluster by entity
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
          const sourceNode = nodes.find(n => n.id === sourceId);
          if (!sourceNode.cluster) sourceNode.cluster = targetId; // Cluster definitions under referenced entities
        } else {
          nodes.find(n => n.id === sourceId).hasBrokenRef = true; // Flag broken refs
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
    .nodeLabel('')
    .nodeColor(node => {
      if (node.highlighted) return '#FFFF00'; // Yellow for highlighted
      if (node.completeness === 100) return node.group === 0 ? '#00FF00' : '#FF00FF'; // Green or magenta
      if (node.completeness >= 50) return '#FFFF00'; // Yellow
      return '#FF0000'; // Red
    })
    .nodeVal(node => node.size)
    .nodeOpacity(0.9)
    .nodeThreeObject(node => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(node.size / 2),
        new THREE.MeshBasicMaterial({ 
          color: node.highlighted ? '#FFFF00' : (node.completeness === 100 ? (node.group === 0 ? '#00FF00' : '#FF00FF') : node.completeness >= 50 ? '#FFFF00' : '#FF0000')
        })
      );
      if (node.hasBrokenRef) {
        const outline = new THREE.Mesh(
          new THREE.SphereGeometry(node.size / 2 + 0.5),
          new THREE.MeshBasicMaterial({ color: '#FF0000', wireframe: true })
        );
        const group = new THREE.Group();
        group.add(sphere, outline);
        return group;
      }
      return sphere;
    })
    .linkColor(() => '#FFFFFF')
    .linkWidth(0.5)
    .linkOpacity(0.7)
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowRelPos(1)
    .backgroundColor('#1a1a1a')
    .forceEngine('d3')
    .d3Force('cluster', nodes => {
      const clusters = {};
      nodes.forEach(node => {
        const clusterId = node.cluster || 'misc';
        if (!clusters[clusterId]) clusters[clusterId] = { x: 0, y: 0, count: 0 };
        clusters[clusterId].x += node.x || 0;
        clusters[clusterId].y += node.y || 0;
        clusters[clusterId].count++;
      });
      nodes.forEach(node => {
        const cluster = clusters[node.cluster || 'misc'];
        node.vx += (cluster.x / cluster.count - node.x) * 0.05;
        node.vy += (cluster.y / cluster.count - node.y) * 0.05;
      });
    });

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  Graph.onNodeHover(node => {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.display = node ? 'block' : 'none';
    nodes.forEach(n => n.highlighted = false);
    links.forEach(l => l.highlighted = false);
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
        <em>Completeness:</em> ${node.completeness.toFixed(0)}%<br/>
        <em>Properties:</em><br/>${propList}
      `;
      node.highlighted = true;
      links.forEach(l => {
        if (l.source.id === node.id) {
          l.highlighted = true;
          nodes.find(n => n.id === l.target.id).highlighted = true;
        } else if (l.target.id === node.id) {
          l.highlighted = true;
          nodes.find(n => n.id === l.source.id).highlighted = true;
        }
      });
    }
    Graph.nodeColor(n => n.highlighted ? '#FFFF00' : (n.completeness === 100 ? (n.group === 0 ? '#00FF00' : '#FF00FF') : n.completeness >= 50 ? '#FFFF00' : '#FF0000'))
         .linkColor(l => l.highlighted ? '#FFFF00' : '#FFFFFF');
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

  // Existing controls
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

  // Interactive Legend
  const legend = document.createElement('div');
  legend.style.position = 'absolute';
  legend.style.top = '10px';
  legend.style.right = '10px';
  legend.style.background = 'rgba(0, 0, 0, 0.8)';
  legend.style.padding = '10px';
  legend.style.color = '#fff';
  legend.style.borderRadius = '5px';
  legend.innerHTML = `
    <div id="legend-entities" style="cursor:pointer"><span style="color:#00FF00">■</span> Entities</div>
    <div id="legend-defs" style="cursor:pointer"><span style="color:#FF00FF">■</span> Definitions</div>
  `;
  document.body.appendChild(legend);

  document.getElementById('legend-entities').addEventListener('click', () => {
    updateVisibility(node => node.type === 'entity');
  });
  document.getElementById('legend-defs').addEventListener('click', () => {
    updateVisibility(node => node.type === 'definition');
  });

  // Export Button
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export Data';
  exportBtn.style.position = 'absolute';
  exportBtn.style.bottom = '10px';
  exportBtn.style.right = '10px';
  exportBtn.style.padding = '8px 12px';
  exportBtn.style.background = '#333';
  exportBtn.style.color = '#fff';
  exportBtn.style.border = '2px solid #fff';
  exportBtn.style.borderRadius = '4px';
  exportBtn.style.cursor = 'pointer';
  document.body.appendChild(exportBtn);

  exportBtn.addEventListener('click', () => {
    const data = { nodes: nodes.filter(n => n.visible !== false), links };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema-export.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Interaction
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
