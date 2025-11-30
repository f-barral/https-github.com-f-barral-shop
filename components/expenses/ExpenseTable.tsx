
import React from 'react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ExpenseTableProps {
    expenses: Expense[];
}

export const ExpenseTable: React.FC<ExpenseTableProps> = ({ expenses }) => {
    return (
        <div className="table-container">
            <table className="product-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th>Proveedor</th>
                        <th>Nº Factura</th>
                        <th style={{textAlign: 'right'}}>Monto</th>
                    </tr>
                </thead>
                <tbody>
                    {expenses.map(e => (
                        <tr key={e.id}>
                            <td>{formatDate(e.expense_date)}</td>
                            <td><span className="table-name">{e.description}</span></td>
                            <td>{e.expense_categories?.name || '-'}</td>
                            <td>{e.suppliers?.name || '-'}</td>
                            <td>{e.invoice_number || '-'}</td>
                            <td style={{textAlign: 'right'}}><span className="price-tag-sm">{formatCurrency(e.amount)}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
