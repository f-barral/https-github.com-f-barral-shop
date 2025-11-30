
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { ModernImageManager } from '../common/ModernImageManager';
import { IoShareSocialOutline, IoCartOutline, IoHeartOutline, IoHeart, IoCheckmarkCircle } from "react-icons/io5";

interface MarketplaceDetailModalProps {
    onClose: () => void;
    product: Product;
    onAddToCart: () => void;
}

export const MarketplaceDetailModal: React.FC<MarketplaceDetailModalProps> = ({ onClose, product, onAddToCart }) => {
    const [isLiked, setIsLiked] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [isAdded, setIsAdded] = useState(false);
    
    // Check initial like status
    useEffect(() => {
        const checkLike = async () => {
            try {
                let userId = (await supabase.auth.getUser()).data.user?.id;
                if (!userId) userId = localStorage.getItem('marketplace_guest_id') || '';
                
                if (userId) {
                    const { data, error } = await supabase
                        .from('product_likes')
                        .select('product_id')
                        .eq('product_id', product.id)
                        .eq('user_id', userId)
                        .maybeSingle();
                    
                    if (error) {
                        if (error.code !== '42P01') console.error("Error checkLike:", error.message);
                        return;
                    }
                    if (data) setIsLiked(true);
                }
            } catch (e) {
                console.warn("Auth/DB check error", e);
            }
        };
        checkLike();
    }, [product.id]);

    const handleToggleLike = async () => {
        const prev = isLiked;
        setIsLiked(!prev); // Optimistic Update

        let userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            userId = localStorage.getItem('marketplace_guest_id') || crypto.randomUUID();
            localStorage.setItem('marketplace_guest_id', userId);
        }

        try {
            const { error } = await supabase.rpc('toggle_product_like', {
                p_product_id: product.id,
                p_user_id: userId
            });

            if (error) {
                if (error.code === '42883') { // Function undefined, fallback
                    if (!prev) {
                        await supabase.from('product_likes').insert({ product_id: product.id, user_id: userId });
                    } else {
                        await supabase.from('product_likes').delete().eq('product_id', product.id).eq('user_id', userId);
                    }
                } else {
                     throw error;
                }
            }
        } catch (error: any) {
            console.error("Error toggle like:", error.message || error);
            setIsLiked(prev); // Rollback if error
             if (error?.code === '42P01') {
                // Table missing, silent fail in UI but log warn
                console.warn("Table product_likes missing");
            }
        }
    };

    const handleAddToCartClick = () => {
        onAddToCart();
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    const handleShare = (platform: 'whatsapp' | 'facebook' | 'instagram' | 'copy') => {
        const text = `¡Mira este producto! ${product.name} a solo ${formatCurrency(product.price)}.`;
        const url = window.location.href; 
        const encodedText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(url);

        if (platform === 'whatsapp') {
            window.open(`https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'facebook') {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'instagram') {
             window.open(`https://www.instagram.com/`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'copy') {
            navigator.clipboard.writeText(`${text} ${url}`).then(() => alert("Copiado!")).catch(console.error);
        }
        setShowShareMenu(false);
    };

    // Stock Logic (Discrete)
    let stockStatus = { color: '#10b981', text: 'Disponible' };
    if (product.current_stock === 0) {
        stockStatus = { color: '#ef4444', text: 'Agotado' };
    } else if (product.current_stock <= 10) {
        stockStatus = { color: '#f59e0b', text: '¡Últimas unidades!' };
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{zIndex: 2000}}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', height: 'auto', maxHeight: '90vh', borderRadius: '1.5rem', overflow: 'hidden', padding: 0}}>
                <div className="detail-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', minHeight: '550px'}}>
                    
                    {/* Left: Image (Full Height in desktop) */}
                    <div style={{background: '#f8fafc', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e2e8f0'}}>
                         <div style={{width: '100%', height: '100%', maxHeight: '450px'}}>
                            <ModernImageManager images={product.image_urls || []} setImages={() => {}} readOnly={true} />
                         </div>
                    </div>

                    {/* Right: Info */}
                    <div style={{padding: '2.5rem', display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto'}}>
                        
                        <button onClick={onClose} style={{position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', fontSize: '1.5rem', color: '#cbd5e1', cursor: 'pointer', zIndex: 10}}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>

                        <div style={{fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 600}}>#{product.material_code}</div>
                        <h2 style={{margin: '0 0 1.5rem', fontSize: '1.8rem', lineHeight: 1.2, color: '#1e293b', paddingRight: '2rem'}}>{product.name}</h2>

                        {/* Price & Discrete Stock */}
                        <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap'}}>
                            <div style={{fontSize: '2rem', fontWeight: 800, color: '#1e3a8a'}}>{formatCurrency(product.price)}</div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                background: stockStatus.color + '15', color: stockStatus.color,
                                padding: '0.3rem 0.8rem', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600
                            }}>
                                <div style={{width: '8px', height: '8px', borderRadius: '50%', background: stockStatus.color}}></div>
                                {stockStatus.text}
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div style={{display: 'flex', gap: '0.75rem', marginBottom: '2rem'}}>
                            <button 
                                className="btn btn-primary" 
                                style={{
                                    flex: 1, padding: '0.8rem', fontSize: '1rem', justifyContent: 'center',
                                    background: isAdded ? '#10b981' : 'var(--primary-color)',
                                    transition: 'background 0.3s'
                                }} 
                                onClick={handleAddToCartClick}
                            >
                                {isAdded ? (
                                    <> <IoCheckmarkCircle style={{fontSize: '1.2rem'}} /> Agregado </>
                                ) : (
                                    <> <IoCartOutline style={{fontSize: '1.2rem'}} /> Agregar al carrito </>
                                )}
                            </button>
                            
                            <button onClick={handleToggleLike} style={{
                                width: '50px', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                color: isLiked ? '#ef4444' : '#64748b', fontSize: '1.5rem', transition: 'all 0.2s'
                            }}>
                                {isLiked ? <IoHeart /> : <IoHeartOutline />}
                            </button>

                            <div style={{position: 'relative'}}>
                                <button onClick={() => setShowShareMenu(!showShareMenu)} style={{
                                    width: '50px', height: '100%', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                    color: '#64748b', fontSize: '1.5rem'
                                }}>
                                    <IoShareSocialOutline />
                                </button>
                                {showShareMenu && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
                                        background: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                        border: '1px solid #e2e8f0', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 20, minWidth: '150px'
                                    }}>
                                        <button onClick={() => handleShare('whatsapp')} style={shareBtnStyle}><i className="fa-brands fa-whatsapp" style={{color: '#25D366', width: '20px'}}></i> Whatsapp</button>
                                        <button onClick={() => handleShare('facebook')} style={shareBtnStyle}><i className="fa-brands fa-facebook" style={{color: '#1877F2', width: '20px'}}></i> Facebook</button>
                                        <button onClick={() => handleShare('copy')} style={shareBtnStyle}><i className="fa-solid fa-link" style={{color: '#64748b', width: '20px'}}></i> Copiar</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        <div style={{flex: 1, overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1.5rem'}}>
                            <h4 style={{fontSize: '0.85rem', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: 700}}>Descripción</h4>
                            <p style={{fontSize: '0.95rem', lineHeight: '1.6', color: '#475569', whiteSpace: 'pre-wrap'}}>
                                {product.description || "Sin descripción."}
                            </p>
                        </div>

                        {/* Footer Button */}
                        <div style={{marginTop: 'auto'}}>
                            <button onClick={onClose} style={{
                                width: '100%', padding: '0.9rem', background: '#0f172a', color: 'white', 
                                border: 'none', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                            }}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @media (max-width: 768px) {
                    .detail-grid { grid-template-columns: 1fr !important; display: flex !important; flexDirection: column !important; min-height: 0 !important; }
                    .modal-content { height: 100% !important; max-height: none !important; border-radius: 0 !important; }
                    .detail-grid > div:first-child { min-height: 300px; padding: 1rem !important; }
                    .detail-grid > div:last-child { padding: 1.5rem !important; flex: 1; }
                }
            `}</style>
        </div>
    );
};

const shareBtnStyle = {
    background: 'transparent', border: 'none', textAlign: 'left' as const, padding: '0.5rem', 
    cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
    borderRadius: '0.5rem', transition: 'background 0.2s', width: '100%', color: '#1e293b'
};
