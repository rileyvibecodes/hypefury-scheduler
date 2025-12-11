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

        /* Navigation Bar */
        .nav-bar {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-bottom: 24px;
            background: white;
            padding: 12px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .nav-bar a {
            padding: 10px 20px;
            text-decoration: none;
            color: #4CAF50;
            border-radius: 8px;
            font-weight: 500;
            font-size: 14px;
            transition: background 0.2s, color 0.2s;
        }
        .nav-bar a:hover {
            background: rgba(76, 175, 80, 0.1);
        }
        .nav-bar a.active {
            background: #4CAF50;
            color: white;
        }

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

        /* Card styles */
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .card h2 {
            font-size: 16px;
            margin-bottom: 16px;
            color: #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        .data-table th,
        .data-table td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        .data-table th {
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
        .status-completed, .status-sent { background: #d4edda; color: #155724; }
        .status-partial, .status-queued { background: #fff3cd; color: #856404; }
        .status-failed, .status-permanently_failed { background: #f8d7da; color: #721c24; }
        .status-processing { background: #e7f3ff; color: #004085; }
        .status-rejected { background: #f8d7da; color: #721c24; }

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
        .btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        .btn:hover { background: #45a049; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .btn-secondary {
            background: #6c757d;
        }
        .btn-secondary:hover { background: #5a6268; }
        .btn-small {
            padding: 4px 10px;
            font-size: 12px;
        }
        .btn-retry {
            background: #FFC107;
            color: #333;
            padding: 4px 10px;
            font-size: 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }
        .btn-retry:hover { background: #e0a800; }
        .btn-retry:disabled { background: #ccc; cursor: not-allowed; color: #666; }
        .btn-retry.loading { background: #ccc; }
        .last-updated { font-size: 12px; color: #888; margin-left: 12px; }

        /* Error display with fix action */
        .error-box {
            background: #fff3f3;
            border: 1px solid #f8d7da;
            border-radius: 6px;
            padding: 12px;
            margin-top: 8px;
        }
        .error-box .error-title {
            font-weight: 600;
            color: #721c24;
            margin-bottom: 4px;
        }
        .error-box .error-fix {
            font-size: 13px;
            color: #856404;
            background: #fff9e6;
            padding: 8px;
            border-radius: 4px;
            margin-top: 8px;
        }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            border-bottom: 1px solid #eee;
            padding-bottom: 8px;
        }
        .tab {
            padding: 8px 16px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 14px;
            color: #666;
            border-radius: 6px;
        }
        .tab:hover { background: #f0f0f0; }
        .tab.active { background: #4CAF50; color: white; }

        /* Error message display */
        .error-message {
            background: #fff3f3;
            border: 1px solid #f8d7da;
            border-radius: 6px;
            padding: 12px;
            margin-top: 8px;
            font-size: 13px;
            color: #721c24;
            font-family: monospace;
            word-break: break-all;
        }
        .post-preview {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 12px;
            margin-top: 8px;
            font-size: 13px;
            color: #333;
            max-height: 100px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }

        /* Expandable rows */
        .expandable { cursor: pointer; }
        .expandable:hover { background: #f8f9fa; }
        .expand-icon {
            display: inline-block;
            width: 20px;
            transition: transform 0.2s;
        }
        .expand-icon.expanded { transform: rotate(90deg); }
        .details-row { display: none; }
        .details-row.show { display: table-row; }
        .details-cell {
            padding: 16px !important;
            background: #fafafa;
        }

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
            .data-table { font-size: 12px; }
            .data-table th, .data-table td { padding: 8px 4px; }
            .metric-value { font-size: 24px; }
            .queue-count { font-size: 24px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <nav class="nav-bar">
            <a href="/">Scheduler</a>
            <a href="/clients">Clients</a>
            <a href="/dashboard" class="active">Dashboard</a>
        </nav>

        <div class="header">
            <h1>System Dashboard</h1>
        </div>

        <!-- Health Status -->
        <div class="health-card">
            <div class="health-header">
                <div id="healthIndicator" class="health-indicator"></div>
                <span id="healthStatus" class="health-status">Loading...</span>
                <button class="btn" onclick="refreshDashboard()" id="refreshBtn">Refresh</button>
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
                    <div class="metric-label">Failed</div>
                </div>
            </div>
        </div>

        <!-- Post Status (simplified from retry queue) -->
        <div class="queue-card">
            <h2>Post Status</h2>
            <div class="queue-items">
                <div class="queue-item">
                    <div id="queuePending" class="queue-count">--</div>
                    <div class="queue-label">Queued</div>
                </div>
                <div class="queue-item" style="background: #d4edda;">
                    <div id="queueSent" class="queue-count" style="color: #155724;">--</div>
                    <div class="queue-label">Sent</div>
                </div>
                <div class="queue-item error">
                    <div id="queueFailed" class="queue-count">--</div>
                    <div class="queue-label">Failed</div>
                </div>
            </div>
        </div>

        <!-- Recent Operations -->
        <div class="card">
            <h2>Recent Operations</h2>
            <table class="data-table">
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

        <!-- Logs Section -->
        <div class="card">
            <h2>
                Post Logs
                <div>
                    <button class="tab active" onclick="setLogsFilter('all')" id="tabAll">All</button>
                    <button class="tab" onclick="setLogsFilter('failed')" id="tabFailed">Failed Only</button>
                </div>
            </h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Time</th>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Quality</th>
                        <th>Error</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="logsBody">
                    <tr><td colspan="7" class="loading">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // State
        let logsFilter = 'all';

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
                    loadOperations(),
                    loadLogs()
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
                    document.getElementById('queueFailed').textContent =
                        (data.queue.awaitingRetry || 0) + (data.queue.permanentlyFailed || 0);

                    // Calculate sent from logs
                    const logsResp = await fetch('/api/dashboard/logs?limit=1000');
                    const logsData = await logsResp.json();
                    if (logsData.success) {
                        const sentCount = logsData.logs.filter(l => l.status === 'sent').length;
                        document.getElementById('queueSent').textContent = sentCount;
                    }
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

                    const totalPosts = op.total_posts || 0;
                    const successPosts = op.successful_posts || 0;
                    const failedPosts = op.failed_posts || 0;

                    let avgQuality = 0;
                    if (totalPosts > 0) {
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
                        '<td>' + successPosts + '/' + totalPosts + (failedPosts > 0 ? ' <span style="color:#dc3545">(' + failedPosts + ' failed)</span>' : '') + '</td>' +
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

        async function loadLogs() {
            try {
                const failedOnly = logsFilter === 'failed';
                const resp = await fetch('/api/dashboard/logs?limit=30&failed=' + failedOnly);
                const data = await resp.json();
                const tbody = document.getElementById('logsBody');

                if (!data.success) {
                    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load logs</td></tr>';
                    return;
                }

                if (!data.logs || data.logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' +
                        (failedOnly ? 'No failed posts. All good!' : 'No posts yet.') + '</td></tr>';
                    return;
                }

                tbody.innerHTML = data.logs.map((log, idx) => {
                    const time = formatTime(log.created_at);
                    const statusClass = 'status-' + log.status;
                    const qualityClass = log.quality_score >= 80 ? 'quality-high' :
                                        log.quality_score >= 50 ? 'quality-medium' : 'quality-low';

                    const canRetry = log.status === 'failed' || log.status === 'permanently_failed';
                    const hasError = canRetry || log.status === 'rejected';
                    const errorText = log.hypefury_response || 'No error details';
                    const preview = log.processed_content ? log.processed_content.substring(0, 150) + (log.processed_content.length > 150 ? '...' : '') : '';

                    const mainRow = '<tr class="expandable" onclick="toggleDetails(' + idx + ')">' +
                        '<td><span class="expand-icon" id="icon-' + idx + '">▶</span></td>' +
                        '<td>' + esc(time) + '</td>' +
                        '<td>' + esc(log.clientName) + '</td>' +
                        '<td><span class="status-badge ' + statusClass + '">' + esc(log.status) + '</span></td>' +
                        '<td>' +
                            '<div class="quality-container">' +
                                '<div class="quality-bar">' +
                                    '<div class="quality-fill ' + qualityClass + '" style="width:' + log.quality_score + '%"></div>' +
                                '</div>' +
                                '<span class="quality-value">' + log.quality_score + '</span>' +
                            '</div>' +
                        '</td>' +
                        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                            (hasError ? esc(errorText.substring(0, 50)) : '<span style="color:#28a745">OK</span>') +
                        '</td>' +
                        '<td onclick="event.stopPropagation()">' +
                            (canRetry
                                ? '<button class="btn-retry" id="retry-btn-' + log.id + '" onclick="retryPost(' + log.id + ')">Retry</button>'
                                : (log.status === 'sent' ? '<span style="color:#28a745;font-size:12px;">Sent</span>' : '-')) +
                        '</td>' +
                    '</tr>';

                    const detailsRow = '<tr class="details-row" id="details-' + idx + '">' +
                        '<td colspan="7" class="details-cell">' +
                            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
                                '<div>' +
                                    '<strong>Post Content:</strong>' +
                                    '<div class="post-preview">' + esc(preview) + '</div>' +
                                '</div>' +
                                '<div>' +
                                    (hasError
                                        ? '<div class="error-box">' +
                                            '<div class="error-title">What failed:</div>' +
                                            '<div>' + esc(errorText) + '</div>' +
                                          '</div>'
                                        : '') +
                                    (log.correctionsParsed && log.correctionsParsed.length > 0
                                        ? '<strong style="margin-top:12px;display:block;">Corrections Applied:</strong><div class="post-preview">' + esc(log.correctionsParsed.join(', ')) + '</div>'
                                        : '') +
                                    (canRetry
                                        ? '<div style="margin-top:12px;"><button class="btn-retry" onclick="retryPost(' + log.id + ')">Retry This Post</button></div>'
                                        : '') +
                                '</div>' +
                            '</div>' +
                        '</td>' +
                    '</tr>';

                    return mainRow + detailsRow;
                }).join('');
            } catch (e) {
                console.error('Failed to load logs:', e);
                document.getElementById('logsBody').innerHTML =
                    '<tr><td colspan="7" class="empty-state">Error loading logs</td></tr>';
            }
        }

        function toggleDetails(idx) {
            const details = document.getElementById('details-' + idx);
            const icon = document.getElementById('icon-' + idx);
            if (details.classList.contains('show')) {
                details.classList.remove('show');
                icon.classList.remove('expanded');
            } else {
                details.classList.add('show');
                icon.classList.add('expanded');
            }
        }

        function setLogsFilter(filter) {
            logsFilter = filter;
            document.getElementById('tabAll').classList.toggle('active', filter === 'all');
            document.getElementById('tabFailed').classList.toggle('active', filter === 'failed');
            loadLogs();
        }

        async function retryPost(postId) {
            const btn = document.getElementById('retry-btn-' + postId);
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Retrying...';
                btn.classList.add('loading');
            }

            try {
                const resp = await fetch('/api/posts/' + postId + '/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await resp.json();

                if (data.success) {
                    // Show success and refresh
                    if (btn) {
                        btn.textContent = 'Sent!';
                        btn.style.background = '#28a745';
                        btn.style.color = 'white';
                    }
                    // Refresh after short delay
                    setTimeout(() => {
                        refreshDashboard();
                    }, 1000);
                } else {
                    // Show error
                    const errorMsg = data.error?.message || 'Retry failed';
                    const fixAction = data.error?.fixAction || '';
                    alert('Retry failed: ' + errorMsg + (fixAction ? '\\n\\nHow to fix: ' + fixAction : ''));
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Retry';
                        btn.classList.remove('loading');
                    }
                }
            } catch (e) {
                console.error('Retry error:', e);
                alert('Failed to retry post. Please try again.');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Retry';
                    btn.classList.remove('loading');
                }
            }
        }

        function formatTime(isoString) {
            if (!isoString) return '--';

            // Handle SQLite timestamp format (YYYY-MM-DD HH:MM:SS)
            // Add 'Z' to treat as UTC if no timezone indicator
            let dateStr = isoString;
            if (!dateStr.includes('T') && !dateStr.includes('Z')) {
                dateStr = dateStr.replace(' ', 'T') + 'Z';
            }

            const date = new Date(dateStr);

            // Check for invalid date
            if (isNaN(date.getTime())) {
                return isoString; // Return original string if can't parse
            }

            const now = new Date();
            const diff = now.getTime() - date.getTime();

            // Handle future dates (shouldn't happen, but just in case)
            if (diff < 0) {
                return 'Scheduled';
            }

            // Less than 1 minute ago
            if (diff < 60 * 1000) {
                return 'Just now';
            }

            // Less than 1 hour ago
            if (diff < 60 * 60 * 1000) {
                const mins = Math.floor(diff / 60000);
                return mins + 'm ago';
            }

            // Less than 24 hours ago
            if (diff < 24 * 60 * 60 * 1000) {
                const hours = Math.floor(diff / 3600000);
                return hours + 'h ago';
            }

            // Less than 7 days ago
            if (diff < 7 * 24 * 60 * 60 * 1000) {
                const days = Math.floor(diff / (24 * 60 * 60 * 1000));
                return days + 'd ago';
            }

            // Show full date for older items
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
