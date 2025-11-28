import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, CartItem, Coupon } from '../../types';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
interface SaleModalProps {
onClose: () => void;
onSuccess: () => void;
products: Product[];
coupons: Coupon[];
}
export const SaleModal: React.FC<SaleModalProps> = ({ onClose, onSuccess, products, coupons }) => {
// Cart and header state
const [items, setItems] = useState<CartItem[]>([]);
const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
const [invoiceNumber, setInvoiceNumber] = useState('');
const [paymentMethod, setPaymentMethod] = useState('Efectivo');
const [cardBank, setCardBank] = useState('');
const [cardInstallments, setCardInstallments] = useState('');
// Discount/Coupon state
const [couponCode, setCouponCode] = useState('');
const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
const [couponError, setCouponError] = useState('');
const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

// State for adding new items
const [productId, setProductId] = useState('');
const [quantity, setQuantity] = useState('1');
const [unitPrice, setUnitPrice] = useState('');

// UI State
const [isSaving, setIsSaving] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
const [showDropdown, setShowDropdown] = useState(false);
const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

// New: Product Picker Modal State
const [showProductPicker, setShowProductPicker] = useState(false);
const [pickerSearch, setPickerSearch] = useState('');

// New: Coupon Picker Modal State
const [showCouponPicker, setShowCouponPicker] = useState(false);

useEffect(() => {
    if (!searchTerm) {
        setFilteredProducts([]);
        return;
    }
    const term = searchTerm.toLowerCase();
    const results = products.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.material_code.toString().includes(term)
    );
    setFilteredProducts(results);
}, [searchTerm, products]);

useEffect(() => {
    if (productId) {
        const prod = products.find(p => p.id === productId);
        if (prod) {
            setUnitPrice(prod.price.toString());
        }
    } else {
        setUnitPrice('');
    }
}, [productId, products]);

const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setShowDropdown(true);
    if (productId) setProductId(''); 
};

const handleSelectProduct = (product: Product) => {
    setProductId(product.id);
    setSearchTerm(product.name); 
    setUnitPrice(product.price.toString());
    setShowDropdown(false);
    setShowProductPicker(false); // Close picker if open
};

const handleSelectCoupon = (coupon: Coupon) => {
    setCouponCode(coupon.code);
    setShowCouponPicker(false);
    // Automatically validate after selection
    setTimeout(() => validateCoupon(coupon.code), 100);
};

const addItem = () => {
    // Ensure productId is set. If not set but searchTerm matches exactly one product or code, try to find it.
    let targetProductId = productId;
    
    if (!targetProductId && searchTerm) {
         const exactMatch = products.find(p => 
            p.name.toLowerCase() === searchTerm.toLowerCase() || 
            p.material_code.toString() === searchTerm
        );
        if (exactMatch) {
            targetProductId = exactMatch.id;
        }
    }

    if (!targetProductId) {
        // If still no product ID, maybe user clicked + without selecting from dropdown but typed something valid?
        // For now, require explicit selection or valid ID
        return; 
    }

    if (!quantity || !unitPrice) return;
    
    const product = products.find(p => p.id === targetProductId);
    if (!product) return;

    if (parseInt(quantity) > product.current_stock) {
        alert(`Stock insuficiente para "${product.name}". Disponible: ${product.current_stock}`);
        return;
    }
    
    const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        materialCode: product.material_code,
        quantity: parseInt(quantity),
        unitPrice: parseFloat(unitPrice)
    };
    
    setItems([...items, newItem]);
    
    // Reset inputs
    setProductId('');
    setSearchTerm('');
    setQuantity('1');
    setUnitPrice('');
};

const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
};

