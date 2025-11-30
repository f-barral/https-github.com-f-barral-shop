
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { IoShareSocialOutline } from "react-icons/io5";

interface MarketplaceViewProps {
    products: Product[];
    onProductClick: (product: Product) => void;
    cartCount: number;
    onOpenCart: () => void;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({ products, onProductClick, cartCount, onOpenCart }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
    const [activeShareId, setActiveShareId] = useState<string | null>(null);
    const [isLoadingLikes, setIsLoadingLikes] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string>('');

    // Función auxiliar para obtener ID (Usuario real o Invitado)
    const getOrCreateUserId = async () => {
        try {
            // 1. Intentar obtener usuario autenticado
            const { data } = await supabase.auth.getUser();
            if (data?.user) return data.user.id;
        } catch (e) {
            console.warn("Error verificando sesión:", e);
        }

        // 2. Si no hay, usar/generar ID de invitado en localStorage
        let guestId = localStorage.getItem('marketplace_guest_id');
        if (!guestId) {
            // Generar UUID válido para invitado
            guestId = crypto.randomUUID();
            localStorage.setItem('marketplace_guest_id', guestId);
        }
        return guestId;
    };

    // Cargar likes reales desde la base de datos (TABLA: product_likes)
    useEffect(() => {
        const fetchLikesData = async () => {
            setIsLoadingLikes(true);
            try {
                const userId = await getOrCreateUserId();
                setCurrentUserId(userId);

                // 1. Obtener conteo total por producto
                const { data: allLikes, error: likesError } = await supabase
                    .from('product_likes')
                    .select('product_id');

                if (likesError) throw likesError;

                const counts: Record<string, number> = {};
                allLikes?.forEach((like: any) => {
                    counts[like.product_id] = (counts[like.product_id] || 0) + 1;
                });
                setLikeCounts(counts);

                // 2. Obtener likes del usuario actual (o invitado)
                const { data: myLikes, error: myLikesError } = await supabase
                    .from('product_likes')
                    .select('product_id')
                    .eq('user_id', userId);
                
                if (myLikesError) throw myLikesError;

                const myFavs = new Set<string>();
                myLikes?.forEach((like: any) => myFavs.add(like.product_id));
                setFavorites(myFavs);

            } catch (error: any) {
                // Handle specific Supabase errors gracefully
                if (error?.code === '42P01') {
                    console.warn("Tabla 'product_likes' no existe en Supabase. La funcionalidad de likes está deshabilitada.");
                } else {
                    console.error("Error al cargar likes:", error?.message || error);
                }
            } finally {
                setIsLoadingLikes(false);
            }
        };

        fetchLikesData();
        
        // Suscripción a cambios
        const channel = supabase
            .channel('public:product_likes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_likes' }, () => {
                fetchLikesData(); 
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const toggleFavorite = async (e: React.MouseEvent, productId: string) => {
        e.stopPropagation();
        
        let userIdToUse = currentUserId;
        if (!userIdToUse) {
            userIdToUse = await getOrCreateUserId();
            setCurrentUserId(userIdToUse);
        }

        // Estado Previo para Rollback
        const wasLiked = favorites.has(productId);
        const prevCount = likeCounts[productId] || 0;

        // 1. Actualización Optimista (UI responde inmediato)
        const newIsLiked = !wasLiked;
        const newCount = wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1;

        const newFavorites = new Set(favorites);
        if (newIsLiked) newFavorites.add(productId);
        else newFavorites.delete(productId);
        
        setFavorites(newFavorites);
        setLikeCounts(prev => ({ ...prev, [productId]: newCount }));

        try {
            // 2. Llamada a Base de Datos (Función: toggle_product_like)
            // Si la función RPC no existe, intentamos fallback manual (insert/delete)
            const { data: isLikedDB, error } = await supabase.rpc('toggle_product_like', {
                p_product_id: productId,
                p_user_id: userIdToUse 
            });

            if (error) {
                // Fallback manual si RPC no existe
                if (error.code === '42883') { // Undefined function
                     if (newIsLiked) {
                         await supabase.from('product_likes').insert({ product_id: productId, user_id: userIdToUse });
                     } else {
                         await supabase.from('product_likes').delete().eq('product_id', productId).eq('user_id', userIdToUse);
                     }
                } else {
                    throw error;
                }
            } else if (typeof isLikedDB === 'boolean' && isLikedDB !== newIsLiked) {
                 // 3. Verificación de Integridad (solo si RPC funcionó y devolvió boolean)
                console.warn("Sincronizando estado de like con servidor...");
                const correctedFavs = new Set(newFavorites);
                if (isLikedDB) correctedFavs.add(productId);
                else correctedFavs.delete(productId);
                setFavorites(correctedFavs);
                
                setLikeCounts(prev => ({ 
                    ...prev, 
                    [productId]: isLikedDB ? prevCount + 1 : Math.max(0, prevCount - 1)
                }));
            }

        } catch (error: any) {
            console.error("Error al actualizar like:", error.message || error);
            // Rollback
            const rollbackFavs = new Set(favorites);
            if (wasLiked) rollbackFavs.add(productId);
            else rollbackFavs.delete(productId);
            setFavorites(rollbackFavs);
            setLikeCounts(prev => ({ ...prev, [productId]: prevCount }));
            
            if (error?.code === '42P01') {
                alert("La funcionalidad de Likes requiere configuración en la base de datos (tabla 'product_likes').");
            }
        }
    };

    const toggleShareMenu = (e: React.MouseEvent, productId: string) => {
        e.stopPropagation();
        if (activeShareId === productId) {
            setActiveShareId(null);
        } else {
            setActiveShareId(productId);
        }
    };

    const handleShareAction = (e: React.MouseEvent, platform: 'whatsapp' | 'facebook' | 'instagram' | 'copy', product: Product) => {
        e.stopPropagation();
        e.preventDefault();
        setActiveShareId(null);

        const text = `¡Mira este producto! ${product.name} a solo ${formatCurrency(product.price)}.`;
        const url = window.location.href; 
        
        const encodedText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(url);

        if (platform === 'whatsapp') {
            window.open(`https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'facebook') {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'instagram') {
             // Instagram no tiene API directa de compartir texto/link desde web fácilmente, redirigimos al home o perfil
             window.open(`https://www.instagram.com/`, '_blank', 'noopener,noreferrer');
        } else if (platform === 'copy') {
            navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                alert("Enlace copiado al portapapeles.");
            }).catch(err => console.error(err));
        }
    };

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {activeShareId && (
                <div 
                    style={{position: 'fixed', inset: 0, zIndex: 30}} 
                    onClick={() => setActiveShareId(null)}
                />
            )}

            <div style={{
                background: 'white', 
                padding: '1.5rem', 
                borderRadius: '1rem', 
                boxShadow: 'var(--shadow-sm)', 
                marginBottom: '2rem', 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <h2 style={{margin: 0, fontSize: '1.5rem', color: '#1e293b'}}>
                        <i className="fa-solid fa-store" style={{marginRight: '10px', color: 'var(--bg-gradient-cyan)'}}></i>
                        Catálogo Digital
                    </h2>
                    <p style={{margin: '0.25rem 0 0', color: '#64748b'}}>Explora nuestros productos disponibles</p>
                </div>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end'}}>
                    <div className="searchable-select-container" style={{width: '100%', maxWidth: '350px'}}>
                        <div className="search-input-wrapper">
                            <i className="fa-solid fa-magnifying-glass" style={{position: 'absolute', left: '12px', color: 'var(--text-muted)'}}></i>
                            <input 
                                type="text" 
                                placeholder="Buscar productos..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                style={{
                                    width: '100%', 
                                    padding: '0.75rem 0.75rem 0.75rem 2.5rem', 
                                    borderRadius: 'var(--radius-md)', 
                                    border: '1px solid var(--border-color)',
                                    fontSize: '1rem'
                                }} 
                            />
                        </div>
                    </div>
                    
                    {/* Botón Carrito */}
                    <button 
                        onClick={onOpenCart}
                        style={{
                            position: 'relative',
                            background: 'var(--primary-color)',
                            color: 'var(--primary-text)',
                            border: 'none',
                            borderRadius: '0.75rem',
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-md)',
                            fontSize: '1.2rem',
                            transition: 'transform 0.1s'
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <i className="fa-solid fa-cart-shopping"></i>
                        {cartCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                minWidth: '20px',
                                height: '20px',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 4px',
                                border: '2px solid white'
                            }}>
                                {cartCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="empty-state">
                    <i className="fa-solid fa-store-slash" style={{fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem'}}></i>
                    <h2>No se encontraron productos</h2>
                    <p>Intenta con otra búsqueda.</p>
                </div>
            ) : (
                <div className="product-grid">
                    {filteredProducts.map(p => {
                        const isLiked = favorites.has(p.id);
                        const likeCount = likeCounts[p.id] || 0;
                        const isShareOpen = activeShareId === p.id;

                        let stockClass = 'stock-ok';
                        let stockText = 'Disponible';
                        
                        if (p.current_stock === 0) {
                            stockClass = 'stock-out';
                            stockText = 'Agotado!';
                        } else if (p.current_stock <= 10) {
                            stockClass = 'stock-low';
                            stockText = '¡Últimas!';
                        }

                        // Calcular si es "Novedad" (<= 14 días)
                        const createdDate = new Date(p.created_at);
                        const now = new Date();
                        const diffTime = Math.abs(now.getTime() - createdDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const isNew = diffDays <= 14;

                        return (
                            <div key={p.id} className="product-card" onClick={() => onProductClick(p)} style={{overflow: 'visible'}}>
                                <div className="image-container" style={{position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0'}}>
                                    <span className={`stock-badge ${stockClass}`} style={{
                                        position: 'absolute',
                                        top: '12px',
                                        left: '12px',
                                        zIndex: 10,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                        fontSize: '0.9rem',
                                        padding: '0.4rem 1rem',
                                        fontWeight: '600'
                                    }}>
                                        {stockText}
                                    </span>

                                    {/* Etiqueta de Novedad */}
                                    {isNew && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '12px',
                                            right: '12px',
                                            zIndex: 10,
                                            background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)', // Degradado Violeta a Fucsia
                                            color: 'white',
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            padding: '0.35rem 0.8rem',
                                            borderRadius: '99px',
                                            boxShadow: '0 4px 10px rgba(139, 92, 246, 0.4)',
                                            letterSpacing: '0.05em',
                                            textTransform: 'uppercase',
                                            border: '1px solid rgba(255,255,255,0.3)'
                                        }}>
                                            ✨ Novedad
                                        </span>
                                    )}

                                    <img src={p.image_urls?.[0] || 'https://placehold.co/600x400/f1f5f9/94a3b8?text=Sin+Imagen'} alt={p.name} />
                                </div>
                                <div className="product-card-content">
                                    <h3 style={{marginBottom: '0.5rem', fontSize: '1.1rem'}}>{p.name}</h3>
                                    <p style={{
                                        fontSize: '0.9rem', 
                                        marginBottom: '1rem', 
                                        color: 'var(--text-secondary)',
                                        lineHeight: '1.5',
                                        
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {p.description}
                                    </p>
                                    
                                    <div className="card-footer" style={{marginTop: 'auto', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                        
                                        <span className="price-tag" style={{fontSize: '1.2rem'}}>{formatCurrency(p.price)}</span>
                                        
                                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                            {/* BOTÓN DE LIKE (CORAZÓN) */}
                                            <button 
                                                onClick={(e) => toggleFavorite(e, p.id)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    cursor: 'pointer',
                                                    // Color ROJO (#ef4444) si tiene like, gris (#cbd5e1) si no
                                                    color: isLiked ? '#ef4444' : '#cbd5e1',
                                                    padding: '4px',
                                                    transition: 'transform 0.1s'
                                                }}
                                                title={isLiked ? "Ya no me gusta" : "Me gusta"}
                                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
                                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                {/* Icono Corazón: Solid si tiene like, Regular (borde) si no */}
                                                <i className={`${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart`} style={{fontSize: '1.3rem'}}></i>
                                                <span style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)'}}>
                                                    {isLoadingLikes && likeCount === 0 ? '-' : likeCount}
                                                </span>
                                            </button>

                                            <div style={{position: 'relative'}}>
                                                <button 
                                                    onClick={(e) => toggleShareMenu(e, p.id)}
                                                    style={{
                                                        background: 'var(--input-bg)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '50%',
                                                        width: '32px',
                                                        height: '32px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-secondary)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    className="share-btn-trigger"
                                                    title="Compartir"
                                                >
                                                    <IoShareSocialOutline style={{ fontSize: '1.2rem' }} />
                                                </button>

                                                {isShareOpen && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: '100%',
                                                        right: '-10px',
                                                        marginBottom: '10px',
                                                        background: 'white',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                                        padding: '0.5rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.25rem',
                                                        zIndex: 40,
                                                        minWidth: '140px',
                                                        border: '1px solid var(--border-color)',
                                                        animation: 'fadeIn 0.2s'
                                                    }}>
                                                        <button className="share-menu-item" onClick={(e) => handleShareAction(e, 'whatsapp', p)} style={shareItemStyle}>
                                                            <i className="fa-brands fa-whatsapp" style={{color: '#25D366', width: '20px'}}></i> WhatsApp
                                                        </button>
                                                        <button className="share-menu-item" onClick={(e) => handleShareAction(e, 'instagram', p)} style={shareItemStyle}>
                                                            <i className="fa-brands fa-instagram" style={{color: '#E1306C', width: '20px'}}></i> Instagram
                                                        </button>
                                                        <button className="share-menu-item" onClick={(e) => handleShareAction(e, 'facebook', p)} style={shareItemStyle}>
                                                            <i className="fa-brands fa-facebook" style={{color: '#1877F2', width: '20px'}}></i> Facebook
                                                        </button>
                                                        <div style={{height: '1px', background: 'var(--border-color)', margin: '0.25rem 0'}}></div>
                                                        <button className="share-menu-item" onClick={(e) => handleShareAction(e, 'copy', p)} style={shareItemStyle}>
                                                            <i className="fa-solid fa-link" style={{color: 'var(--text-secondary)', width: '20px'}}></i> Copiar Link
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const shareItemStyle = {
    background: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: 'var(--text-main)',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    transition: 'background 0.2s'
};
