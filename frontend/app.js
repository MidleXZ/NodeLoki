let editor = null;
let container = null;
let selectedElement = null;
let selectedNodeId = null;
let activeTargetNodeId = null;
let elementCounter = 1;
let isRunning = false;
let currentProjectId = null;

// -------------------------------------------------------------
// 0. INITIALIZATION & GLOBAL EXPOSURE (CRITICAL FOR ONCLICK)
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded successfully. Connecting frontend...");

  container = document.getElementById("drawflow");
  if (container) {
    try {
      editor = new Drawflow(container);
      editor.reroute = true;
      editor.start();

      editor.on('nodeSelected', (id) => {
        selectedNodeId = id;
        renderNodeInspector(id);
      });

      editor.on('nodeUnselected', () => {
        selectedNodeId = null;
        renderNodeInspector(null);
      });
    } catch (e) {
      console.warn("Drawflow initialization notice:", e);
    }
  }

  populateSidebar();

  // View switchers
  const nodeViewBtn = document.getElementById('view-nodes-btn');
  const appViewBtn = document.getElementById('view-app-btn');
  if (nodeViewBtn) nodeViewBtn.addEventListener('click', switchToNodeView);
  if (appViewBtn) appViewBtn.addEventListener('click', switchToAppView);

  // Picker cancel
  const cancelPickerBtn = document.getElementById('cancel-picker-btn');
  if (cancelPickerBtn) cancelPickerBtn.addEventListener('click', cancelElementPicker);

  // Search input
  const searchInput = document.getElementById('node-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      document.querySelectorAll('.drag-drawflow').forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(searchTerm) ? 'flex' : 'none';
      });
    });
  }

  // Header control buttons
  const saveProjectBtn = document.getElementById('save-project-btn');
  if (saveProjectBtn) saveProjectBtn.addEventListener('click', saveCurrentProject);

  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (isRunning) {
        stopAppExecution();
      } else {
        startAppExecution();
      }
    });
  }

  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isRunning) stopAppExecution();
      const nodeView = document.getElementById('node-view');

      if (nodeView && nodeView.classList.contains('active')) {
        if (editor) editor.clearModuleSelected();
        selectedNodeId = null;
        renderNodeInspector(null);
      } else {
        const appCanvas = document.getElementById('app-canvas');
        if (appCanvas) appCanvas.innerHTML = '';
        selectedElement = null;
        renderInspector();
      }
    });
  }

  // Bind new project button explicitly & robustly
  const modalNewBtn = document.getElementById('modal-new-btn');
  if (modalNewBtn) {
    modalNewBtn.onclick = createNewProject;
  }

  // App Canvas backdrop click to deselect UI
  const appCanvas = document.getElementById('app-canvas');
  if (appCanvas) {
    appCanvas.addEventListener('click', (e) => {
      if (e.target === appCanvas && !isRunning && activeTargetNodeId === null) {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        renderInspector();
      }
    });
  }

  // Show project startup modal and fetch server projects
  showProjectModal();
});

// Explicitly bind functions to window scope for inline HTML onclick attributes
window.loadProject = loadProject;
window.deleteProject = deleteProject;
window.startElementPicker = startElementPicker;
window.toggleNodeOptions = toggleNodeOptions;
window.createNewProject = createNewProject;

// -------------------------------------------------------------
// 1. VIEW SWITCHER & TARGET PICKER MODE
// -------------------------------------------------------------
function switchToNodeView() {
  const nodeViewBtn = document.getElementById('view-nodes-btn');
  const appViewBtn = document.getElementById('view-app-btn');
  const nodeView = document.getElementById('node-view');
  const appView = document.getElementById('app-view');

  if (nodeViewBtn) nodeViewBtn.classList.add('active');
  if (appViewBtn) appViewBtn.classList.remove('active');
  if (nodeView) nodeView.classList.add('active');
  if (appView) appView.classList.remove('active');
}