const validateCoupon = async (codeToValidate: string = couponCode) => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!codeToValidate) return;

    setIsApplyingCoupon(true);
    try {
        // Use local coupons list if available to avoid extra DB call, or fetch if needed.
        // Since we pass 'coupons' prop which are all coupons, we can search there first.
        // However, the prop might not be fully up to date with specific relation data if not fetched with join.
        // Let's stick to DB call to be safe and get fresh status.
        const { data: coupon, error } = await supabase
            .from('coupons')
            .select('*, products(name, material_code)')
            .eq('code', codeToValidate)
            .single();

        if (error || !coupon) throw new Error("Cupón no encontrado o inválido.");

        // Basic validation
        if (coupon.status !== 'Activo') throw new Error(`El cupón está ${coupon.status.toLowerCase()}.`);
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const validFromDate = new Date(coupon.valid_from + "T00:00:00");
        const validUntilDate = new Date(coupon.valid_until + "T23:59:59");

        if (validFromDate > today) throw new Error("El cupón aún no es válido.");
        if (validUntilDate < today) throw new Error("El cupón ha expirado.");
        
        if (coupon.max_uses_total !== null && coupon.current_uses >= coupon.max_uses_total) throw new Error("El cupón ha agotado su límite de usos.");

        // Check min purchase amount
        const currentSubtotal = items.reduce((sum, item) => sum + (item.quantity * (item.unitPrice || 0)), 0);
        if (coupon.min_purchase_amount !== null && currentSubtotal < coupon.min_purchase_amount) {
            throw new Error(`Monto mínimo de compra de ${formatCurrency(coupon.min_purchase_amount)} no alcanzado.`);
        }

        // Check product specific
        if (coupon.applies_to_product_id && !items.some(item => item.productId === coupon.applies_to_product_id)) {
            throw new Error(`El cupón solo aplica para ${coupon.products?.name}.`);
        }

        // Check payment method
        if (coupon.valid_payment_methods && coupon.valid_payment_methods.length > 0 && !coupon.valid_payment_methods.includes(paymentMethod)) {
            throw new Error(`El cupón no es válido con el medio de pago "${paymentMethod}".`);
        }

        // Check days of week
        if (coupon.valid_days_of_week && coupon.valid_days_of_week.length > 0) {
            const todayDay = new Date().getDay();
            if (!coupon.valid_days_of_week.includes(todayDay)) {
                throw new Error("El cupón no es válido para hoy.");
            }
        }
        
        setAppliedCoupon(coupon);
        setCouponCode(coupon.code); // Ensure input matches validated code
        setCouponError('');
    } catch (error: any) {
        setCouponError(error.message);
        setAppliedCoupon(null);
    } finally {
        setIsApplyingCoupon(false);
    }
};

const removeCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
};

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
        alert("Agregue al menos un producto a la venta.");
        return;
    }
    
    setIsSaving(true);
    
    const subtotal = items.reduce((acc, item) => acc + (item.quantity * (item.unitPrice || 0)), 0);
    
    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.discount_type === 'fixed' 
            ? appliedCoupon.discount_value
            : subtotal * (appliedCoupon.discount_value / 100);
        discountAmount = Math.min(discountAmount, subtotal);
    }
    
    const itemsPayload = items.map(item => {
        const itemSubtotal = item.quantity * (item.unitPrice || 0);
        const proratedDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * discountAmount : 0;
        const finalItemTotal = itemSubtotal - proratedDiscount;
        const finalUnitPrice = item.quantity > 0 ? finalItemTotal / item.quantity : 0;
        
        return {
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: finalUnitPrice
        };
    });

    try {
        const { error } = await supabase.rpc('register_bulk_sale', {
            p_sale_date: saleDate,
            p_invoice_number: invoiceNumber,
            p_payment_method: paymentMethod,
            p_card_bank: paymentMethod === 'Tarjeta' ? cardBank : null,
            p_card_installments: paymentMethod === 'Tarjeta' ? parseInt(cardInstallments) || 1 : null,
            p_items: itemsPayload
        });

        if (error) throw error;

        if (appliedCoupon) {
            await supabase.from('coupons').update({ current_uses: appliedCoupon.current_uses + 1 }).eq('id', appliedCoupon.id);
        }
        
        onSuccess();
        onClose();

    } catch (error: any) {
        console.error("Error al registrar la venta:", error);
        alert("Error al registrar la venta: " + error.message);
    } finally {
        setIsSaving(false);
    }
};

