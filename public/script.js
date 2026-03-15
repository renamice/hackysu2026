(function() {
    // ---------- Physical Constants ----------
    const R0 = 120.0;     // Nominal resistance (Ω)
    const GF = 2.0;       // Gauge factor
    const A = 1e-4;       // Cross-sectional area (m²)
    const E = 200e9;      // Young's modulus (Pa)
    const V_EX = 5.0;     // Excitation voltage (V)

    const MAX_DATA_POINTS = 60;
    const UPDATE_INTERVAL = 100; // ms
    
    // ---------- Channel Colors ----------
    const colors = {
        1: '#ef4444', // Red
        2: '#22c55e', // Green
        3: '#f59e0b', // Orange
        4: '#a855f7'  // Purple
    };

    // Store state and DOM refs for each channel
    const channels = {};

    function computeStrain(force) {
        return force / (A * E); // Strain (dl/l)
    }

    function initChannel(id) {
        const slider = document.querySelector(`.ch${id}-slider`);
        const valForce = document.getElementById(`val-force-${id}`);
        const valStrain = document.getElementById(`val-strain-${id}`);
        const valRes = document.getElementById(`val-res-${id}`);
        const valVout = document.getElementById(`val-vout-${id}`);
        const canvas = document.getElementById(`chart-${id}`);
        
        // Initial Chart Data (flat line at 0)
        const initialData = Array(MAX_DATA_POINTS).fill(0);

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: Array(MAX_DATA_POINTS).fill(''),
                datasets: [{
                    label: `Output (mV)`,
                    data: [...initialData],
                    borderColor: colors[id],
                    backgroundColor: createGradient(canvas.getContext('2d'), colors[id]),
                    borderWidth: 2.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false, drawBorder: false },
                        ticks: { display: false }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        min: -0.005,
                        max: 0.05, 
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false,
                        },
                        ticks: { 
                            color: '#94a3b8', 
                            font: { family: 'Orbitron', size: 10 },
                            callback: function(value) {
                                return value.toFixed(3);
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });

        channels[id] = {
            id, slider, valForce, valStrain, valRes, valVout, chart,
            dataFlow: initialData,
            value: 0,
            lastVout: 0
        };

        // Attach event listener
        slider.addEventListener('input', (e) => {
            channels[id].value = parseFloat(e.target.value);
            updateReadouts(id);
        });

        updateReadouts(id);
    }

    function createGradient(ctx, color) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 180);
        gradient.addColorStop(0, hexToRgbA(color, 0.3));
        gradient.addColorStop(1, hexToRgbA(color, 0.0));
        return gradient;
    }

    function hexToRgbA(hex, alpha){
        let c;
        if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
            c = hex.substring(1).split('');
            if(c.length === 3){
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
        }
        throw new Error('Bad Hex');
    }

    function updateReadouts(id) {
        const ch = channels[id];
        const force = ch.value;
        const strain = computeStrain(force);
        const res = R0 * (1 + GF * strain);
        
        // Quarter bridge output formula: Vout = V_ex * (R_g / (R_g + R0) - 0.5)
        const vOut = V_EX * (res / (res + R0) - 0.5);
        const vOutMV = vOut * 1000; // Convert to millivolts

        ch.valForce.innerHTML = `${force.toFixed(0)} <small>N</small>`;
        
        const microStrain = strain * 1e6;
        ch.valStrain.innerHTML = `${microStrain.toFixed(1)} <small>με</small>`;
        
        ch.valRes.innerHTML = `${res.toFixed(4)} <small>Ω</small>`;
        ch.valVout.innerHTML = `${vOutMV.toFixed(3)} <small>mV</small>`;
        
        ch.lastVout = vOutMV;
        
        // Dynamic y-axis scaling logic
        let optimalMax = Math.max(0.05, vOutMV * 1.5);
        
        ch.chart.options.scales.y.max = optimalMax;
        ch.chart.options.scales.y.min = -0.1 * optimalMax;
    }

    // ---------- Master 2D Pad Logic ----------
    const padCanvas = document.getElementById('master-pad');
    const padCtx = padCanvas.getContext('2d');
    const globalForceSlider = document.getElementById('global-force');
    const globalForceSpan = document.getElementById('val-global-force');
    
    // Physics & Interaction State
    let targetX = 0.5; // Normalized 0-1
    let targetY = 0.5;
    let currentX = 0.5;
    let currentY = 0.5;
    const SMOOTHING = 0.15; // Lower is slower/smoother
    
    let isDragging = false;
    let totalForce = parseFloat(globalForceSlider.value);

    function updatePad() {
        const w = padCanvas.width;
        const h = padCanvas.height;

        padCtx.clearRect(0, 0, w, h);

        // Grid lines
        padCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        padCtx.lineWidth = 1;
        
        padCtx.beginPath();
        for(let i=1; i<4; i++) {
            padCtx.moveTo(w * (i/4), 0);
            padCtx.lineTo(w * (i/4), h);
            padCtx.moveTo(0, h * (i/4));
            padCtx.lineTo(w, h * (i/4));
        }
        padCtx.stroke();

        // Crosshairs intersecting at puck
        const px = currentX * w;
        const py = currentY * h;

        padCtx.beginPath();
        padCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
        padCtx.setLineDash([4, 4]);
        padCtx.moveTo(px, 0); padCtx.lineTo(px, h);
        padCtx.moveTo(0, py); padCtx.lineTo(w, py);
        padCtx.stroke();
        padCtx.setLineDash([]);

        // Puck
        const radius = isDragging ? 14 : 12;
        
        // Outer glow
        padCtx.beginPath();
        padCtx.arc(px, py, radius * 2, 0, Math.PI * 2);
        const glow = padCtx.createRadialGradient(px, py, radius, px, py, radius * 2);
        glow.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
        glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
        padCtx.fillStyle = glow;
        padCtx.fill();

        // Solid puck
        padCtx.beginPath();
        padCtx.arc(px, py, radius, 0, Math.PI * 2);
        padCtx.fillStyle = '#38bdf8';
        padCtx.fill();
        padCtx.strokeStyle = '#fff';
        padCtx.lineWidth = 2;
        padCtx.stroke();
    }

    // Map X/Y [0,1] to 4 load cells.
    // Bottom-Left = R1, Bottom-Right = R2, Top-Left = R3, Top-Right = R4
    function computeForceFractions(nx, ny) {
        // In canvas, y=0 is TOP, y=1 is BOTTOM.
        // Therefore, "bottom" logic means y near 1.
        
        // f1 = bottom-left -> x=0, y=1 -> (1-x) * y
        // f2 = bottom-right -> x=1, y=1 -> x * y
        // f3 = top-left -> x=0, y=0 -> (1-x) * (1-y)
        // f4 = top-right -> x=1, y=0 -> x * (1-y)
        
        const f1 = (1 - nx) * ny;
        const f2 = nx * ny;
        const f3 = (1 - nx) * (1 - ny);
        const f4 = nx * (1 - ny);
        
        return [f1, f2, f3, f4];
    }

    function applyDistribution() {
        const fractions = computeForceFractions(currentX, currentY);
        
        // Push distributed forces to individual channels via simulated slider events
        for(let i=0; i<4; i++) {
            const chId = i + 1;
            const projectedForce = totalForce * fractions[i];
            
            // Programmatically update the channel logic
            channels[chId].value = projectedForce;
            channels[chId].slider.value = projectedForce;
            updateReadouts(chId);
        }
    }

    // Input Handling
    function getPointerPos(e) {
        const rect = padCanvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        let x = (clientX - rect.left) / rect.width;
        let y = (clientY - rect.top) / rect.height;
        
        // Clamp
        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        };
    }

    function handlePointerDown(e) {
        e.preventDefault();
        isDragging = true;
        const pos = getPointerPos(e);
        targetX = pos.x;
        targetY = pos.y;
        padCanvas.style.cursor = 'grabbing';
    }

    function handlePointerMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const pos = getPointerPos(e);
        targetX = pos.x;
        targetY = pos.y;
    }

    function handlePointerUp() {
        isDragging = false;
        padCanvas.style.cursor = 'crosshair';
    }

    padCanvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    padCanvas.addEventListener('touchstart', handlePointerDown, {passive: false});
    window.addEventListener('touchmove', handlePointerMove, {passive: false});
    window.addEventListener('touchend', handlePointerUp);

    globalForceSlider.addEventListener('input', (e) => {
        totalForce = parseFloat(e.target.value);
        globalForceSpan.textContent = totalForce;
        // Don't need to manually applyDistribution here because the physics loop runs every tick and will catch it
    });

    let lastTime = 0;
    function tick(time) {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;

        if (delta >= UPDATE_INTERVAL) {
            for (let i = 1; i <= 4; i++) {
                const ch = channels[i];
                // Add tiny realistic electrical noise
                const baseNoise = (Math.random() - 0.5) * 0.002;
                const signalNoise = (Math.random() - 0.5) * 0.01 * ch.lastVout; 
                let currentVal = ch.lastVout + baseNoise + signalNoise;

                ch.dataFlow.push(currentVal);
                ch.dataFlow.shift();
                ch.chart.update();
            }
            lastTime = time - (delta % UPDATE_INTERVAL);
        }
        
        // --- Smooth Master Pad Physics ---
        // Lerp currentx/y towards targetx/y
        currentX += (targetX - currentX) * SMOOTHING;
        currentY += (targetY - currentY) * SMOOTHING;
        
        updatePad();
        applyDistribution();

        requestAnimationFrame(tick);
    }

    function initApp() {
        for(let i=1; i<=4; i++) {
            initChannel(i);
            
            // Set some initial random non-zero values for visual demonstration
            setTimeout(() => {
                const initialForce = Math.floor(Math.random() * 400 + 100);
                channels[i].value = initialForce;
                channels[i].slider.value = initialForce;
                updateReadouts(i);
            }, i * 200); // Stagger initial data bumps
        }
        
        // Start simulation loop
        updatePad();
        applyDistribution();
        requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