function switchToAppView() {
  const nodeViewBtn = document.getElementById('view-nodes-btn');
  const appViewBtn = document.getElementById('view-app-btn');
  const nodeView = document.getElementById('node-view');
  const appView = document.getElementById('app-view');

  if (appViewBtn) appViewBtn.classList.add('active');
  if (nodeViewBtn) nodeViewBtn.classList.remove('active');
  if (appView) appView.classList.add('active');
  if (nodeView) nodeView.classList.remove('active');
}

function startElementPicker(nodeId) {
  activeTargetNodeId = nodeId;
  switchToAppView();
  const pickerBanner = document.getElementById('picker-banner');
  if (pickerBanner) pickerBanner.classList.remove('hidden');
  document.querySelectorAll('.ui-element').forEach(el => el.classList.add('picking-highlight'));
}

function cancelElementPicker() {
  activeTargetNodeId = null;
  const pickerBanner = document.getElementById('picker-banner');
  if (pickerBanner) pickerBanner.classList.add('hidden');
  document.querySelectorAll('.ui-element').forEach(el => el.classList.remove('picking-highlight'));
}

function toggleNodeOptions(nodeId) {
  const fieldsContainer = document.getElementById(`node-fields-${nodeId}`);
  if (fieldsContainer) {
    fieldsContainer.classList.toggle('hidden');
  }
}

// -------------------------------------------------------------
// 2. NODE LOGIC REGISTRY & DYNAMIC TYPE INSPECTOR
// -------------------------------------------------------------
const NODE_TYPES = {
  trigger_click: {
    name: 'Button Click Trigger', cat: 'trigger', icon: 'fa-hand-pointer', inputs: 0, outputs: 1,
    fields: [{ label: 'Target Element', type: 'picker', key: 'target', val: 'Unselected' }]
  },
  trigger_timer: {
    name: 'Timer / Interval', cat: 'trigger', icon: 'fa-clock', inputs: 0, outputs: 1,
    fields: [
      { label: 'Interval (ms)', type: 'number', key: 'time', val: '1000' },
      { label: 'Repeat Mode', type: 'select', key: 'repeat', options: ['Loop Continuously', 'Run Once On Start'] }
    ]
  },
  logic_condition: {
    name: 'If / Else Switch', cat: 'logic', icon: 'fa-code-branch', inputs: 1, outputs: 2,
    fields: [
      { label: 'Condition Operator', type: 'select', key: 'cond', options: ['Equals', 'Greater Than', 'Less Than', 'Contains', 'Not Equal'] },
      { label: 'Comparison Value', type: 'text', key: 'compareVal', val: '0' }
    ]
  },
  logic_variable: {
    name: 'Set State Variable', cat: 'logic', icon: 'fa-database', inputs: 1, outputs: 1,
    fields: [
      { label: 'Variable Name', type: 'text', key: 'var', val: 'count' },
      { label: 'Initial Value', type: 'text', key: 'val', val: '0' }
    ]
  },
  math_calc: {
    name: 'Math Calculator', cat: 'logic', icon: 'fa-calculator', inputs: 2, outputs: 1,
    fields: [
      { label: 'Operation', type: 'select', key: 'op', options: ['Addition (+)', 'Subtraction (-)', 'Multiplication (*)', 'Division (/)'] },
      { label: 'Operand B Default', type: 'number', key: 'operandB', val: '1' }
    ]
  },
  action_ui: {
    name: 'Update UI Element', cat: 'action', icon: 'fa-pen-to-square', inputs: 1, outputs: 0,
    fields: [
      { label: 'Target Element', type: 'picker', key: 'target', val: 'Unselected' },
      { label: 'Update Property', type: 'select', key: 'property', options: ['Text Content', 'Visibility', 'Background Color', 'Disabled State', 'Custom CSS Class'] },
      { label: 'Set Value To', type: 'text', key: 'value', val: 'New Value' },
      { label: 'CSS Class Name', type: 'text', key: 'className', val: 'active-style', dependsOn: { property: 'Custom CSS Class' } }
    ]
  },
  action_alert: {
    name: 'Show Alert Popup', cat: 'action', icon: 'fa-bell', inputs: 1, outputs: 0,
    fields: [
      { label: 'Popup Message', type: 'text', key: 'msg', val: 'Hello World!' },
      { label: 'Alert Level', type: 'select', key: 'level', options: ['Info', 'Success', 'Warning', 'Error'] }
    ]
  }
};

