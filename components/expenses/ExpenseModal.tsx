
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ai } from '../../lib/gemini';
import { Supplier, DetectedEntity, ExpenseCategory } from '../../types';
import { fileToBase64, formatDate } from '../../utils/formatters';

interface ExpenseModalProps {
    onClose: () => void;
    onSuccess: () => void;
    suppliers: Supplier[];
    onOpenSupplierCreate: (data: Partial<Supplier>) => void;
    categories: ExpenseCategory[];
    onOpenCategoryManager: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ onClose, onSuccess, suppliers, onOpenSupplierCreate, categories, onOpenCategoryManager }) => {
    const [supplierId, setSupplierId] = useState<string | undefined>('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    
    // Set default category
    useEffect(() => {
        if (!categoryId && categories.length > 0) {
            const defaultCat = categories.find(c => c.name === 'Otros') || categories[0];
            setCategoryId(defaultCat.id);
        }
    }, [categories, categoryId]);

    const [isSaving, setIsSaving] = useState(false);
    const [ocrState, setOcrState] = useState<'idle' | 'scanning' | 'resolution' | 'ready'>('idle');
    const [pendingEntities, setPendingEntities] = useState<DetectedEntity[]>([]);

    const [duplicateError, setDuplicateError] = useState<{ invoice: string; date: string } | null>(null);

    useEffect(() => {
        if (ocrState === 'resolution' && pendingEntities.length > 0) {
            const entity = pendingEntities[0]; // Only one supplier can be new at a time
            const match = suppliers.find(s => s.name.toLowerCase() === entity.name.toLowerCase());
            
            if (match) {
                setSupplierId(match.id);
                setPendingEntities([]); // Clear pending as it's resolved
                setOcrState('ready');
            }
        }
    }, [suppliers, ocrState, pendingEntities]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setOcrState('scanning');
            try {
                const base64Data = await fileToBase64(file);
                const categoryNames = categories.map(c => c.name).join(', ');
                const promptText = `Analiza el documento adjunto (factura o recibo de gasto). Extrae la siguiente información en formato JSON estricto:
                - supplier_name: Nombre o razón social del proveedor del servicio o producto. Si no lo encuentras, déjalo como null.
                - invoice_number: Número del comprobante (factura, recibo, etc.).
                - date: La fecha de EMISIÓN del comprobante. Formato estricto YYYY-MM-DD.
                - total_amount: El monto TOTAL final del gasto. Debe ser un número, sin símbolos de moneda.
                - description: Una descripción breve y concisa del gasto (ej: 'Servicio de Internet Fibertel', 'Alquiler oficina mes de Junio').
                - category: Clasifica el gasto en una de las siguientes categorías de GASTO exactas: ${categoryNames}. Si no estás seguro, usa 'Otros'.`;

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
                try { parsedData = JSON.parse(rawText); } catch { alert("La IA devolvió un formato inválido."); setOcrState('idle'); return; }

                setInvoiceNumber(parsedData.invoice_number || '');
                setExpenseDate(parsedData.date || new Date().toISOString().split('T')[0]);
                setAmount(parsedData.total_amount?.toString() || '');
                setDescription(parsedData.description || '');
                if (parsedData.category) {
                    const foundCat = categories.find(c => c.name === parsedData.category);
                    if (foundCat) {
                        setCategoryId(foundCat.id);
                    }
                }

                if (parsedData.supplier_name) {
                    const existingSup = suppliers.find(s => s.name.toLowerCase().includes(parsedData.supplier_name.toLowerCase()));
                    if (existingSup) {
                        setSupplierId(existingSup.id);
                        setOcrState('ready');
                    } else {
                        setPendingEntities([{ 
                            type: 'supplier', 
                            name: parsedData.supplier_name, 
                            isKnown: false, 
                            tempId: 'sup_new_expense',
                            data: { name: parsedData.supplier_name }
                        }]);
                        setOcrState('resolution');
                    }
                } else {
                    setOcrState('ready');
                }
            } catch (err) { console.error(err); alert("Error al procesar con IA."); setOcrState('idle'); }
        }
    };

    const handleCreateEntity = (entity: DetectedEntity) => {
        if (entity.type === 'supplier') {
            onOpenSupplierCreate({ name: entity.name });
        }
    };

    const handleDiscardEntity = () => {
        setPendingEntities([]);
        setOcrState('ready');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!description || !amount || !expenseDate || !categoryId) {
            alert('Por favor, complete todos los campos requeridos.');
            return;
        }

        setIsSaving(true);
        try {
            if (supplierId && invoiceNumber) {
                const { data: existing, error: checkError } = await supabase
                    .from('expenses')
                    .select('created_at')
                    .eq('supplier_id', supplierId)
                    .eq('invoice_number', invoiceNumber)
                    .limit(1);

                if (checkError) throw checkError;

                if (existing && existing.length > 0) {
                    setDuplicateError({
                        invoice: invoiceNumber,
                        date: formatDate(existing[0].created_at)
                    });
                    setIsSaving(false);
                    return;
                }
            }

            const expenseData = {
                expense_date: expenseDate,
                description,
                amount: parseFloat(amount),
                category_id: categoryId,
                supplier_id: supplierId || null,
                invoice_number: invoiceNumber || null
            };

            const { error } = await supabase.from('expenses').insert([expenseData]);
            if (error) throw error;

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error en registro:", error);
            alert('Ocurrió un error al registrar el gasto: ' + (error.message || 'Error desconocido'));
        } finally {
            setIsSaving(false);
        }
    };

    if (duplicateError) {
        return (
             <div className="modal-overlay" style={{zIndex: 1500}}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{height: 'auto', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', animation: 'scaleIn 0.2s'}}>
                    <div style={{width: '80px', height: '80px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1.5rem'}}>
                        <i className="fa-solid fa-ban"></i>
                    </div>
                    <h2 style={{margin: '0 0 1rem', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700}}>Acción Denegada</h2>
                    <p style={{textAlign: 'center', color: '#64748b', marginBottom: '2rem', lineHeight: 1.6, fontSize: '1rem'}}>
                        El comprobante <strong>{duplicateError.invoice}</strong> ya fue cargado previamente el día <strong>{duplicateError.date}</strong>.
                        <br/>
                        <span style={{fontSize: '0.9rem', display: 'block', marginTop: '1rem'}}>No se puede proceder para evitar duplicidad de gastos.</span>
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
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{height: 'auto', maxHeight: '90vh', position: 'relative'}}>
                {ocrState === 'scanning' && (
                    <div className="scanning-overlay">
                        <div className="loader"></div>
                        <h3>Analizando Comprobante...</h3>
                    </div>
                )}
                <div className="modal-header">
                    <h2>Registrar Gasto</h2>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>
                {ocrState === 'resolution' ? (
                     <div className="modal-body-layout single-column">
                        <div className="resolution-panel">
                            <div className="resolution-header">
                                <span className="ai-badge"><i className="fa-solid fa-robot"></i> Asistente IA</span>
                                <h3 className="resolution-title">Conflicto Detectado</h3>
                            </div>
                            <p>El comercio/entidad extraído del documento no se encontró en tu base de datos.</p>
                             {pendingEntities.map((entity, idx) => (
                                <div key={idx} className="resolution-card">
                                    <div className="res-info">
                                        <h4>{entity.name}</h4>
                                        <p>Nueva entidad detectada</p>
                                    </div>
                                    <div className="res-actions" style={{display: 'flex', gap: '0.5rem'}}>
                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleCreateEntity(entity)}><i className="fa-solid fa-plus"></i> Dar de Alta</button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleDiscardEntity}>Ignorar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                ) : (
                    <form onSubmit={handleSubmit} className="modal-form">
                        <div className="modal-body-layout single-column">
                            {ocrState === 'idle' && (
                                <div className="file-upload-zone" onClick={() => document.getElementById('expenseFile')?.click()}>
                                    <i className="fa-solid fa-wand-magic-sparkles file-upload-icon"></i>
                                    <h3>Carga Inteligente con IA</h3>
                                    <p>Sube una factura o recibo para autocompletar</p>
                                    <input type="file" id="expenseFile" style={{display: 'none'}} accept=".pdf,image/*" onChange={handleFileUpload} />
                                </div>
                            )}
                            <div className="form-section">
                                {/* Row 1: Comercio | N Factura */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="supplier">COMERCIO / ENTIDAD</label>
                                        <select id="supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                                            <option value="">Seleccione o deje en blanco...</option>
                                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Nº FACTURA / COMPROBANTE</label>
                                        <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Opcional" />
                                    </div>
                                </div>

                                {/* Row 2: Descripción */}
                                <div className="form-group">
                                    <label htmlFor="description">DESCRIPCIÓN DEL GASTO</label>
                                    <input id="description" type="text" value={description} onChange={e => setDescription(e.target.value)} required autoFocus placeholder="Ej: Pago de Internet, Insumos de limpieza..." />
                                </div>

                                {/* Row 3: Categoría | Fecha | Monto */}
                                <div className="form-row three-col">
                                    <div className="form-group">
                                        <label htmlFor="category">CATEGORÍA</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <select id="category" value={categoryId} onChange={e => setCategoryId(e.target.value)} required style={{ flex: 1 }}>
                                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                            </select>
                                            <button type="button" className="btn btn-secondary" onClick={onOpenCategoryManager} title="Gestionar Categorías" style={{ flexShrink: 0, padding: '0.75rem' }}>
                                                <i className="fa-solid fa-cog"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>FECHA DEL GASTO</label>
                                        <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="amount">MONTO TOTAL ($)</label>
                                        <input id="amount" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Registrando...' : 'Registrar Gasto'}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
