// Chart Configuration
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Performance
    scales: {
        x: {
            type: 'time',
            time: {
                unit: 'second'
            },
            grid: {
                color: '#30363d'
            },
            ticks: {
                color: '#8b949e'
            }
        },
        y: {
            grid: {
                color: '#30363d'
            },
            ticks: {
                color: '#8b949e'
            },
            beginAtZero: true
        }
    },
    plugins: {
        legend: {
            display: false
        }
    },
    elements: {
        point: {
            radius: 0
        },
        line: {
            borderWidth: 2,
            tension: 0.4
        }
    }
};

// Initialize Charts
const cpuCtx = document.getElementById('cpuChart').getContext('2d');
const cpuChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'CPU %',
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88, 166, 255, 0.1)',
            fill: true,
            data: []
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            ...commonOptions.scales,
            y: { ...commonOptions.scales.y, max: 100 }
        }
    }
});

const memCtx = document.getElementById('memChart').getContext('2d');
const memChart = new Chart(memCtx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Memory (MB)',
            borderColor: '#bc8cff',
            backgroundColor: 'rgba(188, 140, 255, 0.1)',
            fill: true,
            data: []
        }]
    },
    options: commonOptions
});

const queueCtx = document.getElementById('queueChart').getContext('2d');
const queueChart = new Chart(queueCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Queued',
                borderColor: '#d2a8ff',
                data: []
            },
            {
                label: 'Active',
                borderColor: '#238636',
                data: []
            }
        ]
    },
    options: commonOptions
});

// Data Buffers
const MAX_POINTS = 60;

function updateChart(chart, timestamp, ...values) {
    const time = new Date(timestamp);

    chart.data.datasets.forEach((dataset, i) => {
        dataset.data.push({ x: time, y: values[i] });
        if (dataset.data.length > MAX_POINTS) {
            dataset.data.shift();
        }
    });
    chart.update('none');
}

function log(msg) {
    const container = document.getElementById('log-container');
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `> ${msg}`;
    container.prepend(div);
    if (container.children.length > 20) {
        container.lastChild.remove();
    }
}

// Modal Logic
let lastReportTime = null;

function showModal(data) {
    document.getElementById('rep-total').textContent = data.total_requests;

    const successRate = data.total_requests > 0
        ? Math.round((data.success / data.total_requests) * 100)
        : 0;

    document.getElementById('rep-success').textContent = `${successRate}%`;
    document.getElementById('rep-latency').textContent = `${data.avg_latency}s`;
    document.getElementById('rep-throughput').textContent = `${data.throughput} /s`;
    document.getElementById('rep-duration').textContent = `${data.duration}s`;
    document.getElementById('rep-concurrency').textContent = data.concurrency;

    document.getElementById('report-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('report-modal').classList.remove('active');
}

// Polling Loop
async function fetchData() {
    try {
        // 1. Fetch Real-time metrics
        const response = await fetch('/api/v1/test/results/latest');
        if (response.ok) {
            const data = await response.json();
            if (data.timestamp) {
                document.getElementById('cpu-val').textContent = `${data.cpu_percent}%`;
                document.getElementById('mem-val').textContent = `${Math.round(data.memory_mb)} MB`;
                document.getElementById('queue-val').textContent = data.queued_tasks;
                document.getElementById('active-val').textContent = data.active_workers;

                updateChart(cpuChart, data.timestamp, data.cpu_percent);
                updateChart(memChart, data.timestamp, data.memory_mb);
                updateChart(queueChart, data.timestamp, data.queued_tasks, data.active_workers);
            }
        }

        // 2. Poll for Test Report
        const reportResp = await fetch('/api/v1/test/report/latest');
        if (reportResp.ok) {
            const report = await reportResp.json();
            if (report.timestamp && report.timestamp !== lastReportTime) {
                // New report found
                log("Test completed! Showing report.");
                lastReportTime = report.timestamp;
                showModal(report);
            }
        }

    } catch (e) {
        console.error("Fetch error", e);
    }
}

// Start polling
setInterval(fetchData, 1000);
log("Dashboard initialized. Polling for data...");
