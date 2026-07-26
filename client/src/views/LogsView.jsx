import React, { useEffect, useState } from 'react';
import { api } from '../services/apiClient.js';
import { useApp } from '../contexts/AppContext.jsx';

export function LogsView() {
  const { notify } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { const response = await api.getLogs(); setLogs(response.logs || []); }
    catch (error) { notify(error.message, 'danger'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cuepilot-logs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="logs-view surface-card">
      <div className="logs-toolbar"><div><span className="section-eyebrow">Audit trail</span><h2>Event logs</h2></div><div><button className="btn btn-outline-secondary" onClick={load}><i className="bi bi-arrow-clockwise" /> Refresh</button><button className="btn btn-outline-secondary" onClick={exportLogs}><i className="bi bi-download" /> Export</button><button className="btn btn-outline-danger" onClick={async () => { await api.clearLogs(); setLogs([]); }}><i className="bi bi-trash3" /> Clear</button></div></div>
      <div className="log-table-wrap"><table className="table log-table"><thead><tr><th>Timestamp</th><th>Source</th><th>Action</th><th>Cue</th><th>Result</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.timestamp}-${index}`}><td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td><td><span className="source-chip">{log.source || 'system'}</span></td><td>{log.action}</td><td>{log.cueId || '—'}</td><td>{log.result || '—'}</td></tr>)}</tbody></table>{!loading && !logs.length && <div className="empty-state"><i className="bi bi-journal-text" /><h3>No log entries</h3><p>Playback and project actions will appear here.</p></div>}{loading && <div className="loading-state"><span className="spinner-border spinner-border-sm" /> Loading logs…</div>}</div>
    </div>
  );
}
