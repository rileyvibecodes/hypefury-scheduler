/**
 * Dashboard HTML Templates
 *
 * Provides the UI for monitoring system health, operations, and queue status.
 */

export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Dashboard - Hypefury Scheduler</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            color: #1a1a2e;
            line-height: 1.5;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }

        /* Header */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            flex-wrap: wrap;
            gap: 12px;
        }
        .header h1 { font-size: 24px; color: #1a1a2e; }
        .nav-links a {
            margin-left: 16px;
            color: #4a4a6a;
            text-decoration: none;
            font-size: 14px;
        }
        .nav-links a:hover { color: #4CAF50; }

        /* Health Status Card */
        .health-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .health-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .health-indicator {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .health-indicator.healthy { background: #4CAF50; }
        .health-indicator.degraded { background: #FFC107; }
        .health-indicator.down { background: #f44336; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .health-status { font-size: 18px; font-weight: 600; }
        .health-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 16px;
        }
        .metric {
            text-align: center;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .metric-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
        .metric-label { font-size: 12px; color: #666; margin-top: 4px; }
        .metric.success .metric-value { color: #4CAF50; }
        .metric.warning .metric-value { color: #FFC107; }
        .metric.error .metric-value { color: #f44336; }

        /* Queue Status */
        .queue-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .queue-card h2 { font-size: 16px; margin-bottom: 16px; color: #333; }
        .queue-items { display: flex; gap: 24px; flex-wrap: wrap; }
        .queue-item {
            flex: 1;
            min-width: 120px;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 8px;
            text-align: center;
        }
        .queue-count { font-size: 32px; font-weight: 700; }
        .queue-label { font-size: 12px; color: #666; }
        .queue-item.warning .queue-count { color: #FFC107; }
        .queue-item.error .queue-count { color: #f44336; }

        /* Operations Table */
        .operations-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .operations-card h2 { font-size: 16px; margin-bottom: 16px; color: #333; }
        .operations-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        .operations-table th,
        .operations-table td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        .operations-table th {
            font-size: 11px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .status-completed { background: #d4edda; color: #155724; }
        .status-partial { background: #fff3cd; color: #856404; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .status-processing { background: #e7f3ff; color: #004085; }

        /* Quality Score Bar */
        .quality-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .quality-bar {
            width: 50px;
            height: 6px;
            background: #eee;
            border-radius: 3px;
            overflow: hidden;
        }
        .quality-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s;
        }
        .quality-high { background: #4CAF50; }
        .quality-medium { background: #FFC107; }
        .quality-low { background: #f44336; }
        .quality-value { font-size: 12px; color: #666; min-width: 30px; }

        /* Buttons */
        .refresh-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        .refresh-btn:hover { background: #45a049; }
        .refresh-btn:disabled { background: #ccc; cursor: not-allowed; }
        .last-updated { font-size: 12px; color: #888; margin-left: 12px; }

        /* Loading State */
        .loading {
            text-align: center;
            color: #888;
            padding: 20px;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            color: #888;
            padding: 40px 20px;
        }

        /* Responsive */
        @media (max-width: 600px) {
            .operations-table { font-size: 12px; }
            .operations-table th, .operations-table td { padding: 8px 4px; }
            .metric-value { font-size: 24px; }
            .queue-count { font-size: 24px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>System Dashboard</h1>
            <div class="nav-links">
                <a href="/">Scheduler</a>
                <a href="/clients">Clients</a>
            </div>
        </div>

        <!-- Health Status -->
        <div class="health-card">
            <div class="health-header">
                <div id="healthIndicator" class="health-indicator"></div>
                <span id="healthStatus" class="health-status">Loading...</span>
                <button class="refresh-btn" onclick="refreshDashboard()" id="refreshBtn">Refresh</button>
                <span id="lastUpdated" class="last-updated"></span>
            </div>
            <div class="health-metrics">
                <div class="metric success">
                    <div id="successRate" class="metric-value">--%</div>
                    <div class="metric-label">Success Rate (24h)</div>
                </div>
                <div class="metric">
                    <div id="totalOps" class="metric-value">--</div>
                    <div class="metric-label">Operations (24h)</div>
                </div>
                <div class="metric">
                    <div id="avgQuality" class="metric-value">--</div>
                    <div class="metric-label">Avg Quality</div>
                </div>
                <div class="metric warning">
                    <div id="correctedCount" class="metric-value">--</div>
                    <div class="metric-label">Auto-Corrected</div>
                </div>
                <div class="metric error">
                    <div id="rejectedCount" class="metric-value">--</div>
                    <div class="metric-label">Rejected</div>
                </div>
            </div>
        </div>

        <!-- Queue Status -->
        <div class="queue-card">
            <h2>Retry Queue Status</h2>
            <div class="queue-items">
                <div class="queue-item">
                    <div id="queuePending" class="queue-count">--</div>
                    <div class="queue-label">Pending</div>
                </div>
                <div class="queue-item warning">
                    <div id="queueFailed" class="queue-count">--</div>
                    <div class="queue-label">Awaiting Retry</div>
                </div>
                <div class="queue-item error">
                    <div id="queuePermanent" class="queue-count">--</div>
                    <div class="queue-label">Permanently Failed</div>
                </div>
            </div>
        </div>

        <!-- Recent Operations -->
        <div class="operations-card">
            <h2>Recent Operations</h2>
            <table class="operations-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Client</th>
                        <th>Type</th>
                        <th>Posts</th>
                        <th>Status</th>
                        <th>Quality</th>
                    </tr>
                </thead>
                <tbody id="operationsBody">
                    <tr><td colspan="6" class="loading">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        let refreshInterval = setInterval(refreshDashboard, 30000);

        // Initial load
        document.addEventListener('DOMContentLoaded', refreshDashboard);

        async function refreshDashboard() {
            const btn = document.getElementById('refreshBtn');
            btn.disabled = true;
            btn.textContent = 'Loading...';

            try {
                await Promise.all([
                    loadHealth(),
                    loadQueue(),
                    loadOperations()
                ]);
            } catch (e) {
                console.error('Dashboard refresh failed:', e);
            }

            btn.disabled = false;
            btn.textContent = 'Refresh';
            document.getElementById('lastUpdated').textContent =
                'Updated: ' + new Date().toLocaleTimeString();
        }

        async function loadHealth() {
            try {
                const resp = await fetch('/api/dashboard/health');
                const data = await resp.json();
                if (data.success) {
                    const h = data.health;

                    // Update indicator
                    const indicator = document.getElementById('healthIndicator');
                    indicator.className = 'health-indicator ' + h.status;

                    // Update status text
                    const statusText = {
                        healthy: 'System Healthy',
                        degraded: 'System Degraded',
                        down: 'System Down'
                    };
                    document.getElementById('healthStatus').textContent = statusText[h.status] || h.status;

                    // Update metrics
                    document.getElementById('successRate').textContent =
                        (h.successRate * 100).toFixed(0) + '%';
                    document.getElementById('totalOps').textContent = h.totalOperations || 0;
                    document.getElementById('avgQuality').textContent =
                        h.avgQualityScore ? Math.round(h.avgQualityScore) : '--';
                    document.getElementById('correctedCount').textContent = h.postsCorrected || 0;
                    document.getElementById('rejectedCount').textContent = h.postsRejected || 0;
                }
            } catch (e) {
                console.error('Failed to load health:', e);
                document.getElementById('healthStatus').textContent = 'Error loading';
            }
        }

        async function loadQueue() {
            try {
                const resp = await fetch('/api/dashboard/queue');
                const data = await resp.json();
                if (data.success) {
                    document.getElementById('queuePending').textContent = data.queue.pending || 0;
                    document.getElementById('queueFailed').textContent = data.queue.awaitingRetry || 0;
                    document.getElementById('queuePermanent').textContent = data.queue.permanentlyFailed || 0;
                }
            } catch (e) {
                console.error('Failed to load queue:', e);
            }
        }

        async function loadOperations() {
            try {
                const resp = await fetch('/api/dashboard/operations?limit=15');
                const data = await resp.json();
                const tbody = document.getElementById('operationsBody');

                if (!data.success) {
                    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load operations</td></tr>';
                    return;
                }

                if (!data.operations || data.operations.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No operations yet. Schedule some posts to see them here.</td></tr>';
                    return;
                }

                tbody.innerHTML = data.operations.map(op => {
                    const time = formatTime(op.started_at);
                    const statusClass = {
                        completed: 'status-completed',
                        partial: 'status-partial',
                        failed: 'status-failed',
                        processing: 'status-processing',
                        pending: 'status-processing'
                    }[op.status] || '';

                    // Calculate average quality for this operation
                    const totalPosts = op.total_posts || 0;
                    const successPosts = op.successful_posts || 0;

                    // Estimate quality - real implementation would calculate from posts
                    let avgQuality = 0;
                    if (totalPosts > 0) {
                        // Use corrected and rejected to estimate quality
                        const rejected = op.rejected_posts || 0;
                        const corrected = op.corrected_posts || 0;
                        avgQuality = Math.max(0, 100 - (rejected * 10) - (corrected * 2));
                    }

                    const qualityClass = avgQuality >= 80 ? 'quality-high' :
                                        avgQuality >= 50 ? 'quality-medium' : 'quality-low';

                    const typeLabels = {
                        google_doc: 'Google Doc',
                        webhook: 'Webhook',
                        bulk: 'Bulk',
                        single: 'Single',
                        retry: 'Retry'
                    };

                    return '<tr>' +
                        '<td>' + esc(time) + '</td>' +
                        '<td>' + esc(op.clientName || 'Client #' + op.client_id) + '</td>' +
                        '<td>' + esc(typeLabels[op.operation_type] || op.operation_type) + '</td>' +
                        '<td>' + successPosts + '/' + totalPosts + '</td>' +
                        '<td><span class="status-badge ' + statusClass + '">' + esc(op.status) + '</span></td>' +
                        '<td>' +
                            '<div class="quality-container">' +
                                '<div class="quality-bar">' +
                                    '<div class="quality-fill ' + qualityClass + '" style="width:' + avgQuality + '%"></div>' +
                                '</div>' +
                                '<span class="quality-value">' + avgQuality + '</span>' +
                            '</div>' +
                        '</td>' +
                    '</tr>';
                }).join('');
            } catch (e) {
                console.error('Failed to load operations:', e);
                document.getElementById('operationsBody').innerHTML =
                    '<tr><td colspan="6" class="empty-state">Error loading operations</td></tr>';
            }
        }

        function formatTime(isoString) {
            if (!isoString) return '--';
            const date = new Date(isoString);
            const now = new Date();
            const diff = now - date;

            // If less than 24 hours, show relative time
            if (diff < 24 * 60 * 60 * 1000) {
                if (diff < 60 * 1000) return 'Just now';
                if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + 'm ago';
                return Math.floor(diff / 3600000) + 'h ago';
            }

            // Otherwise show date
            return date.toLocaleDateString();
        }

        function esc(text) {
            if (text === null || text === undefined) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
}
