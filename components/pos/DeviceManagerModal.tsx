
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PosDevice } from '../../types';
import { QRCodeCanvas } from 'qrcode.react';

interface DeviceManagerModalProps {
    onClose: () => void;
}

export const DeviceManagerModal: React.FC<DeviceManagerModalProps> = ({ onClose }) => {
    const [devices, setDevices] = useState<PosDevice[]>([]);
    
    // State for the base URL (editable)
    // FIX: Initialize with full current path (minus query params) to support subdirectories/cloud environments
    const [baseUrl, setBaseUrl] = useState(() => {
        return window.location.href.split('?')[0].split('#')[0];
    });

    const [scannerUrl, setScannerUrl] = useState('');
    const [showCopied, setShowCopied] = useState(false);

    useEffect(() => {
        // Construct the full URL preserving the current path
        // This ensures that if the app is at /app/v1/, the scanner URL is /app/v1/?mode=scanner
        try {
            // Determine separator based on if user manually added query params
            const separator = baseUrl.includes('?') ? '&' : '?';
            setScannerUrl(`${baseUrl}${separator}mode=scanner`);
        } catch (e) {
            setScannerUrl(`${baseUrl}?mode=scanner`);
        }
    }, [baseUrl]);

    useEffect(() => {
        fetchDevices();

        // Subscribe to changes in pos_devices table
        const channel = supabase
            .channel('device_manager')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_devices' }, () => {
                fetchDevices();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchDevices = async () => {
        const { data, error } = await supabase
            .from('pos_devices')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data) setDevices(data as PosDevice[]);
    };

    const updateStatus = async (deviceId: string, status: 'approved' | 'blocked' | 'pending') => {
        await supabase
            .from('pos_devices')
            .update({ status })
            .eq('device_id', deviceId);
    };

    const handleDelete = async (deviceId: string) => {
        if (confirm('¿Eliminar dispositivo? Tendrá que registrarse nuevamente.')) {
            await supabase.from('pos_devices').delete().eq('device_id', deviceId);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(scannerUrl);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2500 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', height: '80vh' }}>
                <div className="modal-header">
                    <h2><i className="fa-solid fa-mobile-screen-button" style={{marginRight: '10px'}}></i> Escáneres Remotos</h2>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>
                
                <div className="modal-body-layout" style={{ gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
                    {/* Left: QR Code to join */}
                    <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-main)' }}>Vincular Nuevo Dispositivo</h3>
                        
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: 'var(--shadow-md)', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                            <QRCodeCanvas value={scannerUrl} size={220} level="H" />
                        </div>
                        
                        <div style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem', background: '#e0f2fe', color:'#0369a1', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #bae6fd' }}>
                            <i className="fa-solid fa-circle-info" style={{marginRight: '5px'}}></i>
                            Usa la <strong>Cámara de tu Celular</strong> y <strong style={{textDecoration: 'underline'}}>abre el enlace web</strong> que aparece.
                        </div>

                        <div style={{width: '100%', position: 'relative'}}>
                            <label style={{display: 'block', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px'}}>
                                URL del Sistema (Editable si es incorrecta)
                            </label>
                            <input 
                                type="text"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.5rem', borderRadius: '0.5rem', 
                                    border: '1px solid #cbd5e1', fontSize: '0.85rem', marginBottom: '0.5rem',
                                    fontFamily: 'monospace'
                                }}
                                placeholder="https://mi-erp.com"
                            />
                            <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem', wordBreak: 'break-all'}}>
                                Generando: {scannerUrl}
                            </div>
                            <button 
                                onClick={handleCopyLink}
                                className="btn btn-secondary"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                <i className={`fa-solid ${showCopied ? 'fa-check' : 'fa-copy'}`}></i>
                                {showCopied ? 'Enlace Copiado' : 'Copiar Enlace para enviar'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Device List */}
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Dispositivos Registrados</h3>
                            <span style={{background: '#e2e8f0', padding: '2px 8px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600}}>{devices.length}</span>
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '5px' }}>
                            {devices.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--input-bg)', borderRadius: '0.5rem', border: '1px dashed var(--border-color)' }}>
                                    <i className="fa-solid fa-mobile-screen" style={{fontSize: '2rem', marginBottom: '1rem', opacity: 0.5}}></i>
                                    <p>No hay dispositivos conectados.</p>
                                    <p style={{fontSize: '0.85rem'}}>Escanea el QR para agregar uno.</p>
                                </div>
                            ) : (
                                devices.map(dev => (
                                    <div key={dev.device_id} style={{ 
                                        padding: '1rem', 
                                        borderRadius: '0.75rem', 
                                        border: '1px solid var(--border-color)',
                                        background: dev.status === 'pending' ? '#fff7ed' : (dev.status === 'blocked' ? '#fef2f2' : 'white'),
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {dev.status === 'approved' ? <i className="fa-solid fa-check-circle" style={{color: '#10b981'}}></i> : 
                                                 dev.status === 'blocked' ? <i className="fa-solid fa-ban" style={{color: '#ef4444'}}></i> :
                                                 <i className="fa-solid fa-circle-notch fa-spin" style={{color: '#f97316'}}></i>}
                                                {dev.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Activo: {new Date(dev.last_active).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(0,0,0,0.05)' }}>
                                            {dev.status === 'pending' && (
                                                <button 
                                                    onClick={() => updateStatus(dev.device_id, 'approved')}
                                                    className="btn btn-primary btn-sm"
                                                    style={{ background: '#10b981', borderColor: '#10b981', flex: 1 }}
                                                >
                                                    <i className="fa-solid fa-check"></i> Aprobar
                                                </button>
                                            )}
                                            
                                            {dev.status === 'approved' ? (
                                                <button 
                                                    onClick={() => updateStatus(dev.device_id, 'blocked')}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ color: '#d97706', flex: 1 }}
                                                >
                                                    <i className="fa-solid fa-ban"></i> Bloquear
                                                </button>
                                            ) : dev.status === 'blocked' ? (
                                                 <button 
                                                    onClick={() => updateStatus(dev.device_id, 'approved')}
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ color: '#10b981', flex: 1 }}
                                                >
                                                    <i className="fa-solid fa-check"></i> Desbloquear
                                                </button>
                                            ) : null}

                                            <button 
                                                onClick={() => handleDelete(dev.device_id)}
                                                className="btn btn-secondary btn-sm"
                                                title="Eliminar Dispositivo"
                                                style={{ color: '#ef4444' }}
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
