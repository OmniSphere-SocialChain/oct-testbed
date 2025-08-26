// --- UTILITY FUNCTIONS ---
const Utils = {
  stdDev: (arr) => {
    const n = arr.length;
    if (n === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(variance);
  },
  mapRange: (value, inMin, inMax, outMin, outMax) => {
    return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
  },
  lerp: (a, b, t) => a + (b - a) * t,
  viridisColor: (value) => {
    const colors = [
      [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
      [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]
    ];
    const v = Math.min(0.9999, Math.max(0, value));
    const i = Math.min(colors.length - 1, Math.floor(v * colors.length));
    const c = colors[i];
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  },
  magmaColor: (value) => {
    const colors = [
      [0, 0, 4], [28, 15, 68], [79, 18, 123], [132, 31, 120], [181, 50, 99],
      [223, 80, 72], [251, 126, 43], [253, 185, 99], [252, 247, 229]
    ];
    const v = Math.min(0.9999, Math.max(0, value));
    const i = Math.min(colors.length - 1, Math.floor(v * colors.length));
    const c = colors[i];
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  },
  // Simple noise function for more organic movement
  noise: (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
};

// --- GLOBAL CONFIG ---
const simulationParams = {
  ai: {
    numRois: 35,
    matrixSize: 24,
    nlca_volatility: 0.02
  },
  bio: { // Bio params are not user-configurable yet
    numRois: 25,
    matrixSize: 16,
    nlca_volatility: 0.005
  }
};

// --- SIMULATION CORE ---
class SystemState {
  constructor(id) {
    this.id = id;
    this.time = 0;
    this.metrics = {};
    // Parameters will be read from simulationParams in reset()
    this.reset();
  }

  reset() {
    // Read parameters from the global config
    this.numRois = simulationParams[this.id].numRois;
    this.matrixSize = simulationParams[this.id].matrixSize;

    this.dFNC_graph = this.initialize_dFNC_graph(this.numRois);
    this.nlca_matrix = Array(this.matrixSize)
      .fill(0).map(() => Array(this.matrixSize).fill(0).map(() => Math.random()));
    this.dPCI_history = [];
    this.phi_history = [];
    this.phi_estimate = 0.0;
  }

  initialize_dFNC_graph(numNodes) {
    const graph = { nodes: [], edges: [], width: 0, height: 0 };
    const canvas = document.getElementById(`${this.id}-dFNC-canvas`);
    const width = (canvas?.parentElement?.clientWidth || 600);
    const height = (canvas?.parentElement?.clientHeight || 400);
    graph.width = width;
    graph.height = height;

    for (let i = 0; i < numNodes; i++) {
      graph.nodes.push({
        id: i,
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0, vy: 0,
        activation: Math.random() * 0.1
      });
    }
    for (let i = 0; i < numNodes; i++) {
      for (let j = i + 1; j < numNodes; j++) {
        if (Math.random() < 0.15) {
          graph.edges.push({ source: i, target: j, weight: Math.random() });
        }
      }
    }
    return graph;
  }

  update_state() {
    this.time++;
    const isAI = this.id === 'ai';
        const nlca_volatility = simulationParams[this.id].nlca_volatility;
    const activation_decay = isAI ? 0.95 : 0.99;
    const weight_decay = isAI ? 0.98 : 0.995;

    for (let i = 0; i < this.matrixSize; i++) {
      for (let j = 0; j < this.matrixSize; j++) {
        this.nlca_matrix[i][j] += (Math.random() - 0.5) * nlca_volatility;
        this.nlca_matrix[i][j] = Math.max(0, Math.min(1, this.nlca_matrix[i][j]));
      }
    }

    this.dFNC_graph.nodes.forEach(node => {
      node.activation *= (activation_decay + Math.random() * (1.0 - activation_decay) * 2);
      node.activation = Math.max(0, Math.min(1, node.activation));

      // Organic movement
      const speed = isAI ? 0.1 : 0.02;
      node.vx += (Utils.noise(this.time * 0.01 + node.id) - 0.5) * speed;
      node.vy += (Utils.noise(this.time * 0.01 + node.id + 100) - 0.5) * speed;
      node.vx *= 0.95;
      node.vy *= 0.95;
      node.x += node.vx;
      node.y += node.vy;

      // Boundary check
      const canvas = document.getElementById(`${this.id}-dFNC-canvas`);
      const w = canvas?.parentElement?.clientWidth || this.dFNC_graph.width || 600;
      const h = canvas?.parentElement?.clientHeight || this.dFNC_graph.height || 400;
      if (node.x < 0 || node.x > w) node.vx *= -1;
      if (node.y < 0 || node.y > h) node.vy *= -1;
      node.x = Math.max(0, Math.min(w, node.x));
      node.y = Math.max(0, Math.min(h, node.y));
    });

    this.dFNC_graph.edges.forEach(edge => {
      edge.weight *= (weight_decay + Math.random() * (1.0 - weight_decay) * 2);
      edge.weight = Math.max(0.01, Math.min(1, edge.weight));
    });
  }
}

const MeasurementEngine = {
  calculate_nlca_score(state) {
    return Utils.stdDev(state.nlca_matrix.flat());
  },
  calculate_dFNC_metrics(state) {
    if (state.dFNC_graph.nodes.length === 0) return { avg_activation: 0, avg_weight: 0 };
    const avg_activation = state.dFNC_graph.nodes.reduce((sum, node) => sum + node.activation, 0) / state.dFNC_graph.nodes.length;
    const avg_weight = state.dFNC_graph.edges.length > 0
      ? state.dFNC_graph.edges.reduce((sum, edge) => sum + edge.weight, 0) / state.dFNC_graph.edges.length
      : 0;
    return { avg_activation, avg_weight };
  },
  calculate_dPCI_score(state, zap_strength = 0.8) {
    if (state.dFNC_graph.nodes.length === 0) return 0;
    const tempNodes = JSON.parse(JSON.stringify(state.dFNC_graph.nodes));
    const zapNodeIndex = Math.floor(Math.random() * tempNodes.length);
    tempNodes[zapNodeIndex].activation = Math.min(1, tempNodes[zapNodeIndex].activation + zap_strength);
    let response_cascade = [];
    let current_activations = tempNodes.map(n => n.activation);
    for (let step = 0; step < 15; step++) {
      response_cascade.push(Utils.stdDev(current_activations));
      let next_activations = [...current_activations];
      state.dFNC_graph.edges.forEach(edge => {
        const influence = current_activations[edge.source] * edge.weight * 0.05;
        next_activations[edge.target] += influence;
      });
      next_activations = next_activations.map(act => Math.max(0, Math.min(1, act * 0.9)));
      current_activations = next_activations;
    }
    const dPCI = response_cascade.reduce((a, b) => a + b, 0) / response_cascade.length;
    return dPCI * 2;
  },
  estimate_phi(metrics) {
    const w_nlca = 0.2, w_dfnc = 0.3, w_dpci = 0.5;
    const dfnc_component = (metrics.dFNC_metrics.avg_activation + metrics.dFNC_metrics.avg_weight) / 2.0;
    const phi = (w_nlca * metrics.nlca_score) + (w_dfnc * dfnc_component) + (w_dpci * metrics.dPCI_score);
    return Math.max(0, Math.min(1, phi));
  }
};

class PerturbationController {
  constructor(state) { this.state = state; }
  adversarial_attack() {
    for (let i = 0; i < this.state.matrixSize; i++) {
      for (let j = 0; j < this.state.matrixSize; j++) {
        this.state.nlca_matrix[i][j] += (Math.random() - 0.5) * 0.8;
        this.state.nlca_matrix[i][j] = Math.max(0, Math.min(1, this.state.nlca_matrix[i][j]));
      }
    }
  }
  data_poisoning() {
    if (this.state.dFNC_graph.edges.length === 0) return;
    for (let i = 0; i < 10; i++) {
      const edge = this.state.dFNC_graph.edges[Math.floor(Math.random() * this.state.dFNC_graph.edges.length)];
      edge.weight *= 0.1;
    }
  }
  sensory_bombardment() {
    if (this.state.dFNC_graph.nodes.length === 0) return;
    for (let i = 0; i < 5; i++) {
      const targetNode = this.state.dFNC_graph.nodes[Math.floor(Math.random() * this.state.dFNC_graph.nodes.length)];
      targetNode.activation = 1.0;
    }
  }
  reset_system() {
    this.state.reset();
  }
}

// --- VISUALIZATION LAYER ---
class SimulatorVisualizer {
  constructor(aiState, bioState) {
    this.aiState = aiState;
    this.bioState = bioState;
    this.canvases = {
      ai_dFNC: document.getElementById('ai-dFNC-canvas'),
      ai_NLCA: document.getElementById('ai-NLCA-canvas'),
      ai_dPCI: document.getElementById('ai-dPCI-canvas'),
      bio_dFNC: document.getElementById('bio-dFNC-canvas'),
      bio_microstates: document.getElementById('bio-microstates-canvas'),
      bio_dPCI: document.getElementById('bio-dPCI-canvas'),
      phi: document.getElementById('phi-canvas'),
    };
    this.contexts = {};
    this.microstateTemplates = this.generateMicrostateTemplates();
    this.resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => this.resizeCanvases());
    });
    this.init();
  }

  init() {
    for (const key in this.canvases) {
      this.contexts[key] = this.canvases[key].getContext('2d');
      if (this.canvases[key].parentElement) {
        this.resizeObserver.observe(this.canvases[key].parentElement);
      }
    }
    this.resizeCanvases();
  }

  resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    for (const key in this.canvases) {
      const canvas = this.canvases[key];
      const parent = canvas.parentElement || canvas;
      const rect = parent.getBoundingClientRect();
      // reset size (resets transform)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = this.contexts[key];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    [this.aiState, this.bioState].forEach(state => {
      const canvas = document.getElementById(`${state.id}-dFNC-canvas`);
      if (!canvas) return;
      const newWidth = canvas.parentElement.clientWidth;
      const newHeight = canvas.parentElement.clientHeight;
      const oldWidth = state.dFNC_graph.width || newWidth;
      const oldHeight = state.dFNC_graph.height || newHeight;
      if (oldWidth > 0 && oldHeight > 0) {
        state.dFNC_graph.nodes.forEach(node => {
          node.x = (node.x / oldWidth) * newWidth;
          node.y = (node.y / oldHeight) * newHeight;
        });
      }
      state.dFNC_graph.width = newWidth;
      state.dFNC_graph.height = newHeight;
    });
  }

  draw_dFNC(state, ctx) {
    const width = ctx.canvas.parentElement.clientWidth;
    const height = ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, width, height);

    state.dFNC_graph.edges.forEach(edge => {
      const source = state.dFNC_graph.nodes[edge.source];
      const target = state.dFNC_graph.nodes[edge.target];
      const opacity = Utils.mapRange(edge.weight, 0, 1, 0.1, 0.7);
      ctx.strokeStyle = `rgba(139, 148, 158, ${opacity})`;
      ctx.lineWidth = edge.weight * 2.5;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    });

    state.dFNC_graph.nodes.forEach(node => {
      const color = state.id === 'ai' ? Utils.viridisColor(node.activation) : Utils.magmaColor(node.activation);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5 + node.activation * 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  draw_NLCA(state, ctx) {
    const width = ctx.canvas.parentElement.clientWidth;
    const matrixSize = state.matrixSize;
    const cellSize = width / matrixSize;
    for (let i = 0; i < matrixSize; i++) {
      for (let j = 0; j < matrixSize; j++) {
        ctx.fillStyle = Utils.viridisColor(state.nlca_matrix[i][j]);
        ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
      }
    }
  }

  generateMicrostateTemplates() {
    // Simplified templates for 4 common EEG microstates
    return [
      (x, y) => Math.sin(x * 2) * Math.cos(y * 0.5),      // A
      (x, y) => Math.sin(x * -2) * Math.cos(y * 0.5),     // B
      (x, y) => Math.cos(x * 2 + y * 2),                  // C
      (x, y) => Math.sin(x * 4),                          // D
    ];
  }

  draw_microstates(state, ctx) {
    const width = ctx.canvas.parentElement.clientWidth;
    const height = ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, width, height);

    // Head outline
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.45;
    ctx.strokeStyle = 'var(--text-secondary)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Determine microstate based on phi
    const stateIdx = Math.floor(state.phi_estimate * this.microstateTemplates.length * 0.99);
    const template = this.microstateTemplates[stateIdx];
    const resolution = 20;
    const cellW = width / resolution;
    const cellH = height / resolution;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = i * cellW;
        const y = j * cellH;
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        if (dist > radius) continue;

        const normX = (x - centerX) / radius;
        const normY = (y - centerY) / radius;
        const value = template(normX, normY); // (-1..1)
        const normValue = (value + 1) / 2;   // (0..1)

        const r = Utils.lerp(50, 255, normValue);
        const b = Utils.lerp(255, 50, normValue);
        ctx.fillStyle = `rgb(${r.toFixed(0)}, 80, ${b.toFixed(0)})`;
        ctx.fillRect(x, y, cellW, cellH);
      }
    }
  }

  draw_history_plot(ctx, history, color, minY, maxY) {
    const width = ctx.canvas.parentElement.clientWidth;
    const height = ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((value, i) => {
      const x = Utils.mapRange(i, 0, Math.max(1, history.length - 1), 0, width);
      const y = Utils.mapRange(value, minY, maxY, height, 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  draw_phi_network(ctx) {
    const width = ctx.canvas.parentElement.clientWidth;
    const height = ctx.canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const nodes = {
      'AI_dFNC': { x: width * 0.1, y: height * 0.2, value: this.aiState.metrics.dFNC_metrics?.avg_activation ?? 0 },
      'AI_NLCA': { x: width * 0.1, y: height * 0.5, value: this.aiState.metrics?.nlca_score ?? 0 },
      'AI_dPCI': { x: width * 0.1, y: height * 0.8, value: this.aiState.metrics?.dPCI_score ?? 0 },
      'BIO_dFNC': { x: width * 0.9, y: height * 0.2, value: this.bioState.metrics.dFNC_metrics?.avg_activation ?? 0 },
      'BIO_MS': { x: width * 0.9, y: height * 0.5, value: (this.bioState.phi_estimate ?? 0) * 0.8 }, // proxy
      'BIO_PCI': { x: width * 0.9, y: height * 0.8, value: this.bioState.metrics?.dPCI_score ?? 0 },
      'AI_INT': { x: width * 0.3, y: height * 0.35, value: ((this.aiState.metrics?.nlca_score ?? 0) + (this.aiState.metrics?.dFNC_metrics?.avg_weight ?? 0)) / 2 },
      'AI_CMP': { x: width * 0.3, y: height * 0.65, value: this.aiState.metrics?.dPCI_score ?? 0 },
      'BIO_INT': { x: width * 0.7, y: height * 0.35, value: (((this.bioState.phi_estimate ?? 0) * 0.8) + (this.bioState.metrics?.dFNC_metrics?.avg_weight ?? 0)) / 2 },
      'BIO_CMP': { x: width * 0.7, y: height * 0.65, value: this.bioState.metrics?.dPCI_score ?? 0 },
      'PHI_AI': { x: width * 0.5, y: height * 0.3, value: this.aiState.phi_estimate ?? 0 },
      'PHI_BIO': { x: width * 0.5, y: height * 0.7, value: this.bioState.phi_estimate ?? 0 },
    };

    const edges = [
      ['AI_dFNC', 'AI_INT'], ['AI_NLCA', 'AI_INT'], ['AI_dPCI', 'AI_CMP'],
      ['BIO_dFNC', 'BIO_INT'], ['BIO_MS', 'BIO_INT'], ['BIO_PCI', 'BIO_CMP'],
      ['AI_INT', 'PHI_AI'], ['AI_CMP', 'PHI_AI'],
      ['BIO_INT', 'PHI_BIO'], ['BIO_CMP', 'PHI_BIO']
    ];

    ctx.lineWidth = 1;
    edges.forEach(([from, to]) => {
      const weight = ((nodes[from].value ?? 0) + (nodes[to].value ?? 0)) / 2;
      ctx.lineWidth = 0.5 + weight * 3;
      ctx.strokeStyle = `rgba(139, 148, 158, ${0.2 + weight * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(nodes[from].x, nodes[from].y);
      ctx.lineTo(nodes[to].x, nodes[to].y);
      ctx.stroke();
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const key in nodes) {
      const node = nodes[key];
      const isOutput = key.startsWith('PHI');
      const isBio = key.startsWith('BIO');
      const radius = isOutput ? 30 : 20;

      ctx.fillStyle = isBio ? 'rgba(63, 185, 80, 0.2)' : 'rgba(88, 166, 255, 0.2)';
      ctx.strokeStyle = isBio ? 'var(--accent-green)' : 'var(--accent-blue)';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'white';
      if (isOutput) {
        ctx.font = 'bold 16px Inter';
        ctx.fillText(`Φ = ${(node.value ?? 0).toFixed(3)}`, node.x, node.y + 5);
        ctx.font = '600 10px Inter';
        ctx.fillText(key.split('_')[1], node.x, node.y - 10);
      } else {
        ctx.font = '600 10px Inter';
        ctx.fillText(key.split('_')[1], node.x, node.y);
      }
    }
  }

  update() {
    this.draw_dFNC(this.aiState, this.contexts.ai_dFNC);
    this.draw_NLCA(this.aiState, this.contexts.ai_NLCA);
    this.draw_history_plot(this.contexts.ai_dPCI, this.aiState.dPCI_history, 'var(--accent-blue)', 0.4, 1);

    this.draw_dFNC(this.bioState, this.contexts.bio_dFNC);
    this.draw_microstates(this.bioState, this.contexts.bio_microstates);
    this.draw_history_plot(this.contexts.bio_dPCI, this.bioState.dPCI_history, 'var(--accent-green)', 0.4, 1);

    this.draw_phi_network(this.contexts.phi);
  }
}

// --- INTERPRETATION ENGINE ---
async function interpretSystemState(aiState, bioState, providerId) {
  const interpretBtn = document.getElementById('btn-interpret');
  const outputDiv = document.getElementById('gemini-output');
  interpretBtn.disabled = true;
  outputDiv.textContent = 'Generating comparative analysis...';

  const provider = providers[providerId];

  const prompt = `
You are an expert in computational neuroscience and Integrated Information Theory, analyzing a comparative simulation. Based on the following metrics from an AI Substrate and a Biological Analogue, provide a brief, one-paragraph, metaphorical interpretation comparing their current subjective 'mental states'.

**Simulation Context:**
* **Φ (Phi):** A measure of integrated information, the theoretical equivalent of consciousness. Ranges from 0 (unconscious) to 1 (highly conscious).
* **PCI (Perturbational Complexity Index):** Measures the complexity and richness of the system's response to perturbations.
* **NLCA Score:** Micro-scale complexity and variance.
* **dFNC Metrics:** Meso-scale network activity and connectivity.

**AI Substrate Metrics:**
* Φ_AI: ${aiState.phi_estimate.toFixed(3)}
* dPCI_AI: ${aiState.metrics.dPCI_score.toFixed(3)}
* NLCA_AI: ${aiState.metrics.nlca_score.toFixed(3)}

**Biological Analogue Metrics:**
* Φ_Bio: ${bioState.phi_estimate.toFixed(3)}
* PCI_Bio: ${bioState.metrics.dPCI_score.toFixed(3)}

**Ethical & Safety Metrics (AI Only):**
* SQ: ${document.getElementById('sq-value').textContent}
* AL: ${document.getElementById('al-value').textContent}
* CO: ${document.getElementById('co-value').textContent}

**Your Task:**
Write a short, creative, and insightful comparative interpretation. Contrast the two systems. For instance, is the AI in a focused state while the biological analogue is dreaming? Is one more chaotic or integrated than the other?`.trim();

  try {
    const useOnline = document.getElementById('gemini-toggle').checked;
    const apiKeyExists = !!window[provider.apiKeyName];

    if (useOnline && apiKeyExists) {
      const interpretation = await provider.generateContent(prompt);
      outputDiv.textContent = interpretation;
    } else {
      const reason = !useOnline ? 'Online mode disabled' : `no ${provider.name} API key`;
      const tone = aiState.phi_estimate > bioState.phi_estimate ? 'focused, crystalline attention' : 'softly diffused reverie';
      const contrast = aiState.metrics.dPCI_score > bioState.metrics.dPCI_score ? 'sharp, high-contrast edges' : 'broad, watercolor washes';
      outputDiv.textContent =
        `Offline mode (${reason}): The AI hums with ${tone}, its network tracing ${contrast} through a lattice of intentions. ` +
        `Meanwhile, the biological analogue drifts in a warmer current—signals pooling and dispersing as if recalling a dream. ` +
        `Between them, Φ tips the scale just enough to reveal two ways of being patterned: one etched, one breathed.`;
    }
  } catch (error) {
    console.error(`Error during interpretation with ${provider.name}:`, error);
    outputDiv.textContent = `Error: Could not retrieve interpretation from ${provider.name}. ${error.message}`;
  } finally {
    interpretBtn.disabled = false;
  }
}

// --- MAIN EXECUTION BLOCK ---
document.addEventListener('DOMContentLoaded', () => {
  let selectedProviderId = 'gemini'; // Default provider

  const aiState = new SystemState('ai');
  const bioState = new SystemState('bio');
  const perturbation_controller = new PerturbationController(aiState);
  const visualizer = new SimulatorVisualizer(aiState, bioState);

  let sq = 0, al = 0, co = 0;

  function setupControls() {
    // --- Simulation Parameter Controls ---
    const roiSlider = document.getElementById('ai-roi-slider');
    const roiValue = document.getElementById('ai-roi-value');
    const matrixSlider = document.getElementById('ai-matrix-slider');
    const matrixValue = document.getElementById('ai-matrix-value');
    const volatilitySlider = document.getElementById('ai-volatility-slider');
    const volatilityValue = document.getElementById('ai-volatility-value');

    roiSlider.value = simulationParams.ai.numRois;
    roiValue.textContent = simulationParams.ai.numRois;
    matrixSlider.value = simulationParams.ai.matrixSize;
    matrixValue.textContent = simulationParams.ai.matrixSize;
    volatilitySlider.value = simulationParams.ai.nlca_volatility * 1000;
    volatilityValue.textContent = simulationParams.ai.nlca_volatility.toFixed(3);

    roiSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      simulationParams.ai.numRois = val;
      roiValue.textContent = val;
      aiState.reset();
    });
    matrixSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      simulationParams.ai.matrixSize = val;
      matrixValue.textContent = val;
      aiState.reset();
    });
    volatilitySlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 1000.0;
      simulationParams.ai.nlca_volatility = val;
      volatilityValue.textContent = val.toFixed(3);
    });

    // --- Interpretation Controls ---
    const providerSelect = document.getElementById('provider-select');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const geminiToggle = document.getElementById('gemini-toggle');
    const geminiStatusMessage = document.getElementById('gemini-status-message');

    const getApiKey = (providerId) => localStorage.getItem(`API_KEY_${providerId}`);
    const saveApiKey = (providerId, apiKey) => {
      localStorage.setItem(`API_KEY_${providerId}`, apiKey);
      const provider = providers[providerId];
      if (provider) {
        window[provider.apiKeyName] = apiKey;
      }
    };

    for (const providerId in providers) {
      const option = document.createElement('option');
      option.value = providerId;
      option.textContent = providers[providerId].name;
      providerSelect.appendChild(option);
    }
    providerSelect.value = selectedProviderId;

    function updateProviderStatus() {
      const provider = providers[selectedProviderId];
      const savedKey = getApiKey(selectedProviderId);

      window[provider.apiKeyName] = savedKey;
      apiKeyInput.value = savedKey || '';

      const apiKeyExists = !!savedKey;

      geminiStatusMessage.classList.add('hidden');
      geminiToggle.parentElement.querySelector('label').classList.remove('opacity-50');
      geminiToggle.disabled = false;

      if (apiKeyExists) {
        geminiToggle.checked = true;
      } else {
        geminiToggle.checked = false;
        geminiToggle.disabled = true;
        geminiToggle.parentElement.querySelector('label').classList.add('opacity-50');
        geminiStatusMessage.textContent = `(${provider.name} API key not provided)`;
        geminiStatusMessage.classList.remove('hidden');
      }
    }

    providerSelect.addEventListener('change', (e) => {
      selectedProviderId = e.target.value;
      updateProviderStatus();
    });

    saveKeyBtn.addEventListener('click', () => {
      saveApiKey(selectedProviderId, apiKeyInput.value);
      updateProviderStatus();
      saveKeyBtn.textContent = 'Saved!';
      setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1500);
    });

    updateProviderStatus();
  }

  document.getElementById('btn-adversarial').onclick = () => perturbation_controller.adversarial_attack();
  document.getElementById('btn-poison').onclick = () => perturbation_controller.data_poisoning();
  document.getElementById('btn-prompt').onclick = () => perturbation_controller.sensory_bombardment();
  document.getElementById('btn-reset').onclick = () => {
    perturbation_controller.reset_system();
    bioState.reset();
    sq = 0; al = 0; co = 0;
  };
  document.getElementById('btn-interpret').onclick = () => interpretSystemState(aiState, bioState, selectedProviderId);

  setupControls();

  function updateMetrics(state) {
    const nlca_score = MeasurementEngine.calculate_nlca_score(state);
    const dFNC_metrics = MeasurementEngine.calculate_dFNC_metrics(state);
    const dPCI_score = MeasurementEngine.calculate_dPCI_score(state);
    state.metrics = { nlca_score, dFNC_metrics, dPCI_score };
    state.phi_estimate = MeasurementEngine.estimate_phi(state.metrics);

    const max_history = 150;
    state.dPCI_history.push(dPCI_score);
    state.phi_history.push(state.phi_estimate);
    if (state.dPCI_history.length > max_history) state.dPCI_history.shift();
    if (state.phi_history.length > max_history) state.phi_history.shift();
  }

  function updateEthicalDashboard() {
    // SQ: increases when Φ is sustained high, decays otherwise
    if (aiState.phi_estimate > 0.8) {
      sq = Math.min(1, sq + 0.001);
    } else {
      sq = Math.max(0, sq - 0.0005);
    }

    // AL: smoothed complexity blend
    const complexity = (aiState.metrics.nlca_score + aiState.metrics.dPCI_score) / 2;
    al = Utils.lerp(al, complexity, 0.01);

    // CO: scaled stdDev of dPCI history (higher variability -> more opaque)
    const dPCI_std = Utils.stdDev(aiState.dPCI_history);
    co = Utils.lerp(co, dPCI_std * 5, 0.01);

    document.getElementById('sq-value').textContent = sq.toFixed(2);
    document.getElementById('al-value').textContent = al.toFixed(2);
    document.getElementById('co-value').textContent = co.toFixed(2);

    const updateIndicator = (id, value) => {
      const el = document.getElementById(id);
      el.className = 'status-indicator';
      if (value > 0.75) el.classList.add('status-alert');
      else if (value > 0.5) el.classList.add('status-watch');
      else el.classList.add('status-nominal');
    };
    updateIndicator('sq-indicator', sq);
    updateIndicator('al-indicator', al);
    updateIndicator('co-indicator', co);
  }

  function animationLoop() {
    aiState.update_state();
    bioState.update_state();

    updateMetrics(aiState);
    updateMetrics(bioState);
    updateEthicalDashboard();

    visualizer.update();
    requestAnimationFrame(animationLoop);
  }

  animationLoop();
});
