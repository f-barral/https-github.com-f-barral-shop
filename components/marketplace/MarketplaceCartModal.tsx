
import React from 'react';
import { CartItem } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface MarketplaceCartModalProps {
    items: CartItem[];
    onClose: () => void;
    onUpdateQuantity: (productId: string, newQuantity: number) => void;
    onRemove: (productId: string) => void;
    onClear: () => void;
}

export const MarketplaceCartModal: React.FC<MarketplaceCartModalProps> = ({ items, onClose, onUpdateQuantity, onRemove, onClear }) => {
    const total = items.reduce((sum, item) => sum + (item.unitPrice || 0) * item.quantity, 0);

    const handleSendOrder = () => {
        if (items.length === 0) return;

        let message = "Hola! 👋 Me gustaría realizar el siguiente pedido desde el Marketplace:\n\n";
        items.forEach(item => {
            message += `▪️ ${item.quantity} x ${item.productName} (${formatCurrency(item.unitPrice || 0)})\n`;
        });
        message += `\n💰 *Total Estimado: ${formatCurrency(total)}*`;
        message += `\n\nQuedo a la espera de la confirmación. Gracias!`;

        const encodedMessage = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{zIndex: 3000}}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px', height: 'auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column'}}>
                <div className="modal-header">
                    <h2><i className="fa-solid fa-cart-shopping" style={{marginRight: '10px', color: 'var(--bg-gradient-cyan)'}}></i> Mi Carrito</h2>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>

                <div className="modal-body-layout single-column" style={{padding: '0', overflowY: 'auto', flex: 1}}>
                    {items.length === 0 ? (
                        <div style={{padding: '3rem', textAlign: 'center', color: 'var(--text-muted)'}}>
                            <i className="fa-solid fa-basket-shopping" style={{fontSize: '3rem', marginBottom: '1rem', opacity: 0.5}}></i>
                            <p>Tu carrito está vacío.</p>
                            <button className="btn btn-secondary" onClick={onClose} style={{marginTop: '1rem'}}>
                                Seguir mirando
                            </button>
                        </div>
                    ) : (
                        <div style={{padding: '1.5rem'}}>
                            {items.map(item => (
                                <div key={item.productId} style={{display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px dashed var(--border-color)'}}>
                                    <div style={{flex: 1}}>
                                        <h4 style={{margin: '0 0 0.25rem', fontSize: '0.95rem', color: 'var(--text-main)'}}>{item.productName}</h4>
                                        <div style={{fontSize: '0.9rem', color: 'var(--bg-gradient-blue)', fontWeight: 600}}>
                                            {formatCurrency(item.unitPrice || 0)}
                                        </div>
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                        <button 
                                            onClick={() => onUpdateQuantity(item.productId, Math.max(1, item.quantity - 1))}
                                            style={{width: '28px', height: '28px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                                        >
                                            <i className="fa-solid fa-minus" style={{fontSize: '0.7rem'}}></i>
                                        </button>
                                        <span style={{width: '24px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600}}>{item.quantity}</span>
                                        <button 
                                            onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                                            style={{width: '28px', height: '28px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                                        >
                                            <i className="fa-solid fa-plus" style={{fontSize: '0.7rem'}}></i>
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => onRemove(item.productId)}
                                        style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem'}}
                                        title="Eliminar"
                                    >
                                        <i className="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            ))}

                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px solid var(--border-color)'}}>
                                <span style={{fontWeight: 700, fontSize: '1.1rem'}}>Total</span>
                                <span style={{fontWeight: 800, fontSize: '1.5rem', color: 'var(--bg-gradient-blue)'}}>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {items.length > 0 && (
                    <div className="modal-footer" style={{display: 'flex', gap: '1rem'}}>
                         <button className="btn btn-secondary" onClick={onClear} style={{marginRight: 'auto', fontSize: '0.85rem', color: '#ef4444'}}>
                            Vaciar
                        </button>
                        <button className="btn btn-primary" onClick={handleSendOrder} style={{background: '#25D366', borderColor: '#25D366', color: 'white', flex: 1, justifyContent: 'center'}}>
                            <i className="fa-brands fa-whatsapp"></i> Enviar Pedido
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