function populateSidebar() {
  const listContainer = document.getElementById("nodes-list");
  if (!listContainer) return;
  listContainer.innerHTML = '';
  const categories = { trigger: 'Triggers', logic: 'Logic & Math', action: 'Actions' };

  Object.keys(categories).forEach(catKey => {
    const title = document.createElement('div');
    title.className = 'category-title';
    title.innerText = categories[catKey];
    listContainer.appendChild(title);

    Object.keys(NODE_TYPES).forEach(typeKey => {
      const node = NODE_TYPES[typeKey];
      if (node.cat === catKey) {
        const item = document.createElement('div');
        item.className = `drag-drawflow ${node.cat}`;
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-node', typeKey);
        item.innerHTML = `<i class="fa-solid ${node.icon}"></i> ${node.name}`;
        item.addEventListener('dragstart', (ev) => ev.dataTransfer.setData("node", typeKey));
        listContainer.appendChild(item);
      }
    });
  });
}

function allowDrop(ev) { ev.preventDefault(); }

function dropNode(ev) {
  ev.preventDefault();
  const nodeType = ev.dataTransfer.getData("node");
  if (!NODE_TYPES[nodeType] || !editor) return;

  const rect = container.getBoundingClientRect();
  const posX = (ev.clientX - rect.left) * (editor.precidencenode || 1);
  const posY = (ev.clientY - rect.top) * (editor.precidencenode || 1);

  createNode(nodeType, posX, posY);
}

function createNode(typeKey, posX, posY) {
  const spec = NODE_TYPES[typeKey];
  let fieldsHTML = '';
  let initialData = { typeKey };

  spec.fields.forEach(f => {
    initialData[f.key] = f.val || (f.options ? f.options[0] : '');
  });

  const headerColors = { trigger: '#3a2e1d', logic: '#1d2b3a', action: '#1d382e' };
  const iconColors = { trigger: 'var(--cat-trigger)', logic: 'var(--cat-logic)', action: 'var(--cat-action)' };

  const dummyHtml = `<div class="node-header"><i class="fa-solid ${spec.icon}"></i> ${spec.name}</div>`;
  const createdNodeId = editor.addNode(typeKey, spec.inputs, spec.outputs, posX, posY, typeKey, initialData, dummyHtml);

  spec.fields.forEach(field => {
    if (field.type === 'picker') {
      fieldsHTML += `
        <label>${field.label}</label>
        <input type="text" id="target-display-${createdNodeId}" df-${field.key} value="${field.val}" readonly style="margin-bottom:4px;">
        <button type="button" class="btn picker-btn small" onclick="startElementPicker(${createdNodeId})">
          <i class="fa-solid fa-crosshairs"></i> Select Element
        </button>`;
    } else if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}">${o}</option>`).join('');
      fieldsHTML += `<label>${field.label}</label><select df-${field.key}>${opts}</select>`;
    } else {
      fieldsHTML += `<label>${field.label}</label><input type="${field.type}" df-${field.key} value="${field.val || ''}">`;
    }
  });

  const fullHtml = `
    <div class="node-header" style="background:${headerColors[spec.cat]}; color:${iconColors[spec.cat]};">
      <i class="fa-solid ${spec.icon}"></i> ${spec.name}
    </div>
    <div class="node-body">
      <button type="button" class="btn toggle-options-btn small" onclick="toggleNodeOptions(${createdNodeId})">
        <i class="fa-solid fa-sliders"></i> Options
      </button>
      <div id="node-fields-${createdNodeId}" class="node-fields-container hidden" style="margin-top:8px;">
        ${fieldsHTML}
      </div>
    </div>`;

  editor.updateNodeHtml(createdNodeId, fullHtml);
}

