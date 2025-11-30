

import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PurchaseCategory, ExpenseCategory } from '../../types';

interface CategoryManagementModalProps {
    onClose: () => void;
    onSuccess: () => void;
    categories: (PurchaseCategory | ExpenseCategory)[];
    categoryType: 'purchase' | 'expense';
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({ onClose, onSuccess, categories, categoryType }) => {
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const tableName = categoryType === 'purchase' ? 'purchase_categories' : 'expense_categories';
    const title = categoryType === 'purchase' ? 'Categorías de Compra' : 'Categorías de Gasto';
    const iconClass = categoryType === 'purchase' ? 'fa-tags' : 'fa-receipt';

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        setIsSaving(true);
        setError('');

        const { error: insertError } = await supabase
            .from(tableName)
            .insert({ name: newCategoryName.trim() });

        if (insertError) {
            console.error("Error adding category:", insertError);
            setError(`Error: ${insertError.message}`);
        } else {
            setNewCategoryName('');
            onSuccess(); // Refresh data in parent
        }
        setIsSaving(false);
    };

    const handleDeleteCategory = async (categoryId: string) => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar esta categoría? Esta acción no se puede deshacer.")) {
            return;
        }
        setIsSaving(true);
        setError('');

        const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .eq('id', categoryId);
        
        if (deleteError) {
            console.error("Error deleting category:", deleteError);
            setError(`Error: No se pudo eliminar. Es posible que esté en uso por algún registro.`);
        } else {
            onSuccess();
        }
        setIsSaving(false);
    };

    const handleStartEdit = (category: PurchaseCategory | ExpenseCategory) => {
        setEditingCategoryId(category.id);
        setEditingCategoryName(category.name);
    };

    const handleCancelEdit = () => {
        setEditingCategoryId(null);
        setEditingCategoryName('');
    };

    const handleUpdateCategory = async () => {
        if (!editingCategoryId || !editingCategoryName.trim()) return;
        setIsSaving(true);
        setError('');

        const { error: updateError } = await supabase
            .from(tableName)
            .update({ name: editingCategoryName.trim() })
            .eq('id', editingCategoryId);

        if (updateError) {
            console.error("Error updating category:", updateError);
            setError(`Error: ${updateError.message}`);
        } else {
            handleCancelEdit();
            onSuccess();
        }
        setIsSaving(false);
    };


    return (
        <div className="modal-overlay stacked" onClick={onClose}>
            {/* COMPACT MODAL STRUCTURE */}
            <div className="modal-content compact" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>
                
                {/* FIXED ADD SECTION */}
                <div className="add-category-section">
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Nueva categoría..."
                            style={{ flex: 1 }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                        />
                        <button className="btn btn-primary" onClick={handleAddCategory} disabled={isSaving || !newCategoryName.trim()}>
                            <i className="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    {error && <p style={{ color: 'var(--error-color)', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: 0 }}>{error}</p>}
                </div>

                {/* SCROLLABLE LIST AREA */}
                <div className="category-list-scroll">
                    <div className="category-list">
                        {categories.length > 0 ? categories.map(cat => (
                            <div key={cat.id} className={`category-item ${editingCategoryId === cat.id ? 'editing' : ''}`}>
                                
                                {/* Column 1: Icon */}
                                <div className="category-icon-container">
                                    <i className={`fa-solid ${iconClass}`}></i>
                                </div>

                                {/* Column 2: Content (Text or Input) */}
                                <div className="category-content">
                                    {editingCategoryId === cat.id ? (
                                        <input
                                            type="text"
                                            value={editingCategoryName}
                                            onChange={(e) => setEditingCategoryName(e.target.value)}
                                            autoFocus
                                            className="category-input"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleUpdateCategory();
                                                if (e.key === 'Escape') handleCancelEdit();
                                            }}
                                        />
                                    ) : (
                                        <span className="category-name-text">{cat.name}</span>
                                    )}
                                </div>

                                {/* Column 3: Actions */}
                                <div className="category-actions">
                                    {editingCategoryId === cat.id ? (
                                        <>
                                            <button onClick={handleUpdateCategory} className="btn btn-primary btn-sm" disabled={isSaving} title="Guardar"><i className="fa-solid fa-check"></i></button>
                                            <button onClick={handleCancelEdit} className="btn btn-secondary btn-sm" title="Cancelar"><i className="fa-solid fa-xmark"></i></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => handleStartEdit(cat)} className="btn btn-secondary btn-sm" title="Editar"><i className="fa-solid fa-pencil"></i></button>
                                            <button onClick={() => handleDeleteCategory(cat.id)} className="btn btn-secondary btn-sm" style={{ color: 'var(--error-color)' }} disabled={isSaving} title="Eliminar"><i className="fa-solid fa-trash"></i></button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'var(--input-bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                                <i className="fa-regular fa-folder-open" style={{fontSize: '2rem', marginBottom: '1rem', display: 'block'}}></i>
                                No hay categorías registradas.
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
};