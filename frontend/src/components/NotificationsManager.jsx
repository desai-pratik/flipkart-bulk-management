import { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
  ExternalLink,
  Maximize2,
  X,
  Sparkles,
  Layers,
  Clock,
  Filter,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:3002';

function NotificationsManager({ socket }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'SUCCESS' | 'ERROR'
  const [searchQuery, setSearchQuery] = useState('');
  const [previewScreenshot, setPreviewScreenshot] = useState(null);

  const fetchNotifications = () => {
    setLoading(true);
    fetch(`${BACKEND_URL}/api/catalog-notifications`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotifications(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching notifications:", err);
        setLoading(false);
      });
  };

  const handleClearNotifications = async () => {
    if (!window.confirm("Are you sure you want to clear all notifications?")) return;
    try {
      await fetch(`${BACKEND_URL}/api/catalog-notifications`, { method: 'DELETE' });
      setNotifications([]);
    } catch (e) {
      alert("Error clearing notifications: " + e.message);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (socket) {
      const handleSkuNotification = (notif) => {
        setNotifications(prev => [notif, ...prev.filter(n => !(n.sku === notif.sku && n.timestamp === notif.timestamp))]);
      };

      socket.on('skuNotification', handleSkuNotification);

      return () => {
        socket.off('skuNotification', handleSkuNotification);
      };
    }
  }, [socket]);

  // Derived counts
  const totalCount = notifications.length;
  const successCount = notifications.filter(n => n.status === 'SUCCESS').length;
  const errorCount = notifications.filter(n => n.status === 'ERROR').length;

  // Filtered notifications
  const filteredNotifications = notifications.filter(notif => {
    if (filterType === 'SUCCESS' && notif.status !== 'SUCCESS') return false;
    if (filterType === 'ERROR' && notif.status !== 'ERROR') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSku = notif.sku && notif.sku.toLowerCase().includes(q);
      const matchMsg = notif.message && notif.message.toLowerCase().includes(q);
      const matchAcc = notif.account && notif.account.toLowerCase().includes(q);
      if (!matchSku && !matchMsg && !matchAcc) return false;
    }
    return true;
  });

  return (
    <div className="notifications-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Banner & Control Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(40, 116, 240, 0.15)', padding: '12px', borderRadius: '12px', color: 'var(--primary)' }}>
            <Bell size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>Catalog Notifications & Error Center</h2>
              <span style={{ background: 'rgba(40, 116, 240, 0.15)', color: 'var(--primary)', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                LIVE FEED
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Real-time submission reports, QC confirmations, and automated error screenshot logs for all catalog uploads.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn glass-panel"
            onClick={fetchNotifications}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          {notifications.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={handleClearNotifications}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              <Trash2 size={14} /> Clear All Logs
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        
        {/* Total Processed */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ background: 'rgba(40, 116, 240, 0.15)', padding: '10px', borderRadius: '10px', color: 'var(--primary)' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Processed</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-main)' }}>{totalCount}</div>
          </div>
        </div>

        {/* Successfully Sent to QC */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--success)' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: '10px', color: 'var(--success)' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent to QC (Success)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--success)' }}>{successCount}</div>
          </div>
        </div>

        {/* Errors Captured */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '10px', borderRadius: '10px', color: 'var(--danger)' }}>
            <AlertCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Errors (With Screenshots)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--danger)' }}>{errorCount}</div>
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
            <Filter size={14} /> Filter:
          </span>
          <button
            className={`btn ${filterType === 'ALL' ? 'btn-primary' : 'glass-panel'}`}
            onClick={() => setFilterType('ALL')}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
          >
            All Logs ({totalCount})
          </button>
          <button
            className={`btn ${filterType === 'SUCCESS' ? 'btn-success' : 'glass-panel'}`}
            onClick={() => setFilterType('SUCCESS')}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.82rem',
              background: filterType === 'SUCCESS' ? 'var(--success)' : undefined,
              color: filterType === 'SUCCESS' ? 'white' : 'var(--success)'
            }}
          >
            Success ({successCount})
          </button>
          <button
            className={`btn ${filterType === 'ERROR' ? 'btn-danger' : 'glass-panel'}`}
            onClick={() => setFilterType('ERROR')}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.82rem',
              background: filterType === 'ERROR' ? 'var(--danger)' : undefined,
              color: filterType === 'ERROR' ? 'white' : 'var(--danger)'
            }}
          >
            Errors ({errorCount})
          </button>
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="search"
            className="input-field"
            placeholder="Search by SKU, Account, Error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '34px', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredNotifications.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', display: 'inline-flex', padding: '1.25rem', borderRadius: '50%', marginBottom: '1rem' }}>
              <Bell size={36} color="var(--text-muted)" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>No Notifications Yet</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: '400px', marginInline: 'auto' }}>
              When the single listing bot runs, success confirmations and error screenshots will automatically appear here.
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif, idx) => {
            const isSuccess = notif.status === 'SUCCESS';
            return (
              <div
                key={idx}
                className="glass-panel"
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1.25rem',
                  borderLeft: `5px solid ${isSuccess ? 'var(--success)' : 'var(--danger)'}`,
                  background: isSuccess ? 'rgba(16, 185, 129, 0.03)' : 'rgba(244, 63, 94, 0.03)'
                }}
              >
                {/* Left details */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1, minWidth: '280px' }}>
                  <div style={{
                    background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    padding: '10px',
                    borderRadius: '10px',
                    color: isSuccess ? 'var(--success)' : 'var(--danger)',
                    marginTop: '2px'
                  }}>
                    {isSuccess ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                        SKU: {notif.sku}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isSuccess ? 'var(--success)' : 'var(--danger)',
                        color: 'white'
                      }}>
                        {notif.status}
                      </span>
                      {notif.account && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                          Account: {notif.account}
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '4px 0 6px 0', fontSize: '0.9rem', color: isSuccess ? 'var(--text-main)' : 'var(--danger)', lineHeight: 1.4 }}>
                      {notif.message}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> {notif.timestamp ? new Date(notif.timestamp).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Screenshot Preview & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {notif.screenshot ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {/* Thumbnail */}
                      <div
                        onClick={() => setPreviewScreenshot(notif)}
                        style={{
                          width: '100px',
                          height: '65px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
                          cursor: 'pointer',
                          background: '#000',
                          position: 'relative'
                        }}
                      >
                        <img
                          src={`${BACKEND_URL}${notif.screenshot}`}
                          alt={`Screenshot for ${notif.sku}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          ':hover': { opacity: 1 }
                        }}>
                          <Maximize2 size={16} color="white" />
                        </div>
                      </div>

                      {/* View Button */}
                      <button
                        className="btn glass-panel"
                        onClick={() => setPreviewScreenshot(notif)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.85rem',
                          background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                          color: isSuccess ? 'var(--success)' : 'var(--danger)',
                          borderColor: isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'
                        }}
                      >
                        <Maximize2 size={14} /> View Screenshot
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No Screenshot</span>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* SCREENSHOT PREVIEW MODAL */}
      {previewScreenshot && (
        <div className="modal-backdrop" style={{ zIndex: 1400 }} onClick={() => setPreviewScreenshot(null)}>
          <div className="modal-content" style={{ maxWidth: '900px', padding: '1.5rem', background: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {previewScreenshot.status === 'SUCCESS' ? (
                  <CheckCircle2 size={24} color="var(--success)" />
                ) : (
                  <AlertCircle size={24} color="var(--danger)" />
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
                    Flipkart Browser Screenshot — SKU: {previewScreenshot.sku}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: previewScreenshot.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)' }}>
                    {previewScreenshot.message}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPreviewScreenshot(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* High-res Image Preview */}
            <div style={{ width: '100%', maxHeight: '580px', background: '#000', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
              <img
                src={`${BACKEND_URL}${previewScreenshot.screenshot}`}
                alt={`Screenshot for ${previewScreenshot.sku}`}
                style={{ width: '100%', height: 'auto', maxHeight: '580px', objectFit: 'contain' }}
              />
            </div>

            {/* Modal Footer info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div>
                <span>Account: <strong>{previewScreenshot.account || 'N/A'}</strong></span>
                <span style={{ marginInline: '8px' }}>•</span>
                <span>Recorded: <strong>{previewScreenshot.timestamp ? new Date(previewScreenshot.timestamp).toLocaleString() : 'N/A'}</strong></span>
              </div>
              <a
                href={`${BACKEND_URL}${previewScreenshot.screenshot}`}
                target="_blank"
                rel="noreferrer"
                className="btn glass-panel"
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} /> Open Full Size in New Tab
              </a>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default NotificationsManager;
