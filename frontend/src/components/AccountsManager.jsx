import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Search, RefreshCw } from 'lucide-react';

function AccountsManager({ onTrigger, socket, statuses }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Fetch accounts
    fetch('http://localhost:3002/api/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

  }, []);

  const addAccount = () => {
    setAccounts([...accounts, { username: '', password: '', name: '', brand: '', isActive: true }]);
  };

  const updateAccount = (index, field, value) => {
    const newAccounts = [...accounts];
    newAccounts[index][field] = value;
    setAccounts(newAccounts);
  };

  const toggleAllAccounts = (checked) => {
    const newAccounts = accounts.map(acc => ({ ...acc, isActive: checked }));
    setAccounts(newAccounts);
  };

  const removeAccount = (index) => {
    const newAccounts = accounts.filter((_, i) => i !== index);
    setAccounts(newAccounts);
  };

  const saveAccounts = async () => {
    try {
      const res = await fetch('http://localhost:3002/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: accounts.filter(a => a.username && a.password) })
      });
      const data = await res.json();
      if (data.success) {
        alert("Accounts saved successfully!");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save accounts");
    }
  };

  const handleLoginVerify = async (accountObj) => {
    if (!accountObj || !accountObj.username) {
      alert("Please enter a Seller Portal Email / Mobile first.");
      return;
    }
    try {
      await fetch('http://localhost:3002/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: accounts.filter(a => a.username && a.password) })
      });
    } catch (e) {
      console.warn("Auto-save before login verification failed:", e);
    }
    onTrigger('flipkart_login_helper.js', { account: accountObj.username });
  };


  const getStatusBadgeClass = (statusObj) => {
    const status = statusObj?.status || 'Unknown';
    switch (status) {
      case 'Logged In':
        return 'status-logged-in';
      case 'Logged Out':
        return 'status-logged-out';
      case 'OTP Required':
        return 'status-otp';
      case 'Checking...':
        return 'status-checking';
      default:
        return 'status-unknown';
    }
  };

  if (loading) return <div className="glass-panel">Loading accounts...</div>;

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 85px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0, flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.3px' }}>Flipkart Supplier Accounts</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Add and manage seller portal credentials.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="search"
              className="input-field"
              placeholder="Search account name / email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', minWidth: '220px', paddingRight: '10px' }}
            />
          </div>
          <button className="btn btn-primary" onClick={addAccount}>
            <Plus size={16} /> Add Account
          </button>
          <button className="btn" style={{ background: 'var(--success)', color: 'white' }} onClick={saveAccounts}>
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem', paddingBottom: '1rem' }}>
        <table className="accounts-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '50px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  checked={accounts.length > 0 && accounts.every(a => a.isActive !== false)}
                  onChange={(e) => toggleAllAccounts(e.target.checked)}
                  title="Toggle all accounts"
                />
              </th>
              <th>Seller Portal Email / Mobile</th>
              <th>Seller Company Name</th>
              <th>Brand Name</th>
              <th>Password</th>
              <th style={{ width: '120px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts
              .map((acc, index) => ({ ...acc, originalIndex: index }))
              .filter(acc => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (acc.username && acc.username.toLowerCase().includes(q)) ||
                  (acc.name && acc.name.toLowerCase().includes(q)) ||
                  (acc.brand && acc.brand.toLowerCase().includes(q));
              })
              .map((acc) => {
                const idx = acc.originalIndex;
                const accountStatus = statuses?.[acc.username]?.status;
                const isChecking = accountStatus === 'Checking...';

                return (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <input
                        type="checkbox"
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                        checked={acc.isActive !== false}
                        onChange={(e) => updateAccount(idx, 'isActive', e.target.checked)}
                        title="Toggle status for this account"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        value={acc.username}
                        onChange={(e) => updateAccount(idx, 'username', e.target.value)}
                        placeholder="seller@example.com"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        value={acc.name || ''}
                        onChange={(e) => updateAccount(idx, 'name', e.target.value)}
                        placeholder="e.g. Surat Sarees Hub"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        value={acc.brand || ''}
                        onChange={(e) => updateAccount(idx, 'brand', e.target.value)}
                        placeholder="e.g. ZXRIZ / Brand"
                      />
                    </td>
                    <td>
                      <input
                        type="password"
                        className="input-field"
                        value={acc.password}
                        onChange={(e) => updateAccount(idx, 'password', e.target.value)}
                        placeholder="Password"
                      />
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                          className="btn"
                          style={{
                            padding: '0.45rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            background: isChecking
                              ? 'rgba(40, 116, 240, 0.25)'
                              : accountStatus === 'Logged In'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : accountStatus === 'Logged Out'
                              ? 'rgba(244, 63, 94, 0.15)'
                              : accountStatus === 'OTP Required'
                              ? 'rgba(255, 159, 0, 0.15)'
                              : 'rgba(40, 116, 240, 0.12)',
                            color: isChecking
                              ? 'var(--accent-yellow)'
                              : accountStatus === 'Logged In'
                              ? 'var(--success)'
                              : accountStatus === 'Logged Out'
                              ? 'var(--danger)'
                              : accountStatus === 'OTP Required'
                              ? 'var(--accent-orange)'
                              : 'var(--primary)',
                            border: `1px solid ${
                              isChecking
                                ? 'rgba(255, 225, 27, 0.4)'
                                : accountStatus === 'Logged In'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : accountStatus === 'Logged Out'
                                ? 'rgba(244, 63, 94, 0.3)'
                                : 'rgba(40, 116, 240, 0.25)'
                            }`,
                            cursor: isChecking ? 'wait' : 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                          onClick={() => handleLoginVerify(acc)}
                          disabled={isChecking}
                          title={
                            isChecking
                              ? `Running login bot for ${acc.username || 'this account'}...`
                              : `Run Login Bot for ${acc.username || 'this account'}${accountStatus ? ` (${accountStatus})` : ''}`
                          }
                        >
                          <RefreshCw size={16} className={isChecking ? 'spin' : ''} />
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.45rem', display: 'inline-flex', borderRadius: '8px' }}
                          onClick={() => removeAccount(idx)}
                          title="Delete Account"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                  No Flipkart accounts configured yet. Click 'Add Account' to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AccountsManager;