function renderNodeInspector(nodeId) {
  const panel = document.getElementById('node-inspector-content');
  if (!panel) return;

  if (!nodeId || !editor) {
    panel.innerHTML = `<p class="empty-msg">Click any node on the canvas to inspect its properties.</p>`;
    return;
  }

  const nodeData = editor.getNodeFromId(nodeId);
  if (!nodeData) return;

  const typeKey = nodeData.name;
  const spec = NODE_TYPES[typeKey];

  let typeSpecificArea = '';
  spec.fields.forEach(field => {
    const currentVal = nodeData.data[field.key] || field.val || '';

    if (field.dependsOn) {
      const depKey = Object.keys(field.dependsOn)[0];
      const requiredVal = field.dependsOn[depKey];
      if (nodeData.data[depKey] !== requiredVal) {
        return;
      }
    }

    if (field.type === 'picker') {
      typeSpecificArea += `
        <div class="field-group">
          <label>${field.label}</label>
          <input type="text" id="inspector-node-target-${nodeId}" value="${currentVal}" readonly style="margin-bottom:6px;">
          <button type="button" class="btn picker-btn small" onclick="startElementPicker(${nodeId})">
            <i class="fa-solid fa-crosshairs"></i> Select Element
          </button>
        </div>`;
    } else if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}" ${o === currentVal ? 'selected' : ''}>${o}</option>`).join('');
      typeSpecificArea += `
        <div class="field-group">
          <label>${field.label}</label>
          <select id="inspector-node-field-${field.key}">${opts}</select>
        </div>`;
    } else {
      typeSpecificArea += `
        <div class="field-group">
          <label>${field.label}</label>
          <input type="${field.type}" id="inspector-node-field-${field.key}" value="${currentVal}">
        </div>`;
    }
  });

  panel.innerHTML = `
    <div class="field-group">
      <label>Node ID</label>
      <input type="text" value="#node-${nodeId}" readonly style="opacity:0.6;">
    </div>
    <div class="field-group">
      <label>Node Category / Type</label>
      <input type="text" value="[${spec.cat.toUpperCase()}] ${spec.name}" readonly style="opacity:0.6;">
    </div>
    <div class="type-settings-box" style="border:1px solid var(--border-color); padding:10px; border-radius:6px; margin:8px 0; background:rgba(0,0,0,0.15);">
      <div style="font-size:0.75rem; font-weight:bold; color:var(--primary-accent); margin-bottom:8px; text-transform:uppercase;">
        ${spec.name} Configurations
      </div>
      ${typeSpecificArea}
    </div>
    <div class="field-group">
      <button type="button" id="delete-node-btn" class="btn secondary" style="width:100%; justify-content:center; margin-top:10px;">
        <i class="fa-solid fa-trash"></i> Delete Node
      </button>
    </div>
  `;

  spec.fields.forEach(field => {
    if (field.type !== 'picker') {
      const inputEl = document.getElementById(`inspector-node-field-${field.key}`);
      if (inputEl) {
        const updateVal = (e) => {
          nodeData.data[field.key] = e.target.value;
          editor.updateNodeDataFromId(nodeId, nodeData.data);
          const canvasInput = document.querySelector(`#node-${nodeId} [df-${field.key}]`);
          if (canvasInput) canvasInput.value = e.target.value;

          if (field.type === 'select') {
            renderNodeInspector(nodeId);
          }
        };
        inputEl.addEventListener('change', updateVal);
        inputEl.addEventListener('input', updateVal);
      }
    }
  });

  const deleteNodeBtn = document.getElementById('delete-node-btn');
  if (deleteNodeBtn) {
    deleteNodeBtn.addEventListener('click', () => {
      editor.removeNodeId(`node-${nodeId}`);
      renderNodeInspector(null);
    });
  }
}

// -------------------------------------------------------------
// 3. APP DESIGNER, DRAG, RESIZE
// -------------------------------------------------------------
function dragUI(ev) {
  ev.dataTransfer.setData("ui_type", ev.target.getAttribute('data-ui'));
}

