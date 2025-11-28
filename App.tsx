
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { Product, Supplier, Batch, Sale, Coupon } from './types';
import { formatCurrency, formatDate, formatNumber, REPUTATION_LEVELS } from './utils/formatters';
import { ReputationStars } from './components/common/ReputationStars';
import { ProductManagementModal } from './components/products/ProductManagementModal';
import { SupplierManagementModal } from './components/suppliers/SupplierManagementModal';
import { PurchaseModal } from './components/purchases/PurchaseModal';
import { SaleModal } from './components/sales/SaleModal';
import { CouponManagementModal } from './components/coupons/CouponManagementModal';
import { CouponTable } from './components/coupons/CouponTable';


const ProductCard: React.FC<{ product: Product, onClick: (p: Product) => void }> = ({ product, onClick }) => {
    let stockClass = 'stock-ok';
    let stockText = 'Disponible';
    if (product.current_stock === 0) {
        stockClass = 'stock-out';
        stockText = 'Agotado';
    } else if (product.current_stock <= product.min_stock) {
        stockClass = 'stock-low';
        stockText = 'Bajo Stock';
    }

    return (
        <div className="product-card" onClick={() => onClick(product)}>
            <div className="image-container">
                <div className="material-code-badge">#{product.material_code}</div>
                <img src={product.image_urls?.[0] || 'https://placehold.co/600x400/f1f5f9/94a3b8?text=Sin+Imagen'} alt={product.name} />
            </div>
            <div className="product-card-content">
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <div className="card-footer">
                    <span className="price-tag">{formatCurrency(product.price)}</span>
                    <span className={`stock-badge ${stockClass}`} style={{fontSize: '0.75rem', padding: '0.25rem 0.6rem'}}>
                        {stockText}: {product.current_stock}
                    </span>
                </div>
            </div>
        </div>
    );
};

