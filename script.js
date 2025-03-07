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

  // First pass: Add all nodes
  Object.entries(schema.properties).forEach(([id, entity]) => {
    addNode(id, entity, 'entity');
  });

  Object.entries(schema.definitions).forEach(([id, definition]) => {
    addNode(id, definition, 'definition');
  });

  // Second pass: Create links and assign clusters
  nodes.forEach(node => {
    const schemaNode = node.type === 'entity' 
      ? schema.properties[node.id]
      : schema.definitions[node.id];
    traverseProperties(schemaNode, node.id);
  });

  // Third pass: Update entity completeness based on referenced definitions
  nodes.forEach(node => {
    if (node.type === 'entity') {
      const referencedDefs = links
        .filter(link => link.source.id === node.id)
        .map(link => nodes.find(n => n.id === link.target.id))
        .filter(n => n && n.type === 'definition');
      if (referencedDefs.length > 0) {
        const avgCompleteness = referencedDefs.reduce((sum, def) => sum + def.completeness, 0) / referencedDefs.length;
        node.completeness = avgCompleteness;
      } else {
        // Fallback if no definitions (based on title/description)
        const hasTitle = !!schema.properties[node.id].title;
        const hasDesc = !!(schema.properties[node.id].description || schema.properties[node.id].$comment);
        node.completeness = (hasTitle + hasDesc) / 2 * 100 || 0;
      }
    }
  });

  function addNode(id, data, type) {
    if (!seenNodes.has(id) && (data.properties || data.enum || data.type || type === 'entity' || type === 'definition')) {
      const properties = data.properties 
        ? Object.entries(data.properties).map(([propName, prop]) => ({
            name: propName,
            type: prop.type || (prop['$ref'] ? prop['$ref'].split('/').pop() : 'unknown'),
            description: prop.description || ''
          }))
        : [];
      const hasTitle = !!data.title;
      const description = data.description || data.$comment || null;
      const hasDesc = description !== null;
      const hasProps = properties.length > 0;
      const hasEnum = Array.isArray(data.enum) && data.enum.length > 0;
      const isSimpleTypeComplete = !hasProps && !hasEnum && ['string', 'integer', 'number', 'boolean'].includes(data.type);
      const completeness = (hasTitle + hasDesc + (hasProps || hasEnum || isSimpleTypeComplete)) / 3 * 100;
      nodes.push({
        id,
        name: data.title || id,
        type,
        description,
        group: type === 'entity' ? 0 : 1,
        size: type === 'entity' ? 8 : 6,
        properties,
        enum: data.enum || [],
        completeness,
        cluster: type === 'entity' ? id : null
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
          if (!sourceNode.cluster) sourceNode.cluster = targetId;
        } else {
          nodes.find(n => n.id === sourceId).hasBrokenRef = true;
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
  const Graph = ForceGraph3D()(document.getElementById('graph'));

  Graph.graphData({ nodes, links })
    .nodeLabel(node => node.highlighted ? node.name : '')
    .nodeColor(node => {
      if (node.highlighted) return '#FFFF00';
      if (node.completeness === 100) return node.group === 0 ? '#00FF00' : '#FF00FF';
      if (node.completeness >= 50) return '#FFFF00';
      return '#FF0000';
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
    .d3Force('cluster', nodeArray => {
      if (!Array.isArray(nodeArray)) {
        console.error('Cluster force received invalid nodes:', nodeArray);
        return;
      }
      const clusters = {};
      nodeArray.forEach(node => {
        const clusterId = node.cluster || 'misc';
        if (!clusters[clusterId]) clusters[clusterId] = { x: 0, y: 0, count: 0 };
        clusters[clusterId].x += node.x || 0;
        clusters[clusterId].y += node.y || 0;
        clusters[clusterId].count++;
      });
      nodeArray.forEach(node => {
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
      const schemaNode = node.type === 'entity' ? schema.properties[node.id] : schema.definitions[node.id];
      const nodeType = schemaNode.type || (node.properties.length > 0 ? 'object' : 'unknown');
      const hasTitle = !!schemaNode.title;
      const descriptionText = node.description === null ? 'N/A' : (node.description === '' ? '(empty)' : node.description);
      const hasDesc = node.description !== null;
      const hasProps = node.properties.length > 0;
      const hasEnum = Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0;
      const isSimpleTypeComplete = !hasProps && !hasEnum && ['string', 'integer', 'number', 'boolean'].includes(schemaNode.type);
      const qualityIssues = [];
      if (node.completeness < 100) {
        if (!hasTitle) qualityIssues.push('Missing title');
        if (!hasDesc) qualityIssues.push('Missing description');
        if (!hasProps && !hasEnum && !isSimpleTypeComplete) qualityIssues.push('Missing properties');
        if (!hasEnum && !hasProps && !isSimpleTypeComplete) qualityIssues.push('Missing enum');
      }
      const propList = node.properties.length > 0 
        ? node.properties.map(p => `${p.name}: ${p.type}${p.description ? ' - ' + p.description : ''}`).join('<br/>')
        : node.enum && node.enum.length > 0 ? `Enum: ${node.enum.join(', ').substring(0, 100)}${node.enum.join(', ').length > 100 ? '...' : ''}` : 'None';
      tooltip.innerHTML = `
        <strong>${node.name}</strong><br/>
        <em>Type:</em> ${nodeType}<br/>
        <em>Description:</em> ${descriptionText}<br/>
        <em>Completeness:</em> ${node.completeness.toFixed(0)}%<br/>
        <em>Properties/Enum:</em><br/>${propList}
        ${qualityIssues.length > 0 ? `<br/><em>Data Quality Issues:</em> ${qualityIssues.join(', ')}` : ''}
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
    Graph.nodeColor(n => n.highlighted ? '#FFFF00' : (n.completeness === 100 ? (node.group === 0 ? '#00FF00' : '#FF00FF') : n.completeness >= 50 ? '#FFFF00' : '#FF0000'))
         .linkColor(l => l.highlighted ? '#FFFF00' : '#FFFFFF');
  });

  let lastClickTime = 0;
  const doubleClickThreshold = 300;
  Graph.onNodeClick(node => {
    const currentTime = Date.now();
    if (currentTime - lastClickTime < doubleClickThreshold) {
      const clusterNodes = nodes.filter(n => n.cluster === node.cluster && n.visible !== false);
      const center = clusterNodes.reduce((acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y, z: acc.z + n.z }), { x: 0, y: 0, z: 0 });
      center.x /= clusterNodes.length;
      center.y /= clusterNodes.length;
      center.z /= clusterNodes.length;
      Graph.cameraPosition(
        { x: center.x, y: center.y, z: center.z + 300 },
        center,
        1000
      );
    } else {
      Graph.cameraPosition(
        { x: node.x, y: node.y, z: node.z + 300 },
        node,
        1000
      );
    }
    lastClickTime = currentTime;
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

  // Create and position the completeness slider and label
  const completenessFilter = document.createElement('input');
  completenessFilter.type = 'range';
  completenessFilter.min = '0';
  completenessFilter.max = '100';
  completenessFilter.value = '0';
  completenessFilter.style.width = '200px';
  completenessFilter.style.margin = '5px';

  const completenessLabel = document.createElement('span');
  completenessLabel.textContent = 'Min Completeness: 0%';
  completenessFilter.addEventListener('input', e => {
    const minCompleteness = parseInt(e.target.value);
    completenessLabel.textContent = `Min Completeness: ${minCompleteness}%`;
    updateVisibility(node => node.completeness >= minCompleteness);
  });

  // Insert the slider and label between filterDefsBtn and resetViewBtn
  const controls = document.getElementById('controls');
  if (controls) {
    console.log('Controls div found, adding slider and label');
    controls.insertBefore(completenessFilter, resetViewBtn);
    controls.insertBefore(completenessLabel, resetViewBtn);
  } else {
    console.error('Controls div not found in the DOM');
  }

  // Create and append Save View and Restore View buttons
  let savedPosition = null;
  const saveViewBtn = document.createElement('button');
  saveViewBtn.textContent = 'Save View';
  saveViewBtn.style.margin = '5px';
  controls.appendChild(saveViewBtn);
  
  const restoreViewBtn = document.createElement('button');
  restoreViewBtn.textContent = 'Restore View';
  restoreViewBtn.style.margin = '5px';
  controls.appendChild(restoreViewBtn);

  saveViewBtn.addEventListener('click', () => {
    savedPosition = Graph.cameraPosition();
    saveViewBtn.blur();
  });

  restoreViewBtn.addEventListener('click', () => {
    if (savedPosition) {
      Graph.cameraPosition(savedPosition, null, 1000);
    }
    restoreViewBtn.blur();
  });

  // Create and hide the export button
  const exportBtn = document.createElement('button');
  exportBtn.id = 'exportBtn';
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
  exportBtn.style.display = 'none'; // Hide the export button
  document.body.appendChild(exportBtn);

  // Remove the export button's event listener since it's hidden
  // (No need to define the click handler if it's not visible)

  const qualityPanel = document.createElement('div');
  qualityPanel.style.position = 'absolute';
  qualityPanel.style.top = '10px';
  qualityPanel.style.right = '10px';
  qualityPanel.style.background = 'rgba(0, 0, 0, 0.8)';
  qualityPanel.style.padding = '10px';
  qualityPanel.style.color = '#fff';
  qualityPanel.style.borderRadius = '5px';
  const avgCompleteness = nodes.reduce((sum, node) => sum + node.completeness, 0) / nodes.length;
  const brokenRefs = nodes.filter(n => n.hasBrokenRef).length;
  qualityPanel.innerHTML = `
    <strong>Data Quality Summary</strong><br/>
    Avg. Completeness: ${avgCompleteness.toFixed(0)}%<br/>
    Broken References: ${brokenRefs}
  `;
  document.body.appendChild(qualityPanel);

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