function dropUI(ev) {
  ev.preventDefault();
  const uiType = ev.dataTransfer.getData("ui_type");
  if (!uiType) return;

  const appCanvas = document.getElementById("app-canvas");
  if (!appCanvas) return;

  const rect = appCanvas.getBoundingClientRect();
  const posX = ev.clientX - rect.left - 40;
  const posY = ev.clientY - rect.top - 20;

  const elementId = `${uiType}_${elementCounter++}`;
  const el = document.createElement("div");
  el.className = `ui-element ui-${uiType}`;
  el.setAttribute('id', elementId);
  el.setAttribute('data-uitype', uiType);
  el.style.left = `${posX}px`;
  el.style.top = `${posY}px`;
  el.style.width = '140px';
  el.style.height = '40px';

  let innerHTML = '';
  switch (uiType) {
    case 'frame': el.style.width = '200px'; el.style.height = '150px'; break;
    case 'card': el.style.width = '280px'; el.style.height = '120px'; break;
    case 'button': innerHTML = `<div class="ui-content ui-button">Button (${elementId})</div>`; break;
    case 'text': innerHTML = `<div class="ui-content ui-text">Text Label</div>`; break;
    case 'input': innerHTML = `<div class="ui-content ui-input"><input type="text" placeholder="Type here..."></div>`; break;
    case 'image': el.style.width = '100px'; el.style.height = '100px'; innerHTML = `<div class="ui-content ui-image"><i class="fa-solid fa-image fa-2x"></i></div>`; break;
  }

  el.innerHTML = innerHTML;
  makeDraggableAndSelectable(el);
  appCanvas.appendChild(el);

  if (activeTargetNodeId !== null) {
    assignElementToActiveNode(elementId);
  } else {
    selectElement(el);
  }
}

function assignElementToActiveNode(elementId) {
  const targetSelector = `#${elementId}`;
  
  // 1. Update the canvas view input field if present
  const targetInput = document.getElementById(`target-display-${activeTargetNodeId}`);
  if (targetInput) {
    targetInput.value = targetSelector;
  }
  
  // 2. Ensure Drawflow node data is correctly populated and synchronized
  if (editor) {
    const nodeData = editor.getNodeFromId(activeTargetNodeId);
    if (nodeData) {
      if (!nodeData.data) nodeData.data = {};
      nodeData.data.target = targetSelector;
      editor.updateNodeDataFromId(activeTargetNodeId, nodeData.data);
    }
  }

  // 3. Update the inspector panel input field if it's currently open
  const inspectorTargetInput = document.getElementById(`inspector-node-target-${activeTargetNodeId}`);
  if (inspectorTargetInput) {
    inspectorTargetInput.value = targetSelector;
  }
  
  // Clean up picker mode and return to node view
  cancelElementPicker();
  switchToNodeView();
  
  // Refresh inspector to reflect the newly saved target immediately
  if (selectedNodeId === activeTargetNodeId) {
    renderNodeInspector(activeTargetNodeId);
  }
}

