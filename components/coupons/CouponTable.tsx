

import React from 'react';
import { Coupon } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface CouponTableProps {
    coupons: Coupon[];
    onClick: (coupon: Coupon) => void;
}

export const CouponTable: React.FC<CouponTableProps> = ({ coupons, onClick }) => {
    return (
        <div className="table-container">
            <table className="product-table">
                <thead>
                    <tr>
                        <th>Campaña</th>
                        <th>Código</th>
                        <th>Descuento</th>
                        <th>Vigencia</th>
                        <th>Usos</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {coupons.map(c => {
                        let statusClass = `status-${c.status.toLowerCase()}`;
                        // Fix: Remove incorrect status checks for CouponTable as Coupon status type does not include 'Completada' or 'Anulada'.
                        // These checks were causing type mismatches. The base statusClass `status-${c.status.toLowerCase()}` is sufficient.
                        return (
                            <tr key={c.id} onClick={() => onClick(c)}>
                                <td><span className="table-name">{c.campaign_name}</span></td>
                                <td><span className="table-code">{c.code}</span></td>
                                <td>
                                    {c.discount_type === 'percent' ? `${c.discount_value}%` : formatCurrency(c.discount_value)}
                                </td>
                                <td>{formatDate(c.valid_from)} - {formatDate(c.valid_until)}</td>
                                <td>{c.current_uses} {c.max_uses_total ? ` / ${c.max_uses_total}` : ''}</td>
                                <td><span className={`status-badge ${statusClass}`}>{c.status}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};