const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.unitPrice || 0)), 0);
let discountValueDisplay = 0;
if (appliedCoupon) {
    discountValueDisplay = appliedCoupon.discount_type === 'fixed' 
        ? appliedCoupon.discount_value
        : subtotal * (appliedCoupon.discount_value / 100);
    discountValueDisplay = Math.min(discountValueDisplay, subtotal);
}
const total = subtotal - discountValueDisplay;

// Filter products for the Picker Modal
const pickerProducts = products.filter(p => {
    if (!pickerSearch) return true;
    const term = pickerSearch.toLowerCase();
    return p.name.toLowerCase().includes(term) || p.material_code.toString().includes(term);
});

// Filter ACTIVE coupons for the Coupon Picker Modal
const activeCoupons = coupons.filter(c => {
    if (c.status !== 'Activo') return false;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const validUntilDate = new Date(c.valid_until + "T23:59:59");

    return validUntilDate >= today;
});

return (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{height: '90vh', maxHeight: '900px', display:'flex', flexDirection:'column'}}>
            
            {/* --- Main Sale Form --- */}
            {!showProductPicker && !showCouponPicker && (
                <>
                    <div className="modal-header">
                        <div>
                            <h2>Registrar Venta</h2>
                            <span className="modal-subtitle">Nueva transacción de salida</span>
                        </div>
                        <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="modal-form" style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
                        <div className="modal-body-layout single-column" style={{overflowY:'auto', flex:1, padding:'1.5rem'}}>
                            
                            {/* Header Section */}
                            <div className="form-section" style={{background: 'var(--surface-color)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)'}}>
                                <div className="form-row three-col">
                                    <div className="form-group">
                                        <label><i className="fa-regular fa-calendar" style={{marginRight:'5px'}}></i> Fecha</label>
                                        <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label><i className="fa-solid fa-hashtag" style={{marginRight:'5px'}}></i> Nº Factura</label>
                                        <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Opcional" />
                                    </div>
                                    <div className="form-group">
                                        <label><i className="fa-solid fa-wallet" style={{marginRight:'5px'}}></i> Pago</label>
                                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Tarjeta">Tarjeta</option>
                                            <option value="QR">QR</option>
                                        </select>
                                    </div>
                                </div>
                                {paymentMethod === 'Tarjeta' && (
                                    <div className="form-row" style={{marginTop:'1rem', paddingTop:'1rem', borderTop:'1px dashed var(--border-color)'}}>
                                        <div className="form-group">
                                            <label>Banco / Entidad</label>
                                            <input type="text" value={cardBank} onChange={e => setCardBank(e.target.value)} placeholder="Ej: Visa Galicia" />
                                        </div>
                                        <div className="form-group">
                                            <label>Cuotas</label>
                                            <input type="number" min="1" value={cardInstallments} onChange={e => setCardInstallments(e.target.value)} placeholder="1" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Product Selection Bar */}
                            <div style={{display: 'grid', gridTemplateColumns: '1fr auto 100px 120px auto', gap: '0.75rem', alignItems: 'end', background: 'white', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--bg-gradient-blue)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginTop:'1rem', position:'sticky', top:0, zIndex:10}}>
                                <div className="form-group" style={{marginBottom: 0}}>
                                    <label style={{fontSize:'0.75rem', marginBottom:'4px'}}>Producto</label>
                                    <div className="searchable-select-container">
                                        <div className="search-input-wrapper">
                                            <i className="fa-solid fa-magnifying-glass" style={{position:'absolute', left:'12px', color:'var(--text-muted)'}}></i>
                                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={handleSearchChange} onFocus={() => setShowDropdown(true)} style={{paddingLeft:'36px'}} />
                                        </div>
                                        {showDropdown && searchTerm && (
                                            <ul className="search-dropdown">
                                                {filteredProducts.map(p => (
                                                    <li key={p.id} className="search-result-item" onClick={() => handleSelectProduct(p)}>
                                                        <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                                            <img src={p.image_urls?.[0] || 'https://placehold.co/40x40'} alt="" style={{width:'32px', height:'32px', borderRadius:'4px', objectFit:'cover'}} />
                                                            <div style={{display:'flex', flexDirection:'column'}}>
                                                                <span className="search-item-name">{p.name}</span>
                                                                <span style={{fontSize: '0.75rem', color:'var(--text-secondary)'}}>#{p.material_code}</span>
                                                            </div>
                                                        </div>
                                                        <span className={`stock-badge ${p.current_stock > 0 ? 'stock-ok' : 'stock-out'}`} style={{fontSize:'0.7rem', padding:'2px 6px'}}>Stock: {p.current_stock}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                                
                                <button type="button" className="btn btn-secondary" onClick={() => setShowProductPicker(true)} style={{padding:'0.875rem', height:'46px'}} title="Ver Catálogo Completo">
                                    <i className="fa-solid fa-list-ul"></i>
                                </button>

                                <div className="form-group" style={{marginBottom: 0}}>
                                    <label style={{fontSize:'0.75rem', marginBottom:'4px'}}>Cant.</label>
                                    <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} style={{textAlign:'center'}} />
                                </div>
                                <div className="form-group" style={{marginBottom: 0}}>
                                    <label style={{fontSize:'0.75rem', marginBottom:'4px'}}>Precio ($)</label>
                                    <input type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
                                </div>
                                <button type="button" className="btn btn-primary" onClick={addItem} style={{height:'46px', padding:'0 1.5rem'}}>
                                    <i className="fa-solid fa-plus"></i>
                                </button>
                            </div>

                            {/* Cart Items Table */}
                            <div className="items-table-container" style={{marginTop:'1.5rem', background:'white', minHeight:'200px'}}>
                                <table className="items-table">
                                    <thead><tr><th style={{width:'60px'}}></th><th>Producto</th><th style={{textAlign:'center'}}>Cant.</th><th style={{textAlign:'right'}}>Precio Unit.</th><th style={{textAlign:'right'}}>Subtotal</th><th style={{width:'40px'}}></th></tr></thead>
                                    <tbody>
                                        {items.length === 0 ? (
                                            <tr><td colSpan={6} style={{textAlign:'center', padding:'3rem', color:'var(--text-muted)'}}><i className="fa-solid fa-basket-shopping" style={{fontSize:'2rem', marginBottom:'0.5rem', display:'block'}}></i>Carrito vacío</td></tr>
                                        ) : (
                                            items.map((item, idx) => {
                                                const prod = products.find(p => p.id === item.productId);
                                                return (
                                                    <tr key={idx}>
                                                        <td><img src={prod?.image_urls?.[0] || 'https://placehold.co/40x40'} alt="" style={{width:'40px', height:'40px', borderRadius:'6px', objectFit:'cover', border:'1px solid var(--border-color)'}} /></td>
                                                        <td>
                                                            <div style={{fontWeight:600, color:'var(--text-main)'}}>{item.productName}</div>
                                                            <div style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}>#{item.materialCode}</div>
                                                        </td>
                                                        <td style={{textAlign:'center'}}>{formatNumber(item.quantity)}</td>
                                                        <td style={{textAlign:'right'}}>{formatCurrency(item.unitPrice || 0)}</td>
                                                        <td style={{textAlign:'right', fontWeight:600}}>{formatCurrency(item.quantity * (item.unitPrice || 0))}</td>
                                                        <td><button type="button" className="remove-btn" onClick={() => removeItem(idx)}><i className="fa-solid fa-trash"></i></button></td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer: Coupon & Totals */}
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem', marginTop:'1.5rem'}}>
                                {/* Coupon Section */}
                                <div style={{background: 'var(--surface-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'}}>
                                    <label style={{display:'block', marginBottom:'0.75rem', fontWeight:700, color:'var(--text-secondary)', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em'}}><i className="fa-solid fa-ticket" style={{marginRight:'5px'}}></i> Cupón de Descuento</label>
                                    <div style={{display:'flex', gap:'0.5rem'}}>
                                        <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} 
                                            placeholder="CÓDIGO" style={{flex:1, textTransform:'uppercase', fontWeight:600}} disabled={!!appliedCoupon} />
                                        {!appliedCoupon ? (
                                            <>
                                                <button type="button" className="btn btn-secondary" onClick={() => setShowCouponPicker(true)} title="Ver Cupones Activos">
                                                    <i className="fa-solid fa-tags"></i>
                                                </button>
                                                <button type="button" className="btn btn-primary" onClick={() => validateCoupon()} disabled={!couponCode || isApplyingCoupon} style={{minWidth: '80px'}}>
                                                    {isApplyingCoupon ? '...' : 'Aplicar'}
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" className="btn btn-secondary" onClick={removeCoupon} style={{background:'#fee2e2', color:'#991b1b', border:'1px solid #fecaca'}}>
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                    {couponError && <p style={{color: 'var(--error-color)', fontSize: '0.85rem', marginTop: '0.5rem', display:'flex', alignItems:'center', gap:'5px'}}><i className="fa-solid fa-circle-exclamation"></i> {couponError}</p>}
                                    {appliedCoupon && (
                                        <div style={{marginTop:'1rem', padding:'0.75rem', background:'#ecfdf5', borderRadius:'6px', border:'1px solid #d1fae5', color:'#065f46', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                            <i className="fa-solid fa-circle-check"></i>
                                            <div>
                                                <span style={{fontWeight:700}}>{appliedCoupon.campaign_name}</span>
                                                <div style={{fontSize:'0.8rem'}}>Ahorras: {appliedCoupon.discount_type === 'fixed' ? formatCurrency(appliedCoupon.discount_value) : `${appliedCoupon.discount_value}%`}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Totals Section */}
                                <div className="sale-summary" style={{margin:0, maxWidth:'100%', background:'white', border:'1px solid var(--bg-gradient-cyan)', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.05)'}}>
                                    <div className="summary-row">
                                        <span className="label">Subtotal</span>
                                        <span className="value">{formatCurrency(subtotal)}</span>
                                    </div>
                                    <div className="summary-row">
                                        <span className="label">Descuento</span>
                                        <span className="value" style={{color: appliedCoupon ? 'var(--success-color)' : 'var(--text-muted)'}}>
                                            {appliedCoupon ? `-${formatCurrency(discountValueDisplay)}` : '$ 0,00'}
                                        </span>
                                    </div>
                                    <div className="summary-row summary-total" style={{borderTop:'2px dashed var(--border-color)', marginTop:'0.5rem', paddingTop:'1rem'}}>
                                        <span className="label" style={{fontSize:'1.1rem', color:'var(--text-main)'}}>Total a Pagar</span>
                                        <span className="value" style={{fontSize:'1.8rem'}}>{formatCurrency(total)}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving || items.length === 0} style={{padding:'0.75rem 2rem', fontSize:'1rem'}}>
                                {isSaving ? 'Procesando...' : <span><i className="fa-solid fa-check"></i> Finalizar Venta</span>}
                            </button>
                        </div>
                    </form>
                </>
            )}

            {/* --- Product Picker Overlay (Inner Modal) --- */}
            {showProductPicker && (
                <div style={{display:'flex', flexDirection:'column', height:'100%', background:'white', animation:'fadeIn 0.2s'}}>
                    <div className="modal-header" style={{background:'var(--surface-color)'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'1rem', width:'100%'}}>
                            <button onClick={() => setShowProductPicker(false)} className="btn btn-secondary btn-sm"><i className="fa-solid fa-arrow-left"></i> Volver</button>
                            <div style={{flex:1, position:'relative'}}>
                                <i className="fa-solid fa-search" style={{position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)'}}></i>
                                <input type="text" placeholder="Buscar por nombre, código..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} autoFocus 
                                       style={{width:'100%', paddingLeft:'36px', height:'40px', borderRadius:'99px'}} />
                            </div>
                        </div>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'1rem'}}>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'1rem'}}>
                            {pickerProducts.map(p => (
                                <div key={p.id} onClick={() => handleSelectProduct(p)} 
                                     style={{
                                         border:'1px solid var(--border-color)', borderRadius:'var(--radius-md)', overflow:'hidden', cursor:'pointer', 
                                         transition:'all 0.2s', background:'white', display:'flex', flexDirection:'column'
                                     }}
                                     onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--bg-gradient-blue)'}
                                     onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                >
                                    <div style={{height:'140px', background:'var(--input-bg)', position:'relative'}}>
                                        <img src={p.image_urls?.[0] || 'https://placehold.co/200x140?text=Producto'} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                                        <div style={{position:'absolute', top:'8px', right:'8px', background:'rgba(0,0,0,0.7)', color:'white', fontSize:'0.7rem', padding:'2px 6px', borderRadius:'4px'}}>
                                            #{p.material_code}
                                        </div>
                                    </div>
                                    <div style={{padding:'0.75rem', display:'flex', flexDirection:'column', flex:1}}>
                                        <div style={{fontWeight:600, fontSize:'0.9rem', marginBottom:'0.25rem', lineHeight:1.2}}>{p.name}</div>
                                        <div style={{marginTop:'auto', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <div style={{fontWeight:700, color:'var(--bg-gradient-blue)'}}>{formatCurrency(p.price)}</div>
                                            <div style={{fontSize:'0.75rem', color: p.current_stock > 0 ? 'var(--success-color)' : 'var(--error-color)', background: p.current_stock > 0 ? '#dcfce7' : '#fee2e2', padding:'2px 6px', borderRadius:'4px'}}>
                                                Stock: {p.current_stock}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {pickerProducts.length === 0 && (
                                <div style={{gridColumn:'1 / -1', textAlign:'center', padding:'3rem', color:'var(--text-muted)'}}>
                                    No se encontraron productos.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Coupon Picker Overlay (Inner Modal) --- */}
            {showCouponPicker && (
                <div style={{display:'flex', flexDirection:'column', height:'100%', background:'white', animation:'fadeIn 0.2s'}}>
                    <div className="modal-header" style={{background:'var(--surface-color)'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'1rem', width:'100%'}}>
                            <button onClick={() => setShowCouponPicker(false)} className="btn btn-secondary btn-sm"><i className="fa-solid fa-arrow-left"></i> Volver</button>
                            <h3>Cupones Activos</h3>
                        </div>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:'1rem'}}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
                            {activeCoupons.map(c => (
                                <div key={c.id} onClick={() => handleSelectCoupon(c)} 
                                     style={{
                                         border:'1px solid var(--border-color)', borderRadius:'var(--radius-md)', padding:'1rem', cursor:'pointer',
                                         background:'white', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'all 0.2s'
                                     }}
                                     onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--bg-gradient-blue)'}
                                     onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                >
                                    <div>
                                        <div style={{fontWeight:700, color:'var(--text-main)'}}>{c.campaign_name}</div>
                                        <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>
                                            {c.discount_type === 'percent' ? `${c.discount_value}%` : formatCurrency(c.discount_value)} de descuento
                                        </div>
                                        <div style={{fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'0.25rem'}}>
                                            Vence: {formatDate(c.valid_until)}
                                        </div>
                                    </div>
                                    <div style={{background:'#dbeafe', color:'#1e3a8a', padding:'0.5rem 1rem', borderRadius:'6px', fontWeight:600, fontFamily:'monospace'}}>
                                        {c.code}
                                    </div>
                                </div>
                            ))}
                            {activeCoupons.length === 0 && (
                                <div style={{gridColumn:'1 / -1', textAlign:'center', padding:'3rem', color:'var(--text-muted)'}}>
                                    No hay cupones activos disponibles.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
);
};