function makeDraggableAndSelectable(element) {
  element.addEventListener('click', (e) => {
    if (activeTargetNodeId !== null) {
      e.stopPropagation();
      assignElementToActiveNode(element.id);
    } else if (!isRunning) {
      e.stopPropagation();
      selectElement(element);
    }
  });

  let pos3 = 0, pos4 = 0;
  element.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    if (isRunning || activeTargetNodeId) return;
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    const pos2 = pos4 - e.clientY;
    const pos1 = pos3 - e.clientX;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function selectElement(el) {
  if (selectedElement) selectedElement.classList.remove('selected');
  selectedElement = el;
  selectedElement.classList.add('selected');
  renderInspector();
}

// -------------------------------------------------------------
// 4. UI ELEMENT INSPECTOR PANEL
// -------------------------------------------------------------
function renderInspector() {
  const panel = document.getElementById('inspector-content');
  if (!panel) return;

  if (!selectedElement) {
    panel.innerHTML = `<p class="empty-msg">Click any item on the stage to customize its options.</p>`;
    return;
  }

  const uiType = selectedElement.getAttribute('data-uitype') || 'element';
  const contentDiv = selectedElement.querySelector('.ui-content') || selectedElement;
  const currentText = contentDiv.innerText || '';
  const bg = selectedElement.style.backgroundColor || '';
  const color = selectedElement.style.color || '';

  let typeSpecificFields = '';
  switch (uiType) {
    case 'button':
    case 'text':
      typeSpecificFields = `
        <div class="field-group">
          <label>Display Label</label>
          <input type="text" id="prop-text" value="${currentText}">
        </div>`;
      break;
    case 'input':
      const inputEl = selectedElement.querySelector('input');
      typeSpecificFields = `
        <div class="field-group">
          <label>Placeholder Text</label>
          <input type="text" id="prop-placeholder" value="${inputEl ? inputEl.placeholder : ''}">
        </div>`;
      break;
    default:
      typeSpecificFields = '';
  }

  panel.innerHTML = `
    <div class="field-group">
      <label>Element ID</label>
      <input type="text" value="${selectedElement.id}" readonly style="opacity:0.6;">
    </div>
    <div class="field-group">
      <label>Element Type</label>
      <input type="text" value="${uiType.toUpperCase()}" readonly style="opacity:0.6;">
    </div>
    <div class="type-settings-box" style="border:1px solid var(--border-color); padding:10px; border-radius:6px; margin:8px 0; background:rgba(0,0,0,0.15);">
      <div style="font-size:0.75rem; font-weight:bold; color:var(--cat-logic); margin-bottom:8px; text-transform:uppercase;">
        ${uiType} Specific Options
      </div>
      ${typeSpecificFields}
      <div class="field-group">
        <label>Background Color</label>
        <input type="color" id="prop-bg" value="${rgbToHex(bg) || '#282c34'}">
      </div>
      <div class="field-group">
        <label>Text / Accent Color</label>
        <input type="color" id="prop-color" value="${rgbToHex(color) || '#ffffff'}">
      </div>
    </div>
    <div class="field-group">
      <button type="button" id="delete-el-btn" class="btn secondary" style="width:100%; justify-content:center; margin-top:10px;">
        <i class="fa-solid fa-trash"></i> Delete Element
      </button>
    </div>
  `;

  const propText = document.getElementById('prop-text');
  if (propText) {
    propText.addEventListener('input', (e) => {
      if (contentDiv) contentDiv.innerText = e.target.value;
    });
  }

  const propPlaceholder = document.getElementById('prop-placeholder');
  if (propPlaceholder) {
    propPlaceholder.addEventListener('input', (e) => {
      const inp = selectedElement.querySelector('input');
      if (inp) inp.placeholder = e.target.value;
    });
  }

  const propBg = document.getElementById('prop-bg');
  if (propBg) {
    propBg.addEventListener('input', (e) => {
      selectedElement.style.backgroundColor = e.target.value;
    });
  }

  const propColor = document.getElementById('prop-color');
  if (propColor) {
    propColor.addEventListener('input', (e) => {
      selectedElement.style.color = e.target.value;
      if (contentDiv) contentDiv.style.color = e.target.value;
    });
  }

  const deleteElBtn = document.getElementById('delete-el-btn');
  if (deleteElBtn) {
    deleteElBtn.addEventListener('click', () => {
      selectedElement.remove();
      selectedElement = null;
      renderInspector();
    });
  }
}

function rgbToHex(rgb) {
  if (!rgb || !rgb.startsWith('rgb')) return '';
  const nums = rgb.match(/\d+/g);
  return "#" + nums.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}

// -------------------------------------------------------------
// 5. GRAPH EXECUTION ENGINE
// -------------------------------------------------------------
function executeNodeGraph(startNodeId, nodes) {
  if (!isRunning) return;

  const currentNode = nodes[startNodeId];
  if (!currentNode) return;

  const data = currentNode.data;

  if (data.typeKey === 'action_ui') {
    const targetSelector = data.target;
    if (targetSelector && targetSelector !== 'Unselected') {
      const elementId = targetSelector.replace('#', '');
      const targetEl = document.getElementById(elementId);
      if (targetEl) {
        const property = data.property;
        const value = data.value || '';

        switch (property) {
          case 'Text Content': {
            const contentDiv = targetEl.querySelector('.ui-content') || targetEl;
            contentDiv.innerText = value;
            break;
          }
          case 'Visibility': {
            const isHidden = value.toLowerCase() === 'false' || value.toLowerCase() === 'hidden' || value === '0';
            targetEl.style.display = isHidden ? 'none' : 'block';
            break;
          }
          case 'Background Color': {
            targetEl.style.backgroundColor = value;
            break;
          }
          case 'Disabled State': {
            const isDisabled = value.toLowerCase() === 'true' || value === '1';
            const inputChild = targetEl.querySelector('input, button');
            if (inputChild) inputChild.disabled = isDisabled;
            targetEl.style.pointerEvents = isDisabled ? 'none' : 'auto';
            targetEl.style.opacity = isDisabled ? '0.5' : '1';
            break;
          }
          case 'Custom CSS Class': {
            if (data.className) {
              targetEl.classList.add(data.className);
            }
            break;
          }
        }
      }
    }
  }

  if (data.typeKey === 'action_alert') {
    if (data.msg) {
      alert(`[${data.level || 'Info'}] ${data.msg}`);
    }
  }

  if (currentNode.outputs) {
    Object.keys(currentNode.outputs).forEach(outKey => {
      const connections = currentNode.outputs[outKey].connections;
      connections.forEach(conn => {
        executeNodeGraph(conn.node, nodes);
      });
    });
  }
}

function stopAppExecution() {
  isRunning = false;
  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.innerHTML = '<i class="fa-solid fa-play"></i> Run App';
    runBtn.style.backgroundColor = '';
  }

  document.querySelectorAll('.ui-element').forEach(el => {
    el.onclick = null;
    el.style.cursor = 'default';
  });
}

