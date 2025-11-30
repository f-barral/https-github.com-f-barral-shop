
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Batch, Sale, Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PriceDeterminationProps {
    products: Product[];
    batches: Batch[];
    sales: Sale[];
    expenses: Expense[];
    onUpdate: () => void;
}

interface PriceRowState {
    productId: string;
    profitability: number; // Target Profitability Percentage (Margin)
    manualPrice: string;   // The price the user actually types
    validityDate: string;
    isModified: boolean;
}

export const PriceDetermination: React.FC<PriceDeterminationProps> = ({ products, batches, sales, expenses, onUpdate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [rowStates, setRowStates] = useState<Record<string, PriceRowState>>({});
    const [isSaving, setIsSaving] = useState<string | 'BULK' | null>(null);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);
    
    // Selection and Feedback States
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [recentlySavedIds, setRecentlySavedIds] = useState<Set<string>>(new Set());

    // 0. Calculate Overhead Cost Per Unit (Prorrateo de Gastos)
    const { overheadPerUnit, overheadCalculationDetails } = useMemo(() => {
        const now = new Date();
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Filter Expenses (Last Month)
        const lastMonthExpenses = expenses.filter(e => {
            const d = new Date(e.expense_date);
            return d >= firstDayPrevMonth && d <= lastDayPrevMonth;
        });
        const totalExpenses = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Filter Sales (Units Sold Last Month)
        const lastMonthSales = sales.filter(s => {
            const d = new Date(s.sale_date);
            return d >= firstDayPrevMonth && d <= lastDayPrevMonth && s.status === 'Completada';
        });
        const totalUnitsSold = lastMonthSales.reduce((sum, s) => sum + s.quantity, 0);

        const val = totalUnitsSold > 0 ? totalExpenses / totalUnitsSold : 0;
        
        return {
            overheadPerUnit: val,
            overheadCalculationDetails: {
                totalExpenses,
                totalUnitsSold,
                period: `${firstDayPrevMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
            }
        };
    }, [expenses, sales]);

    // 1. Calculate Reference Costs (Memoized)
    const productCosts = useMemo(() => {
        const costs: Record<string, { cost: number; source: 'last_month' | 'last_purchase' | 'none' }> = {};
        
        const now = new Date();
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        products.forEach(p => {
            const prodBatches = batches.filter(b => 
                (b.product_id === p.id) || 
                (b.products?.name === p.name)
            );

            if (prodBatches.length === 0) {
                costs[p.id] = { cost: 0, source: 'none' };
                return;
            }

            // Filter for last month
            const lastMonthBatches = prodBatches.filter(b => {
                const d = new Date(b.purchase_date);
                return d >= firstDayPrevMonth && d <= lastDayPrevMonth;
            });

            if (lastMonthBatches.length > 0) {
                const totalCost = lastMonthBatches.reduce((sum, b) => sum + (b.unit_cost * b.quantity), 0);
                const totalQty = lastMonthBatches.reduce((sum, b) => sum + b.quantity, 0);
                costs[p.id] = { cost: totalQty > 0 ? totalCost / totalQty : 0, source: 'last_month' };
            } else {
                // Fallback: Last known purchase cost
                const sortedBatches = [...prodBatches].sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());
                costs[p.id] = { cost: sortedBatches[0].unit_cost, source: 'last_purchase' };
            }
        });

        return costs;
    }, [products, batches]);

    // 2. Initialize Row State
    useEffect(() => {
        const initialStates: Record<string, PriceRowState> = {};
        products.forEach(p => {
            if (!rowStates[p.id]) {
                initialStates[p.id] = {
                    productId: p.id,
                    profitability: 30, // Default 30% margin
                    manualPrice: p.price.toString(),
                    validityDate: new Date().toISOString().split('T')[0],
                    isModified: false
                };
            }
        });
        if (Object.keys(initialStates).length > 0) {
            setRowStates(prev => ({ ...prev, ...initialStates }));
        }
    }, [products]);

    // Selection Handlers
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredProducts.length) {
            setSelectedIds(new Set());
        } else {
            const allIds = filteredProducts.map(p => p.id);
            setSelectedIds(new Set(allIds));
        }
    };

    const toggleRowSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const clearSavedStatus = (productId: string) => {
        setRecentlySavedIds(prev => {
            if (prev.has(productId)) {
                const next = new Set(prev);
                next.delete(productId);
                return next;
            }
            return prev;
        });
    };

    // Handlers
    const handleProfitabilityChange = (productId: string, newVal: string) => {
        const val = parseFloat(newVal) || 0;
        const purchaseCost = productCosts[productId]?.cost || 0;
        const totalBaseCost = purchaseCost + overheadPerUnit; 

        // Suggested Price Formula: (Cost + Overhead) * (1 + Margin)
        const suggested = totalBaseCost * (1 + (val / 100));
        
        setRowStates(prev => ({
            ...prev,
            [productId]: {
                ...prev[productId],
                profitability: val,
                manualPrice: suggested.toFixed(2), // Auto-update manual price with suggestion when margin changes
                isModified: true
            }
        }));
        
        const newSet = new Set(selectedIds);
        newSet.add(productId);
        setSelectedIds(newSet);
        clearSavedStatus(productId);
    };

    const handlePriceChange = (productId: string, newVal: string) => {
        setRowStates(prev => ({
            ...prev,
            [productId]: {
                ...prev[productId],
                manualPrice: newVal,
                isModified: true
            }
        }));
        const newSet = new Set(selectedIds);
        newSet.add(productId);
        setSelectedIds(newSet);
        clearSavedStatus(productId);
    };

    const handleApplySuggested = (productId: string, suggested: number) => {
        setRowStates(prev => ({
            ...prev,
            [productId]: {
                ...prev[productId],
                manualPrice: suggested.toFixed(2),
                isModified: true
            }
        }));
        const newSet = new Set(selectedIds);
        newSet.add(productId);
        setSelectedIds(newSet);
        clearSavedStatus(productId);
    };

    const handleDateChange = (productId: string, newVal: string) => {
        setRowStates(prev => ({
            ...prev,
            [productId]: {
                ...prev[productId],
                validityDate: newVal,
                isModified: true
            }
        }));
        clearSavedStatus(productId);
    };

    const handleUpdatePrice = async (productId: string) => {
        const state = rowStates[productId];
        if (!state) return;

        const newPrice = parseFloat(state.manualPrice);
        if (isNaN(newPrice) || newPrice < 0) {
            alert("Precio inválido");
            return;
        }

        setIsSaving(productId);

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const isFuture = state.validityDate > todayStr;
            const payload: any = {};

            if (isFuture) {
                payload.scheduled_price = newPrice;
                payload.scheduled_date = state.validityDate;
            } else {
                payload.price = newPrice;
            }

            const { error } = await supabase.from('products').update(payload).eq('id', productId);
            if (error) throw error;

            setRowStates(prev => ({
                ...prev,
                [productId]: { ...prev[productId], isModified: false }
            }));
            
            setRecentlySavedIds(prev => new Set([...prev, productId]));

            if (selectedIds.has(productId)) {
                const newSelected = new Set(selectedIds);
                newSelected.delete(productId);
                setSelectedIds(newSelected);
            }

            onUpdate();

        } catch (error: any) {
            console.error(error);
            alert("Error al actualizar precio.");
        } finally {
            setIsSaving(null);
        }
    };

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.material_code.toString().includes(searchTerm)
    );

    const handleBulkUpdateClick = () => {
        if (selectedIds.size === 0) return;
        setShowBulkConfirm(true);
    };

    const executeBulkUpdate = async () => {
        setShowBulkConfirm(false);
        setIsSaving('BULK');
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const productsToUpdate = products.filter(p => selectedIds.has(p.id));
            const processedIds: string[] = [];

            const updatePromises = productsToUpdate.map(async (p) => {
                const state = rowStates[p.id];
                if (!state) return null; 

                const newPrice = parseFloat(state.manualPrice);
                if (isNaN(newPrice)) return null;

                const isFuture = state.validityDate > todayStr;
                const payload: any = {};

                if (isFuture) {
                    payload.scheduled_price = newPrice;
                    payload.scheduled_date = state.validityDate;
                } else {
                    payload.price = newPrice;
                }

                const { error } = await supabase.from('products').update(payload).eq('id', p.id);
                if (!error) processedIds.push(p.id);
                return { error };
            });

            await Promise.all(updatePromises);
            
            setRowStates(prev => {
                const nextState = { ...prev };
                processedIds.forEach(id => {
                    if (nextState[id]) nextState[id].isModified = false;
                });
                return nextState;
            });

            setRecentlySavedIds(prev => new Set([...prev, ...processedIds]));
            setSelectedIds(new Set());
            onUpdate();

        } catch (error) {
            console.error(error);
            alert("Error en actualización masiva.");
        } finally {
            setIsSaving(null);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s' }}>
            {showBulkConfirm && (
                <div className="modal-overlay" style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ height: 'auto', maxWidth: '500px', textAlign: 'center', padding: '2rem', borderRadius: '1rem' }}>
                        <div style={{ fontSize: '3rem', color: 'var(--bg-gradient-blue)', marginBottom: '1rem' }}><i className="fa-solid fa-list-check"></i></div>
                        <h2 style={{ margin: '0 0 1rem', color: 'var(--text-main)' }}>Confirmar</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Se actualizarán <strong>{selectedIds.size}</strong> precios seleccionados.</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={executeBulkUpdate}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Area */}
            <div style={{ background: 'white', padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', marginBottom: '1.5rem', border: '1px solid white' }}>
                <div style={{marginBottom: '1rem'}}>
                    <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.4rem' }}>Determinación de Precios</h2>
                </div>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem'}}>
                    
                    {/* Left Side: Formula & Reference */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                         <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <span style={{fontWeight: 600, color: 'var(--text-main)'}}>Fórmula:</span> 
                            <span style={{marginLeft: '6px', fontFamily: 'monospace', background: 'var(--input-bg)', padding: '2px 6px', borderRadius: '4px'}}>
                                (Costo Mercadería + Gasto Operativo) × (1 + Margen)
                            </span>
                         </div>
                         
                         {/* Reference Badge - Moved here */}
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.75rem', width: 'fit-content',
                            background: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '8px',
                            border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)'
                        }}>
                            <i className="fa-solid fa-calculator" style={{color: 'var(--accent-color)'}}></i>
                            <span>Ref. Gasto Operativo: <strong>{formatCurrency(overheadPerUnit)}</strong> / unidad</span>
                            <div className="reputation-tooltip-wrapper">
                                 <i className="fa-solid fa-circle-info" style={{color: 'var(--text-muted)', cursor: 'help'}}></i>
                                 <div className="reputation-tooltip" style={{width: '280px', left: 0}}>
                                     <h4>Cálculo de Prorrateo</h4>
                                     <p>Periodo: {overheadCalculationDetails.period}</p>
                                     <p style={{marginTop: '4px'}}>Total Gastos: {formatCurrency(overheadCalculationDetails.totalExpenses)}</p>
                                     <p>Total Unidades Vendidas: {overheadCalculationDetails.totalUnitsSold}</p>
                                     <hr style={{margin: '8px 0', borderColor: '#e2e8f0'}}/>
                                     <strong style={{color: 'var(--accent-color)'}}>Resultado: {formatCurrency(overheadPerUnit)} por producto</strong>
                                 </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right Side: Actions */}
                    <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
                        <div className="searchable-select-container" style={{ width: '250px' }}>
                            <div className="search-input-wrapper">
                                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }}></i>
                                <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px', width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }} />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleBulkUpdateClick} disabled={!!isSaving || selectedIds.size === 0} style={{ fontSize: '0.9rem', padding: '0.6rem 1rem' }}>
                            {isSaving === 'BULK' ? '...' : `Publicar Seleccionados (${selectedIds.size})`}
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                <table className="product-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input type="checkbox" checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            </th>
                            <th style={{ minWidth: '200px' }}>Producto</th>
                            <th style={{ textAlign: 'right', width: '110px' }}>Costo Unit.<br/><small style={{fontWeight:400, color:'var(--text-muted)'}}>(Mercadería)</small></th>
                            <th style={{ textAlign: 'center', width: '90px' }}>Margen<br/>Meta %</th>
                            <th style={{ textAlign: 'right', width: '120px', background: '#f8fafc' }}>Precio<br/>Sugerido</th>
                            <th style={{ width: '40px' }}></th> {/* Copy Action */}
                            <th style={{ textAlign: 'right', width: '130px' }}>Nuevo<br/>Precio</th>
                            <th style={{ textAlign: 'center', width: '130px' }}>Vigencia</th>
                            <th style={{ textAlign: 'center', width: '80px' }}>Publicar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map(p => {
                            const costData = productCosts[p.id] || { cost: 0, source: 'none' };
                            const purchaseCost = costData.cost;
                            const totalUnitCost = purchaseCost + overheadPerUnit; // Basis for Suggestion
                            const state = rowStates[p.id] || { profitability: 30, manualPrice: p.price.toString(), validityDate: '', isModified: false };
                            
                            // Suggested = (Base + Overhead) * (1 + Margin)
                            const suggestedPrice = totalUnitCost * (1 + (state.profitability / 100));
                            
                            const isSelected = selectedIds.has(p.id);
                            const isRecentlySaved = recentlySavedIds.has(p.id);

                            return (
                                <tr key={p.id} style={{ backgroundColor: isRecentlySaved ? '#f0fdf4' : (isSelected ? '#eff6ff' : (state.isModified ? '#fffbeb' : 'transparent')), transition: 'background-color 0.3s' }}>
                                    <td style={{ textAlign: 'center' }}>
                                        {isRecentlySaved ? <i className="fa-solid fa-check" style={{color:'var(--success-color)'}}></i> : 
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelection(p.id)} style={{ width: '16px', height: '16px' }} />}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{p.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>#{p.material_code}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                                        {formatCurrency(purchaseCost)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input 
                                            type="number" 
                                            value={state.profitability} 
                                            onChange={(e) => handleProfitabilityChange(p.id, e.target.value)}
                                            style={{ width: '50px', padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--border-color)', textAlign: 'center', fontSize: '0.9rem' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', background: '#f8fafc', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                                        {formatCurrency(suggestedPrice)}
                                        <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400}}>inc. Gasto Op.</div>
                                    </td>
                                    <td style={{textAlign: 'center', padding: '0.5rem'}}>
                                        <button 
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleApplySuggested(p.id, suggestedPrice)}
                                            title="Copiar Sugerido a Nuevo"
                                            style={{ 
                                                padding: 0, width: '28px', height: '28px', borderRadius: '50%',
                                                color: 'var(--accent-color)', borderColor: 'var(--border-color)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                        >
                                            <i className="fa-solid fa-arrow-right" style={{fontSize: '0.8rem'}}></i>
                                        </button>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <input 
                                            type="number" 
                                            value={state.manualPrice} 
                                            onChange={(e) => handlePriceChange(p.id, e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleUpdatePrice(p.id)}
                                            style={{ 
                                                width: '100%', padding: '0.4rem', borderRadius: '4px', 
                                                border: '1px solid var(--accent-color)', fontWeight: 700,
                                                textAlign: 'right', fontSize: '0.95rem'
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <input 
                                            type="date" 
                                            value={state.validityDate} 
                                            onChange={(e) => handleDateChange(p.id, e.target.value)}
                                            style={{ width: '100%', padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                                        />
                                    </td>
                                    <td style={{textAlign: 'center'}}>
                                        <button 
                                            className="btn btn-primary btn-sm" 
                                            onClick={() => handleUpdatePrice(p.id)}
                                            disabled={!!isSaving}
                                            style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }}
                                        >
                                            {isSaving === p.id ? '...' : 'Publicar'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
