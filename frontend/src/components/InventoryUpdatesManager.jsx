import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Play, Terminal, Square } from 'lucide-react';

function InventoryUpdatesManager({ socket }) {
  const [updates, setUpdates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Accounts for triggering updates
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  // Logs terminal state
  const [logs, setLogs] = useState([]);
  const terminalRef = useRef(null);

  useEffect(() => {
    // Fetch stock updates
    fetch('http://localhost:3002/api/inventory-stock-updates')
      .then(res => res.json())
      .then(data => {
        const normalizedData = data.map((item, idx) => ({
          id: `db-${idx}-${Date.now()}-${Math.random()}`,
          sku: item.sku,
          stock: item.stock
        }));
        setUpdates(normalizedData);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

    // Fetch accounts for run dropdown
    fetch('http://localhost:3002/api/accounts')
      .then(res => res.json())
      .then(data => {
        const activeAccounts = data.filter(a => a.isActive !== false);
        setAccounts(activeAccounts);
        if (activeAccounts.length > 0) {
          setSelectedAccount(activeAccounts[0].username);
        }
      })
      .catch(err => console.error("Error fetching accounts:", err));

    // Connect socket listeners for logs
    const handleLog = (data) => {
      if (data.script === 'flipkart_inventory_stock_update.js') {
        setLogs(prev => [...prev, data].slice(-200));
      }
    };

    const handleProcessStatus = (data) => {
      if (data.script === 'flipkart_inventory_stock_update.js') {
        setIsRunning(data.status === 'running');
      }
    };

    socket.on('log', handleLog);
    socket.on('processStatus', handleProcessStatus);

    return () => {
      socket.off('log', handleLog);
      socket.off('processStatus', handleProcessStatus);
    };
  }, [socket]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const addUpdate = () => {
    setUpdates([...updates, { id: `new-${Date.now()}-${Math.random()}`, sku: '', stock: '' }]);
  };

  const updateItem = (id, field, value) => {
    setUpdates(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const removeUpdate = (id) => {
    setSelectedIds(prev => prev.filter(item => item !== id));
    setUpdates(prev => prev.filter(u => u.id !== id));
  };

  const toggleSelectUpdate = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(updates.map(u => u.id));
    } else {
      setSelectedIds([]);
    }
  };

  const deleteSelected = () => {
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected items?`)) return;
    const newUpdates = updates.filter(u => !selectedIds.includes(u.id));
    setUpdates(newUpdates);
    setSelectedIds([]);
  };

  const saveUpdates = async () => {
    try {
      const payload = updates
        .filter(u => u.sku && u.stock !== '')
        .map(u => ({ sku: u.sku, stock: u.stock }));

      const res = await fetch('http://localhost:3002/api/inventory-stock-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: payload })
      });
      const data = await res.json();
      if (data.success) {
        alert("Stock updates saved successfully!");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save inventory updates");
    }
  };

  const triggerStockUpdate = async (action = 'start') => {
    if (action === 'start' && !selectedAccount) {
      alert("Please select a seller account first.");
      return;
    }
    try {
      const isStop = action === 'stop';
      const endpoint = isStop ? `/api/stop/flipkart_inventory_stock_update.js` : `/api/run/flipkart_inventory_stock_update.js`;
      let bodyData = undefined;
      if (!isStop) {
        bodyData = JSON.stringify({ account: selectedAccount });
      } else {
        bodyData = JSON.stringify({ account: selectedAccount });
      }

      setLogs([]); // clear log window on start
      const res = await fetch(`http://localhost:3002${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyData
      });
      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to connect to backend");
    }
  };

  if (loading) return <div className="glass-panel">Loading inventory stock manager...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>

      {/* Left side: Stock SKU List Manager */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
          <div>
            <input
              type="search"
              className="input-field"
              placeholder="Search SKU..."
              style={{ width: '220px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', background: 'var(--bg-dark)' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={deleteSelected} style={{ padding: '0.5rem 0.75rem' }}>
                <Trash2 size={16} /> Delete ({selectedIds.length})
              </button>
            )}
            <button className="btn btn-primary" onClick={addUpdate} style={{ padding: '0.5rem 0.75rem' }}>
              <Plus size={16} /> Add SKU
            </button>
            <button className="btn" style={{ background: 'var(--success)', color: 'white', padding: '0.5rem 0.75rem' }} onClick={saveUpdates}>
              <Save size={16} /> Save CSV
            </button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          <table className="accounts-table" style={{ marginTop: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-dark)' }}>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                    checked={updates.length > 0 && updates.every(u => selectedIds.includes(u.id))}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th>SKU / Style ID</th>
                <th style={{ width: '150px' }}>Stock</th>
                <th style={{ width: '70px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {updates
                .filter(u => (u.sku || '').toLowerCase().includes(searchTerm.toLowerCase()))
                .map((update) => {
                  const isSelected = selectedIds.includes(update.id);
                  return (
                    <tr key={update.id}>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <input
                          type="checkbox"
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                          checked={isSelected}
                          onChange={() => toggleSelectUpdate(update.id)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input-field"
                          style={{ width: '100%', fontFamily: 'monospace' }}
                          value={update.sku}
                          onChange={(e) => updateItem(update.id, 'sku', e.target.value)}
                          placeholder="e.g. SKU-FLIPKART-12"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input-field"
                          style={{ width: '100%' }}
                          value={update.stock}
                          onChange={(e) => updateItem(update.id, 'stock', e.target.value)}
                          placeholder="e.g. 100"
                        />
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.4rem', display: 'inline-flex' }}
                          onClick={() => removeUpdate(update.id)}
                          title="Remove SKU"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {updates.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No SKUs configured yet. Click 'Add SKU' to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right side: Runner Control & Live Output Logs */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Run stock update bot</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
              Execute automation script against active seller account.
            </p>
          </div>
        </div>

        {/* Account Selection and Trigger Controls */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>
              Select Active Account
            </label>
            <select
              className="input-field"
              style={{ width: '100%', background: 'var(--bg-dark)', cursor: 'pointer', height: '42px' }}
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              disabled={isRunning}
            >
              {accounts.map(acc => (
                <option key={acc.username} value={acc.username}>
                  {acc.name ? `${acc.name} (${acc.username})` : acc.username}
                </option>
              ))}
              {accounts.length === 0 && (
                <option value="">No active accounts configured</option>
              )}
            </select>
          </div>

          <div>
            {isRunning ? (
              <button className="btn btn-danger" onClick={() => triggerStockUpdate('stop')} style={{ height: '42px', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                <Square size={16} /> Stop Bot
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => triggerStockUpdate('start')} style={{ height: '42px', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', background: 'var(--primary)', color: 'white' }}>
                <Play size={16} /> Start Sync
              </button>
            )}
          </div>
        </div>

        {/* Live Logs Terminal Screen */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '1.05rem', fontWeight: '700' }}>
            <Terminal size={18} /> Live Script Output
          </h3>
          <div className="terminal-container" ref={terminalRef} style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', color: '#d4d4d4' }}>
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>Waiting for stock updates script execution to output logs...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ color: log.type === 'error' ? 'var(--danger)' : '#569cd6', marginRight: '8px' }}>
                    [{log.type.toUpperCase()}]
                  </span>
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

export default InventoryUpdatesManager;