function startAppExecution() {
  isRunning = true;
  switchToAppView();

  if (selectedElement) {
    selectedElement.classList.remove('selected');
    selectedElement = null;
    renderInspector();
  }

  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop App';
    runBtn.style.backgroundColor = '#d9534f';
  }

  if (!editor) return;
  const exportData = editor.export();
  const nodes = exportData.drawflow.Home.data;

  Object.keys(nodes).forEach(nodeId => {
    const node = nodes[nodeId];
    if (node.data.typeKey === 'trigger_click') {
      const targetSelector = node.data.target;
      if (targetSelector && targetSelector !== 'Unselected') {
        const elementId = targetSelector.replace('#', '');
        const triggerEl = document.getElementById(elementId);
        if (triggerEl) {
          triggerEl.style.cursor = 'pointer';
          triggerEl.onclick = (e) => {
            e.stopPropagation();
            executeNodeGraph(nodeId, nodes);
          };
        }
      }
    }
  });
}

// -------------------------------------------------------------
// 6. BACKEND FILE-SYSTEM PROJECT MANAGEMENT & MODAL
// -------------------------------------------------------------
function showProjectModal() {
  const projectModal = document.getElementById('project-modal');
  if (projectModal) projectModal.classList.add('active');
  renderModalProjectList();
}

function hideProjectModal() {
  const projectModal = document.getElementById('project-modal');
  if (projectModal) projectModal.classList.remove('active');
}

