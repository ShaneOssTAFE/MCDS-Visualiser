// Function to parse your JSON schema and generate graph data
function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // D3 color scale for distinct colors
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Step 1: Create nodes from "properties"
    Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        const node = {
            id: key,
            label: prop.title || key,
            group: "entity",
            description: prop.description || "",
            properties: prop.type === "array" && prop.items && prop.items["$ref"]
                ? schema.definitions[prop.items["$ref"].split("/").pop()].properties || {}
                : prop.properties || {},
            color: "#00d1b2" // Teal for entities
        };
        nodes.push(node);
        nodeMap.set(key, node);
    });

    // Step 2: Create nodes from "definitions" (optional, for referenced types)
    Object.keys(schema.definitions).forEach(defKey => {
        if (!nodeMap.has(defKey + "s") && !defKey.endsWith("ID") && !["partyType", "gender"].includes(defKey)) {
            const def = schema.definitions[defKey];
            const node = {
                id: defKey,
                label: def.title || defKey,
                group: "definition",
                description: def.description || "",
                properties: def.properties || {},
                color: "#ff6b6b" // Red for definitions
            };
            nodes.push(node);
            nodeMap.set(defKey, node); // Fixed: Use 'defKey' instead of 'key'
        }
    });

    // Step 3: Extract relationships (links)
    nodes.forEach(node => {
        const props = node.properties;
        if (props) {
            Object.keys(props).forEach(propKey => {
                const prop = props[propKey];
                if (prop["$ref"]) {
                    const refPath = prop["$ref"].split("/").pop();
                    let targetNodeId = refPath;
                    if (refPath.endsWith("ID")) {
                        targetNodeId = refPath.replace("ID", "s");
                    } else if (nodeMap.has(refPath + "s")) {
                        targetNodeId = refPath + "s";
                    }
                    if (nodeMap.has(targetNodeId)) {
                        links.push({
                            source: node.id,
                            target: targetNodeId,
                            label: propKey
                        });
                    }
                }
                if (prop.type === "array" && prop.items && prop.items["$ref"]) {
                    const refPath = prop.items["$ref"].split("/").pop();
                    let targetNodeId = refPath;
                    if (refPath.endsWith("ID")) {
                        targetNodeId = refPath.replace("ID", "s");
                    } else if (nodeMap.has(refPath + "s")) {
                        targetNodeId = refPath + "s";
                    }
                    if (nodeMap.has(targetNodeId)) {
                        links.push({
                            source: node.id,
                            target: targetNodeId,
                            label: propKey
                        });
                    }
                }
            });
        }
    });

    return { nodes, links };
}

// Load your JSON schema and initialize the graph
fetch("schema.json")
    .then(response => response.json())
    .then(schema => {
        const graphData = generateGraphData(schema);

        // Initialize the 3D force-directed graph
        const Graph = ForceGraph3D()(document.getElementById("graph"))
            .graphData(graphData)
            .nodeLabel(node => node.label)
            .nodeAutoColorBy('group') // Color nodes by group
            .linkAutoColorBy(d => {
                const sourceNode = typeof d.source === 'object' ? d.source : graphData.nodes.find(n => n.id === d.source);
                return sourceNode ? sourceNode.group : 'default';
            })
            .linkWidth(2)
            .linkOpacity(0.5)
            .backgroundColor("#1a1a1a")
            
            // Add Particle Effects to Nodes
            .nodeThreeObject(node => {
                const group = new THREE.Group();
                
                // Main sphere (node)
                const geometry = new THREE.SphereGeometry(6);
                const material = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.9 });
                const sphere = new THREE.Mesh(geometry, material);
                group.add(sphere);
                
                // Particle halo
                const particleGeo = new THREE.BufferGeometry();
                const positions = [];
                for (let i = 0; i < 50; i++) {
                    const theta = Math.random() * 2 * Math.PI;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const r = 8 + Math.random() * 2;
                    positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
                }
                particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                const particleMat = new THREE.PointsMaterial({ color: node.color, size: 2, transparent: true, opacity: 0.5 });
                const particles = new THREE.Points(particleGeo, particleMat);
                group.add(particles);
                
                return group;
            })
            
            // Add Animated Links (Dashed Links)
            .linkThreeObject(link => {
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(1, 0, 0)
                ]);
                const material = new THREE.LineDashedMaterial({
                    color: link.source.group === 'entity' ? '#00d1b2' : '#ff6b6b',
                    dashSize: 5,
                    gapSize: 3,
                    transparent: true,
                    opacity: 0.7
                });
                const line = new THREE.Line(geometry, material);
                line.computeLineDistances();
                return line;
            })
            .onEngineTick(() => {
                Graph.scene().children.forEach(obj => {
                    if (obj.type === 'Line') obj.material.dashOffset -= 0.1; // Animate dash
                });
            })
            
            // Add Starry Background
            .onEngineTick(() => {
                const starGeo = new THREE.BufferGeometry();
                const starPos = [];
                for (let i = 0; i < 1000; i++) {
                    starPos.push((Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000);
                }
                starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
                const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
                const stars = new THREE.Points(starGeo, starMat);
                Graph.scene().add(stars);
            });

        // Handle Node Hover and Click Events
        Graph.d3Force("charge").strength(-200);
        Graph.d3Force("link").distance(100);

        // Search and Filter Logic
        document.getElementById('search').addEventListener('input', function(event) {
            const searchTerm = event.target.value.toLowerCase();
            graphData.nodes.forEach(node => {
                if (node.label.toLowerCase().includes(searchTerm)) {
                    node.visible = true;
                } else {
                    node.visible = false;
                }
            });
            Graph.graphData(graphData);
        });

        document.getElementById('filterEntities').addEventListener('click', function() {
            graphData.nodes.forEach(node => {
                node.visible = node.group === 'entity';
            });
            Graph.graphData(graphData);
        });

        document.getElementById('filterDefs').addEventListener('click', function() {
            graphData.nodes.forEach(node => {
                node.visible = node.group === 'definition';
            });
            Graph.graphData(graphData);
        });
    })
    .catch(error => console.error("Error loading JSON:", error));
