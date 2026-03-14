(function() {
    // ---------- Physical constants ----------
    const R0 = 120;                // nominal resistance (Ω)
    const GF = 2.0;                 // gauge factor
    const A = 1e-4;                  // cross-sectional area (m²)
    const E = 200e9;                  // Young's modulus (Pa)
    const V_EX = 5.0;                 // excitation voltage (V)

    // Force range for theoretical curve
    const FORCE_MIN = 0;
    const FORCE_MAX = 1000;
    const FORCE_STEP = 10;

    // ---------- Helper: compute resistance from force ----------
    function computeResistance(force) {
        const strain = force / (A * E);
        return R0 * (1 + GF * strain);
    }

    // ---------- Prepare theoretical line data ----------
    const theoryPoints = [];
    for (let f = FORCE_MIN; f <= FORCE_MAX; f += FORCE_STEP) {
        theoryPoints.push({ x: f, y: computeResistance(f) });
    }

    // ---------- Get DOM elements ----------
    const forceSliders = [
        document.getElementById('forceSlider1'),
        document.getElementById('forceSlider2'),
        document.getElementById('forceSlider3'),
        document.getElementById('forceSlider4')
    ];
    const forceSpans = [
        document.getElementById('forceValue1'),
        document.getElementById('forceValue2'),
        document.getElementById('forceValue3'),
        document.getElementById('forceValue4')
    ];
    const resistanceSpans = [
        document.getElementById('resistanceValue1'),
        document.getElementById('resistanceValue2'),
        document.getElementById('resistanceValue3'),
        document.getElementById('resistanceValue4')
    ];

    // Bridge output display
    const bridgeSpan1 = document.getElementById('bridgeVoltage1');
    const bridgeVSpan1 = document.getElementById('bridgeVoltageV1');
    const bridgeSpan2 = document.getElementById('bridgeVoltage2');
    const bridgeVSpan2 = document.getElementById('bridgeVoltageV2');

    // Total force control
    const totalForceSlider = document.getElementById('totalForceSlider');
    const totalForceSpan = document.getElementById('totalForceValue');

    // Canvas
    const canvas = document.getElementById('forceCanvas');
    const ctx = canvas.getContext('2d');

    // ---------- State ----------
    let updating = false;               // prevent recursive updates
    let circlePos = { x: 0.5, y: 0.5 }; // normalized (0..1)
    let dragging = false;

    // ---------- Initialize Chart.js ----------
    const chartCtx = document.getElementById('strainChart').getContext('2d');
    const chart = new Chart(chartCtx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Theoretical R vs. Force',
                    data: theoryPoints,
                    borderColor: 'blue',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                    tension: 0.1
                },
                {
                    label: 'Gauge 1 (R₁)',
                    data: [{ x: 200, y: computeResistance(200) }],
                    borderColor: 'red',
                    backgroundColor: 'red',
                    pointRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Gauge 2 (R₂)',
                    data: [{ x: 400, y: computeResistance(400) }],
                    borderColor: 'green',
                    backgroundColor: 'green',
                    pointRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Gauge 3 (R₃)',
                    data: [{ x: 600, y: computeResistance(600) }],
                    borderColor: 'orange',
                    backgroundColor: 'orange',
                    pointRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Gauge 4 (R₄)',
                    data: [{ x: 800, y: computeResistance(800) }],
                    borderColor: 'purple',
                    backgroundColor: 'purple',
                    pointRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Force (N)' },
                    min: FORCE_MIN,
                    max: FORCE_MAX
                },
                y: {
                    title: { display: true, text: 'Resistance (Ω)' },
                    min: computeResistance(FORCE_MIN) * 0.999,
                    max: computeResistance(FORCE_MAX) * 1.001
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const point = context.raw;
                            return `${label}: (${point.x.toFixed(1)} N, ${point.y.toFixed(4)} Ω)`;
                        }
                    }
                }
            }
        }
    });

    // ---------- Bridge output update ----------
    function updateBridge() {
        const R1 = computeResistance(parseFloat(forceSliders[0].value));
        const R2 = computeResistance(parseFloat(forceSliders[1].value));
        const R3 = computeResistance(parseFloat(forceSliders[2].value));
        const R4 = computeResistance(parseFloat(forceSliders[3].value));

        const vOut1 = V_EX * (R2 / (R1 + R2) - R3 / (R4 + R3));
        bridgeSpan1.textContent = (vOut1 * 1000).toFixed(4) + ' mV';
        bridgeVSpan1.textContent = `(${vOut1.toFixed(6)} V)`;

        const vOut2 = V_EX * (R3 / (R1 + R3) - R2 / (R4 + R2));
        bridgeSpan2.textContent = (vOut2 * 1000).toFixed(4) + ' mV';
        bridgeVSpan2.textContent = `(${vOut2.toFixed(6)} V)`;
    }

    // ---------- Update a single gauge from its slider (called by slider event) ----------
    function updateGaugeFromSlider(index) {
        if (updating) return;
        updating = true;
        const force = parseFloat(forceSliders[index].value);
        const resistance = computeResistance(force);

        forceSpans[index].textContent = force;
        resistanceSpans[index].textContent = resistance.toFixed(4);
        chart.data.datasets[index + 1].data = [{ x: force, y: resistance }];

        // Bridge and chart update will be triggered after all sliders (in the event we call updateBridge and chart.update separately)
        // But we'll let the slider event handler do that to avoid multiple updates.
        updating = false;
    }

    // ---------- Set all forces programmatically (from canvas or total force) ----------
    function setAllForces(forces) {
        if (updating) return;
        updating = true;

        // Update sliders, displays, and chart datasets
        for (let i = 0; i < 4; i++) {
            let f = Math.min(FORCE_MAX, Math.max(FORCE_MIN, forces[i])); // clamp
            forceSliders[i].value = f;
            forceSpans[i].textContent = f;
            const r = computeResistance(f);
            resistanceSpans[i].textContent = r.toFixed(4);
            chart.data.datasets[i + 1].data = [{ x: f, y: r }];
        }

        updateBridge();
        chart.update();
        updating = false;
    }

    // ---------- Compute force fractions from normalized position ----------
    function computeFractions(x, y) {
        // x,y in [0,1]
        // R1 (bottom-left): (1-x)*(1-y)
        // R2 (bottom-right): x*(1-y)
        // R3 (top-left): (1-x)*y
        // R4 (top-right): x*y
        const f1 = (1 - x) * (1 - y);
        const f2 = x * (1 - y);
        const f3 = (1 - x) * y;
        const f4 = x * y;
        return [f1, f2, f3, f4];
    }

    // ---------- Update forces from circle position and total force ----------
    function updateForcesFromCircle() {
        const totalF = parseFloat(totalForceSlider.value);
        const fractions = computeFractions(circlePos.x, circlePos.y);
        const forces = fractions.map(f => f * totalF);
        setAllForces(forces);
    }

    // ---------- Draw canvas ----------
    function drawCanvas() {
        ctx.clearRect(0, 0, 300, 300);

        // Draw rectangle (already the canvas border)
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 300, 300);

        // Draw crosshair lines (optional)
        ctx.beginPath();
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(150, 0); ctx.lineTo(150, 300);
        ctx.moveTo(0, 150); ctx.lineTo(300, 150);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw circle
        const x = circlePos.x * 300;
        const y = circlePos.y * 300;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fillStyle = '#e67e22';
        ctx.shadowColor = '#00000040';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // ---------- Canvas event handlers ----------
    function handleMouseDown(e) {
        e.preventDefault();
        dragging = true;
        updatePositionFromEvent(e);
    }

    function handleMouseMove(e) {
        if (!dragging) return;
        e.preventDefault();
        updatePositionFromEvent(e);
    }

    function handleMouseUp(e) {
        dragging = false;
    }

    function updatePositionFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;   // usually 1 if canvas size matches CSS
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Calculate canvas-relative coordinates
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;

        // Clamp to rectangle
        x = Math.min(300, Math.max(0, x));
        y = Math.min(300, Math.max(0, y));

        // Normalize
        circlePos.x = x / 300;
        circlePos.y = y / 300;

        drawCanvas();
        updateForcesFromCircle();
    }

    // Attach canvas events
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    // Touch support
    canvas.addEventListener('touchstart', handleMouseDown, { passive: false });
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    // Prevent default context menu on canvas
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- Total force slider event ----------
    totalForceSlider.addEventListener('input', () => {
        totalForceSpan.textContent = totalForceSlider.value;
        updateForcesFromCircle();
    });

    // ---------- Gauge slider events (manual override) ----------
    forceSliders.forEach((slider, idx) => {
        slider.addEventListener('input', () => {
            if (updating) return;
            updating = true;
            const force = parseFloat(slider.value);
            forceSpans[idx].textContent = force;
            const r = computeResistance(force);
            resistanceSpans[idx].textContent = r.toFixed(4);
            chart.data.datasets[idx + 1].data = [{ x: force, y: r }];
            updateBridge();
            chart.update();
            updating = false;
        });
    });

    // ---------- Initialization ----------
    // Set circle to center
    circlePos = { x: 0.5, y: 0.5 };
    drawCanvas();
    // Set total force display
    totalForceSpan.textContent = totalForceSlider.value;
    // Compute initial forces from circle and total force
    updateForcesFromCircle();
})();
