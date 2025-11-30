
import React, { useState, useMemo } from 'react';
import { Sale, Expense, Batch, Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface FinancialAnalysisProps {
    sales: Sale[];
    expenses: Expense[];
    batches: Batch[];
    products: Product[];
}

export const FinancialAnalysis: React.FC<FinancialAnalysisProps> = ({ sales, expenses, batches, products }) => {
    // Default to current month or allow selection
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // 1. Calculate Product Unit Costs (Weighted Average / Precio Promedio Ponderado)
    // Formula: Total Purchase Value / Total Purchase Quantity
    const productCosts = useMemo(() => {
        const costs: Record<string, number> = {};
        products.forEach(p => {
            // Find all batches for this product
            const prodBatches = batches.filter(b => 
                b.product_id === p.id || (b.products?.name === p.name) // Fallback for name match
            );

            if (prodBatches.length > 0) {
                const totalValue = prodBatches.reduce((sum, b) => sum + (b.unit_cost * b.quantity), 0);
                const totalQty = prodBatches.reduce((sum, b) => sum + b.quantity, 0);
                costs[p.id] = totalQty > 0 ? totalValue / totalQty : 0;
            } else {
                costs[p.id] = 0;
            }
        });
        return costs;
    }, [products, batches]);

    // 2. Filter Data for Selected Month
    const metrics = useMemo(() => {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr) - 1; // JS months are 0-indexed

        // Filter Sales (Completed only)
        const monthlySales = sales.filter(s => {
            const d = new Date(s.sale_date);
            // Fix timezone issue by using UTC or simply comparing parts
            const saleYear = d.getFullYear();
            const saleMonth = d.getMonth();
            return saleYear === year && saleMonth === month && s.status === 'Completada';
        });

        // Calculate Revenue (Ingresos)
        const revenue = monthlySales.reduce((sum, s) => sum + s.total_price, 0);

        // Calculate COGS (Costo de Mercadería Vendida)
        // Sum of (Sold Quantity * Weighted Average Unit Cost)
        const cogs = monthlySales.reduce((sum, s) => {
            const unitCost = productCosts[s.product_id] || 0;
            return sum + (s.quantity * unitCost);
        }, 0);

        // Filter Expenses (Gastos Operativos)
        const monthlyExpenses = expenses.filter(e => {
            const d = new Date(e.expense_date);
            const expYear = d.getFullYear();
            const expMonth = d.getMonth();
            return expYear === year && expMonth === month;
        });

        const operatingExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Calculate Gross Margin (Ganancia Bruta)
        const grossMargin = revenue - cogs;

        // Calculate Net Income (Resultado Neto)
        const netIncome = grossMargin - operatingExpenses;

        return {
            revenue,
            cogs,
            grossMargin,
            operatingExpenses,
            netIncome,
            salesCount: monthlySales.length,
            monthlySales,
            monthlyExpenses
        };
    }, [sales, expenses, selectedMonth, productCosts]);

    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedMonth(e.target.value);
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s' }}>
             {/* Header with Date Picker */}
            <div style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '1rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                marginBottom: '2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1e293b' }}>Estado de Resultados</h2>
                    <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>Análisis de rentabilidad mensual (Criterio Devengado)</p>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <label style={{fontWeight: 600, color: '#475569'}}>Período:</label>
                    <input 
                        type="month" 
                        value={selectedMonth} 
                        onChange={handleMonthChange}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #cbd5e1',
                            fontSize: '1rem',
                            fontFamily: 'inherit',
                            color: '#0f172a'
                        }}
                    />
                </div>
            </div>

            {/* Waterfall Breakdown Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* 1. Ingresos */}
                <div className="financial-card" style={{ borderLeft: '5px solid #3b82f6' }}>
                    <div className="f-row">
                        <div className="f-icon" style={{ color: '#3b82f6', background: '#eff6ff' }}><i className="fa-solid fa-cash-register"></i></div>
                        <div className="f-content">
                            <span className="f-label">1. Ingresos por Ventas</span>
                            <span className="f-desc">Total facturado en el mes ({metrics.salesCount} ventas)</span>
                        </div>
                        <div className="f-value" style={{ color: '#3b82f6' }}>{formatCurrency(metrics.revenue)}</div>
                    </div>
                </div>

                {/* 2. CMV */}
                <div className="financial-card" style={{ borderLeft: '5px solid #f97316' }}>
                    <div className="f-row">
                        <div className="f-icon" style={{ color: '#f97316', background: '#fff7ed' }}><i className="fa-solid fa-boxes-packing"></i></div>
                        <div className="f-content">
                            <span className="f-label">2. Costo de Mercadería Vendida (CMV)</span>
                            <span className="f-desc">Costo de reposición de los productos vendidos</span>
                        </div>
                        <div className="f-value" style={{ color: '#f97316' }}>- {formatCurrency(metrics.cogs)}</div>
                    </div>
                </div>

                {/* 3. Ganancia Bruta */}
                <div className="financial-card" style={{ borderLeft: '5px solid #eab308', background: '#fefce8' }}>
                    <div className="f-row">
                        <div className="f-icon" style={{ color: '#eab308', background: '#fef9c3' }}><i className="fa-solid fa-scale-balanced"></i></div>
                        <div className="f-content">
                            <span className="f-label">3. Ganancia Bruta</span>
                            <span className="f-desc">Ingresos - Costos Directos</span>
                        </div>
                        <div className="f-value" style={{ color: '#a16207' }}>{formatCurrency(metrics.grossMargin)}</div>
                    </div>
                </div>

                {/* 4. Gastos Operativos */}
                <div className="financial-card" style={{ borderLeft: '5px solid #ef4444' }}>
                    <div className="f-row">
                        <div className="f-icon" style={{ color: '#ef4444', background: '#fef2f2' }}><i className="fa-solid fa-file-invoice-dollar"></i></div>
                        <div className="f-content">
                            <span className="f-label">4. Gastos Operativos</span>
                            <span className="f-desc">Alquiler, servicios, impuestos, etc.</span>
                        </div>
                        <div className="f-value" style={{ color: '#ef4444' }}>- {formatCurrency(metrics.operatingExpenses)}</div>
                    </div>
                </div>

                {/* 5. Resultado Neto */}
                <div className="financial-card main-result" style={{ 
                    borderLeft: `5px solid ${metrics.netIncome >= 0 ? '#10b981' : '#dc2626'}`,
                    background: metrics.netIncome >= 0 ? '#f0fdf4' : '#fef2f2'
                }}>
                    <div className="f-row">
                        <div className="f-icon" style={{ 
                            color: metrics.netIncome >= 0 ? '#10b981' : '#dc2626', 
                            background: metrics.netIncome >= 0 ? '#dcfce7' : '#fee2e2' 
                        }}>
                            {metrics.netIncome >= 0 ? <i className="fa-solid fa-trophy"></i> : <i className="fa-solid fa-triangle-exclamation"></i>}
                        </div>
                        <div className="f-content">
                            <span className="f-label" style={{ fontSize: '1.2rem' }}>5. Resultado Neto</span>
                            <span className="f-desc">Ganancia o Pérdida Final</span>
                        </div>
                        <div className="f-value" style={{ 
                            fontSize: '1.8rem', 
                            color: metrics.netIncome >= 0 ? '#15803d' : '#991b1b' 
                        }}>
                            {formatCurrency(metrics.netIncome)}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .financial-card {
                    background: white;
                    padding: 1.5rem;
                    border-radius: 0.75rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    transition: transform 0.2s;
                }
                .financial-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .f-row {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .f-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    flex-shrink: 0;
                }
                .f-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .f-label {
                    font-weight: 700;
                    color: #1e293b;
                    font-size: 1rem;
                }
                .f-desc {
                    color: #64748b;
                    font-size: 0.85rem;
                }
                .f-value {
                    font-weight: 800;
                    font-size: 1.25rem;
                    font-family: monospace;
                }
                .main-result .f-label {
                    color: #0f172a;
                }
                @media (max-width: 640px) {
                    .f-row { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
                    .f-icon { margin-bottom: 0.5rem; }
                    .f-value { align-self: flex-end; font-size: 1.5rem; }
                }
            `}</style>
        </div>
    );
};
