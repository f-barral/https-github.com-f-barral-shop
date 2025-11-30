
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, ActiveCart, CartItem } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { QRScanner } from './QRScanner';
import { DeviceManagerModal } from './DeviceManagerModal';

interface PointOfSaleViewProps {
    products: Product[];
    onSaleSuccess: () => void;
}

export const PointOfSaleView: React.FC<PointOfSaleViewProps> = ({ products, onSaleSuccess }) => {
    const [carts, setCarts] = useState<ActiveCart[]>([]);
    const [activeCartId, setActiveCartId] = useState<string | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [showDeviceManager, setShowDeviceManager] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastRemoteScan, setLastRemoteScan] = useState<{ code: string, device: string } | null>(null);

    // Initial Cart Load
    useEffect(() => {
        // Load from local storage or create default
        const stored = localStorage.getItem('pos_carts');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.length > 0) {
                    setCarts(parsed);
                    setActiveCartId(parsed[0].id);
                    return;
                }
            } catch (e) { console.error("Error loading carts", e); }
        }
        createCart('Mostrador');
    }, []);

    // Save to local storage on change
    useEffect(() => {
        if (carts.length > 0) {
            localStorage.setItem('pos_carts', JSON.stringify(carts));
        }
    }, [carts]);

    // Realtime Scanner Listener
    useEffect(() => {
        const channel = supabase.channel('pos-scans')
            .on('broadcast', { event: 'remote-scan' }, (payload) => {
                if (payload.payload && payload.payload.code) {
                    handleScan(payload.payload.code, true);
                    setLastRemoteScan({ code: payload.payload.code, device: payload.payload.device });
                    setTimeout(() => setLastRemoteScan(null), 3000);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [products, activeCartId, carts]); // Re-bind when cart state changes to ensure correct active cart

    const createCart = (nameInput?: string) => {
        const name = nameInput || prompt("Nombre del cliente / mesa:");
        if (!name) return;
        
        const newCart: ActiveCart = {
            id: crypto.randomUUID(),
            name,
            items: [],
            createdAt: Date.now()
        };
        
        setCarts(prev => [...prev, newCart]);
        setActiveCartId(newCart.id);
    };

    const deleteCart = (id: string) => {
        if (!confirm("¿Eliminar este carrito?")) return;
        const newCarts = carts.filter(c => c.id !== id);
        setCarts(newCarts);
        if (newCarts.length > 0) {
            setActiveCartId(newCarts[newCarts.length - 1].id);
        } else {
            createCart('Mostrador');
        }
    };

    const activeCart = carts.find(c => c.id === activeCartId);

    const updateCartItems = (cartId: string, newItems: CartItem[]) => {
        setCarts(prev => prev.map(c => c.id === cartId ? { ...c, items: newItems } : c));
    };

    const addToCart = (product: Product, quantity = 1) => {
        if (!activeCartId) return;
        // Need to find the cart again from state to be sure we have latest items (due to closure)
        // But since we pass setCarts functional update, we need logic inside.
        
        setCarts(prev => {
            return prev.map(cart => {
                if (cart.id === activeCartId) {
                    const currentItems = cart.items || [];
                    const existing = currentItems.find(i => i.productId === product.id);
                    
                    let newItems;
                    if (existing) {
                        newItems = currentItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + quantity } : i);
                    } else {
                        newItems = [...currentItems, {
                            productId: product.id,
                            productName: product.name,
                            materialCode: product.material_code,
                            quantity: quantity,
                            unitPrice: product.price
                        }];
                    }
                    return { ...cart, items: newItems };
                }
                return cart;
            });
        });
    };

    const handleScan = (decodedText: string, isRemote = false) => {
        let product = products.find(p => p.id === decodedText);
        
        if (!product) {
            const code = parseInt(decodedText);
            if (!isNaN(code)) {
                product = products.find(p => p.material_code === code);
            }
        }

        if (product) {
            addToCart(product);
            if (!isRemote) {
                setShowScanner(false);
                alert(`Producto agregado: ${product.name}`);
            } else {
                // Play notification sound for remote scan
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');
                audio.play().catch(e => console.log('Audio play failed', e));
            }
        } else {
            if (!isRemote) alert(`Producto no encontrado para el código: ${decodedText}`);
        }
    };

    const handleQuantityChange = (index: number, delta: number) => {
        if (!activeCart) return;
        const newItems = [...activeCart.items];
        newItems[index].quantity += delta;
        if (newItems[index].quantity <= 0) {
            newItems.splice(index, 1);
        }
        updateCartItems(activeCart.id, newItems);
    };

    const handleRemoveItem = (index: number) => {
        if (!activeCart) return;
        const newItems = activeCart.items.filter((_, i) => i !== index);
        updateCartItems(activeCart.id, newItems);
    };

    const handleCheckout = async () => {
        if (!activeCart || activeCart.items.length === 0) return;
        
        const paymentMethod = prompt("Método de Pago (Efectivo, Tarjeta, QR, Transferencia):", "Efectivo");
        if (!paymentMethod) return;

        setIsProcessing(true);
        try {
            const saleDate = new Date().toISOString().split('T')[0];
            const itemsPayload = activeCart.items.map(item => ({
                product_id: item.productId,
                quantity: item.quantity,
                unit_price: item.unitPrice || 0
            }));

            const { error } = await supabase.rpc('register_bulk_sale', {
                p_sale_date: saleDate,
                p_invoice_number: `POS-${Date.now()}`,
                p_payment_method: paymentMethod,
                p_card_bank: null,
                p_card_installments: null,
                p_items: itemsPayload
            });

            if (error) throw error;

            alert("¡Venta registrada con éxito!");
            onSaleSuccess();
            updateCartItems(activeCart.id, []);

        } catch (error: any) {
            console.error("Error checkout:", error);
            alert("Error al procesar la venta: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.material_code.toString().includes(searchTerm)
    );

    const total = activeCart?.items.reduce((sum, i) => sum + ((i.unitPrice || 0) * i.quantity), 0) || 0;

    return (
        <div style={{height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column'}}>
            {showScanner && (
                <QRScanner onScan={(code) => handleScan(code, false)} onClose={() => setShowScanner(false)} />
            )}

            {showDeviceManager && (
                <DeviceManagerModal onClose={() => setShowDeviceManager(false)} />
            )}

            {/* Notification Toast for Remote Scan */}
            {lastRemoteScan && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 4000,
                    background: '#10b981', color: 'white', padding: '1rem', borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideInRight 0.3s'
                }}>
                    <div style={{fontWeight: 600}}><i className="fa-solid fa-mobile-screen"></i> Escaneo Remoto</div>
                    <div style={{fontSize: '0.9rem'}}>Código: {lastRemoteScan.code}</div>
                    <div style={{fontSize: '0.8rem', opacity: 0.8}}>De: {lastRemoteScan.device}</div>
                </div>
            )}

            {/* Top Bar: Carts */}
            <div style={{
                display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '1rem', 
                borderBottom: '1px solid var(--border-color)', marginBottom: '1rem'
            }}>
                <button 
                    onClick={() => createCart()} 
                    className="btn btn-secondary"
                    style={{width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}
                >
                    <i className="fa-solid fa-plus"></i>
                </button>
                
                {carts.map(cart => (
                    <div 
                        key={cart.id} 
                        onClick={() => setActiveCartId(cart.id)}
                        style={{
                            padding: '0.5rem 1rem',
                            background: activeCartId === cart.id ? 'var(--bg-gradient-blue)' : 'white',
                            color: activeCartId === cart.id ? 'white' : 'var(--text-secondary)',
                            borderRadius: '0.5rem',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: activeCartId === cart.id ? 'var(--shadow-md)' : 'none'
                        }}
                    >
                        <i className="fa-solid fa-cart-shopping"></i>
                        <span style={{fontWeight: 600}}>{cart.name}</span>
                        {activeCartId === cart.id && carts.length > 1 && (
                            <i 
                                className="fa-solid fa-xmark" 
                                style={{fontSize: '0.8rem', opacity: 0.7, cursor: 'pointer', marginLeft: '5px'}}
                                onClick={(e) => { e.stopPropagation(); deleteCart(cart.id); }}
                            ></i>
                        )}
                    </div>
                ))}
            </div>

            {/* Main Content */}
            <div style={{flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden', flexDirection: 'column'}}>
                
                {/* Search & Scan Bar */}
                <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => setShowScanner(true)}
                        style={{flex: 1, background: 'var(--primary-color)', color: 'var(--primary-text)'}}
                    >
                        <i className="fa-solid fa-qrcode" style={{fontSize: '1.2rem'}}></i> Escanear Local
                    </button>

                     <button 
                        className="btn btn-secondary" 
                        onClick={() => setShowDeviceManager(true)}
                        title="Gestionar Escáneres Remotos"
                        style={{background: 'white', color: 'var(--text-secondary)', width: 'auto'}}
                    >
                        <i className="fa-solid fa-mobile-screen-button"></i>
                    </button>
                    
                    <div className="searchable-select-container" style={{flex: 2}}>
                        <input 
                            type="text" 
                            placeholder="Buscar producto manual..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            onFocus={() => setShowProductDropdown(true)}
                            onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                            style={{width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)'}}
                        />
                        {showProductDropdown && searchTerm && (
                            <ul className="search-dropdown">
                                {filteredProducts.map(p => (
                                    <li key={p.id} className="search-result-item" onClick={() => { addToCart(p); setSearchTerm(''); }}>
                                        <div style={{display:'flex', justifyContent:'space-between', width:'100%'}}>
                                            <span>{p.name}</span>
                                            <span style={{fontWeight: 'bold'}}>{formatCurrency(p.price)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Cart Items List */}
                <div style={{flex: 1, background: 'white', borderRadius: '1rem', border: '1px solid var(--border-color)', overflowY: 'auto', padding: '0.5rem'}}>
                    {!activeCart || activeCart.items.length === 0 ? (
                        <div style={{height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'}}>
                            <i className="fa-solid fa-basket-shopping" style={{fontSize: '3rem', marginBottom: '1rem', opacity: 0.3}}></i>
                            <p>Carrito vacío</p>
                            <p style={{fontSize: '0.8rem'}}>Escanea un QR o busca un producto</p>
                        </div>
                    ) : (
                        <table className="items-table">
                            <thead style={{position: 'sticky', top: 0, background: 'white', zIndex: 10}}>
                                <tr>
                                    <th>Producto</th>
                                    <th style={{textAlign: 'center'}}>Cant</th>
                                    <th style={{textAlign: 'right'}}>Total</th>
                                    <th style={{width: '30px'}}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeCart.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div style={{fontWeight: 600}}>{item.productName}</div>
                                            <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>{formatCurrency(item.unitPrice || 0)}</div>
                                        </td>
                                        <td style={{textAlign: 'center'}}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                                                <button onClick={() => handleQuantityChange(idx, -1)} style={{width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #ddd'}}>-</button>
                                                <span style={{width: '20px'}}>{item.quantity}</span>
                                                <button onClick={() => handleQuantityChange(idx, 1)} style={{width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #ddd'}}>+</button>
                                            </div>
                                        </td>
                                        <td style={{textAlign: 'right', fontWeight: 600}}>
                                            {formatCurrency((item.unitPrice || 0) * item.quantity)}
                                        </td>
                                        <td>
                                            <button onClick={() => handleRemoveItem(idx)} style={{color: '#ef4444', background: 'none', border: 'none'}}>
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Totals & Checkout */}
                <div style={{background: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border-color)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 600}}>
                        <span>Total a Pagar</span>
                        <span style={{color: 'var(--bg-gradient-blue)', fontSize: '1.5rem'}}>{formatCurrency(total)}</span>
                    </div>
                    
                    <button 
                        className="btn btn-primary" 
                        style={{width: '100%', padding: '1rem', fontSize: '1.1rem', justifyContent: 'center'}}
                        onClick={handleCheckout}
                        disabled={isProcessing || !activeCart || activeCart.items.length === 0}
                    >
                        {isProcessing ? 'Procesando...' : (
                            <>
                                <i className="fa-solid fa-money-bill-wave"></i> Cobrar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
