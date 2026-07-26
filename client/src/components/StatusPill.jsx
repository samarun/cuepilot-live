import React from 'react';

export function StatusPill({ status = 'ready' }) {
  const normalized = status || 'ready';
  return <span className={`status-pill status-${normalized}`}><span className="status-dot" />{normalized.replace('-', ' ')}</span>;
}