const ProductTable: React.FC<{ products: Product[], onClick: (p: Product) => void }> = ({ products, onClick }) => (
    <div className="table-container">
        <table className="product-table">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Cód. Material</th>
                    <th>Stock</th>
                    <th>Precio</th>
                </tr>
            </thead>
            <tbody>
                {products.map(p => {
                    let stockClass = 'stock-ok';
                    let stockText = 'Disponible';
                    if (p.current_stock === 0) {
                        stockClass = 'stock-out';
                        stockText = 'Agotado';
                    } else if (p.current_stock <= p.min_stock) {
                        stockClass = 'stock-low';
                        stockText = 'Bajo';
                    }
                    return (
                        <tr key={p.id} onClick={() => onClick(p)}>
                            <td>
                                <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                                    <img src={p.image_urls?.[0] || 'https://placehold.co/48x48/f1f5f9/94a3b8?text=IMG'} className="table-thumb" alt="" />
                                    <div>
                                        <span className="table-name">{p.name}</span>
                                        <div className="table-desc">{p.description}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span className="table-code">#{p.material_code}</span></td>
                            {/* Fix: Use 'p.current_stock' instead of 'product.current_stock' */}
                            <td><span className={`stock-badge ${stockClass}`}>{stockText}: {p.current_stock}</span></td>
                            <td><span className="price-tag-sm">{formatCurrency(p.price)}</span></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const SupplierCard: React.FC<{ supplier: Supplier, onClick: (s: Supplier) => void }> = ({ supplier, onClick }) => (
    <div className="product-card" onClick={() => onClick(supplier)} style={{ minHeight: 'auto' }}>
        <div className="product-card-content">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
                <h3 style={{margin: 0, fontSize: '1.25rem', lineHeight: 1.2}}>{supplier.name}</h3>
                <span className={`status-badge status-${supplier.status.toLowerCase()}`} style={{fontSize: '0.7rem', padding: '0.2rem 0.75rem', marginLeft: '0.5rem', whiteSpace: 'nowrap'}}>{supplier.status}</span>
            </div>
                        
            <div className="reputation-tooltip-wrapper" style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem'}}>
                <ReputationStars level={supplier.reputation} />
                <span style={{fontSize: '0.8rem', fontWeight: 600, color: REPUTATION_LEVELS[supplier.reputation || 3]?.color}}>
                    {REPUTATION_LEVELS[supplier.reputation || 3]?.label}
                </span>
                <div className="reputation-tooltip">
                    {(() => {
                        const level = supplier.reputation || 3;
                        const rep = REPUTATION_LEVELS[level];

                        if (!rep) return null;

                        return (
                            <>
                                <h4>Reputación actual</h4>
                                <div style={{ borderLeft: `3px solid ${rep.color}`, paddingLeft: '0.5rem' }}>
                                    <strong style={{ color: rep.color }}>
                                        {level} - {rep.label}
                                    </strong>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                                        {rep.desc}
                                    </p>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>

            <div style={{marginTop: 'auto'}}>
                <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center'}}>
                    <i className="fa-solid fa-location-dot" style={{marginRight: '0.75rem', color: 'var(--text-muted)', width: '16px', textAlign: 'center'}}></i>
                    {[supplier.city, supplier.country].filter(Boolean).join(', ') || 'Sin ubicación'}
                </p>

                {supplier.website ? (
                    <p style={{fontSize: '0.85rem', margin: 0, display: 'flex', alignItems: 'center'}}>
                        <i className="fa-solid fa-link" style={{marginRight: '0.75rem', color: 'var(--text-muted)', width: '16px', textAlign: 'center'}}></i>
                        <a href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 500}}>
                            {supplier.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                    </p>
                ) : (
                     <p style={{fontSize: '0.85rem', margin: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center'}}>
                        <i className="fa-solid fa-link" style={{marginRight: '0.75rem', color: 'var(--text-muted)', width: '16px', textAlign: 'center'}}></i>
                        -
                    </p>
                )}
            </div>
        </div>
    </div>
);

const SupplierTable: React.FC<{ suppliers: Supplier[], onClick: (s: Supplier) => void }> = ({ suppliers, onClick }) => (
    <div className="table-container">
        <table className="product-table">
            <thead>
                <tr>
                    <th>Proveedor</th>
                    <th>ID</th>
                    <th>Reputación</th>
                    <th>Estado</th>
                    <th>Ubicación</th>
                </tr>
            </thead>
            <tbody>
                {suppliers.map(s => (
                    <tr key={s.id} onClick={() => onClick(s)}>
                        <td><span className="table-name">{s.name}</span></td>
                        <td><span className="table-code">V-{s.supplier_code}</span></td>
                        <td>
                            <div className="reputation-tooltip-wrapper" style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                                <ReputationStars level={s.reputation} />
                                <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>{REPUTATION_LEVELS[s.reputation || 3]?.label}</span>
                                <div className="reputation-tooltip">
                                    {(() => {
                                        const level = s.reputation || 3;
                                        const rep = REPUTATION_LEVELS[level];

                                        if (!rep) return null;

                                        return (
                                            <>
                                                <h4>Reputación actual</h4>
                                                <div style={{ borderLeft: `3px solid ${rep.color}`, paddingLeft: '0.5rem' }}>
                                                    <strong style={{ color: rep.color }}>
                                                        {level} - {rep.label}
                                                    </strong>
                                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                                                        {rep.desc}
                                                    </p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </td>
                        <td><span className={`status-badge status-${s.status.toLowerCase()}`}>{s.status}</span></td>
                        <td style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>{[s.city, s.country].filter(Boolean).join(', ')}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);


export const App: React.FC = () => {
    const [currentTab, setCurrentTab] = useState<'products' | 'suppliers' | 'purchases' | 'sales' | 'coupons'>('products');
    const [productsView, setProductsView] = useState<'grid' | 'table'>('grid');
    const [suppliersView, setSuppliersView] = useState<'grid' | 'table'>('grid');

    const [products, setProducts] = useState<Product[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [initialProductData, setInitialProductData] = useState<Partial<Product> | null>(null);
    
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [initialSupplierData, setInitialSupplierData] = useState<Partial<Supplier> | null>(null);

    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
    
    const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

    const fetchData = useCallback(async () => {
        const { data: p } = await supabase.from('products').select(`*, product_suppliers(supplier_id, supplier_material_code, suppliers(name, supplier_code))`).order('created_at', { ascending: false });
        if(p) setProducts(p);
        const { data: s } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
        if(s) setSuppliers(s);
        const { data: b } = await supabase.from('batches').select('*, products(name, material_code), suppliers(name)').order('created_at', { ascending: false });
        if(b) setBatches(b);
        const { data: sl } = await supabase.from('sales').select('*, products(name, material_code)').order('created_at', { ascending: false });
        if(sl) setSales(sl);
        const { data: co } = await supabase.from('coupons').select('*, products(name, material_code)').order('created_at', { ascending: false });
        if(co) setCoupons(co);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleOpenProduct = (p?: Product) => { setEditingProduct(p || null); setInitialProductData(null); setIsProductModalOpen(true); };
    const handleOpenSupplier = (s?: Supplier) => { setEditingSupplier(s || null); setInitialSupplierData(null); setIsSupplierModalOpen(true); };
    const handleOpenCoupon = (c?: Coupon) => { setEditingCoupon(c || null); setIsCouponModalOpen(true); };
    
    const handleOpenProductFromAgent = (data: Partial<Product>) => { setEditingProduct(null); setInitialProductData(data); setIsProductModalOpen(true); };
    const handleOpenSupplierFromAgent = (data: Partial<Supplier>) => { setEditingSupplier(null); setInitialSupplierData(data); setIsSupplierModalOpen(true); };

    return (
        <div className="container">
            <header>
                <div className="header-left"><h1><i className="fa-solid fa-cube"></i> ERP Inventario</h1>
                    <div className="nav-tabs">
                        <button className={`nav-tab ${currentTab === 'products' ? 'active' : ''}`} onClick={() => setCurrentTab('products')}>Inventario</button>
                        <button className={`nav-tab ${currentTab === 'suppliers' ? 'active' : ''}`} onClick={() => setCurrentTab('suppliers')}>Proveedores</button>
                        <button className={`nav-tab ${currentTab === 'purchases' ? 'active' : ''}`} onClick={() => setCurrentTab('purchases')}>Compras</button>
                        <button className={`nav-tab ${currentTab === 'sales' ? 'active' : ''}`} onClick={() => setCurrentTab('sales')}>Ventas</button>
                        <button className={`nav-tab ${currentTab === 'coupons' ? 'active' : ''}`} onClick={() => setCurrentTab('coupons')}>Cupones</button>
                    </div>
                </div>
                <div className="header-actions">
                    {currentTab === 'products' && (
                        <div className="view-controls">
                            <button className={`view-btn ${productsView === 'grid' ? 'active' : ''}`} onClick={() => setProductsView('grid')}><i className="fa-solid fa-border-all"></i></button>
                            <button className={`view-btn ${productsView === 'table' ? 'active' : ''}`} onClick={() => setProductsView('table')}><i className="fa-solid fa-list"></i></button>
                        </div>
                    )}
                    {currentTab === 'suppliers' && (
                        <div className="view-controls">
                            <button className={`view-btn ${suppliersView === 'grid' ? 'active' : ''}`} onClick={() => setSuppliersView('grid')}><i className="fa-solid fa-border-all"></i></button>
                            <button className={`view-btn ${suppliersView === 'table' ? 'active' : ''}`} onClick={() => setSuppliersView('table')}><i className="fa-solid fa-list"></i></button>
                        </div>
                    )}

                    {currentTab === 'products' ? <button className="btn btn-primary" onClick={() => handleOpenProduct()}><i className="fa-solid fa-plus"></i> Nuevo Producto</button> : 
                     currentTab === 'suppliers' ? <button className="btn btn-primary" onClick={() => handleOpenSupplier()}><i className="fa-solid fa-plus"></i> Nuevo Proveedor</button> : 
                     currentTab === 'purchases' ? <button className="btn btn-primary" onClick={() => setIsPurchaseModalOpen(true)}><i className="fa-solid fa-cart-plus"></i> Registrar Compra</button> :
                     currentTab === 'sales' ? <button className="btn btn-primary" onClick={() => setIsSaleModalOpen(true)}><i className="fa-solid fa-cash-register"></i> Registrar Venta</button> :
                     currentTab === 'coupons' ? <button className="btn btn-primary" onClick={() => handleOpenCoupon()}><i className="fa-solid fa-plus"></i> Nuevo Cupón</button> : null}
                </div>
            </header>
            <main>
                {currentTab === 'products' && (
                    productsView === 'grid' 
                        ? (products.length === 0 ? <EmptyState type="productos" onCreate={() => handleOpenProduct()} /> : <div className="product-grid">{products.map(p => <ProductCard key={p.id} product={p} onClick={handleOpenProduct} />)}</div>)
                        : (products.length === 0 ? <EmptyState type="productos" onCreate={() => handleOpenProduct()} /> : <ProductTable products={products} onClick={handleOpenProduct} />)
                )}
                {currentTab === 'suppliers' && (
                    suppliersView === 'grid' 
                        ? (suppliers.length === 0 ? <EmptyState type="proveedores" onCreate={() => handleOpenSupplier()} /> : <div className="product-grid">{suppliers.map(s => <SupplierCard key={s.id} supplier={s} onClick={handleOpenSupplier} />)}</div>)
                        : (suppliers.length === 0 ? <EmptyState type="proveedores" onCreate={() => handleOpenSupplier()} /> : <SupplierTable suppliers={suppliers} onClick={handleOpenSupplier} />)
                )}
                {currentTab === 'purchases' && (
                    batches.length === 0 ? <EmptyState type="compras" onCreate={() => setIsPurchaseModalOpen(true)} /> :
                    <div className="table-container">
                        <table className="product-table">
                            <thead><tr><th>ID</th><th>Producto</th><th>Proveedor</th><th>Factura</th><th>Fecha</th><th>Cant.</th><th>Costo</th></tr></thead>
                            <tbody>
                                {batches.map(b => (
                                    <tr key={b.id}>
                                        <td>L-{b.batch_code}</td><td>{b.products?.name}</td><td>{b.suppliers?.name}</td><td>{b.invoice_number}</td><td>{formatDate(b.purchase_date)}</td><td>{b.quantity}</td><td>{formatCurrency(b.unit_cost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {currentTab === 'sales' && (
                    sales.length === 0 ? <EmptyState type="ventas" onCreate={() => setIsSaleModalOpen(true)} /> :
                    <div className="table-container">
                        <table className="product-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Cód. Material</th>
                                    <th>Producto</th>
                                    <th>Cant.</th>
                                    <th>Precio Un.</th>
                                    <th>Total</th>
                                    <th>Factura</th>
                                    <th>Estado</th>
                                    <th>Pago</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map(s => (
                                    <tr key={s.id}>
                                        <td>{formatDate(s.sale_date)}</td>
                                        <td><span className="table-code">#{s.products?.material_code}</span></td>
                                        <td>{s.products?.name}</td>
                                        <td>{formatNumber(s.quantity)}</td>
                                        <td>{formatCurrency(s.unit_price)}</td>
                                        <td><span className="price-tag-sm">{formatCurrency(s.total_price)}</span></td>
                                        <td>{s.invoice_number || '-'}</td>
                                        <td>
                                            <span className={`status-badge ${s.status === 'Completada' ? 'status-activo' : 'status-inactivo'}`} style={{fontSize:'0.7rem', padding: '0.2rem 0.6rem'}}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td>
                                            {s.payment_method}
                                            {s.payment_method === 'Tarjeta' && s.card_bank && (
                                                <span style={{display:'block', fontSize:'0.7rem', color:'var(--text-secondary)'}}>
                                                    {s.card_bank} ({s.card_installments} cuotas)
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                 {currentTab === 'coupons' && (
                    coupons.length === 0 ? <EmptyState type="cupones" onCreate={() => handleOpenCoupon()} /> :
                    <CouponTable coupons={coupons} onClick={handleOpenCoupon} />
                )}
            </main>
            {isProductModalOpen && <ProductManagementModal onClose={() => setIsProductModalOpen(false)} onSuccess={fetchData} productToEdit={editingProduct} initialData={initialProductData} suppliers={suppliers} isStacked={isPurchaseModalOpen} />}
            {isSupplierModalOpen && <SupplierManagementModal onClose={() => setIsSupplierModalOpen(false)} onSuccess={fetchData} supplierToEdit={editingSupplier} initialData={initialSupplierData} isStacked={isPurchaseModalOpen} />}
            {isPurchaseModalOpen && <PurchaseModal onClose={() => setIsPurchaseModalOpen(false)} onSuccess={fetchData} products={products} suppliers={suppliers} onOpenProductCreate={handleOpenProductFromAgent} onOpenSupplierCreate={handleOpenSupplierFromAgent} />}
            {isSaleModalOpen && <SaleModal onClose={() => setIsSaleModalOpen(false)} onSuccess={fetchData} products={products} coupons={coupons} />}
            {isCouponModalOpen && <CouponManagementModal onClose={() => setIsCouponModalOpen(false)} onSuccess={fetchData} couponToEdit={editingCoupon} products={products} />}
        </div>
    );
};

const EmptyState: React.FC<{ type: string; onCreate: () => void }> = ({ type, onCreate }) => (
    <div className="empty-state">
        <i className="fa-solid fa-box-open" style={{fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem'}}></i>
        <h2>No hay {type} registrados aún.</h2>
        <p>¡Es un buen momento para añadir el primer {type === 'compras' || type === 'ventas' ? 'registro' : type.slice(0, -1)}!</p>
        <button className="btn btn-primary" onClick={onCreate} style={{marginTop: '1.5rem'}}>
            <i className="fa-solid fa-plus"></i> Añadir {type === 'compras' ? 'Compra' : (type === 'ventas' ? 'Venta' : (type === 'cupones' ? 'Cupón' : type.slice(0, -1).charAt(0).toUpperCase() + type.slice(0, -1).slice(1)))}
        </button>
    </div>
);
