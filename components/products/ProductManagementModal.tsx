
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { ModernImageManager } from '../common/ModernImageManager';
import { QRCodeCanvas } from 'qrcode.react';

interface SupplierCodeItem {
    supplierId: string;
    supplierName: string;
    code: string;
}

interface ProductFormModalProps {
    onClose: () => void;
    onSuccess: () => void;
    productToEdit?: Product | null;
    initialData?: Partial<Product> | null;
    suppliers: Supplier[];
    isStacked?: boolean;
}

export const ProductManagementModal: React.FC<ProductFormModalProps> = ({ onClose, onSuccess, productToEdit, initialData, suppliers, isStacked = false }) => {
    const [mode, setMode] = useState<'view' | 'edit'>((productToEdit && !initialData) ? 'view' : 'edit');
    
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [currentStock, setCurrentStock] = useState('0');
    const [minStock, setMinStock] = useState('5');
    const [images, setImages] = useState<string[]>([]);
    const [supplierCodes, setSupplierCodes] = useState<SupplierCodeItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    
    // State for QR Zoom
    const [showFullQR, setShowFullQR] = useState(false);

    const populateForm = useCallback(() => {
        if (productToEdit) {
            setName(productToEdit.name);
            setDescription(productToEdit.description || '');
            setPrice(productToEdit.price.toString());
            setCurrentStock(productToEdit.current_stock.toString());
            setMinStock(productToEdit.min_stock.toString());
            setImages(productToEdit.image_urls || []);
            
            if (productToEdit.product_suppliers) {
                const codes = productToEdit.product_suppliers.map(ps => ({
                    supplierId: ps.supplier_id,
                    supplierName: ps.suppliers?.name || 'Desconocido',
                    code: ps.supplier_material_code
                }));
                setSupplierCodes(codes);
            } else {
                setSupplierCodes([]);
            }
        } else if (initialData) {
            setName(initialData.name || '');
            setPrice(initialData.price?.toString() || '');
            setDescription(initialData.description || '');
            setCurrentStock('0');
            setMinStock('5');
            setImages([]);
            setSupplierCodes([]);
        } else {
            setName('');
            setDescription('');
            setPrice('');
            setCurrentStock('0');
            setMinStock('5');
            setImages([]);
            setSupplierCodes([]);
        }
    }, [productToEdit, initialData]);

    useEffect(() => { populateForm(); }, [populateForm]);

    const handleRemoveSupplierCode = (index: number) => {
        const newCodes = supplierCodes.filter((_, i) => i !== index);
        setSupplierCodes(newCodes);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !price || isNaN(parseFloat(price))) {
            alert("Por favor, ingresa un nombre y un precio válido.");
            return;
        }
        setIsSaving(true);

        const productData = {
            name,
            description,
            price: parseFloat(price),
            current_stock: parseInt(currentStock) || 0,
            min_stock: parseInt(minStock) || 0,
            image_urls: images
        };

        try {
            let productId = productToEdit?.id;
            if (productToEdit) {
                const { error } = await supabase.from('products').update(productData).eq('id', productToEdit.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('products').insert([productData]).select('id').single();
                if (error) throw error;
                productId = data.id;
            }

            if (productId) {
                await supabase.from('product_suppliers').delete().eq('product_id', productId);
                if (supplierCodes.length > 0) {
                    const relations = supplierCodes.map(sc => ({
                        product_id: productId,
                        supplier_id: sc.supplierId,
                        supplier_material_code: sc.code
                    }));
                    await supabase.from('product_suppliers').insert(relations);
                }
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error al guardar producto:", error);
            alert("Error al guardar el producto.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        if (productToEdit) {
            setMode('view');
            populateForm();
        } else {
            onClose();
        }
    };

    const title = mode === 'view' ? 'Descripción de Producto' : (productToEdit ? 'Editar Producto' : 'Alta de Producto');

    return (
        <div className={`modal-overlay ${isStacked ? 'stacked' : ''}`} onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                
                {/* QR ZOOM OVERLAY */}
                {showFullQR && (
                    <div 
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            animation: 'fadeIn 0.2s', backdropFilter: 'blur(5px)'
                        }} 
                        onClick={() => setShowFullQR(false)}
                    >
                        <div 
                            style={{
                                background: 'white', padding: '2rem', borderRadius: '1.5rem', 
                                textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxWidth: '90%', border: '4px solid var(--bg-gradient-cyan)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 style={{margin: '0 0 1.5rem', fontSize: '1.5rem', color: '#1e3a8a'}}>{name}</h2>
                            <div style={{background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0'}}>
                                <QRCodeCanvas
                                    value={productToEdit?.id || ''}
                                    size={300}
                                    level={"H"}
                                    includeMargin={true}
                                />
                            </div>
                            <p style={{marginTop: '1.5rem', color: '#64748b', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'monospace'}}>
                                ID: {productToEdit?.id.split('-')[0]}...
                            </p>
                            <button 
                                className="btn btn-primary" 
                                onClick={() => setShowFullQR(false)}
                                style={{marginTop: '1.5rem', width: '100%', justifyContent: 'center'}}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}

                <div className="modal-header">
                    <div>
                        <h2>{title}</h2>
                        {initialData && <span className="ai-badge"><i className="fa-solid fa-wand-magic-sparkles"></i> Autocompletado por IA</span>}
                        {productToEdit && <span className="modal-subtitle">Código Interno: #{productToEdit.material_code}</span>}
                    </div>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>
                
                {mode === 'view' ? (
                    <div className="modal-form">
                        <div className="modal-body-layout">
                            <div className="form-section">
                                <div className="detail-group">
                                    <span className="detail-label">Nombre del Producto</span>
                                    <div className="detail-value">{name}</div>
                                </div>
                                <div className="detail-row">
                                     <div className="detail-group">
                                        <span className="detail-label">Precio Unitario</span>
                                        <div className="detail-price">{formatCurrency(parseFloat(price) || 0)}</div>
                                    </div>
                                    <div className="detail-group">
                                        <span className="detail-label">Stock Actual</span>
                                        <div className="detail-value">
                                            {currentStock} un. 
                                            {parseInt(currentStock) <= parseInt(minStock) && <span className="stock-warning-text"> (Bajo Stock)</span>}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <i className="fa-solid fa-bell" style={{ fontSize: '0.75rem', opacity: 0.7 }}></i>
                                            <span>Mínimo: <strong>{minStock}</strong> un.</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Códigos de Proveedores</span>
                                    {supplierCodes.length > 0 ? (
                                        <div className="items-table-container" style={{marginTop: '0.5rem'}}>
                                            <table className="items-table">
                                                <thead><tr><th>Proveedor</th><th>Cód. Material Prov.</th></tr></thead>
                                                <tbody>
                                                    {supplierCodes.map((sc, i) => (
                                                        <tr key={i}><td>{sc.supplierName}</td><td><span className="table-code">{sc.code}</span></td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-muted" style={{fontSize: '0.9rem', fontStyle: 'italic'}}>No hay proveedores asignados.</div>
                                    )}
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Descripción</span>
                                    <div className="detail-description">{description || <span className="text-muted">Sin descripción.</span>}</div>
                                </div>

                                {/* QR Code Section for POS */}
                                <div className="detail-group" style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--border-color)'}}>
                                    <span className="detail-label" style={{marginBottom: '0.75rem', display: 'block'}}>
                                        <i className="fa-solid fa-qrcode" style={{marginRight: '6px', color: 'var(--text-main)'}}></i> Código QR para Caja (POS)
                                    </span>
                                    <div style={{display: 'flex', gap: '1.5rem', alignItems: 'center'}}>
                                        <div 
                                            onClick={() => setShowFullQR(true)}
                                            style={{
                                                background: 'white', padding: '0.75rem', borderRadius: '0.5rem', 
                                                border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                                cursor: 'pointer', position: 'relative', transition: 'transform 0.2s, border-color 0.2s'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.transform = 'scale(1.05)';
                                                e.currentTarget.style.borderColor = 'var(--accent-color)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                            }}
                                            title="Click para agrandar"
                                        >
                                             <QRCodeCanvas
                                                value={productToEdit?.id || ''}
                                                size={100}
                                                level={"H"}
                                                includeMargin={false}
                                            />
                                            <div style={{
                                                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(0,0,0,0.03)', opacity: 0, transition: 'opacity 0.2s'
                                            }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                                                <i className="fa-solid fa-maximize" style={{color: 'var(--accent-color)', fontSize: '1.5rem', textShadow: '0 2px 4px white'}}></i>
                                            </div>
                                        </div>
                                        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                                            <p style={{margin: '0 0 0.5rem', lineHeight: '1.4'}}>Escanea este código desde el módulo de <strong>Caja</strong> para agregar el producto a la venta rápidamente.</p>
                                            <button className="btn btn-sm btn-secondary" onClick={() => setShowFullQR(true)} style={{fontSize: '0.75rem'}}>
                                                <i className="fa-solid fa-maximize" style={{marginRight: '5px'}}></i> Agrandar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="form-section">
                                <div className="detail-group" style={{height: '100%'}}>
                                    <span className="detail-label">Galería</span>
                                    <ModernImageManager images={images} setImages={setImages} readOnly={true} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                            <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}><i className="fa-solid fa-pen-to-square"></i> Editar producto</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="modal-form">
                        <div className="modal-body-layout">
                            <div className="form-section">
                                <div className="form-group">
                                    <label htmlFor="name">Nombre del Producto</label>
                                    <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="price">Precio Unitario ($)</label>
                                        <input id="price" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="minStock">Stock Mínimo (Alerta)</label>
                                        <input id="minStock" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} min="0" />
                                    </div>
                                </div>
                                {mode === 'edit' && !productToEdit && (
                                     <div className="form-group">
                                        <label htmlFor="currentStock">Stock Inicial</label>
                                        <input id="currentStock" type="number" value={currentStock} onChange={e => setCurrentStock(e.target.value)} min="0" />
                                    </div>
                                )}
                                <div className="form-group" style={{background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0'}}>
                                    <label style={{marginBottom: '0.5rem', display:'block'}}>Proveedores Asociados</label>
                                    <div className="text-muted" style={{fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)'}}>
                                        La vinculación con proveedores se genera automáticamente al registrar compras.
                                    </div>
                                    {supplierCodes.length > 0 ? (
                                        <div style={{maxHeight: '120px', overflowY: 'auto'}}>
                                            <table className="items-table" style={{background: 'white'}}>
                                                <tbody>
                                                    {supplierCodes.map((sc, idx) => (
                                                        <tr key={idx}>
                                                            <td style={{fontSize: '0.85rem'}}>{sc.supplierName}</td>
                                                            <td style={{fontSize: '0.85rem'}}><span className="table-code">{sc.code}</span></td>
                                                            <td style={{textAlign: 'right'}}>
                                                                <button type="button" className="remove-btn" onClick={() => handleRemoveSupplierCode(idx)}><i className="fa-solid fa-trash"></i></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-muted" style={{fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem'}}>No hay proveedores asociados actualmente.</div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="description">Descripción</label>
                                    <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
                                </div>
                            </div>
                            <div className="form-section">
                                 <div className="form-group" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                                    <label>Galería de Imágenes</label>
                                    <div style={{flex: 1}}>
                                        <ModernImageManager images={images} setImages={setImages} readOnly={false} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                {isSaving ? 'Guardando...' : (productToEdit ? 'Actualizar Producto' : 'Guardar Producto')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
