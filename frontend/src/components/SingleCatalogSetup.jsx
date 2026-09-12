import { useState, useEffect } from 'react';
import {
  Save,
  Image as ImageIcon,
  Search,
  Trash2,
  UploadCloud,
  Play,
  Square,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Layers,
  Package,
  FileText,
  Building2,
  DollarSign,
  Maximize2
} from 'lucide-react';
import LiveBrowserFeed from './LiveBrowserFeed';

const BACKEND_URL = 'http://localhost:3002';

function SingleCatalogSetup({ socket }) {
  const defaultFormState = {
    brand: '',
    styleCode: '',
    productName: 'Gold Plated Traditional Ethnic Jewellery Set For Women',
    mrp: '999',
    sellingPrice: '199',
    inventory: '1000',
    hsnCode: '711790',
    gstRate: '3',
    listingStatus: 'ACTIVE',
    procurementType: 'instock',
    procurementSLA: '1',

    packageWeight: '0.15',
    packageLength: '15',
    packageBreadth: '12',
    packageHeight: '4',
    productWeight: '100',

    baseMetal: 'Alloy',
    plating: 'Gold Plated',
    stoneType: 'Artificial Stones & Beads',
    type: 'Necklace and Earrings',
    sizing: 'Adjustable',
    trend: 'Handcrafted',
    occasion: 'Festive & Party',
    color: 'Gold',
    packOf: '1',
    netQuantity: '1',
    includedComponents: '1 Necklace, 1 Pair of Earrings',
    genericName: 'Jewellery Set',
    idealFor: 'Women',
    collection: 'Ethnic',
    closure: 'Drawstring',

    countryOfOrigin: 'India',
    manufacturerName: 'Bazar Collections',
    manufacturerAddress: 'Yogi Chowk, Surat, Gujarat - 395010',
    manufacturerPincode: '395010',
    packerName: 'Bazar Collections',
    packerAddress: 'Yogi Chowk, Surat, Gujarat - 395010',
    packerPincode: '395010',

    description: 'Exquisite Gold Plated Traditional Jewellery Set for Women. Features intricate craftsmanship, adorned with lustrous beads and artificial stones. Perfect for weddings, festive occasions, and traditional celebrations.',
    searchKeywords: 'jewellery set, necklace set, traditional gold plated jewelry, bridal jewellery set, women necklace set'
  };

  const [formData, setFormData] = useState(defaultFormState);
  const [images, setImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [photoSearchQuery, setPhotoSearchQuery] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [previewScreenshot, setPreviewScreenshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Bot execution state
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('ALL');
  const [botRunning, setBotRunning] = useState(false);
  const [botStatusMsg, setBotStatusMsg] = useState('');
  const [botLogs, setBotLogs] = useState([]);
  const [catalogNotifications, setCatalogNotifications] = useState([]);

  const fetchDefaults = () => {
    fetch(`${BACKEND_URL}/api/single-catalog-defaults?category=jewellery_set`)
      .then(res => res.json())
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setFormData(prev => ({ ...prev, ...data }));
        }
      })
      .catch(err => console.error("Error loading defaults:", err));
  };

  const fetchImages = () => {
    fetch(`${BACKEND_URL}/api/single-catalog-images`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImages(data);
        }
      })
      .catch(err => console.error("Error loading images:", err));
  };

  const fetchAccounts = () => {
    fetch(`${BACKEND_URL}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAccounts(data.filter(a => a.isActive !== false));
        }
      })
      .catch(err => console.error("Error loading accounts:", err));
  };

  const fetchNotifications = () => {
    fetch(`${BACKEND_URL}/api/catalog-notifications`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCatalogNotifications(data);
        }
      })
      .catch(err => console.error("Error loading notifications:", err));
  };

  const handleClearNotifications = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/catalog-notifications`, { method: 'DELETE' });
      setCatalogNotifications([]);
    } catch (e) { }
  };

  useEffect(() => {
    fetchDefaults();
    fetchImages();
    fetchAccounts();
    fetchNotifications();

    if (socket) {
      const handleProcessStatus = (data) => {
        if (data.script === 'flipkart_jewellery_set_single_catalog_upload.js') {
          if (data.status === 'running') {
            setBotRunning(true);
            setBotStatusMsg('Bot running...');
          } else {
            setBotRunning(false);
            setBotStatusMsg('Bot stopped.');
          }
        }
      };

      const handleLog = (logData) => {
        if (logData.script === 'flipkart_jewellery_set_single_catalog_upload.js') {
          setBotLogs(prev => [logData.message, ...prev.slice(0, 50)]);
          if (logData.message.includes('Processing SKU:')) {
            setBotStatusMsg(logData.message.trim());
          }
        }
      };

      const handleSkuNotification = (notif) => {
        setCatalogNotifications(prev => [notif, ...prev.filter(n => !(n.sku === notif.sku && n.timestamp === notif.timestamp))]);
      };

      socket.on('processStatus', handleProcessStatus);
      socket.on('log', handleLog);
      socket.on('skuNotification', handleSkuNotification);

      return () => {
        socket.off('processStatus', handleProcessStatus);
        socket.off('log', handleLog);
        socket.off('skuNotification', handleSkuNotification);
      };
    }
  }, [socket]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveDefaults = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/single-catalog-defaults?category=jewellery_set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Failed to save defaults");
      }
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const data = new FormData();
    for (let i = 0; i < files.length; i++) {
      data.append('files', files[i]);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/single-catalog-images`, {
        method: 'POST',
        body: data
      });
      if (res.ok) {
        fetchImages();
      } else {
        alert("Failed to upload images");
      }
    } catch (err) {
      alert("Error uploading images: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteImage = async (filename, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${filename}?`)) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/single-catalog-images/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setImages(prev => prev.filter(img => img.name !== filename));
        setSelectedImages(prev => prev.filter(name => name !== filename));
      }
    } catch (err) {
      alert("Error deleting image: " + err.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedImages.length === 0) return;
    if (!window.confirm(`Delete ${selectedImages.length} selected photos?`)) return;
    try {
      for (const filename of selectedImages) {
        await fetch(`${BACKEND_URL}/api/single-catalog-images/${encodeURIComponent(filename)}`, {
          method: 'DELETE'
        });
      }
      setSelectedImages([]);
      fetchImages();
    } catch (err) {
      alert("Error deleting selected images: " + err.message);
    }
  };

  const handleDeleteAll = async () => {
    if (images.length === 0) return;
    if (!window.confirm("Are you sure you want to remove ALL uploaded photos?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/single-catalog-images`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setImages([]);
        setSelectedImages([]);
      }
    } catch (err) {
      alert("Error deleting all images: " + err.message);
    }
  };

  const toggleSelectImage = (filename, e) => {
    e.stopPropagation();
    setSelectedImages(prev =>
      prev.includes(filename) ? prev.filter(n => n !== filename) : [...prev, filename]
    );
  };

  const toggleSelectAll = () => {
    if (selectedImages.length === filteredImages.length) {
      setSelectedImages([]);
    } else {
      setSelectedImages(filteredImages.map(img => img.name));
    }
  };

  const handleTriggerBot = async () => {
    const scriptName = 'flipkart_jewellery_set_single_catalog_upload.js';
    if (botRunning) {
      // Stop bot
      try {
        await fetch(`${BACKEND_URL}/api/stop/${scriptName}`, {
          method: 'POST'
        });
      } catch (err) {
        alert("Failed to stop bot: " + err.message);
      }
    } else {
      // Start bot
      try {
        setBotLogs([]);
        setBotStatusMsg('Starting bot for active accounts (one by one)...');
        const res = await fetch(`${BACKEND_URL}/api/run/${scriptName}`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.error) {
          alert(`Error: ${data.error}`);
        }
      } catch (err) {
        alert("Failed to start bot: " + err.message);
      }
    }
  };

  const commonSuffixes = ['_a.', '_b.', '_c.', '_d.', '_e.', '_f.'];
  const isCommonPhoto = (filename) => {
    const lower = filename.toLowerCase();
    return commonSuffixes.some(s => lower.includes(s));
  };

  const getPhotoRoleBadge = (filename) => {
    const lower = filename.toLowerCase();
    if (lower.includes('_a.')) return { text: 'Side Angle _a', color: '#a855f7' };
    if (lower.includes('_b.')) return { text: 'Side Angle _b', color: '#8b5cf6' };
    if (lower.includes('_c.')) return { text: 'Detail Photo _c', color: '#6366f1' };
    if (lower.includes('_d.')) return { text: 'Extra Photo _d', color: '#3b82f6' };
    return { text: 'Main SKU Photo', color: 'var(--primary)' };
  };

  const filteredImages = images.filter(img =>
    !photoSearchQuery || img.name.toLowerCase().includes(photoSearchQuery.toLowerCase())
  );

  return (
    <div className="single-catalog-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Bot Control Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(40, 116, 240, 0.15)', padding: '12px', borderRadius: '12px', color: 'var(--primary)' }}>
            <Sparkles size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>Single Listing Setup</h2>
              <span style={{ background: 'rgba(255, 225, 27, 0.15)', color: 'var(--accent-yellow)', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                JEWELLERY SET
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Manage default listing attributes and photo assets for automated single catalog creation on Flipkart.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Save Defaults Button */}
          <button
            className="btn btn-primary"
            onClick={handleSaveDefaults}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saveSuccess ? 'var(--success)' : undefined }}
          >
            {saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Defaults'}
          </button>

          {/* Run Bot Button */}
          <button
            className={`btn ${botRunning ? 'btn-danger' : 'btn-success'}`}
            onClick={handleTriggerBot}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: botRunning ? 'var(--danger)' : 'var(--success)',
              color: 'white',
              fontWeight: '700',
              boxShadow: botRunning ? '0 4px 15px rgba(244, 63, 94, 0.4)' : '0 4px 15px rgba(16, 185, 129, 0.4)'
            }}
          >
            {botRunning ? <Square size={16} /> : <Play size={16} />}
            {botRunning ? 'Stop Listing Bot' : 'Run Single Listing Bot'}
          </button>
        </div>
      </div>

      {/* Live Status Pill if bot running */}
      {(botRunning || botStatusMsg) && (
        <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(40, 116, 240, 0.1)', borderColor: 'var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`bot-status ${botRunning ? 'status-running' : 'status-stopped'}`}></span>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>{botStatusMsg || 'Ready'}</span>
          </div>
          {botLogs.length > 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              Latest: {botLogs[0]}
            </span>
          )}
        </div>
      )}

      {/* CATALOG EXECUTION ACTIVITY & NOTIFICATIONS */}
      {catalogNotifications.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid var(--accent-yellow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--accent-yellow)" /> Catalog Upload Activity & Notifications
              </h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  {catalogNotifications.filter(n => n.status === 'SUCCESS').length} Sent to QC
                </span>
                <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  {catalogNotifications.filter(n => n.status === 'ERROR').length} Errors
                </span>
              </div>
            </div>

            <button
              className="btn glass-panel"
              onClick={handleClearNotifications}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
            >
              Clear Notifications
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
            {catalogNotifications.map((notif, index) => {
              const isSuccess = notif.status === 'SUCCESS';
              return (
                <div
                  key={index}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: isSuccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                    border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isSuccess ? (
                      <CheckCircle2 size={18} color="var(--success)" />
                    ) : (
                      <AlertCircle size={18} color="var(--danger)" />
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          SKU: {notif.sku}
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isSuccess ? 'var(--success)' : 'var(--danger)',
                          color: 'white'
                        }}>
                          {notif.status}
                        </span>
                        {notif.account && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({notif.account})
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: isSuccess ? 'var(--text-main)' : 'var(--danger)' }}>
                        {notif.message}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {notif.timestamp ? new Date(notif.timestamp).toLocaleTimeString() : ''}
                    </span>
                    {notif.screenshot && (
                      <button
                        className="btn glass-panel"
                        onClick={() => setPreviewScreenshot(notif)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                          color: isSuccess ? 'var(--success)' : 'var(--danger)',
                          borderColor: isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'
                        }}
                      >
                        <Maximize2 size={12} /> View Screenshot
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 1: PHOTO ASSETS MANAGEMENT */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ImageIcon size={20} color="var(--primary)" /> Uploaded Photos ({images.length})
            </h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Upload your Main SKU images (e.g. <code>JEW_2981.jpg</code>) and common angle files (<code>_a.jpg</code>, <code>_b.jpg</code>, <code>_c.jpg</code>).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Photos */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="search"
                className="input-field"
                placeholder="Search photos..."
                value={photoSearchQuery}
                onChange={(e) => setPhotoSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', minWidth: '180px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Select All */}
            {filteredImages.length > 0 && (
              <button
                className="btn glass-panel"
                onClick={toggleSelectAll}
                style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }}
              >
                {selectedImages.length === filteredImages.length ? 'Deselect All' : 'Select All'}
              </button>
            )}

            {/* Delete Selected / Remove All */}
            {selectedImages.length > 0 ? (
              <button
                className="btn btn-danger"
                style={{ padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
                onClick={handleDeleteSelected}
                disabled={uploading}
              >
                <Trash2 size={14} /> Delete Selected ({selectedImages.length})
              </button>
            ) : images.length > 0 ? (
              <button
                className="btn btn-danger"
                style={{ padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
                onClick={handleDeleteAll}
                disabled={uploading}
              >
                <Trash2 size={14} /> Remove All
              </button>
            ) : null}

            {/* Upload Button */}
            <label className="btn btn-primary" style={{ cursor: 'pointer', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', margin: 0 }}>
              <UploadCloud size={16} /> {uploading ? 'Uploading...' : 'Upload Photos'}
              <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Photos Grid or Empty State */}
        {images.length === 0 ? (
          <label className="upload-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', border: '2px dashed var(--border-color)', borderRadius: '16px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)', transition: 'all 0.3s' }}>
            <UploadCloud size={48} color="var(--primary)" style={{ marginBottom: '0.75rem', opacity: 0.8 }} />
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>No photos uploaded yet</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Click or drop files here to upload your product images</p>
            <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
          </label>
        ) : (
          <div className="photo-grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            {filteredImages.map(img => {
              const role = getPhotoRoleBadge(img.name);
              const isSelected = selectedImages.includes(img.name);
              return (
                <div
                  key={img.name}
                  className={`photo-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setPreviewImage(img)}
                  style={{
                    background: 'rgba(15, 25, 54, 0.4)',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Select checkbox & role badge */}
                  <div style={{ position: 'absolute', top: '8px', left: '8px', right: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleSelectImage(img.name, e)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                    <span style={{ background: role.color, color: 'white', fontSize: '0.65rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {role.text}
                    </span>
                  </div>

                  {/* Thumbnail */}
                  <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img
                      src={`${BACKEND_URL}/single_catalog_images/${encodeURIComponent(img.name)}`}
                      alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Image preview unavailable</div>';
                      }}
                    />
                  </div>

                  {/* Info Footer */}
                  <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ overflow: 'hidden', flex: 1, marginRight: '6px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={img.name}>
                        {img.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {img.size ? `${(img.size / 1024).toFixed(1)} KB` : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteImage(img.name, e)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      title="Delete photo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: FORM ATTRIBUTES - PRICE, STOCK & SHIPPING INFORMATION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.5rem' }}>

        {/* CARD 1: STATUS & PRICE DETAILS */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-yellow)' }}>
            <DollarSign size={18} color="var(--accent-yellow)" /> Status & Price Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div className="form-group">
              <label>Listing Status <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="listingStatus"
                value={formData.listingStatus || 'ACTIVE'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>MRP (INR) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="mrp"
                  value={formData.mrp || ''}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="999"
                />
              </div>

              <div className="form-group">
                <label>Your Selling Price (INR) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="sellingPrice"
                  value={formData.sellingPrice || ''}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="199"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Minimum Order Quantity (MinOQ)</label>
              <select
                name="minOQ"
                value={formData.minOQ || '1'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>

          </div>
        </div>

        {/* CARD 2: INVENTORY & SHIPPING PROVIDER */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Layers size={18} color="var(--primary)" /> Inventory & Shipping Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Fullfilment by <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  name="fulfilmentBy"
                  value={formData.fulfilmentBy || 'Seller'}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="Seller">Seller</option>
                  <option value="Seller Smart">Seller Smart</option>
                  <option value="Flipkart">Flipkart</option>
                </select>
              </div>

              <div className="form-group">
                <label>Procurement Type</label>
                <select
                  name="procurementType"
                  value={formData.procurementType || 'instock'}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="instock">instock</option>
                  <option value="Express">Express</option>
                  <option value="Made to Order">Made to Order</option>
                  <option value="Domestic">Domestic</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Procurement SLA (DAY) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="procurementSLA"
                  value={formData.procurementSLA || '1'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="1"
                />
              </div>

              <div className="form-group">
                <label>Stock <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="stock"
                  value={formData.stock || formData.inventory || '1000'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="1000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Shipping Provider</label>
              <select
                name="shippingProvider"
                value={formData.shippingProvider || 'Flipkart'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="Flipkart">Flipkart</option>
                <option value="Seller">Seller</option>
              </select>
            </div>

          </div>
        </div>

        {/* CARD 3: PACKAGE DETAILS */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
            <Package size={18} color="var(--success)" /> Package Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Length (CM) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="packageLength"
                  value={formData.packageLength || '15'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="15"
                />
              </div>

              <div className="form-group">
                <label>Breadth (CM) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="packageBreadth"
                  value={formData.packageBreadth || '12'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="12"
                />
              </div>

              <div className="form-group">
                <label>Height (CM) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  name="packageHeight"
                  value={formData.packageHeight || '4'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="4"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Weight (KG) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="packageWeight"
                value={formData.packageWeight || '0.15'}
                onChange={handleChange}
                className="input-field"
                placeholder="0.15"
              />
            </div>

          </div>
        </div>

        {/* CARD 4: TAX & MANUFACTURING DETAILS */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
            <Building2 size={18} color="#a855f7" /> Tax & Manufacturing Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>HSN <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode || '711790'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="711790"
                />
              </div>

              <div className="form-group">
                <label>Luxury Cess (%)</label>
                <input
                  type="number"
                  name="luxuryCess"
                  value={formData.luxuryCess || '0'}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="0"
                />
              </div>

              <div className="form-group">
                <label>Tax Code <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  name="taxCode"
                  value={formData.taxCode || 'GST_3'}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="GST_3">GST_3 (3%)</option>
                  <option value="GST_0">GST_0 (0%)</option>
                  <option value="GST_5">GST_5 (5%)</option>
                  <option value="GST_12">GST_12 (12%)</option>
                  <option value="GST_18">GST_18 (18%)</option>
                  <option value="GST_28">GST_28 (28%)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Country Of Origin <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="countryOfOrigin"
                value={formData.countryOfOrigin || 'India'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="India">India</option>
                <option value="China">China</option>
                <option value="Thailand">Thailand</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Germany">Germany</option>
                <option value="France">France</option>
                <option value="Italy">Italy</option>
                <option value="Spain">Spain</option>
                <option value="Japan">Japan</option>
                <option value="Vietnam">Vietnam</option>
                <option value="Bangladesh">Bangladesh</option>
                <option value="Sri Lanka">Sri Lanka</option>
                <option value="Nepal">Nepal</option>
                <option value="Malaysia">Malaysia</option>
                <option value="Indonesia">Indonesia</option>
                <option value="Singapore">Singapore</option>
                <option value="United Arab Emirates">United Arab Emirates</option>
                <option value="Turkey">Turkey</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div className="form-group">
              <label>Manufacturer Details <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="manufacturerDetails"
                value={formData.manufacturerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010'}
                onChange={handleChange}
                className="input-field"
                placeholder="Full Manufacturer Details"
              />
            </div>

            <div className="form-group">
              <label>Packer Details <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="packerDetails"
                value={formData.packerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010'}
                onChange={handleChange}
                className="input-field"
                placeholder="Full Packer Details"
              />
            </div>

          </div>
        </div>

        {/* CARD 5: PRODUCT DESCRIPTION DETAILS (Items Included, Type, Ideal For, Color, Base Material) */}
        <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
            <FileText size={18} color="#38bdf8" /> Product Description Attributes
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

            <div className="form-group">
              <label>Items Included <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="itemsIncluded"
                value={formData.itemsIncluded || formData.includedComponents || '1 Necklace, 1 Pair of Earrings'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. 1 Necklace, 1 Pair of Earrings"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Multiple values allowed (separated by comma)
              </span>
            </div>

            <div className="form-group">
              <label>Type <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="type"
                value={formData.type || 'Earring & Necklace Set'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="Earring & Necklace Set">Earring & Necklace Set</option>
                <option value="Necklace and Earrings">Necklace and Earrings</option>
                <option value="Necklace, Earrings & Maang Tikka">Necklace, Earrings & Maang Tikka</option>
                <option value="Choker Set">Choker Set</option>
                <option value="Bridal Set">Bridal Set</option>
                <option value="Temple Jewellery Set">Temple Jewellery Set</option>
              </select>
            </div>

            <div className="form-group">
              <label>Ideal For <span style={{ color: 'var(--danger)' }}>*</span> (Multi-select)</label>
              <input
                type="text"
                name="idealFor"
                value={formData.idealFor || 'Women, Girls'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Women, Girls"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Options: Women, Girls, Baby Girls
              </span>
            </div>

            <div className="form-group">
              <label>Color <span style={{ color: 'var(--danger)' }}>*</span> (Multi-select)</label>
              <input
                type="text"
                name="color"
                value={formData.color || 'Gold'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Gold, Green, Maroon"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Options: Gold, Green, Maroon, Silver, Pink, Multicolor
              </span>
            </div>

            <div className="form-group">
              <label>Base Material <span style={{ color: 'var(--danger)' }}>*</span> (Multi-select)</label>
              <input
                type="text"
                name="baseMaterial"
                value={formData.baseMaterial || formData.baseMetal || 'Alloy'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Alloy, Brass, Copper"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Options: Alloy, Brass, Copper, Silver, Stainless Steel
              </span>
            </div>

            <div className="form-group">
              <label>Plating <span style={{ color: 'var(--danger)' }}>*</span> (Multi-select)</label>
              <input
                type="text"
                name="plating"
                value={formData.plating || 'Gold-plated'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Gold-plated, Silver-plated"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Options: Gold-plated, Silver-plated, Rose Gold-plated, Rhodium-plated, Oxidized Gold, Yellow Gold
              </span>
            </div>

            <div className="form-group">
              <label>Pearl Type <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="pearlType"
                value={formData.pearlType || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="Cultured">Cultured</option>
                <option value="Freshwater">Freshwater</option>
                <option value="South Sea">South Sea</option>
                <option value="Akoya">Akoya</option>
                <option value="Mabe">Mabe</option>
                <option value="Plastic">Plastic</option>
                <option value="Shell">Shell</option>
              </select>
            </div>

            <div className="form-group">
              <label>Diamond Color Grade <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="diamondColorGrade"
                value={formData.diamondColorGrade || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="D">D</option>
                <option value="E-F">E-F</option>
                <option value="G-H">G-H</option>
                <option value="I-J">I-J</option>
                <option value="K-L">K-L</option>
                <option value="M-N">M-N</option>
              </select>
            </div>

            <div className="form-group">
              <label>Diamond Clarity <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="diamondClarity"
                value={formData.diamondClarity || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="FL">FL</option>
                <option value="IF">IF</option>
                <option value="VVS1">VVS1</option>
                <option value="VVS2">VVS2</option>
                <option value="VS1">VS1</option>
                <option value="VS2">VS2</option>
                <option value="SI1">SI1</option>
                <option value="SI2">SI2</option>
                <option value="I1">I1</option>
              </select>
            </div>

            <div className="form-group">
              <label>Certification <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="certification"
                value={formData.certification || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="Brand Certification">Brand Certification</option>
                <option value="Self-Certified">Self-Certified</option>
                <option value="BIS Hallmark">BIS Hallmark</option>
                <option value="IGI">IGI</option>
                <option value="GIA">GIA</option>
              </select>
            </div>

            <div className="form-group">
              <label>Gemstone <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="gemstone"
                value={formData.gemstone || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="Diamond">Diamond</option>
                <option value="Cubic Zirconia">Cubic Zirconia</option>
                <option value="Artificial Stone">Artificial Stone</option>
                <option value="Ruby">Ruby</option>
                <option value="Emerald">Emerald</option>
                <option value="Sapphire">Sapphire</option>
                <option value="Pearl">Pearl</option>
                <option value="Agate">Agate</option>
                <option value="Topaz">Topaz</option>
              </select>
            </div>

            <div className="form-group">
              <label>Diamond Cut <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="diamondCut"
                value={formData.diamondCut || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Not Applicable">Not Applicable</option>
                <option value="Round Brilliant">Round Brilliant</option>
                <option value="Princess">Princess</option>
                <option value="Emerald Cut">Emerald Cut</option>
                <option value="Oval">Oval</option>
                <option value="Marquise">Marquise</option>
                <option value="Pear">Pear</option>
                <option value="Heart">Heart</option>
                <option value="Cushion">Cushion</option>
              </select>
            </div>

            <div className="form-group">
              <label>Diamond Shape <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="diamondShape"
                value={formData.diamondShape || 'NA'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. NA or Round"
              />
            </div>

            <div className="form-group">
              <label>Diamond Weight (carat) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="number"
                name="diamondWeight"
                value={formData.diamondWeight || '0'}
                onChange={handleChange}
                className="input-field"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label>Brand Color <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="brandColor"
                value={formData.brandColor || formData.color || 'Gold'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Gold, Maroon"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Multiple values allowed (separated by comma)
              </span>
            </div>

            <div className="form-group">
              <label>Silver Weight (g) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="number"
                name="silverWeight"
                value={formData.silverWeight || '0'}
                onChange={handleChange}
                className="input-field"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label>Pack of <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select
                name="packOf"
                value={formData.packOf || '1'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="6">6</option>
              </select>
            </div>

          </div>
        </div>

        {/* CARD 6: ADDITIONAL DESCRIPTION (OPTIONAL) */}
        <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
            <FileText size={18} color="#10b981" /> Additional Description Attributes (Optional)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

            <div className="form-group">
              <label>Necklace & Chain Type</label>
              <select
                name="necklaceChainType"
                value={formData.necklaceChainType || 'Link Chain'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="Link Chain">Link Chain</option>
                <option value="Rope Chain">Rope Chain</option>
                <option value="Beaded Chain">Beaded Chain</option>
                <option value="Strand">Strand</option>
                <option value="Choker">Choker</option>
                <option value="Layered">Layered</option>
                <option value="NA">NA</option>
              </select>
            </div>

            <div className="form-group">
              <label>Pendant Shape</label>
              <select
                name="pendantShape"
                value={formData.pendantShape || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Floral">Floral</option>
                <option value="Round">Round</option>
                <option value="Heart">Heart</option>
                <option value="Geometric">Geometric</option>
                <option value="Peacock">Peacock</option>
                <option value="Drop">Drop</option>
                <option value="Oval">Oval</option>
              </select>
            </div>

            <div className="form-group">
              <label>Ring Size</label>
              <select
                name="ringSize"
                value={formData.ringSize || 'NA'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="NA">NA</option>
                <option value="Adjustable">Adjustable</option>
                <option value="Free Size">Free Size</option>
                <option value="10">10</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="20">20</option>
              </select>
            </div>

            <div className="form-group">
              <label>Maang Tikka</label>
              <select
                name="maangTikka"
                value={formData.maangTikka || 'No'}
                onChange={handleChange}
                className="input-field"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            <div className="form-group">
              <label>Occasion (Multi-select)</label>
              <input
                type="text"
                name="occasion"
                value={formData.occasion || 'Everyday'}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g. Everyday, Festive & Party"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Options: Everyday, Festive & Party, Wedding & Engagement, Religious
              </span>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Search Keywords</label>
              <input
                type="text"
                name="searchKeywords"
                value={formData.searchKeywords || 'jewellery set, necklace set, traditional gold plated jewelry, bridal jewellery set, women necklace set'}
                onChange={handleChange}
                className="input-field"
                placeholder="Comma separated search keywords..."
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Multiple values allowed (separated by comma)
              </span>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Key Features</label>
              <input
                type="text"
                name="keyFeatures"
                value={formData.keyFeatures || 'Premium Quality, Traditional Ethnic Design, Adjustable Length, Skin Friendly'}
                onChange={handleChange}
                className="input-field"
                placeholder="Comma separated key bullet features..."
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                Multiple values allowed (separated by comma)
              </span>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Detailed Description</label>
              <textarea
                name="description"
                value={formData.description || 'Exquisite Gold Plated Traditional Jewellery Set for Women. Features intricate craftsmanship, adorned with lustrous beads and artificial stones. Perfect for weddings, festive occasions, and traditional celebrations.'}
                onChange={handleChange}
                className="input-field"
                rows={4}
                placeholder="Enter rich product description (up to 5000 characters)..."
                style={{ resize: 'vertical' }}
              />
            </div>

          </div>
        </div>

      </div>

      {/* PHOTO PREVIEW MODAL */}
      {previewImage && (
        <div className="modal-backdrop" style={{ zIndex: 1300 }} onClick={() => setPreviewImage(null)}>
          <div className="modal-content" style={{ maxWidth: '650px', padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={20} color="var(--primary)" /> Photo Preview
              </h3>
              <button
                onClick={() => setPreviewImage(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '420px', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <img
                src={`${BACKEND_URL}/single_catalog_images/${encodeURIComponent(previewImage.name)}`}
                alt={previewImage.name}
                style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Filename:</span>
                <div style={{ fontWeight: '600', wordBreak: 'break-all' }}>{previewImage.name}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Role:</span>
                <div style={{ fontWeight: '600', color: getPhotoRoleBadge(previewImage.name).color }}>
                  {getPhotoRoleBadge(previewImage.name).text}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>File Size:</span>
                <div style={{ fontWeight: '600' }}>
                  {previewImage.size ? `${(previewImage.size / 1024).toFixed(1)} KB` : 'N/A'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Last Modified:</span>
                <div style={{ fontWeight: '600' }}>
                  {previewImage.mtime ? new Date(previewImage.mtime).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREENSHOT PREVIEW MODAL */}
      {previewScreenshot && (
        <div className="modal-backdrop" style={{ zIndex: 1400 }} onClick={() => setPreviewScreenshot(null)}>
          <div className="modal-content" style={{ maxWidth: '850px', padding: '1.5rem', background: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {previewScreenshot.status === 'SUCCESS' ? (
                  <CheckCircle2 size={22} color="var(--success)" />
                ) : (
                  <AlertCircle size={22} color="var(--danger)" />
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800' }}>
                    Flipkart Browser Screenshot — SKU: {previewScreenshot.sku}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: previewScreenshot.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)' }}>
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

            <div style={{ width: '100%', maxHeight: '550px', background: '#000', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
              <img
                src={`${BACKEND_URL}${previewScreenshot.screenshot}`}
                alt={`Screenshot for ${previewScreenshot.sku}`}
                style={{ width: '100%', height: 'auto', maxHeight: '550px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Recorded: {previewScreenshot.timestamp ? new Date(previewScreenshot.timestamp).toLocaleString() : ''}</span>
              <a
                href={`${BACKEND_URL}${previewScreenshot.screenshot}`}
                target="_blank"
                rel="noreferrer"
                className="btn glass-panel"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ExternalLink size={13} /> Open Original Full-Size
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Live Headless Browser Automation Viewport (Matching Meesho live feed) */}
      <LiveBrowserFeed socket={socket} />
    </div>
  );
}

export default SingleCatalogSetup;
