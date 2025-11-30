
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
    const [isChannelReady, setIsChannelReady] = useState(false);
    
    // Refs
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const processingRef = useRef<boolean>(false);

    // 1. Init: Check Identity & Connect Channel
    useEffect(() => {
        checkIdentity();
        
        // Setup Supabase Channel
        console.log("Iniciando canal pos-scans en móvil...");
        const channel = supabase.channel('pos-scans');
        
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Móvil conectado a pos-scans exitosamente");
                channelRef.current = channel;
                setIsChannelReady(true);
            } else {
                console.log("Estado canal móvil:", status);
            }
        });

        return () => {
            supabase.removeChannel(channel);
            stopScanner();
        };
    }, []);

    // 2. Subscribe to device status changes (Approved/Blocked)
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
            // Give a small delay for DOM to be ready
            setTimeout(() => startScanner(), 500);
        } else {
            stopScanner();
        }
    }, [status]);

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
                // Keep alive
                if (data.status === 'approved') {
                    await supabase.from('pos_devices').update({ last_active: new Date().toISOString() }).eq('device_id', deviceId);
                }
            } else {
                // ID exists in localstorage but not in DB (deleted?)
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
        
        if (scannerRef.current) return; // Already running

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
                (errorMessage) => {
                    // ignore
                }
            );
        } catch (err) {
            console.error("Error starting scanner", err);
            try {
                if(scannerRef.current) {
                    await scannerRef.current.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: 250 },
                        (decodedText) => onScanSuccess(decodedText),
                        () => {}
                    );
                }
            } catch(e) { console.error("Fallback failed", e); }
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

        if (navigator.vibrate) navigator.vibrate(200);

        try {
            const payload = { code: decodedText, device: device?.name || 'Móvil' };
            
            if (channelRef.current && isChannelReady) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'remote-scan',
                    payload: payload
                });
                setScanStatus('success');
            } else {
                alert("Error: No hay conexión con la caja central. Refresca la página.");
                setScanStatus('scanning');
            }
            
            // Cooldown
            setTimeout(() => {
                setScanStatus('scanning');
                setLastScanned(null);
                processingRef.current = false;
            }, 1500);

        } catch (e) {
            console.error("Error sending scan", e);
            setScanStatus('scanning');
            processingRef.current = false;
        }
    };

    const sendTestScan = () => {
        if (!isChannelReady) {
            alert("Todavía no hay conexión con el servidor. Espera a que diga 'Listo'.");
            return;
        }
        onScanSuccess('CONNECTION_TEST');
    };

    // --- RENDER STATES ---

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
            {/* FORCE VIDEO TO FILL SCREEN */}
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
                    <div style={{ width: '10px', height: '10px', background: isChannelReady ? '#10b981' : '#f59e0b', borderRadius: '50%', boxShadow: isChannelReady ? '0 0 10px #10b981' : 'none' }}></div>
                    <span style={{ fontWeight: 600 }}>{device?.name}</span>
                </div>
                <div style={{fontSize: '0.8rem', opacity: 0.8}}>
                    {scanStatus === 'scanning' ? (isChannelReady ? 'Listo' : 'Conectando...') : 'Enviando...'}
                </div>
            </div>

            {/* Scanner Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
                 {/* The element for Html5Qrcode to render into */}
                <div id="mobile-reader" style={{ width: '100%', height: '100%' }}></div>
                
                {/* Target Overlay (Visual Guide) */}
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

                {/* Manual Test Button */}
                <button 
                    onClick={sendTestScan}
                    style={{
                        position: 'absolute', bottom: '20px', right: '20px',
                        background: isChannelReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.2)', 
                        color: 'white',
                        border: isChannelReady ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.4)', 
                        borderRadius: '99px',
                        padding: '0.5rem 1rem', fontSize: '0.8rem', pointerEvents: 'auto', zIndex: 30
                    }}
                >
                    Prueba
                </button>
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
                    <p style={{marginTop: '1rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '1.2rem'}}>{lastScanned === 'CONNECTION_TEST' ? 'PRUEBA' : lastScanned}</p>
                </div>
            )}

            <div style={{ padding: '1.5rem', background: '#0f172a', color: '#94a3b8', textAlign: 'center', fontSize: '0.9rem' }}>
                Apunta al código QR del producto
            </div>
        </div>
    );
};
