import { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Maximize2,
  Minimize2,
  Terminal,
  Activity,
  Globe,
  Camera
} from 'lucide-react';

function LiveBrowserFeed({ socket, isModal = false, onClose }) {
  const [screencastImage, setScreencastImage] = useState(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [activeScript, setActiveScript] = useState('');
  const [logs, setLogs] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const handleScreencast = (data) => {
      if (data && data.image) {
        setScreencastImage(data.image);
        if (data.url) setCurrentUrl(data.url);
        if (data.script) setActiveScript(data.script);
      }
    };

    const handleScreencastStopped = () => {
      setScreencastImage(null);
      setCurrentUrl('');
      setActiveScript('');
    };

    const handleProcessStatus = (data) => {
      if (data.status === 'stopped') {
        setScreencastImage(null);
        setCurrentUrl('');
        setActiveScript('');
      } else if (data.status === 'running') {
        setActiveScript(data.script);
      }
    };

    const handleLog = (logData) => {
      setLogs(prev => [...prev.slice(-150), logData]);
    };

    socket.on('screencast', handleScreencast);
    socket.on('screencast_stopped', handleScreencastStopped);
    socket.on('processStatus', handleProcessStatus);
    socket.on('log', handleLog);

    return () => {
      socket.off('screencast', handleScreencast);
      socket.off('screencast_stopped', handleScreencastStopped);
      socket.off('processStatus', handleProcessStatus);
      socket.off('log', handleLog);
    };
  }, [socket]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleDownloadScreenshot = () => {
    if (!screencastImage) return;
    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${screencastImage}`;
    link.download = `flipkart_screencast_${Date.now()}.jpg`;
    link.click();
  };

  const isLive = Boolean(screencastImage);

  return (
    <div
      className={isModal ? "" : "glass-panel"}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: isModal ? 0 : '1.5rem',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 2000 : 'auto',
        background: isFullscreen ? '#060a16' : undefined,
        height: isFullscreen ? '100vh' : 'auto'
      }}
    >
      {/* Feed Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'rgba(40, 116, 240, 0.15)', padding: '8px', borderRadius: '8px', color: 'var(--primary)' }}>
            <Monitor size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Live Browser View
              {isLive ? (
                <span className="status-badge status-logged-in" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  <Activity size={12} className="spin" /> LIVE STREAM
                </span>
              ) : (
                <span className="status-badge status-logged-out" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  STANDBY
                </span>
              )}
            </h3>
            {currentUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <Globe size={11} /> {currentUrl}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLive && (
            <button
              className="btn glass-panel"
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              onClick={handleDownloadScreenshot}
              title="Download Screenshot"
            >
              <Camera size={13} /> Screenshot
            </button>
          )}

          <button
            className="btn glass-panel"
            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="btn glass-panel"
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport & Logs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isFullscreen ? '1fr' : '1fr 340px', gap: '1rem', flex: 1, minHeight: '440px' }}>
        {/* Left Screen Viewport */}
        <div
          style={{
            background: '#010309',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            minHeight: '420px'
          }}
        >
          {isLive ? (
            <img
              src={`data:image/jpeg;base64,${screencastImage}`}
              alt="Live Headless Browser Feed"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Monitor size={30} style={{ opacity: 0.4 }} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--text-main)' }}>No Active Browser Stream</h4>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>
                  Run a bot or login verification to stream the live automation viewport in real time.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Real-time Logs Console */}
        {!isFullscreen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={14} /> Real-Time Console
              </span>
              <button
                onClick={() => setLogs([])}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>

            <div
              className="terminal-container"
              style={{
                flex: 1,
                minHeight: '400px',
                maxHeight: '480px',
                fontSize: '0.78rem',
                lineHeight: '1.5',
                padding: '0.75rem',
                background: '#02050f',
                overflowY: 'auto'
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0', opacity: 0.5 }}>
                  Waiting for bot activity...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      color: log.type === 'error' ? 'var(--danger)' : log.type === 'system' ? 'var(--accent-yellow)' : 'var(--text-main)',
                      marginBottom: '4px',
                      wordBreak: 'break-all'
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>&gt;</span>
                    {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveBrowserFeed;
