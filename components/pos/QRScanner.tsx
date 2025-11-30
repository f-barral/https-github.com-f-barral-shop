
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
    onScan: (decodedText: string) => void;
    onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const startScanner = async () => {
            try {
                const html5QrCode = new Html5Qrcode("local-reader");
                scannerRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    },
                    (decodedText) => {
                        // Check if user is scanning the Pairing QR by mistake
                        if (decodedText.includes('mode=scanner')) {
                            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3'); // Error sound
                            audio.play().catch(() => {});
                            alert("⚠️ Estás escaneando el código de vinculación.\n\nPor favor, escanea este código con la CÁMARA DE TU CELULAR para abrir la App en el teléfono.");
                            return;
                        }

                        // On Success
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                        
                        onScan(decodedText);
                    },
                    (errorMessage) => {
                        // Ignore parse errors
                    }
                );
            } catch (err) {
                console.error("Error starting scanner", err);
                setError("No se pudo acceder a la cámara. Verifica los permisos.");
            }
        };

        const timer = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timer);
            if (scannerRef.current) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(err => console.error("Error stopping scanner", err));
            }
        };
    }, [onScan]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.9)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                width: '100%', maxWidth: '500px', padding: '1rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white'
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem'}}>
                    <h3 style={{margin: 0}}>Escanear Producto</h3>
                    <button onClick={onClose} style={{background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <i className="fa-solid fa-xmark" style={{fontSize: '1.2rem'}}></i>
                    </button>
                </div>
                
                <div style={{
                    width: '100%', aspectRatio: '1/1', background: 'black', borderRadius: '1rem', overflow: 'hidden', position: 'relative', border: '1px solid #333'
                }}>
                    <div id="local-reader" style={{width: '100%', height: '100%'}}></div>
                    
                    {error && (
                        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', background: '#1e1e1e'}}>
                            <div>
                                <i className="fa-solid fa-camera-slash" style={{fontSize: '3rem', color: '#ef4444', marginBottom: '1rem'}}></i>
                                <p>{error}</p>
                            </div>
                        </div>
                    )}
                    
                    {!error && (
                        <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', pointerEvents: 'none'}}>
                            <div style={{position: 'absolute', top: '-2px', left: '-2px', width: '20px', height: '20px', borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '4px 0 0 0'}}></div>
                            <div style={{position: 'absolute', top: '-2px', right: '-2px', width: '20px', height: '20px', borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 4px 0 0'}}></div>
                            <div style={{position: 'absolute', bottom: '-2px', left: '-2px', width: '20px', height: '20px', borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '0 0 0 4px'}}></div>
                            <div style={{position: 'absolute', bottom: '-2px', right: '-2px', width: '20px', height: '20px', borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 0 4px 0'}}></div>
                        </div>
                    )}
                </div>
                
                <p style={{marginTop: '1.5rem', opacity: 0.7, textAlign: 'center', fontSize: '0.9rem'}}>
                    Apunta la cámara al código QR del producto.
                </p>
            </div>
        </div>
    );
};
