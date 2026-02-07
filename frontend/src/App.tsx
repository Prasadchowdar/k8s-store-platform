import { useState, useEffect, useCallback, useRef } from 'react';
import { Store, ProvisioningEvent, CreateStoreRequest } from './types/store';
import * as storesApi from './api/stores';
import type { StoreHealth, AuditEntry } from './api/stores';

// ── Theme ──────────────────────────────────────────────
type ThemeName = 'light' | 'dark';

const themes = {
  light: {
    bg: '#f0f2f5',
    surface: '#ffffff',
    surfaceHover: '#f9fafb',
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    border: '#e5e7eb',
    headerBg: 'linear-gradient(135deg, #326CE5 0%, #1d4ed8 100%)',
    inputBg: '#ffffff',
    inputBorder: '#d1d5db',
    modalBg: '#ffffff',
    overlayBg: 'rgba(0,0,0,0.5)',
    cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    cardShadowHover: '0 10px 25px rgba(0,0,0,0.08)',
    credentialBg: '#f3f4f6',
    errorBg: '#fef2f2',
    errorText: '#dc2626',
    errorBorder: '#fecaca',
    deleteBg: '#fef2f2',
    deleteBorder: '#fecaca',
    deleteText: '#dc2626',
    logBg: '#1e1e2e',
    logText: '#a6e3a1',
    tabActive: '#326CE5',
    tabInactive: 'transparent',
    successBg: '#ecfdf5',
    successText: '#059669',
    successBorder: '#a7f3d0',
    warnBg: '#fffbeb',
    warnText: '#d97706',
    warnBorder: '#fde68a',
  },
  dark: {
    bg: '#0f1117',
    surface: '#1a1d27',
    surfaceHover: '#22252f',
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    border: '#2d3140',
    headerBg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    inputBg: '#22252f',
    inputBorder: '#374151',
    modalBg: '#1a1d27',
    overlayBg: 'rgba(0,0,0,0.7)',
    cardShadow: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
    cardShadowHover: '0 10px 25px rgba(0,0,0,0.4)',
    credentialBg: '#22252f',
    errorBg: '#1c1012',
    errorText: '#f87171',
    errorBorder: '#7f1d1d',
    deleteBg: '#1c1012',
    deleteBorder: '#7f1d1d',
    deleteText: '#f87171',
    logBg: '#0d1117',
    logText: '#7ee787',
    tabActive: '#326CE5',
    tabInactive: 'transparent',
    successBg: '#0d1f17',
    successText: '#34d399',
    successBorder: '#065f46',
    warnBg: '#1f1a0d',
    warnText: '#fbbf24',
    warnBorder: '#92400e',
  },
};

type ThemeColors = typeof themes.dark;

const STATUS_CONFIG: Record<string, { color: string; icon: string; glow: string }> = {
  Provisioning: { color: '#f59e0b', icon: '\u29D7', glow: 'rgba(245,158,11,0.2)' },
  Ready: { color: '#10b981', icon: '\u2713', glow: 'rgba(16,185,129,0.2)' },
  Failed: { color: '#ef4444', icon: '\u2717', glow: 'rgba(239,68,68,0.2)' },
  Deleting: { color: '#8b5cf6', icon: '\u29D7', glow: 'rgba(139,92,246,0.2)' },
};

