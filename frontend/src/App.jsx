import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Users, UserCircle, KeyRound, Video, X, AlertCircle, RefreshCw, Tags, Sparkles, Bell } from 'lucide-react';
import { Link, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import AccountsManager from './components/AccountsManager';
import InventoryUpdatesManager from './components/InventoryUpdatesManager';
import SingleCatalogSetup from './components/SingleCatalogSetup';
import NotificationsManager from './components/NotificationsManager';
import LiveBrowserFeed from './components/LiveBrowserFeed';

// Connect to backend server on port 3002
const socket = io('http://localhost:3002');

function App() {
  const [accountCount, setAccountCount] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [activeOtpRequest, setActiveOtpRequest] = useState(null);
  const [userOtpVal, setUserOtpVal] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [unreadErrorCount, setUnreadErrorCount] = useState(0);
  const location = useLocation();

  // Live Browser View State
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [liveFrames, setLiveFrames] = useState({});
  const [liveErrors, setLiveErrors] = useState({});

  const fetchAccounts = () => {
    fetch('http://localhost:3002/api/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        setAccountCount(data.filter(a => a.isActive !== false).length);
      })
      .catch(err => console.error("Error fetching accounts:", err));
  };

  const fetchNotificationCounts = () => {
    fetch('http://localhost:3002/api/catalog-notifications')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotificationCount(data.length);
          setUnreadErrorCount(data.filter(n => n.status === 'ERROR').length);
        }
      })
      .catch(() => {});
  };

  const checkOtpStatus = () => {
    fetch('http://localhost:3002/api/otp-status')
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'WAITING_FOR_OTP' && data.username) {
          setActiveOtpRequest(data);
        } else {
          setActiveOtpRequest(null);
        }
      })
      .catch(err => console.error("Error checking OTP status:", err));
  };

  useEffect(() => {
    fetchAccounts();
    fetchNotificationCounts();
    const interval = setInterval(fetchAccounts, 5000);
    const otpInterval = setInterval(checkOtpStatus, 2000);
    const notifInterval = setInterval(fetchNotificationCounts, 4000);

    // Fetch initial login statuses
    fetch('http://localhost:3002/api/accounts/login-status')
      .then(res => res.json())
      .then(data => {
        setStatuses(data);
      })
      .catch(err => console.error("Error fetching login statuses:", err));

    const handleStatusUpdate = (data) => {
      setStatuses(prev => ({
        ...prev,
        [data.account]: {
          status: data.status,
          timestamp: Date.now()
        }
      }));
    };
    socket.on('loginStatusUpdate', handleStatusUpdate);

    // Listen for screencast frames
    socket.on('live_frame', ({ account, data }) => {
      setLiveFrames(prev => ({ ...prev, [account]: data }));
      // Clear error if we get a frame
      if (liveErrors[account]) {
        setLiveErrors(prev => {
          const next = { ...prev };
          delete next[account];
          return next;
        });
      }
    });

    socket.on('live_error', ({ account, message }) => {
      setLiveErrors(prev => ({ ...prev, [account]: message }));
    });

    return () => {
      clearInterval(interval);
      clearInterval(otpInterval);
      clearInterval(notifInterval);
      socket.off('live_frame');
      socket.off('live_error');
      socket.off('loginStatusUpdate', handleStatusUpdate);
    };
  }, [liveErrors]);

  const triggerScript = async (filename, action = 'start') => {
    try {
      const isStop = action === 'stop';
      const endpoint = isStop ? `/api/stop/${filename}` : `/api/run/${filename}`;
      let bodyData = undefined;
      if (typeof action === 'object' && action.account) {
        bodyData = JSON.stringify({ account: action.account });
      }

      const res = await fetch(`http://localhost:3002${endpoint}`, {
        method: 'POST',
        headers: bodyData ? { 'Content-Type': 'application/json' } : undefined,
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

  const handleSubmitOtp = async (e) => {
    e.preventDefault();
    if (!userOtpVal || userOtpVal.length < 6) {
      alert("Please enter a valid 6-digit OTP.");
      return;
    }
    setSubmittingOtp(true);
    try {
      const res = await fetch('http://localhost:3002/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: activeOtpRequest.username, otp: userOtpVal })
      });
      if (res.ok) {
        setTimeout(() => {
          setSubmittingOtp(false);
          setUserOtpVal('');
          setActiveOtpRequest(null);
        }, 1500);
      }
    } catch (err) {
      alert("Error submitting OTP: " + err.message);
      setSubmittingOtp(false);
    }
  };

  const handleCancelOtp = async () => {
    try {
      await fetch('http://localhost:3002/api/clear-otp', { method: 'POST' });
      setActiveOtpRequest(null);
      setUserOtpVal('');
    } catch (e) { }
  };

  const handleMasterRefresh = () => {
    const activeAccounts = accounts.filter(acc => acc.isActive !== false && acc.username);
    if (activeAccounts.length === 0) {
      alert("No active accounts configured to verify!");
      return;
    }
    activeAccounts.forEach(acc => {
      triggerScript('flipkart_login_helper.js', { account: acc.username });
    });
  };

  const handleOpenLiveModal = () => {
    setIsLiveModalOpen(true);
    setLiveFrames({});
    setLiveErrors({});
    accounts.forEach(acc => {
      socket.emit('start_live_view', { account: acc.username });
    });
  };

  const handleCloseLiveModal = () => {
    setIsLiveModalOpen(false);
    accounts.forEach(acc => {
      socket.emit('stop_live_view', { account: acc.username });
    });
    setLiveFrames({});
    setLiveErrors({});
  };

  return (
    <div className="app-container" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Sidebar */}
      <aside className="sidebar open" style={{ width: '260px', flexShrink: 0 }}>
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '2.5rem' }}>
          <h1 style={{ margin: 0 }}>Flipkart Hub</h1>
          <button
            className="refresh-btn"
            onClick={handleMasterRefresh}
            disabled={Object.values(statuses).some(s => s?.status === 'Checking...')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px',
              color: 'var(--text-muted)',
              cursor: Object.values(statuses).some(s => s?.status === 'Checking...') ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!Object.values(statuses).some(s => s?.status === 'Checking...')) {
                e.currentTarget.style.color = 'var(--accent-yellow)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 225, 27, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
            title="Verify All Logins"
          >
            <RefreshCw size={16} className={Object.values(statuses).some(s => s?.status === 'Checking...') ? 'spin' : ''} />
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <Link
            to="/accounts"
            className={`btn ${(location.pathname === '/' || location.pathname.startsWith('/accounts')) ? 'btn-primary' : 'glass-panel'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              border: (location.pathname === '/' || location.pathname.startsWith('/accounts')) ? '' : 'none',
              color: (location.pathname === '/' || location.pathname.startsWith('/accounts')) ? '' : 'var(--text-muted)',
              position: 'relative',
              textDecoration: 'none'
            }}
          >
            <Users size={18} /> Accounts
            {accountCount > 0 && (
              <span style={{
                background: (location.pathname === '/' || location.pathname.startsWith('/accounts')) ? 'var(--accent-yellow)' : 'rgba(255, 255, 255, 0.1)',
                color: (location.pathname === '/' || location.pathname.startsWith('/accounts')) ? 'var(--bg-dark)' : 'var(--text-main)',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.8rem',
                position: 'absolute',
                right: '14px'
              }}>
                {accountCount}
              </span>
            )}
          </Link>
          <Link
            to="/inventory-updates"
            className={`btn ${location.pathname.startsWith('/inventory-updates') ? 'btn-primary' : 'glass-panel'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              border: location.pathname.startsWith('/inventory-updates') ? '' : 'none',
              color: location.pathname.startsWith('/inventory-updates') ? '' : 'var(--text-muted)',
              textDecoration: 'none'
            }}
          >
            <Tags size={18} /> Inventory Updates
          </Link>
          <Link
            to="/single-catalog"
            className={`btn ${(location.pathname.startsWith('/single-catalog') || location.pathname.startsWith('/single-listing')) ? 'btn-primary' : 'glass-panel'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              border: (location.pathname.startsWith('/single-catalog') || location.pathname.startsWith('/single-listing')) ? '' : 'none',
              color: (location.pathname.startsWith('/single-catalog') || location.pathname.startsWith('/single-listing')) ? '' : 'var(--text-muted)',
              textDecoration: 'none'
            }}
          >
            <Sparkles size={18} /> Single Listing
          </Link>
          <Link
            to="/notifications"
            className={`btn ${location.pathname.startsWith('/notifications') ? 'btn-primary' : 'glass-panel'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              border: location.pathname.startsWith('/notifications') ? '' : 'none',
              color: location.pathname.startsWith('/notifications') ? '' : 'var(--text-muted)',
              textDecoration: 'none',
              position: 'relative'
            }}
          >
            <Bell size={18} /> Notifications
            {notificationCount > 0 && (
              <span style={{
                background: unreadErrorCount > 0 ? 'var(--danger)' : 'var(--success)',
                color: 'white',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '10px',
                fontSize: '0.75rem',
                position: 'absolute',
                right: '12px'
              }}>
                {notificationCount}
              </span>
            )}
          </Link>
        </nav>
        <div style={{ padding: '1rem', fontSize: "12px", color: "#6e84ab", marginTop: "auto", textAlign: "center" }}>
          © 2026 FLIPKART MANAGEMENT PANEL
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="top-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
              {location.pathname.startsWith('/notifications')
                ? 'Notifications & Error Center'
                : location.pathname.startsWith('/single-catalog') || location.pathname.startsWith('/single-listing')
                ? 'Single Listing Setup'
                : location.pathname.startsWith('/inventory-updates')
                ? 'Inventory Updates'
                : 'Accounts'}
            </h2>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: 'white' }}
              onClick={() => setIsLiveModalOpen(true)}
            >
              <Video size={18} /> Live Headless View
            </button>
          </div>
        </header>

        <main className="main-content" style={{ padding: '1rem', flex: 1 }}>
          <Routes>
            <Route path="/" element={<AccountsManager onTrigger={triggerScript} socket={socket} statuses={statuses} />} />
            <Route path="/accounts" element={<AccountsManager onTrigger={triggerScript} socket={socket} statuses={statuses} />} />
            <Route path="/inventory-updates" element={<InventoryUpdatesManager socket={socket} />} />
            <Route path="/single-catalog" element={<SingleCatalogSetup socket={socket} />} />
            <Route path="/single-listing" element={<Navigate to="/single-catalog" replace />} />
            <Route path="/notifications" element={<NotificationsManager socket={socket} />} />
          </Routes>
        </main>
      </div>

      {/* 2-Step OTP Verification Modal */}
      {activeOtpRequest && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '420px', padding: '2rem' }}>
            <h3 style={{ color: 'var(--accent-yellow)', fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={22} color="var(--accent-yellow)" /> Verification Required
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Flipkart Seller portal needs a 2-Step OTP verification for <strong>{activeOtpRequest.username}</strong>.
            </p>

            <form onSubmit={handleSubmitOtp}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Enter 6-Digit OTP</label>
                <input
                  type="text"
                  maxLength={6}
                  className="input-field"
                  placeholder="e.g. 123456"
                  style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px', padding: '10px', fontWeight: 'bold' }}
                  value={userOtpVal}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setUserOtpVal(val);
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={handleCancelOtp}
                  disabled={submittingOtp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submittingOtp || userOtpVal.length < 6}
                >
                  {submittingOtp ? 'Verifying...' : 'Submit OTP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Screencast Grid Modal */}
      {isLiveModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setIsLiveModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '96%', width: '96%', padding: '1.5rem', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <LiveBrowserFeed
              socket={socket}
              accounts={accounts}
              onClose={() => setIsLiveModalOpen(false)}
              isModal={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