async function renderModalProjectList() {
  const modalProjectList = document.getElementById('modal-project-list');
  if (!modalProjectList) return;

  modalProjectList.innerHTML = `<li style="padding:10px; color:#888;">Loading projects from /projects...</li>`;

  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to fetch projects');
    const projects = await response.json();

    modalProjectList.innerHTML = '';

    if (!projects || projects.length === 0) {
      modalProjectList.innerHTML = `<li style="padding:10px; color:#888;">No saved projects found in /projects folder. Create one to get started!</li>`;
      return;
    }

    projects.forEach(proj => {
      const li = document.createElement('li');
      li.className = 'project-item';
      li.innerHTML = `
        <span><i class="fa-solid fa-folder"></i> ${proj.name}</span>
        <div class="project-item-actions">
          <button type="button" class="btn small primary" onclick="loadProject('${proj.id}')"><i class="fa-solid fa-folder-open"></i> Open</button>
          <button type="button" class="btn small secondary" onclick="deleteProject('${proj.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      `;
      modalProjectList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    modalProjectList.innerHTML = `<li style="padding:10px; color:#e74c3c;">Could not load projects from server. Make sure node server.js is running.</li>`;
  }
}

async function saveCurrentProject() {
  if (!currentProjectId) {
    alert('No active project to save. Please create or open a project.');
    showProjectModal();
    return;
  }

  const appCanvas = document.getElementById('app-canvas');
  const flowData = editor ? editor.export() : null;
  const canvasHTML = appCanvas ? appCanvas.innerHTML : '';

  const projectPayload = {
    name: window.currentProjectName || 'Untitled Project',
    flow: flowData,
    canvasHTML: canvasHTML,
    elementCounter: elementCounter
  };

  try {
    const response = await fetch(`/api/projects/${currentProjectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectPayload)
    });

    if (!response.ok) throw new Error('Failed to save project data');
    alert(`Project saved successfully to /projects folder!`);
  } catch (err) {
    console.error(err);
    alert('Error saving project to server.');
  }
}

async function loadProject(projectId) {
  if (isRunning) stopAppExecution();

  try {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch project data');
    const projectData = await response.json();

    currentProjectId = projectId;
    window.currentProjectName = projectData.name || 'Project';
    elementCounter = projectData.elementCounter || 1;

    // Load nodes and connections into Drawflow
    if (editor) {
      editor.clear();
      if (projectData.flow) {
        editor.import(projectData.flow);
      }
    }

    // Load UI elements onto the App Canvas
    const appCanvas = document.getElementById('app-canvas');
    if (appCanvas) {
      appCanvas.innerHTML = projectData.canvasHTML || '';
      
      // Re-attach draggable and selectable handlers to all loaded UI elements
      appCanvas.querySelectorAll('.ui-element').forEach(el => {
        makeDraggableAndSelectable(el);
      });
    }

    selectedElement = null;
    selectedNodeId = null;
    renderInspector();
    renderNodeInspector(null);

    hideProjectModal();
  } catch (err) {
    console.error(err);
    alert('Could not load project data.');
  }
}

async function createNewProject() {
  const name = prompt('Enter a name for your new project:', 'My New Project');
  if (!name || name.trim() === '') return;

  const projectNameFormatted = name.trim();

  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectNameFormatted })
    });

    if (!response.ok) {
      const errRes = await response.json();
      throw new Error(errRes.error || 'Server folder creation failed');
    }

    const result = await response.json();
    currentProjectId = result.id;
    window.currentProjectName = result.name;

    // Reset editor canvas
    if (editor) editor.clear();
    const appCanvas = document.getElementById('app-canvas');
    if (appCanvas) appCanvas.innerHTML = '';
    selectedElement = null;
    selectedNodeId = null;
    elementCounter = 1;
    renderInspector();
    renderNodeInspector(null);

    hideProjectModal();
    console.log(`Folder created successfully inside /projects for "${result.name}"!`);
  } catch (err) {
    console.error("Failed to create project folder:", err);
    alert(`Failed to create project folder: ${err.message}`);
  }
}

async function deleteProject(projectId) {
  if (!confirm(`Are you sure you want to delete this project folder from /projects?`)) return;

  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete folder');

    if (currentProjectId === projectId) {
      currentProjectId = null;
      if (editor) editor.clear();
      const appCanvas = document.getElementById('app-canvas');
      if (appCanvas) appCanvas.innerHTML = '';
    }

    await renderModalProjectList();
  } catch (err) {
    console.error(err);
    alert('Error deleting project directory.');
  }
}