const STEP_LABELS: Record<string, string> = {
  create_namespace: 'Namespace',
  create_secrets: 'Secrets',
  create_quota: 'Quota',
  deploy_mysql: 'MySQL',
  wait_mysql: 'MySQL Ready',
  deploy_wordpress: 'WordPress',
  wait_wordpress: 'WordPress Ready',
  setup_woocommerce: 'WooCommerce',
  create_ingress: 'Ingress',
  create_networkpolicy: 'Network Policy',
  ready: 'Complete',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const exact = `${day}, ${time}`;

  if (diff < 60000) return `${exact} (Just now)`;
  if (diff < 3600000) return `${exact} (${Math.floor(diff / 60000)}m ago)`;
  if (diff < 86400000) return `${exact} (${Math.floor(diff / 3600000)}h ago)`;
  if (diff < 172800000) return `${exact} (Yesterday)`;
  return exact;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'In progress...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── CSS Keyframes (injected once) ──────────────────────
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { margin: 0; }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(30px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
  @keyframes progressFlow { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
  .store-card:hover { transform: translateY(-2px) !important; }
  .btn-hover:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .link-hover:hover { text-decoration: underline !important; }
  input:focus { border-color: #326CE5 !important; box-shadow: 0 0 0 3px rgba(50,108,229,0.15) !important; }
  .log-container::-webkit-scrollbar { width: 6px; }
  .log-container::-webkit-scrollbar-track { background: transparent; }
  .log-container::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
  .tab-btn { transition: all 0.2s !important; }
  .tab-btn:hover { background: rgba(50,108,229,0.1) !important; }
`;
if (!document.head.querySelector('[data-app-styles]')) {
  styleSheet.setAttribute('data-app-styles', 'true');
  document.head.appendChild(styleSheet);
}

// ── Main App ───────────────────────────────────────────
function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [queueSize, setQueueSize] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [events, setEvents] = useState<ProvisioningEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() =>
    (localStorage.getItem('theme') as ThemeName) || 'dark'
  );

  const t = themes[theme];
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  const fetchStores = useCallback(async () => {
    try {
      const data = await storesApi.getStores();
      setStores(data.stores);
      setQueueSize(data.queueSize);
    } catch {
      // silent retry
    }
  }, []);

  useEffect(() => {
    fetchStores();
    const interval = setInterval(fetchStores, 5000);
    return () => clearInterval(interval);
  }, [fetchStores]);

  const fetchEvents = useCallback(async (storeId: string) => {
    try {
      const evts = await storesApi.getStoreEvents(storeId);
      setEvents(evts);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (selectedStore) {
      fetchEvents(selectedStore);
      const interval = setInterval(() => fetchEvents(selectedStore), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedStore, fetchEvents]);

  const handleCreate = async (req: CreateStoreRequest) => {
    setLoading(true);
    setError(null);
    try {
      await storesApi.createStore(req);
      setShowCreate(false);
      await fetchStores();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create store');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this store? All data will be lost.')) return;
    try {
      await storesApi.deleteStore(id);
      setSelectedStore(null);
      await fetchStores();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete store');
    }
  };

  const readyCount = stores.filter(s => s.status === 'Ready').length;
  const provisioningCount = stores.filter(s => s.status === 'Provisioning').length;

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
      minHeight: '100vh',
      backgroundColor: t.bg,
      color: t.text,
      transition: 'background-color 0.3s, color 0.3s',
    }}>
      {/* ─── Header ─── */}
      <header style={{
        background: t.headerBg,
        color: 'white',
        position: 'sticky' as const,
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>
              {'\u2638'}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
                Store Platform
              </h1>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                Kubernetes-native e-commerce provisioning
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginRight: 8 }}>
              <span style={{
                background: 'rgba(255,255,255,0.12)', padding: '5px 12px',
                borderRadius: 20, fontSize: 12, fontWeight: 500,
              }}>
                {readyCount} Active
              </span>
              {provisioningCount > 0 && (
                <span style={{
                  background: 'rgba(245,158,11,0.25)', padding: '5px 12px',
                  borderRadius: 20, fontSize: 12, fontWeight: 500,
                  animation: 'pulse 2s infinite',
                }}>
                  {provisioningCount} Provisioning
                </span>
              )}
              {queueSize > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,0.12)', padding: '5px 12px',
                  borderRadius: 20, fontSize: 12,
                }}>
                  {queueSize} Queued
                </span>
              )}
            </div>

            <button
              className="btn-hover"
              onClick={() => setShowAuditLog(!showAuditLog)}
              style={{
                padding: '8px 14px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: showAuditLog ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                color: 'white', fontSize: 12, fontWeight: 500,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s',
              }}
              title="View platform audit log"
            >
              {'\u2630'} Audit Log
            </button>

            <button
              className="btn-hover"
              onClick={toggleTheme}
              style={{
                width: 36, height: 36, borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            >
              {isDark ? '\u2600' : '\u263E'}
            </button>

            <button
              className="btn-hover"
              onClick={() => setShowCreate(true)}
              style={{
                background: 'white', color: '#1e40af',
                border: 'none', padding: '10px 22px',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              Create Store
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px' }}>
        {stores.length === 0 ? (
          <div style={{
            textAlign: 'center' as const,
            padding: '80px 40px',
            background: t.surface,
            borderRadius: 16,
            border: `1px solid ${t.border}`,
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>{'\u26F5'}</div>
            <h2 style={{ color: t.textSecondary, fontWeight: 600, marginBottom: 8 }}>
              No stores yet
            </h2>
            <p style={{ color: t.textMuted, marginBottom: 24 }}>
              Create your first WooCommerce store in seconds
            </p>
            <button
              className="btn-hover"
              onClick={() => setShowCreate(true)}
              style={{
                background: '#326CE5', color: 'white',
                border: 'none', padding: '12px 28px',
                borderRadius: 10, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              + Create Your First Store
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
            gap: 20,
          }}>
            {stores.map((store, i) => (
              <StoreCard
                key={store.id}
                store={store}
                t={t}
                isDark={isDark}
                index={i}
                isSelected={selectedStore === store.id}
                events={selectedStore === store.id ? events : []}
                onSelect={() => setSelectedStore(store.id === selectedStore ? null : store.id)}
                onDelete={() => handleDelete(store.id)}
                onRefresh={fetchStores}
              />
            ))}
          </div>
        )}

        {showAuditLog && <AuditLogPanel t={t} isDark={isDark} />}
      </main>

      {showCreate && (
        <CreateStoreModal
          t={t}
          isDark={isDark}
          onClose={() => { setShowCreate(false); setError(null); }}
          onCreate={handleCreate}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

// ── Store Card ─────────────────────────────────────────
type TabType = 'overview' | 'health' | 'logs' | 'actions';

function StoreCard({
  store, t, isDark, index, isSelected, events, onSelect, onDelete, onRefresh,
}: {
  store: Store;
  t: ThemeColors;
  isDark: boolean;
  index: number;
  isSelected: boolean;
  events: ProvisioningEvent[];
  onSelect: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const sc = STATUS_CONFIG[store.status] || STATUS_CONFIG.Failed;
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  return (
    <div
      className="store-card"
      style={{
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${isSelected ? '#326CE5' : t.border}`,
        overflow: 'hidden',
        transition: 'all 0.25s ease',
        boxShadow: isSelected ? `0 0 0 2px #326CE5, ${t.cardShadowHover}` : t.cardShadow,
        animation: `fadeIn 0.4s ease ${index * 0.05}s both`,
      }}
    >
      {/* Status bar at top */}
      {store.status === 'Provisioning' && (
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${sc.color}, transparent, ${sc.color})`,
          backgroundSize: '200% 100%',
          animation: 'progressFlow 1.5s linear infinite',
        }} />
      )}

      {/* Clickable header */}
      <div style={{ padding: '18px 20px', cursor: 'pointer' }} onClick={onSelect}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}>
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: 17, fontWeight: 650,
              color: t.text, marginBottom: 4,
              letterSpacing: -0.3,
            }}>
              {store.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: isDark ? 'rgba(50,108,229,0.15)' : '#eff6ff',
                color: '#326CE5',
                padding: '2px 8px', borderRadius: 5,
                fontSize: 11, fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: 0.5,
              }}>
                {store.plan}
              </span>
              <span style={{ color: t.textMuted, fontSize: 12 }}>
                {formatDate(store.createdAt)}
              </span>
              {store.provisionedAt && (
                <span style={{ color: t.textMuted, fontSize: 11 }}>
                  ({formatDuration(store.createdAt, store.provisionedAt)})
                </span>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: sc.glow,
            padding: '5px 12px', borderRadius: 20,
          }}>
            <span style={{
              display: 'inline-block', fontSize: 12,
              ...(store.status === 'Provisioning' || store.status === 'Deleting'
                ? { animation: 'spin 1.5s linear infinite' } : {}),
            }}>
              {sc.icon}
            </span>
            <span style={{ color: sc.color, fontSize: 12, fontWeight: 600 }}>
              {store.status}
            </span>
          </div>
        </div>

        {/* URLs */}
        {store.url && (
          <div style={{
            background: t.surfaceHover,
            borderRadius: 8, padding: '10px 12px',
            marginBottom: 10,
          }}>
            <div style={{ marginBottom: 6 }}>
              <a className="link-hover" href={store.url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#326CE5', textDecoration: 'none', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                {'\u2197'} {store.url}
              </a>
            </div>
            {store.adminUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                <a className="link-hover" href={store.adminUrl} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: '#8b5cf6', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
                  {'\u2699'} Admin Panel
                </a>
                {store.adminPassword && (
                  <code style={{
                    fontSize: 11, color: t.textSecondary,
                    background: t.credentialBg,
                    padding: '2px 8px', borderRadius: 4,
                    border: `1px solid ${t.border}`,
                  }}>
                    admin / {store.adminPassword}
                  </code>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {store.errorMessage && (
          <div style={{
            background: t.errorBg,
            border: `1px solid ${t.errorBorder}`,
            color: t.errorText,
            padding: '8px 12px', borderRadius: 8,
            fontSize: 12, marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{'\u26A0'}</span> {store.errorMessage}
          </div>
        )}
      </div>

      {/* ─── Tabs ─── */}
      {isSelected && (
        <div style={{ borderTop: `1px solid ${t.border}`, animation: 'slideUp 0.3s ease' }}>
          <div style={{
            display: 'flex', gap: 0,
            borderBottom: `1px solid ${t.border}`,
            padding: '0 12px',
          }}>
            {([
              { key: 'overview', label: 'Timeline' },
              { key: 'health', label: 'Health' },
              { key: 'logs', label: 'Logs' },
              { key: 'actions', label: 'Actions' },
            ] as { key: TabType; label: string }[]).map(tab => (
              <button
                key={tab.key}
                className="tab-btn"
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                style={{
                  padding: '10px 16px',
                  fontSize: 12, fontWeight: 600,
                  color: activeTab === tab.key ? '#326CE5' : t.textMuted,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.key ? '#326CE5' : 'transparent'}`,
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.5,
                }}
              >
                {tab.label}
              </button>
            ))}

            {/* Delete button in tab bar */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <button
                className="btn-hover"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                style={{
                  background: t.deleteBg,
                  color: t.deleteText,
                  border: `1px solid ${t.deleteBorder}`,
                  padding: '4px 12px', borderRadius: 6,
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {'\u2716'} Delete
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '16px 20px' }}>
            {activeTab === 'overview' && <TimelineTab events={events} t={t} />}
            {activeTab === 'health' && <HealthTab store={store} t={t} isDark={isDark} />}
            {activeTab === 'logs' && <LogsTab store={store} t={t} />}
            {activeTab === 'actions' && <ActionsTab store={store} t={t} onRefresh={onRefresh} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Tab ────────────────────────────────────────
function TimelineTab({ events, t }: { events: ProvisioningEvent[]; t: ThemeColors }) {
  if (events.length === 0) {
    return <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' as const, padding: 16 }}>No events yet</p>;
  }

  return (
    <div style={{ position: 'relative' as const }}>
      <div style={{
        position: 'absolute' as const,
        left: 7, top: 4, bottom: 4,
        width: 2, background: t.border,
        borderRadius: 1,
      }} />
      {deduplicateEvents(events).map((evt, i) => (
        <div key={evt.id} style={{
          display: 'flex', alignItems: 'flex-start',
          gap: 12, padding: '6px 0',
          position: 'relative' as const,
          animation: `fadeIn 0.3s ease ${i * 0.03}s both`,
        }}>
          <div style={{
            width: 16, height: 16,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'white',
            background: evt.status === 'completed' ? '#10b981' : evt.status === 'failed' ? '#ef4444' : '#f59e0b',
            boxShadow: `0 0 8px ${evt.status === 'completed' ? 'rgba(16,185,129,0.3)' : evt.status === 'failed' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            ...(evt.status === 'started' ? { animation: 'pulse 1.5s infinite' } : {}),
            zIndex: 1,
          }}>
            {evt.status === 'completed' ? '\u2713' : evt.status === 'failed' ? '\u2717' : '\u2022'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: t.text }}>
              {STEP_LABELS[evt.step] || evt.step}
            </span>
            <p style={{
              margin: '2px 0 0', fontSize: 11, color: t.textMuted,
              overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const,
            }}>
              {evt.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function deduplicateEvents(events: ProvisioningEvent[]): ProvisioningEvent[] {
  const map = new Map<string, ProvisioningEvent>();
  for (const evt of events) {
    const existing = map.get(evt.step);
    if (!existing || (evt.status === 'completed' || evt.status === 'failed')) {
      map.set(evt.step, evt);
    }
  }
  return Array.from(map.values());
}

// ── Health Tab ──────────────────────────────────────────
function HealthTab({ store, t, isDark }: { store: Store; t: ThemeColors; isDark: boolean }) {
  const [health, setHealth] = useState<StoreHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const data = await storesApi.getStoreHealth(store.id);
        if (mounted) setHealth(data);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [store.id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center' as const, padding: 24 }}>
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 20 }}>{'\u29D7'}</span>
        <p style={{ color: t.textMuted, fontSize: 12, marginTop: 8 }}>Loading health data...</p>
      </div>
    );
  }

  if (!health) {
    return <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' as const }}>Could not fetch health data</p>;
  }

  const metricBox = (label: string, value: string, color: string) => (
    <div style={{
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: 8, padding: '10px 14px',
      border: `1px solid ${t.border}`,
      flex: '1 1 0',
      minWidth: 90,
    }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Namespace */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Namespace:</span>
        <code style={{
          fontSize: 12, padding: '2px 8px', borderRadius: 4,
          background: t.credentialBg, border: `1px solid ${t.border}`, color: t.text,
        }}>{health.namespace}</code>
      </div>

      {/* Pod cards */}
      {health.pods.map(pod => (
        <div key={pod.name} style={{
          background: t.surfaceHover,
          borderRadius: 10, padding: 14,
          marginBottom: 12,
          border: `1px solid ${t.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: pod.ready ? '#10b981' : '#ef4444',
                boxShadow: `0 0 6px ${pod.ready ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text, textTransform: 'capitalize' as const }}>
                {pod.app}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: pod.phase === 'Running' ? (isDark ? 'rgba(16,185,129,0.15)' : '#ecfdf5') : t.errorBg,
                color: pod.phase === 'Running' ? '#10b981' : t.errorText,
                fontWeight: 600,
              }}>
                {pod.phase}
              </span>
            </div>
            <span style={{ fontSize: 11, color: t.textMuted }}>{pod.image.split('/').pop()}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {metricBox('Uptime', formatUptime(pod.uptime), '#326CE5')}
            {metricBox('Restarts', String(pod.restartCount), pod.restartCount > 0 ? '#f59e0b' : '#10b981')}
            {metricBox('CPU', `${pod.resources.cpuRequest} / ${pod.resources.cpuLimit}`, t.text)}
            {metricBox('Memory', `${pod.resources.memRequest} / ${pod.resources.memLimit}`, t.text)}
          </div>
        </div>
      ))}

      {/* PVC info */}
      {health.pvcs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h5 style={{
            fontSize: 11, fontWeight: 600, color: t.textMuted,
            textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8,
          }}>Storage Volumes</h5>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {health.pvcs.map(pvc => (
              <div key={pvc.name} style={{
                background: t.surfaceHover,
                borderRadius: 8, padding: '8px 12px',
                border: `1px solid ${t.border}`,
                flex: '1 1 0', minWidth: 140,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>{pvc.name}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  {pvc.capacity} | {pvc.status} | {pvc.storageClass}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quota */}
      {health.quota && (
        <div style={{ marginTop: 12 }}>
          <h5 style={{
            fontSize: 11, fontWeight: 600, color: t.textMuted,
            textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8,
          }}>Resource Quota</h5>
          <div style={{
            background: t.surfaceHover,
            borderRadius: 8, padding: 10,
            border: `1px solid ${t.border}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
          }}>
            {Object.entries(health.quota.hard).map(([key, limit]) => (
              <div key={key} style={{ fontSize: 11 }}>
                <span style={{ color: t.textMuted }}>{key.replace('requests.', '').replace('limits.', 'lim.')}:</span>{' '}
                <span style={{ color: t.text, fontWeight: 600 }}>{health.quota!.used[key] || '0'}</span>
                <span style={{ color: t.textMuted }}> / {limit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Logs Tab ────────────────────────────────────────────
function LogsTab({ store, t }: { store: Store; t: ThemeColors }) {
  const [logPod, setLogPod] = useState<'wordpress' | 'mysql'>('wordpress');
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [tailLines, setTailLines] = useState(80);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storesApi.getStoreLogs(store.id, logPod, tailLines);
      setLogs(data.logs);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);
    } catch {
      setLogs('Failed to fetch logs. Pod may not be running.');
    } finally {
      setLoading(false);
    }
  }, [store.id, logPod, tailLines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, flexWrap: 'wrap' as const,
      }}>
        {(['wordpress', 'mysql'] as const).map(pod => (
          <button key={pod}
            onClick={(e) => { e.stopPropagation(); setLogPod(pod); }}
            style={{
              padding: '5px 14px', borderRadius: 6,
              border: `1px solid ${logPod === pod ? '#326CE5' : t.border}`,
              background: logPod === pod ? 'rgba(50,108,229,0.12)' : 'transparent',
              color: logPod === pod ? '#326CE5' : t.textSecondary,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              textTransform: 'capitalize' as const,
            }}
          >
            {pod}
          </button>
        ))}

        <select
          value={tailLines}
          onChange={(e) => { e.stopPropagation(); setTailLines(Number(e.target.value)); }}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '5px 8px', borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.inputBg, color: t.text,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          <option value={50}>50 lines</option>
          <option value={80}>80 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
        </select>

        <button
          onClick={(e) => { e.stopPropagation(); fetchLogs(); }}
          className="btn-hover"
          style={{
            padding: '5px 12px', borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: 'transparent', color: t.textSecondary,
            fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {loading ? (
            <span style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>{'\u21BB'}</span>
          ) : '\u21BB'} Refresh
        </button>

        <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 'auto' }}>Auto-refresh 5s</span>
      </div>

      {/* Log viewer */}
      <pre ref={logRef} className="log-container" style={{
        background: t.logBg,
        color: t.logText,
        borderRadius: 10,
        padding: 14,
        fontSize: 11,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        lineHeight: 1.5,
        maxHeight: 350,
        overflow: 'auto',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-all' as const,
        border: `1px solid ${t.border}`,
      }}>
        {logs || (loading ? 'Loading...' : 'No logs available')}
      </pre>
    </div>
  );
}

// ── Actions Tab ─────────────────────────────────────────
function ActionsTab({ store, t, onRefresh }: { store: Store; t: ThemeColors; onRefresh: () => void }) {
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const runAction = async (label: string, fn: () => Promise<string>) => {
    setLoading(label);
    setActionResult(null);
    try {
      const msg = await fn();
      setActionResult({ type: 'success', message: msg });
      onRefresh();
    } catch (err: any) {
      setActionResult({ type: 'error', message: err.response?.data?.error || err.message || 'Action failed' });
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    {
      label: 'Restart All Pods',
      desc: 'Rolling restart of WordPress and MySQL pods',
      icon: '\u21BB',
      color: '#326CE5',
      disabled: store.status !== 'Ready',
      fn: async () => {
        const res = await storesApi.restartStore(store.id, 'all');
        return `Restarted: ${res.restarted.join(', ')}`;
      },
    },
    {
      label: 'Restart WordPress',
      desc: 'Only restart the WordPress pod',
      icon: '\u21BB',
      color: '#8b5cf6',
      disabled: store.status !== 'Ready',
      fn: async () => {
        const res = await storesApi.restartStore(store.id, 'wordpress');
        return `Restarted: ${res.restarted.join(', ')}`;
      },
    },
    {
      label: 'Restart MySQL',
      desc: 'Only restart the MySQL pod',
      icon: '\u21BB',
      color: '#f59e0b',
      disabled: store.status !== 'Ready',
      fn: async () => {
        const res = await storesApi.restartStore(store.id, 'mysql');
        return `Restarted: ${res.restarted.join(', ')}`;
      },
    },
    {
      label: 'Reset Admin Password',
      desc: 'Generate a new random WP admin password',
      icon: '\u26BF',
      color: '#ef4444',
      disabled: store.status !== 'Ready',
      fn: async () => {
        const res = await storesApi.resetPassword(store.id);
        return `New password: ${res.newPassword}`;
      },
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {store.status !== 'Ready' && (
        <div style={{
          background: t.warnBg, border: `1px solid ${t.warnBorder}`,
          color: t.warnText, padding: '8px 12px', borderRadius: 8,
          fontSize: 12, marginBottom: 12,
        }}>
          Actions are only available for stores in Ready state.
        </div>
      )}

      {/* Action result */}
      {actionResult && (
        <div style={{
          background: actionResult.type === 'success' ? t.successBg : t.errorBg,
          border: `1px solid ${actionResult.type === 'success' ? t.successBorder : t.errorBorder}`,
          color: actionResult.type === 'success' ? t.successText : t.errorText,
          padding: '10px 14px', borderRadius: 8,
          fontSize: 12, marginBottom: 12,
          animation: 'fadeIn 0.2s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{actionResult.message}</span>
          <button onClick={(e) => { e.stopPropagation(); setActionResult(null); }}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}>
            {'\u2715'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {actions.map(action => (
          <button
            key={action.label}
            className="btn-hover"
            disabled={action.disabled || loading !== null}
            onClick={(e) => {
              e.stopPropagation();
              if (!action.disabled) runAction(action.label, action.fn);
            }}
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surfaceHover,
              cursor: action.disabled || loading !== null ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.4 : 1,
              textAlign: 'left' as const,
              transition: 'all 0.2s',
              display: 'flex', flexDirection: 'column' as const, gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading === action.label ? (
                <span style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite', color: action.color, fontSize: 16 }}>{'\u29D7'}</span>
              ) : (
                <span style={{ color: action.color, fontSize: 16 }}>{action.icon}</span>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{action.label}</span>
            </div>
            <span style={{ fontSize: 11, color: t.textMuted }}>{action.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Audit Log Panel ─────────────────────────────────────
function AuditLogPanel({ t, isDark }: { t: ThemeColors; isDark: boolean }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const data = await storesApi.getAuditLog(limit);
        if (mounted) setEntries(data);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [limit]);

  const actionColors: Record<string, string> = {
    'store.create': '#10b981',
    'store.delete': '#ef4444',
    'store.restart': '#326CE5',
    'store.reset_password': '#f59e0b',
    'store.provision_complete': '#10b981',
    'store.provision_failed': '#ef4444',
  };

  const actionLabels: Record<string, string> = {
    'store.create': 'Created',
    'store.delete': 'Deleted',
    'store.restart': 'Restarted',
    'store.reset_password': 'Password Reset',
    'store.provision_complete': 'Provisioned',
    'store.provision_failed': 'Failed',
  };

  return (
    <div style={{
      marginTop: 24,
      background: t.surface,
      borderRadius: 14,
      border: `1px solid ${t.border}`,
      overflow: 'hidden',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 650, color: t.text, marginBottom: 2 }}>
            Audit Log
          </h3>
          <p style={{ fontSize: 12, color: t.textMuted }}>
            Platform-wide activity trail — who did what, when
          </p>
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          title="Number of entries"
          style={{
            padding: '5px 8px', borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.inputBg, color: t.text,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          <option value={25}>25 entries</option>
          <option value={50}>50 entries</option>
          <option value={100}>100 entries</option>
        </select>
      </div>

      <div style={{ padding: '12px 20px', maxHeight: 400, overflow: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: 24 }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 20 }}>{'\u29D7'}</span>
            <p style={{ color: t.textMuted, fontSize: 12, marginTop: 8 }}>Loading audit log...</p>
          </div>
        ) : entries.length === 0 ? (
          <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' as const, padding: 24 }}>
            No audit entries yet
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${t.border}` }}>
                {['Time', 'Action', 'Resource', 'Details', 'IP'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left' as const, padding: '8px 10px',
                    color: t.textMuted, fontWeight: 600,
                    textTransform: 'uppercase' as const, letterSpacing: 0.5,
                    fontSize: 10,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const color = actionColors[entry.action] || t.textSecondary;
                return (
                  <tr key={entry.id} style={{
                    borderBottom: `1px solid ${t.border}`,
                    animation: `fadeIn 0.2s ease ${i * 0.02}s both`,
                  }}>
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' as const, color: t.textMuted }}>
                      {formatDate(entry.createdAt)}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{
                        background: `${color}18`,
                        color: color,
                        padding: '3px 8px', borderRadius: 5,
                        fontWeight: 600, fontSize: 11,
                      }}>
                        {actionLabels[entry.action] || entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px', fontWeight: 500, color: t.text }}>
                      {entry.resourceName || entry.resourceId || '-'}
                    </td>
                    <td style={{ padding: '10px 10px', color: t.textSecondary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                      {entry.details || '-'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <code style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 3,
                        background: t.credentialBg, color: t.textMuted,
                        border: `1px solid ${t.border}`,
                      }}>
                        {entry.ipAddress || '-'}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Create Modal ───────────────────────────────────────
function CreateStoreModal({
  t, isDark, onClose, onCreate, loading, error,
}: {
  t: ThemeColors;
  isDark: boolean;
  onClose: () => void;
  onCreate: (req: CreateStoreRequest) => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'woocommerce' | 'medusa'>('woocommerce');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ name, adminEmail: email, plan });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed' as const,
        top: 0, left: 0, right: 0, bottom: 0,
        background: t.overlayBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.modalBg,
          borderRadius: 20,
          padding: 32,
          width: 480, maxWidth: '90vw',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          border: `1px solid ${t.border}`,
          animation: 'scaleIn 0.25s ease',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>
            Create New Store
          </h2>
          <p style={{ fontSize: 14, color: t.textSecondary }}>
            Launch a fully configured WooCommerce store in minutes
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', marginBottom: 6,
              fontSize: 13, fontWeight: 600, color: t.textSecondary,
              textTransform: 'uppercase' as const, letterSpacing: 0.5,
            }}>Store Name</label>
            <input type="text" placeholder="My Awesome Store"
              value={name} onChange={(e) => setName(e.target.value)}
              required minLength={2} maxLength={50}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                border: `1.5px solid ${t.inputBorder}`,
                background: t.inputBg, color: t.text,
                fontSize: 15, outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', marginBottom: 6,
              fontSize: 13, fontWeight: 600, color: t.textSecondary,
              textTransform: 'uppercase' as const, letterSpacing: 0.5,
            }}>Admin Email</label>
            <input type="email" placeholder="admin@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                border: `1.5px solid ${t.inputBorder}`,
                background: t.inputBg, color: t.text,
                fontSize: 15, outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{
              display: 'block', marginBottom: 8,
              fontSize: 13, fontWeight: 600, color: t.textSecondary,
              textTransform: 'uppercase' as const, letterSpacing: 0.5,
            }}>Platform</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(['woocommerce', 'medusa'] as const).map((p) => (
                <button key={p} type="button"
                  onClick={() => p === 'woocommerce' && setPlan(p)}
                  style={{
                    padding: '14px 16px', borderRadius: 12,
                    border: `2px solid ${plan === p ? '#326CE5' : t.border}`,
                    background: plan === p ? (isDark ? 'rgba(50,108,229,0.12)' : '#eff6ff') : t.surface,
                    cursor: p === 'woocommerce' ? 'pointer' : 'not-allowed',
                    textAlign: 'left' as const,
                    transition: 'all 0.2s',
                    opacity: p === 'medusa' ? 0.4 : 1,
                  }}
                >
                  <strong style={{ color: t.text, fontSize: 14 }}>
                    {p === 'woocommerce' ? 'WooCommerce' : 'MedusaJS'}
                  </strong>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: t.textMuted }}>
                    {p === 'woocommerce' ? 'WordPress + WooCommerce' : 'Coming Soon'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              background: t.errorBg, border: `1px solid ${t.errorBorder}`,
              color: t.errorText, padding: '10px 14px', borderRadius: 10,
              fontSize: 13, marginBottom: 18,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-hover" onClick={onClose}
              style={{
                padding: '11px 22px', borderRadius: 10,
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s',
              }}>Cancel</button>
            <button type="submit" className="btn-hover" disabled={loading}
              style={{
                padding: '11px 28px', borderRadius: 10, border: 'none',
                background: loading ? '#6b7280' : '#326CE5',
                color: 'white', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              {loading && (
                <span style={{
                  display: 'inline-block', width: 14, height: 14,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              )}
              {loading ? 'Creating...' : 'Create Store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
