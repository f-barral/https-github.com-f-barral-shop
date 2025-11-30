
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Html5Qrcode } from 'html5-qrcode';
import { PosDevice } from '../../types';
import { RealtimeChannel } from '@supabase/supabase-js';

export const MobileScannerView: React.FC = () => {
    const [device, setDevice] = useState<PosDevice | null>(null);
    const [registrationName, setRegistrationName] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [status, setStatus] = useState<'init' | 'register' | 'pending' | 'approved' | 'blocked'>('init');
    
    // Scan & Connection state
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [scanStatus, setScanStatus] = useState<'scanning' | 'sending' | 'success'>('scanning');
    const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    
    // Manual Input State
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualCode, setManualCode] = useState('');
    
    // Refs
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const processingRef = useRef<boolean>(false);

    // 1. Init
    useEffect(() => {
        checkIdentity();
        connectToChannel();

        return () => {
            cleanupChannel();
            stopScanner();
        };
    }, []);

    // 2. Subscribe to device status changes
    useEffect(() => {
        if (!device) return;

        const devChannel = supabase
            .channel(`device_${device.device_id}`)
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'pos_devices', filter: `device_id=eq.${device.device_id}` }, 
                (payload) => {
                    const updated = payload.new as PosDevice;
                    setDevice(updated);
                    setStatus(updated.status);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(devChannel); };
    }, [device?.device_id]);

    // 3. Control Scanner based on Status
    useEffect(() => {
        if (status === 'approved') {
            setTimeout(() => startScanner(), 500);
        } else {
            stopScanner();
        }
    }, [status]);

    const cleanupChannel = async () => {
        if (channelRef.current) {
            await supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
    };

    const connectToChannel = async () => {
        setConnectionState('connecting');
        await cleanupChannel();

        console.log("Iniciando canal pos-scans en móvil...");
        const channel = supabase.channel('pos-scans');
        
        channel.subscribe((status) => {
            console.log("Estado canal móvil:", status);
            if (status === 'SUBSCRIBED') {
                setConnectionState('connected');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setConnectionState('disconnected');
            }
        });

        channelRef.current = channel;
    };

    const handleReconnect = () => {
        connectToChannel();
    };

    const checkIdentity = async () => {
        let deviceId = localStorage.getItem('pos_device_id');
        if (!deviceId) {
            setStatus('register');
            return;
        }

        try {
            const { data, error } = await supabase.from('pos_devices').select('*').eq('device_id', deviceId).single();
            if (data) {
                setDevice(data as PosDevice);
                setStatus(data.status);
                if (data.status === 'approved') {
                    await supabase.from('pos_devices').update({ last_active: new Date().toISOString() }).eq('device_id', deviceId);
                }
            } else {
                localStorage.removeItem('pos_device_id');
                setStatus('register');
            }
        } catch (e) {
            console.error("Error checking identity", e);
            setStatus('register');
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!registrationName) return;
        setIsRegistering(true);

        const newId = crypto.randomUUID();
        const newDevice = {
            device_id: newId,
            name: registrationName,
            status: 'pending' as const,
            last_active: new Date().toISOString()
        };

        const { error } = await supabase.from('pos_devices').insert([newDevice]);
        
        if (!error) {
            localStorage.setItem('pos_device_id', newId);
            setDevice(newDevice as any);
            setStatus('pending');
        } else {
            alert("Error al registrar: " + error.message);
        }
        setIsRegistering(false);
    };

    const startScanner = async () => {
        const element = document.getElementById("mobile-reader");
        if (!element) return;
        
        if (scannerRef.current) return; 

        try {
            const html5QrCode = new Html5Qrcode("mobile-reader");
            scannerRef.current = html5QrCode;

            const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                return {
                    width: Math.floor(minEdge * 0.7),
                    height: Math.floor(minEdge * 0.7),
                };
            };

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: qrboxFunction,
                    videoConstraints: {
                        facingMode: "environment",
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 },
                        aspectRatio: window.innerHeight / window.innerWidth
                    }
                },
                (decodedText) => {
                    onScanSuccess(decodedText);
                },
                (errorMessage) => { }
            );
        } catch (err) {
            console.error("Error starting scanner", err);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if(scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (e) { console.error(e); }
            scannerRef.current = null;
        }
    };

    const onScanSuccess = async (decodedText: string) => {
        if (processingRef.current) return;
        processingRef.current = true;
        
        setScanStatus('sending');
        setLastScanned(decodedText);
        setShowManualInput(false);

        if (navigator.vibrate) navigator.vibrate(200);

        try {
            const payload = { code: decodedText, device: device?.name || 'Móvil' };
            
            // Auto-reconnect check
            if (!channelRef.current || connectionState !== 'connected') {
                console.log("No conectado, intentando reconectar antes de enviar...");
                await connectToChannel();
                // Wait briefly for connection
                await new Promise(r => setTimeout(r, 1000));
            }

            if (channelRef.current) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'remote-scan',
                    payload: payload
                });
                setScanStatus('success');
            } else {
                throw new Error("No channel");
            }
            
            setTimeout(() => {
                setScanStatus('scanning');
                setLastScanned(null);
                processingRef.current = false;
            }, 1500);

        } catch (e) {
            console.error("Error sending scan", e);
            setScanStatus('scanning');
            processingRef.current = false;
            // Removed alert, user sees connection status in UI
        }
    };

    const sendTestScan = () => {
        onScanSuccess('CONNECTION_TEST');
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(manualCode) {
            onScanSuccess(manualCode);
            setManualCode('');
        }
    };

    // --- RENDER ---

    if (status === 'register') {
        return (
            <div style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-gradient-blue)', color: 'white' }}>
                <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', color: 'var(--text-main)', textAlign: 'center' }}>
                    <i className="fa-solid fa-mobile-screen" style={{ fontSize: '3rem', color: 'var(--bg-gradient-blue)', marginBottom: '1rem' }}></i>
                    <h2 style={{ marginBottom: '1rem' }}>Conectar Escáner</h2>
                    <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>Ingresa un nombre para identificar este teléfono en la caja.</p>
                    <form onSubmit={handleRegister}>
                        <input 
                            type="text" 
                            placeholder="Ej: Celular de Juan" 
                            value={registrationName}
                            onChange={e => setRegistrationName(e.target.value)}
                            style={{ width: '100%', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '1rem', fontSize: '1rem' }}
                            required
                        />
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} disabled={isRegistering}>
                            {isRegistering ? 'Conectando...' : 'Conectar'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (status === 'pending') {
        return (
            <div style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff7ed', color: '#9a3412', textAlign: 'center' }}>
                <div className="loader" style={{ borderColor: 'rgba(154, 52, 18, 0.2)', borderTopColor: '#9a3412', marginBottom: '2rem' }}></div>
                <h2>Esperando Aprobación</h2>
                <p>Solicita al administrador que apruebe el dispositivo <strong>"{device?.name}"</strong> en la PC.</p>
                <div style={{marginTop: '2rem', fontSize: '0.8rem', opacity: 0.7}}>
                     ID: {device?.device_id.slice(0, 8)}...
                </div>
                <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{marginTop: '2rem'}}>Recargar</button>
            </div>
        );
    }

    if (status === 'blocked') {
        return (
            <div style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#991b1b', textAlign: 'center' }}>
                <i className="fa-solid fa-ban" style={{ fontSize: '4rem', marginBottom: '1rem' }}></i>
                <h2>Dispositivo Bloqueado</h2>
                <p>Este dispositivo no tiene permiso para operar.</p>
            </div>
        );
    }

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'black', position: 'relative' }}>
            <style>{`
                #mobile-reader video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    border-radius: 0 !important;
                }
            `}</style>

            {/* Header */}
            <div style={{ padding: '1rem', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', background: connectionState === 'connected' ? '#10b981' : '#f59e0b', borderRadius: '50%', boxShadow: connectionState === 'connected' ? '0 0 10px #10b981' : 'none' }}></div>
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{device?.name}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.8, color: connectionState === 'connected' ? '#10b981' : '#f59e0b' }}>
                            {connectionState === 'connected' ? 'En Línea' : 'Desconectado'}
                        </span>
                    </div>
                </div>
                <div>
                     {connectionState === 'disconnected' && (
                        <button onClick={handleReconnect} className="btn btn-sm" style={{background: '#f59e0b', color: 'white', border: 'none', fontSize: '0.75rem'}}>
                            Reconectar
                        </button>
                    )}
                </div>
            </div>

            {/* Scanner Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
                <div id="mobile-reader" style={{ width: '100%', height: '100%' }}></div>
                
                {/* Target Overlay */}
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: '70vw', height: '70vw', maxWidth: '300px', maxHeight: '300px',
                    border: '2px solid rgba(255, 255, 255, 0.4)', borderRadius: '20px',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                    pointerEvents: 'none', zIndex: 10
                }}>
                    <div style={{position: 'absolute', top: '-2px', left: '-2px', width: '20px', height: '20px', borderTop: '4px solid #49FFF5', borderLeft: '4px solid #49FFF5', borderRadius: '4px 0 0 0'}}></div>
                    <div style={{position: 'absolute', top: '-2px', right: '-2px', width: '20px', height: '20px', borderTop: '4px solid #49FFF5', borderRight: '4px solid #49FFF5', borderRadius: '0 4px 0 0'}}></div>
                    <div style={{position: 'absolute', bottom: '-2px', left: '-2px', width: '20px', height: '20px', borderBottom: '4px solid #49FFF5', borderLeft: '4px solid #49FFF5', borderRadius: '0 0 0 4px'}}></div>
                    <div style={{position: 'absolute', bottom: '-2px', right: '-2px', width: '20px', height: '20px', borderBottom: '4px solid #49FFF5', borderRight: '4px solid #49FFF5', borderRadius: '0 0 4px 0'}}></div>
                </div>

                {/* Control Buttons */}
                <div style={{
                    position: 'absolute', bottom: '20px', left: '0', right: '0', 
                    display: 'flex', justifyContent: 'center', gap: '1rem',
                    zIndex: 30, pointerEvents: 'auto'
                }}>
                    <button 
                        onClick={() => setShowManualInput(!showManualInput)}
                        style={{
                            background: 'rgba(255,255,255,0.9)', 
                            color: '#0f172a',
                            border: 'none',
                            borderRadius: '99px',
                            height: '48px',
                            padding: '0 1.5rem', 
                            fontSize: '0.9rem', 
                            fontWeight: 600,
                            boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <i className="fa-solid fa-keyboard"></i> Teclado
                    </button>

                    <button 
                        onClick={sendTestScan}
                        style={{
                            background: 'rgba(0,0,0,0.6)', 
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.3)', 
                            borderRadius: '99px',
                            height: '48px',
                            padding: '0 1rem', 
                            fontSize: '0.9rem', 
                            fontWeight: 500,
                            backdropFilter: 'blur(4px)'
                        }}
                    >
                        Test Conexión
                    </button>
                </div>

                {/* Manual Input Overlay */}
                {showManualInput && (
                    <div style={{
                        position: 'absolute', bottom: '90px', left: '20px', right: '20px',
                        background: 'white', borderRadius: '1rem', padding: '1rem',
                        boxShadow: '0 -5px 20px rgba(0,0,0,0.3)', zIndex: 40,
                        animation: 'slideUp 0.2s'
                    }}>
                        <form onSubmit={handleManualSubmit} style={{display: 'flex', gap: '0.5rem'}}>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="Cód. Material / ID"
                                value={manualCode}
                                onChange={e => setManualCode(e.target.value)}
                                style={{
                                    flex: 1, padding: '0.8rem', borderRadius: '0.5rem', 
                                    border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none'
                                }}
                            />
                            <button type="submit" className="btn btn-primary" style={{padding: '0 1.25rem'}}>
                                Enviar
                            </button>
                        </form>
                    </div>
                )}
            </div>

            {/* Success Feedback Overlay */}
            {scanStatus === 'success' && (
                <div style={{ 
                    position: 'absolute', inset: 0, 
                    background: 'rgba(16, 185, 129, 0.9)', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', zIndex: 50, animation: 'fadeIn 0.2s'
                }}>
                    <div style={{background: 'white', borderRadius: '50%', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem'}}>
                        <i className="fa-solid fa-check" style={{ fontSize: '4rem', color: '#10b981' }}></i>
                    </div>
                    <h3 style={{fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em'}}>¡Enviado!</h3>
                    <p style={{marginTop: '1rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '1.2rem'}}>{lastScanned === 'CONNECTION_TEST' ? 'PRUEBA OK' : lastScanned}</p>
                </div>
            )}
            
            {/* Sending Feedback Overlay */}
             {scanStatus === 'sending' && (
                <div style={{ 
                    position: 'absolute', inset: 0, 
                    background: 'rgba(0,0,0,0.5)', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', zIndex: 50
                }}>
                    <div className="loader" style={{borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white'}}></div>
                    <p style={{marginTop: '1rem'}}>Enviando...</p>
                </div>
            )}

            <div style={{ padding: '1.5rem', background: '#0f172a', color: '#94a3b8', textAlign: 'center', fontSize: '0.9rem' }}>
                Apunta al código QR del producto
            </div>
            
            <style>{`
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
};
