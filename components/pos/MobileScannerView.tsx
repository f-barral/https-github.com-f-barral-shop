
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Html5Qrcode } from 'html5-qrcode';
import { PosDevice } from '../../types';
import { RealtimeChannel } from '@supabase/supabase-js';

interface RemoteCart {
    id: string;
    name: string;
}

export const MobileScannerView: React.FC = () => {
    const [device, setDevice] = useState<PosDevice | null>(null);
    const [registrationName, setRegistrationName] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [status, setStatus] = useState<'init' | 'register' | 'pending' | 'approved' | 'blocked'>('init');
    
    // Scan & Connection state
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [scanStatus, setScanStatus] = useState<'scanning' | 'review' | 'sending' | 'success'>('scanning');
    const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    
    // Manual Input State
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualCode, setManualCode] = useState('');

    // Cart Selection Logic
    const [availableCarts, setAvailableCarts] = useState<RemoteCart[]>([]);
    const [selectedCartId, setSelectedCartId] = useState<string>('');
    const [quantity, setQuantity] = useState<number>(1);
    
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

    // 3. Control Scanner based on Status and Scan Mode
    useEffect(() => {
        if (status === 'approved' && scanStatus === 'scanning') {
            setTimeout(() => startScanner(), 500);
        } else {
            stopScanner();
        }
    }, [status, scanStatus]);

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
        
        channel
            .on('broadcast', { event: 'cart-sync' }, (payload) => {
                if (payload.payload && payload.payload.carts) {
                    const carts = payload.payload.carts as RemoteCart[];
                    setAvailableCarts(carts);
                    // Select first if none selected, or if selected one is gone
                    setSelectedCartId(prev => {
                        const exists = carts.find(c => c.id === prev);
                        return exists ? prev : (carts.length > 0 ? carts[0].id : '');
                    });
                }
            })
            .subscribe((status) => {
                console.log("Estado canal móvil:", status);
                if (status === 'SUBSCRIBED') {
                    setConnectionState('connected');
                    // Request carts on connection
                    channel.send({ type: 'broadcast', event: 'request-carts', payload: {} });
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
                    handleScanDetected(decodedText);
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

    const handleScanDetected = (code: string) => {
        if (processingRef.current) return;
        
        if (code === 'CONNECTION_TEST') {
            sendPayload(code, 1);
            return;
        }

        setLastScanned(code);
        setQuantity(1); // Reset quantity on new scan
        setScanStatus('review');
        setShowManualInput(false);
        if (navigator.vibrate) navigator.vibrate(200);
    };

    const sendPayload = async (code: string, qty: number) => {
        processingRef.current = true;
        setScanStatus('sending');

        try {
            const payload = { 
                code: code, 
                device: device?.name || 'Móvil',
                quantity: qty,
                cartId: selectedCartId
            };
            
            // Auto-reconnect check
            if (!channelRef.current || connectionState !== 'connected') {
                console.log("No conectado, intentando reconectar antes de enviar...");
                await connectToChannel();
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
            setScanStatus('review'); // Go back to review on error
            processingRef.current = false;
            alert("Error de conexión. Intenta nuevamente.");
        }
    };

    const handleConfirmSend = () => {
        if (lastScanned) {
            sendPayload(lastScanned, quantity);
        }
    };

    const handleCancelReview = () => {
        setScanStatus('scanning');
        setLastScanned(null);
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(manualCode) {
            handleScanDetected(manualCode);
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

            {/* Header with Cart Selector */}
            <div style={{ padding: '0.75rem', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div style={{ width: '8px', height: '8px', background: connectionState === 'connected' ? '#10b981' : '#f59e0b', borderRadius: '50%', flexShrink: 0 }}></div>
                    <select 
                        value={selectedCartId} 
                        onChange={e => setSelectedCartId(e.target.value)}
                        style={{
                            background: '#1e293b', border: '1px solid #334155', color: 'white',
                            padding: '0.4rem', borderRadius: '0.5rem', fontSize: '0.9rem',
                            maxWidth: '180px'
                        }}
                    >
                        {availableCarts.length === 0 && <option value="">Sin Carritos</option>}
                        {availableCarts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
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
                
                {/* Target Overlay (Only when scanning) */}
                {scanStatus === 'scanning' && !showManualInput && (
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
                )}

                {/* Control Buttons */}
                {scanStatus === 'scanning' && !showManualInput && (
                    <div style={{
                        position: 'absolute', bottom: '20px', left: '0', right: '0', 
                        display: 'flex', justifyContent: 'center', gap: '1rem',
                        zIndex: 30, pointerEvents: 'auto'
                    }}>
                        <button 
                            onClick={() => setShowManualInput(true)}
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
                    </div>
                )}

                {/* Manual Input Overlay */}
                {showManualInput && (
                    <div style={{
                        position: 'absolute', top: '20%', left: '20px', right: '20px',
                        background: 'white', borderRadius: '1rem', padding: '1rem',
                        boxShadow: '0 5px 20px rgba(0,0,0,0.5)', zIndex: 40,
                        animation: 'slideUp 0.2s'
                    }}>
                        <h3 style={{marginTop:0, fontSize: '1.1rem'}}>Ingreso Manual</h3>
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
                                OK
                            </button>
                        </form>
                        <button 
                            onClick={() => setShowManualInput(false)}
                            style={{marginTop: '1rem', width: '100%', padding: '0.8rem', background: '#f1f5f9', border: 'none', borderRadius: '0.5rem', color: '#64748b'}}
                        >
                            Cancelar
                        </button>
                    </div>
                )}
            </div>

            {/* Review & Confirm Overlay */}
            {scanStatus === 'review' && (
                <div style={{ 
                    position: 'absolute', inset: 0, 
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '2rem', zIndex: 60, animation: 'fadeIn 0.2s'
                }}>
                    <div style={{background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '350px', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.3)'}}>
                        <h3 style={{margin: '0 0 1rem', fontSize: '1.2rem', textAlign: 'center'}}>Confirmar Envío</h3>
                        
                        <div style={{background: '#f1f5f9', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'center'}}>
                            <div style={{fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase'}}>Código Escaneado</div>
                            <div style={{fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all'}}>{lastScanned}</div>
                        </div>

                        <div style={{marginBottom: '1.5rem'}}>
                            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>Cantidad</label>
                            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                <button 
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    style={{width: '48px', height: '48px', borderRadius: '0.5rem', border: '1px solid #cbd5e1', background: 'white', fontSize: '1.2rem', cursor: 'pointer'}}
                                >-</button>
                                <input 
                                    type="number" 
                                    value={quantity}
                                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{flex: 1, textAlign: 'center', fontSize: '1.5rem', fontWeight: 700, border: 'none', borderBottom: '2px solid #cbd5e1', outline: 'none'}}
                                />
                                <button 
                                    onClick={() => setQuantity(quantity + 1)}
                                    style={{width: '48px', height: '48px', borderRadius: '0.5rem', border: '1px solid #cbd5e1', background: 'white', fontSize: '1.2rem', cursor: 'pointer'}}
                                >+</button>
                            </div>
                        </div>

                        <div style={{marginBottom: '1.5rem'}}>
                            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>Enviar a</label>
                            <select 
                                value={selectedCartId} 
                                onChange={e => setSelectedCartId(e.target.value)}
                                style={{width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '1rem', background: 'white'}}
                            >
                                {availableCarts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div style={{display: 'flex', gap: '1rem'}}>
                            <button 
                                onClick={handleCancelReview}
                                className="btn btn-secondary"
                                style={{flex: 1, padding: '0.8rem'}}
                            >Cancelar</button>
                            <button 
                                onClick={handleConfirmSend}
                                className="btn btn-primary"
                                style={{flex: 1.5, padding: '0.8rem', fontSize: '1.1rem'}}
                            >Enviar <i className="fa-solid fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Feedback Overlay */}
            {scanStatus === 'success' && (
                <div style={{ 
                    position: 'absolute', inset: 0, 
                    background: 'rgba(16, 185, 129, 0.95)', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', zIndex: 70, animation: 'fadeIn 0.2s'
                }}>
                    <div style={{background: 'white', borderRadius: '50%', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem'}}>
                        <i className="fa-solid fa-check" style={{ fontSize: '4rem', color: '#10b981' }}></i>
                    </div>
                    <h3 style={{fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em'}}>¡Enviado!</h3>
                    <p style={{marginTop: '0.5rem', fontSize: '1.2rem'}}>x{quantity} unidades</p>
                </div>
            )}
            
            {/* Sending Feedback Overlay */}
             {scanStatus === 'sending' && (
                <div style={{ 
                    position: 'absolute', inset: 0, 
                    background: 'rgba(0,0,0,0.6)', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', zIndex: 70
                }}>
                    <div className="loader" style={{borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white'}}></div>
                    <p style={{marginTop: '1rem'}}>Enviando...</p>
                </div>
            )}

            <style>{`
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
};
