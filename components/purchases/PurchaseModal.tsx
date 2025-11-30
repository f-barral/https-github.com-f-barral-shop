
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ai } from '../../lib/gemini';
import { Product, Supplier, CartItem, DetectedEntity, PurchaseCategory } from '../../types';
import { formatCurrency, fileToBase64, formatDate } from '../../utils/formatters';

interface PurchaseModalProps {
    onClose: () => void;
    onSuccess: () => void;
    products: Product[];
    suppliers: Supplier[];
    onOpenProductCreate: (data: Partial<Product>) => void;
    onOpenSupplierCreate: (data: Partial<Supplier>) => void;
    categories: PurchaseCategory[];
    onOpenCategoryManager: () => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ onClose, onSuccess, products, suppliers, onOpenProductCreate, onOpenSupplierCreate, categories, onOpenCategoryManager }) => {
    const [supplierId, setSupplierId] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [categoryId, setCategoryId] = useState('');
    const [items, setItems] = useState<CartItem[]>([]);
    
    // Default category
    useEffect(() => {
        if (!categoryId && categories.length > 0) {
            const defaultCat = categories.find(c => c.name === 'Mercadería') || categories[0];
            setCategoryId(defaultCat.id);
        }
    }, [categories, categoryId]);

    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [ocrState, setOcrState] = useState<'idle' | 'scanning' | 'resolution' | 'ready'>('idle');
    const [pendingEntities, setPendingEntities] = useState<DetectedEntity[]>([]);

    const [duplicateError, setDuplicateError] = useState<{ invoice: string; date: string } | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

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
        if (ocrState === 'resolution') {
            const updatedEntities = pendingEntities.map(entity => {
                if (entity.isKnown || entity.type === 'adjustment' || entity.type === 'other') return entity;
                
                if (entity.type === 'supplier') {
                    const match = suppliers.find(s => s.name.toLowerCase() === entity.name.toLowerCase());
                    if (match) {
                        setSupplierId(match.id);
                        return { ...entity, isKnown: true, matchedId: match.id };
                    }
                } else if (entity.type === 'product') {
                    const match = products.find(p => p.name.toLowerCase() === entity.name.toLowerCase());
                    if (match) {
                        return { ...entity, isKnown: true, matchedId: match.id };
                    }
                }
                return entity;
            });
            
            const prevKnownCount = pendingEntities.filter(e => e.isKnown).length;
            const newKnownCount = updatedEntities.filter(e => e.isKnown).length;
            
            if (prevKnownCount !== newKnownCount || pendingEntities.length !== updatedEntities.length) {
                setPendingEntities(updatedEntities);
            }

            if (updatedEntities.every(e => e.isKnown || e.type === 'adjustment' || e.type === 'other')) {
                const hasPendingDecisions = updatedEntities.some(e => (e.type === 'adjustment' || e.type === 'other'));
                if (!hasPendingDecisions) {
                    syncResolvedItems(updatedEntities);
                    setOcrState('ready');
                }
            }
        }
    }, [products, suppliers, ocrState, pendingEntities.length]);

    const syncResolvedItems = (entities: DetectedEntity[]) => {
         const resolvedItems = entities
            .filter(e => e.type === 'product' && e.matchedId)
            .map(e => {
                const prod = products.find(p => p.id === e.matchedId);
                return {
                    productId: prod!.id,
                    productName: prod!.name,
                    materialCode: prod!.material_code,
                    quantity: e.data.quantity || 1,
                    unitCost: e.data.unitCost || 0
                };
            });
        setItems(resolvedItems);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setShowDropdown(true);
        if (productId) setProductId(''); 
    };

    const handleSelectProduct = (product: Product) => {
        setProductId(product.id);
        setSearchTerm(product.name); 
        setShowDropdown(false);
    };

    const addItem = () => {
        if (!productId || !quantity || !unitCost) return;
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        const newItem: CartItem = {
            productId: prod.id,
            productName: prod.name,
            materialCode: prod.material_code,
            quantity: parseInt(quantity),
            unitCost: parseFloat(unitCost)
        };

        setItems([...items, newItem]);
        setProductId(''); setSearchTerm(''); setQuantity(''); setUnitCost('');
    };

    const removeItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setOcrState('scanning');
            try {
                const base64Data = await fileToBase64(file);
                const categoryNames = categories.map(c => c.name).join(', ');
                const promptText = `Analiza la factura de compra adjunta. Extrae la siguiente información en formato JSON estricto:
                - supplier_name: Nombre o razón social del proveedor.
                - supplier_data: Objeto con { address, city, province, country, phone_details (country_code, area_code, number), website, tax_id (CUIT), gross_income, tax_regime (Responsable Inscripto, Monotributista, Proveedor del exterior, Exento) }. Si CUIT no tiene guiones, formatéalo como XX-XXXXXXXX-X. Si país no está explícito, o por contexto (ej. provincia, código de país de teléfono), asume 'Argentina'. Si el código de país del teléfono no está, asume '54'.
                - invoice_number: Número de la factura.
                - date: La fecha de EMISIÓN de la factura. IMPORTANTE: NO uses fechas de vencimiento (Due Date) ni fecha de pedido. Busca "Fecha de Emisión", "Issue Date". Formato estricto YYYY-MM-DD.
                - category: Clasifica el comprobante en una de las siguientes categorías de COMPRA exactas: ${categoryNames}. Si no estás seguro, usa 'Mercadería'.
                - items: Array de objetos. Cada uno debe tener: type ('PRODUCT', 'ADJUSTMENT', 'OTHER'), description, quantity, unit_cost, supplier_sku (código del proveedor si existe).
                Si encuentras descuentos globales o recargos, márcalos como items de tipo 'ADJUSTMENT'.
                Si encuentras items que no son productos de stock ni ajustes (ej. flete, envío, tasas administrativas), márcalos como 'OTHER'.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: file.type, data: base64Data } },
                            { text: promptText }
                        ]
                    },
                    config: { responseMimeType: 'application/json' }
                });

                const rawText = response.text;
                let parsedData;
                try { parsedData = JSON.parse(rawText); } catch { alert("Error al parsear IA."); setOcrState('idle'); return; }

                const detectedEntities: DetectedEntity[] = [];
                if (parsedData.supplier_name) {
                    const existingSup = suppliers.find(s => s.name.toLowerCase().includes(parsedData.supplier_name.toLowerCase()));
                    if (existingSup) {
                        setSupplierId(existingSup.id);
                        detectedEntities.push({ type: 'supplier', name: existingSup.name, isKnown: true, matchedId: existingSup.id });
                    } else {
                        const supData = parsedData.supplier_data || {};
                         const phoneDetails = supData.phone_details || {};
                        detectedEntities.push({ 
                            type: 'supplier', 
                            name: parsedData.supplier_name, 
                            isKnown: false, 
                            tempId: 'sup_new',
                            data: { 
                                address: supData.address, city: supData.city, province: supData.province, country: supData.country || 'Argentina',
                                website: supData.website, phone_country_code: phoneDetails.country_code || '54', phone_area_code: phoneDetails.area_code, phone_number: phoneDetails.number,
                                tax_id: supData.tax_id, gross_income_number: supData.gross_income, tax_regime: supData.tax_regime || 'Responsable Inscripto'
                            }
                        });
                    }
                }

                if (parsedData.invoice_number) setInvoiceNumber(parsedData.invoice_number);
                if (parsedData.date) setPurchaseDate(parsedData.date);
                if (parsedData.category) {
                    const foundCat = categories.find(c => c.name === parsedData.category);
                    if (foundCat) {
                        setCategoryId(foundCat.id);
                    }
                }

                if (parsedData.items) {
                    parsedData.items.forEach((item: any, idx: number) => {
                        if (item.type === 'ADJUSTMENT') {
                            detectedEntities.push({
                                type: 'adjustment', name: item.description, isKnown: false, tempId: `adj_${idx}`,
                                data: { amount: item.unit_cost * (item.quantity || 1) }
                            });
                        } else if (item.type === 'OTHER') {
                             detectedEntities.push({
                                type: 'other', name: item.description, isKnown: false, tempId: `other_${idx}`,
                                data: { quantity: item.quantity, unitCost: item.unit_cost, description: item.description }
                            });
                        } else {
                            const existingProd = products.find(p => p.name.toLowerCase().includes(item.description.toLowerCase()));
                            if (existingProd) {
                                detectedEntities.push({ type: 'product', name: existingProd.name, isKnown: true, matchedId: existingProd.id, data: { quantity: item.quantity, unitCost: item.unit_cost, sku: item.supplier_sku } });
                            } else {
                                detectedEntities.push({ type: 'product', name: item.description, isKnown: false, tempId: `prod_new_${idx}`, data: { quantity: item.quantity, unitCost: item.unit_cost, description: item.description, sku: item.supplier_sku } });
                            }
                        }
                    });
                }
                setPendingEntities(detectedEntities);
                setOcrState('resolution');
            } catch (err) { console.error(err); alert("Error al procesar IA."); setOcrState('idle'); }
        }
    };

    const handleCreateEntity = (entity: DetectedEntity) => {
        if (entity.type === 'product') {
            onOpenProductCreate({ name: entity.name, price: entity.data.unitCost * 1.3, description: entity.data.description });
        } else {
            onOpenSupplierCreate({ ...entity.data, name: entity.name });
        }
    };

    const handleDiscardEntity = (tempId: string) => {
        const newEntities = pendingEntities.filter(e => e.tempId !== tempId);
        setPendingEntities(newEntities);
        if (newEntities.every(e => e.isKnown && e.type !== 'adjustment' && e.type !== 'other')) {
            syncResolvedItems(newEntities);
            setOcrState('ready');
        }
    };

    const handleTreatAsProduct = (tempId: string) => {
        setPendingEntities(prev => prev.map(e => {
            if (e.tempId === tempId) {
                return { ...e, type: 'product', isKnown: false, data: { ...e.data, quantity: e.data.quantity || 1, unitCost: e.data.unitCost || 0 } };
            }
            return e;
        }));
    };

    const handleApplyAdjustment = (adjustmentEntity: DetectedEntity, mode: 'split' | 'single', targetProductId?: string) => {
        const amount = adjustmentEntity.data.amount;
        let newEntities = [...pendingEntities];
        
        if (mode === 'split') {
            const productEntities = newEntities.filter(e => e.type === 'product' && e.isKnown);
            if (productEntities.length === 0) return;
            const splitAmount = amount / productEntities.length;
            newEntities = newEntities.map(e => {
                if (e.type === 'product' && e.isKnown) {
                    const currentTotal = e.data.unitCost * e.data.quantity;
                    const newUnitCost = (currentTotal + splitAmount) / e.data.quantity;
                    return { ...e, data: { ...e.data, unitCost: newUnitCost } };
                }
                return e;
            });
        } else if (mode === 'single' && targetProductId) {
             newEntities = newEntities.map(e => {
                if (e.type === 'product' && e.matchedId === targetProductId) {
                    const currentTotal = e.data.unitCost * e.data.quantity;
                    const newUnitCost = (currentTotal + amount) / e.data.quantity;
                    return { ...e, data: { ...e.data, unitCost: newUnitCost } };
                }
                return e;
             });
        }
        
        newEntities = newEntities.filter(e => e.tempId !== adjustmentEntity.tempId);
        setPendingEntities(newEntities);
        if (newEntities.every(e => e.isKnown && e.type !== 'adjustment' && e.type !== 'other')) {
            syncResolvedItems(newEntities);
            setOcrState('ready');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!supplierId || !invoiceNumber || !purchaseDate || items.length === 0 || !categoryId) {
            alert('Por favor, complete todos los campos requeridos y agregue al menos un producto.');
            return;
        }

        setIsSaving(true);
        try {
            const { data: existingBatches, error: checkError } = await supabase
                .from('batches')
                .select('created_at')
                .eq('supplier_id', supplierId)
                .eq('invoice_number', invoiceNumber)
                .limit(1);

            if (checkError) throw checkError;

            if (existingBatches && existingBatches.length > 0) {
                setDuplicateError({
                    invoice: invoiceNumber,
                    date: formatDate(existingBatches[0].created_at)
                });
                setIsSaving(false);
                return;
            }

            const itemsPayload = items.map(item => ({
                product_id: item.productId,
                quantity: item.quantity,
                unit_cost: item.unitCost,
                supplier_sku: pendingEntities.find(pe => pe.matchedId === item.productId)?.data?.sku || ''
            }));

            const { error } = await supabase.rpc('register_bulk_purchase', {
                p_supplier_id: supplierId,
                p_invoice_number: invoiceNumber,
                p_purchase_date: purchaseDate,
                p_category_id: categoryId,
                p_items: itemsPayload
            });

            if (error) throw error;

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error en registro:", error);
            alert('Ocurrió un error al registrar la compra: ' + (error.message || 'Error desconocido'));
        } finally {
            setIsSaving(false);
        }
    };

    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * (item.unitCost ?? 0)), 0);

    if (duplicateError) {
        return (
             <div className="modal-overlay" style={{zIndex: 1500}}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{height: 'auto', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', animation: 'scaleIn 0.2s'}}>
                    <div style={{width: '80px', height: '80px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1.5rem'}}>
                        <i className="fa-solid fa-ban"></i>
                    </div>
                    <h2 style={{margin: '0 0 1rem', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700}}>Acción Denegada</h2>
                    <p style={{textAlign: 'center', color: '#64748b', marginBottom: '2rem', lineHeight: 1.6, fontSize: '1rem'}}>
                        La factura <strong>{duplicateError.invoice}</strong> ya fue cargada previamente en el sistema el día <strong>{duplicateError.date}</strong>.
                        <br/>
                        <span style={{fontSize: '0.9rem', display: 'block', marginTop: '1rem'}}>No se puede proceder con la carga para evitar duplicidad de stock y costos.</span>
                    </p>
                    <button className="btn btn-primary" onClick={onClose} style={{minWidth: '150px'}}>
                        Entendido
                    </button>
                </div>
             </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{height: '90vh', maxHeight: '900px', position: 'relative'}}>
                
                {ocrState === 'scanning' && (
                    <div className="scanning-overlay">
                        <div style={{position: 'relative', width: '300px', height: '200px', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <div className="scan-line"></div>
                            <div style={{textAlign: 'center', zIndex: 2}}>
                                <i className="fa-solid fa-wand-magic-sparkles" style={{fontSize: '3rem', color: '#49FFF5', marginBottom: '1rem'}}></i>
                                <h3 style={{margin: 0, color: '#1e3a8a'}}>Analizando Factura...</h3>
                                <p style={{margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem'}}>Extrayendo datos con Gemini IA</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="modal-header">
                    <h2>Registrar Compra</h2>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>
                {ocrState === 'resolution' ? (
                     <div className="modal-body-layout single-column">
                        <div className="resolution-panel">
                            <div className="resolution-header">
                                <div style={{width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #49FFF5, #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.2rem'}}>
                                    <i className="fa-solid fa-robot"></i>
                                </div>
                                <div>
                                    <div className="resolution-title">Análisis Inteligente</div>
                                    <p style={{margin: 0, fontSize: '0.9rem', color: '#64748b'}}>
                                        Se detectaron entidades nuevas, ajustes o ítems no clasificados. Valide para continuar.
                                    </p>
                                </div>
                            </div>
                             {pendingEntities.map((entity, idx) => (
                                <div key={idx} className={`resolution-card ${entity.type === 'adjustment' ? 'adjustment' : (entity.type === 'other' ? 'other' : (entity.isKnown ? 'resolved' : ''))}`}
                                     style={entity.type === 'other' ? {borderLeftColor: '#94a3b8', background: '#f8fafc'} : undefined}>
                                    <div className="res-info" style={{width: '100%'}}>
                                        <h4>
                                            {entity.name}
                                            {entity.isKnown && <span style={{marginLeft: '0.5rem', fontSize: '0.75rem', color: '#10b981', background: '#d1fae5', padding: '2px 6px', borderRadius: '4px'}}><i className="fa-solid fa-check"></i> OK</span>}
                                            {entity.type === 'adjustment' && <span className="res-tag">Ajuste / Descuento</span>}
                                            {entity.type === 'other' && <span className="res-tag" style={{background:'#e2e8f0', color:'#475569'}}>Otro / Servicio</span>}
                                        </h4>
                                        <p>
                                            {entity.type === 'product' ? 'Producto detectado' : 
                                             entity.type === 'supplier' ? 'Proveedor detectado' : 
                                             entity.type === 'other' ? `Monto/Costo: ${formatCurrency((entity.data.unitCost ?? 0) * (entity.data.quantity || 1))}` :
                                             `Monto: ${formatCurrency(entity.data.amount)}`}
                                        </p>
                                        
                                        <div style={{marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                            {/* Action Buttons for New Supplier/Product */}
                                            {!entity.isKnown && entity.type !== 'adjustment' && entity.type !== 'other' && (
                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleCreateEntity(entity)}>
                                                    <i className="fa-solid fa-plus"></i> Dar de Alta
                                                </button>
                                            )}

                                            {/* Action Buttons for Adjustment */}
                                            {entity.type === 'adjustment' && (
                                                <div style={{display:'flex', flexDirection:'column', gap:'0.5rem', width:'100%'}}>
                                                    <div style={{display:'flex', gap: '0.5rem'}}>
                                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleApplyAdjustment(entity, 'split')}>
                                                            Dividir en Productos
                                                        </button>
                                                    </div>
                                                    <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                                                        <select style={{padding:'0.3rem', borderRadius:'4px', border:'1px solid #cbd5e1', fontSize:'0.85rem', width: '100%'}}
                                                                onChange={(e) => {
                                                                    if(e.target.value) handleApplyAdjustment(entity, 'single', e.target.value);
                                                                }}
                                                                defaultValue="">
                                                            <option value="" disabled>Aplicar 100% a un ítem...</option>
                                                            {pendingEntities.filter(p => p.type === 'product' && p.isKnown).map(p => (
                                                                <option key={p.matchedId} value={p.matchedId}>{p.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action Buttons for Other */}
                                            {entity.type === 'other' && (
                                                <div style={{display: 'flex', gap: '0.5rem', width: '100%'}}>
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleTreatAsProduct(entity.tempId!)}>
                                                        <i className="fa-solid fa-box"></i> Es un Producto
                                                    </button>
                                                    <button type="button" className="remove-btn" onClick={() => handleDiscardEntity(entity.tempId!)} style={{background:'#fee2e2', borderRadius:'4px', padding:'0.4rem 0.8rem', color:'#991b1b', width:'auto'}}>
                                                        <i className="fa-solid fa-trash"></i> Descartar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                ) : (
                    <form onSubmit={handleSubmit} className="modal-form">
                        <div className="modal-body-layout single-column">
                            {ocrState === 'idle' && (
                                <div className="file-upload-zone" onClick={() => document.getElementById('invoiceFile')?.click()}>
                                    <i className="fa-solid fa-wand-magic-sparkles file-upload-icon"></i>
                                    <h3>Carga Inteligente con IA</h3>
                                    <p style={{color: 'var(--text-secondary)', marginTop: '0.5rem'}}>Sube una factura o recibo para autocompletar</p>
                                    <input type="file" id="invoiceFile" style={{display: 'none'}} accept=".pdf,image/*" onChange={handleFileUpload} />
                                </div>
                            )}
                            <div className="form-section">
                                <div className="form-row three-col">
                                    <div className="form-group">
                                        <label htmlFor="supplier">PROVEEDOR</label>
                                        <select id="supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                                            <option value="">Seleccione...</option>
                                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Nº FACTURA</label>
                                        <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="F-0000-0000" required />
                                    </div>
                                    <div className="form-group">
                                        <label>FECHA EMISIÓN</label>
                                        <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>CATEGORÍA</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required style={{ flex: 1 }}>
                                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                        </select>
                                        <button type="button" className="btn btn-secondary" onClick={onOpenCategoryManager} title="Gestionar Categorías" style={{ flexShrink: 0, padding: '0.75rem' }}>
                                            <i className="fa-solid fa-cog"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="form-section">
                                <div style={{display: 'grid', gridTemplateColumns: '3fr 1fr 1fr auto', gap: '1rem', alignItems: 'end', background: 'var(--input-bg)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--border-color)'}}>
                                    <div className="form-group" style={{marginBottom: 0}}>
                                        <label style={{marginBottom: '0.5rem', display: 'block'}}>PRODUCTO</label>
                                        <div className="searchable-select-container">
                                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={handleSearchChange} onFocus={() => setShowDropdown(true)} />
                                            {showDropdown && searchTerm && !productId && (
                                                <ul className="search-dropdown">
                                                    {filteredProducts.map(p => (
                                                        <li key={p.id} className="search-result-item" onClick={() => handleSelectProduct(p)}>
                                                            <span className="search-item-name">{p.name}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                    <div className="form-group" style={{marginBottom: 0}}>
                                        <label style={{marginBottom: '0.5rem', display: 'block'}}>CANTIDAD</label>
                                        <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{marginBottom: 0}}>
                                        <label style={{marginBottom: '0.5rem', display: 'block'}}>COSTO UNIT. ($)</label>
                                        <input type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
                                    </div>
                                    <button type="button" className="btn btn-secondary" onClick={addItem} disabled={!productId} style={{height: '46px', width: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><i className="fa-solid fa-plus"></i></button>
                                </div>
                                {items.length > 0 && (
                                    <div className="items-table-container">
                                        <table className="items-table">
                                            <thead><tr><th>Producto</th><th>Cant.</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead>
                                            <tbody>
                                                {items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.productName}</td>
                                                        <td>{item.quantity}</td>
                                                        <td>{formatCurrency(item.unitCost || 0)}</td>
                                                        <td>{formatCurrency(item.quantity * (item.unitCost || 0))}</td>
                                                        <td><button type="button" className="remove-btn" onClick={() => removeItem(idx)}><i className="fa-solid fa-trash"></i></button></td>
                                                    </tr>
                                                ))}
                                                <tr><td colSpan={3}>Total:</td><td>{formatCurrency(totalAmount)}</td><td></td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving || items.length === 0}>{isSaving ? 'Registrando...' : 'Registrar'}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
