

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier } from '../../types';
import { REPUTATION_LEVELS } from '../../utils/formatters';
import { ReputationStars } from '../common/ReputationStars';

interface SupplierFormModalProps {
    onClose: () => void;
    onSuccess: () => void;
    supplierToEdit?: Supplier | null;
    initialData?: Partial<Supplier> | null;
    isStacked?: boolean;
}

export const SupplierManagementModal: React.FC<SupplierFormModalProps> = ({ onClose, onSuccess, supplierToEdit, initialData, isStacked = false }) => {
    const [mode, setMode] = useState<'view' | 'edit'>((supplierToEdit && !initialData) ? 'view' : 'edit');
    const [isSaving, setIsSaving] = useState(false);

    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [province, setProvince] = useState('');
    const [country, setCountry] = useState('');
    const [phoneCountry, setPhoneCountry] = useState('');
    const [phoneArea, setPhoneArea] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [website, setWebsite] = useState('');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'Activo' | 'Suspendido' | 'Inactivo'>('Activo');
    const [reputation, setReputation] = useState<number>(3); 
    const [taxId, setTaxId] = useState('');
    const [grossIncome, setGrossIncome] = useState('');
    const [taxRegime, setTaxRegime] = useState<'Responsable Inscripto' | 'Monotributista' | 'Proveedor del exterior' | 'Exento'>('Responsable Inscripto');

    const populateForm = useCallback(() => {
        if (supplierToEdit) {
            setName(supplierToEdit.name);
            setAddress(supplierToEdit.address || '');
            setCity(supplierToEdit.city || '');
            setProvince(supplierToEdit.province || '');
            setCountry(supplierToEdit.country || '');
            setPhoneCountry(supplierToEdit.phone_country_code || '');
            setPhoneArea(supplierToEdit.phone_area_code || '');
            setPhoneNumber(supplierToEdit.phone_number || '');
            setWebsite(supplierToEdit.website || '');
            setNotes(supplierToEdit.notes || '');
            setStatus(supplierToEdit.status || 'Activo');
            setReputation(supplierToEdit.reputation || 3);
            setTaxId(supplierToEdit.tax_id || '');
            setGrossIncome(supplierToEdit.gross_income_number || '');
            setTaxRegime(supplierToEdit.tax_regime || 'Responsable Inscripto');
        } else if (initialData) {
            setName(initialData.name || '');
            setAddress(initialData.address || '');
            setCity(initialData.city || '');
            setProvince(initialData.province || '');
            setCountry(initialData.country || '');
            setWebsite(initialData.website || '');
            setPhoneCountry(initialData.phone_country_code || '');
            setPhoneArea(initialData.phone_area_code || '');
            setPhoneNumber(initialData.phone_number || '');
            setStatus('Activo');
            setReputation(3);
            setTaxId(initialData.tax_id || '');
            setGrossIncome(initialData.gross_income_number || '');
            if(initialData.tax_regime) setTaxRegime(initialData.tax_regime);
        } else {
            setName('');
            setAddress('');
            setCity('');
            setProvince('');
            setCountry('');
            setPhoneCountry('');
            setPhoneArea('');
            setPhoneNumber('');
            setWebsite('');
            setNotes('');
            setStatus('Activo');
            setReputation(3);
            setTaxId('');
            setGrossIncome('');
            setTaxRegime('Responsable Inscripto');
        }
    }, [supplierToEdit, initialData]);

    useEffect(() => { populateForm(); }, [populateForm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        setIsSaving(true);
        const supplierData = { 
            name, address, city, province, country, 
            phone_country_code: phoneCountry, phone_area_code: phoneArea, phone_number: phoneNumber, 
            website, notes, status, reputation,
            tax_id: taxId, gross_income_number: grossIncome, tax_regime: taxRegime
        };
        try {
            if (supplierToEdit) {
                await supabase.from('suppliers').update(supplierData).eq('id', supplierToEdit.id);
            } else {
                await supabase.from('suppliers').insert([supplierData]);
            }
            onSuccess();
            onClose();
        } catch (error) {
            alert("Error al guardar proveedor.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        if (supplierToEdit) {
            setMode('view');
            populateForm();
        } else {
            onClose();
        }
    };

    const handleWebsiteBlur = () => {
        if (website && !/^https?:\/\//i.test(website)) {
            setWebsite('https://' + website);
        }
    };

    const title = mode === 'view' ? 'Perfil Corporativo' : (supplierToEdit ? 'Editar Proveedor' : 'Nuevo Proveedor');
    const fullPhoneNumber = [phoneCountry ? `+${phoneCountry}` : '', phoneArea ? `(${phoneArea})` : '', phoneNumber].filter(Boolean).join(' ');

    return (
        <div className={`modal-overlay ${isStacked ? 'stacked' : ''}`} onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2>{title}</h2>
                        {initialData && <span className="ai-badge"><i className="fa-solid fa-wand-magic-sparkles"></i> Autocompletado por IA</span>}
                        {supplierToEdit && <span className="modal-subtitle">ID Sistema: V-{supplierToEdit.supplier_code}</span>}
                    </div>
                    <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                </div>

                {mode === 'view' ? (
                    <div className="modal-form" style={{background: '#f8fafc'}}>
                        <div className="modal-body-layout single-column">
                            
                            {/* Header Card */}
                            <div style={{background: 'white', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-sm)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid white'}}>
                                <div>
                                    <h1 style={{margin: '0 0 0.75rem', fontSize: '1.8rem', color: 'var(--text-main)', letterSpacing: '-0.02em'}}>{name}</h1>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
                                        <div className={`status-badge status-${status.toLowerCase()}`}>{status}</div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#f1f5f9', padding: '0.4rem 1rem', borderRadius: '99px'}}>
                                            <ReputationStars level={reputation} />
                                            <span style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)'}}>{REPUTATION_LEVELS[reputation].label}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{width: '72px', height: '72px', background: 'var(--bg-gradient-blue)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '2rem', boxShadow: '0 10px 15px -3px rgba(30, 58, 138, 0.2)'}}>
                                    <i className="fa-solid fa-building"></i>
                                </div>
                            </div>

                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem'}}>
                                
                                {/* Fiscal Data Card */}
                                <div style={{background: 'white', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-sm)', border: '1px solid white'}}>
                                    <h4 style={{margin: '0 0 1.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.1em', fontWeight: 700}}><i className="fa-solid fa-file-invoice-dollar" style={{marginRight: '0.5rem'}}></i> Datos Fiscales</h4>
                                    
                                    <div style={{display: 'grid', gap: '1.5rem'}}>
                                        <div>
                                            <span className="detail-label">CUIT</span>
                                            <div className="detail-value" style={{fontFamily: 'monospace', fontSize: '1.1rem', marginTop: '0.25rem'}}>{taxId || '-'}</div>
                                        </div>
                                        <div>
                                            <span className="detail-label">Ingresos Brutos</span>
                                            <div className="detail-value" style={{marginTop: '0.25rem'}}>{grossIncome || '-'}</div>
                                        </div>
                                        <div>
                                            <span className="detail-label">Condición IVA</span>
                                            <div className="detail-value" style={{marginTop: '0.25rem'}}>{taxRegime || '-'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Location & Contact Card */}
                                <div style={{background: 'white', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-sm)', border: '1px solid white'}}>
                                    <h4 style={{margin: '0 0 1.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.1em', fontWeight: 700}}><i className="fa-solid fa-location-dot" style={{marginRight: '0.5rem'}}></i> Ubicación y Contacto</h4>
                                    
                                    <div className="detail-group">
                                        <span className="detail-label">Dirección</span>
                                        <div className="detail-value" style={{fontSize: '1rem'}}>{address || '-'}</div>
                                    </div>
                                    <div className="detail-group">
                                        <span className="detail-label">Ciudad / País</span>
                                        <div className="detail-value" style={{fontSize: '1rem'}}>{[city, province, country].filter(Boolean).join(', ') || '-'}</div>
                                    </div>
                                    <div className="detail-group">
                                        <span className="detail-label">Teléfono</span>
                                        <div className="detail-value" style={{fontSize: '1rem'}}>
                                            {fullPhoneNumber ? (
                                                <span style={{fontFamily: 'monospace'}}>
                                                    {fullPhoneNumber}
                                                </span>
                                            ) : '-'}
                                        </div>
                                    </div>
                                    <div className="detail-group" style={{marginBottom: 0}}>
                                        <span className="detail-label">Sitio Web</span>
                                        <div className="detail-value">
                                            {website ? (
                                                <a href={website} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-color)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', padding: '0.5rem 1rem', background: '#ecfeff', borderRadius: '8px', textDecoration: 'none'}}>
                                                    <i className="fa-solid fa-arrow-up-right-from-square" style={{marginRight: '8px'}}></i>
                                                    {website.replace(/^https?:\/\//, '')}
                                                </a>
                                            ) : <span style={{color: 'var(--text-muted)'}}>-</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                        <div className="modal-footer" style={{background: 'white'}}>
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                            <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}><i className="fa-solid fa-pen-to-square"></i> Editar</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="modal-form">
                        <div className="modal-body-layout single-column">
                            <div className="form-section">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="supName">Nombre / Razón Social</label>
                                        <input id="supName" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="supStatus">Estado</label>
                                        <select id="supStatus" value={status} onChange={e => setStatus(e.target.value as any)}>
                                            <option value="Activo">Activo</option>
                                            <option value="Suspendido">Suspendido</option>
                                            <option value="Inactivo">Inactivo</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem', background: '#f8fafc'}}>
                                    <h5 style={{margin: '0 0 1rem 0', color: 'var(--text-main)', fontSize: '1rem', fontWeight: 600}}>Datos Fiscales</h5>
                                    <div className="form-row three-col">
                                        <div className="form-group">
                                            <label>CUIT</label>
                                            <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="30-12345678-9" />
                                        </div>
                                        <div className="form-group">
                                            <label>Ing. Brutos</label>
                                            <input type="text" value={grossIncome} onChange={e => setGrossIncome(e.target.value)} placeholder="123456" />
                                        </div>
                                        <div className="form-group">
                                            <label>Régimen Tributario</label>
                                            <select value={taxRegime} onChange={e => setTaxRegime(e.target.value as any)}>
                                                <option value="Responsable Inscripto">Responsable Inscripto</option>
                                                <option value="Monotributista">Monotributista</option>
                                                <option value="Proveedor del exterior">Proveedor del exterior</option>
                                                <option value="Exento">Exento</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Reputación</label>
                                    <select value={reputation} onChange={e => setReputation(parseInt(e.target.value))}>
                                        <option value={1}>1 – Descartado</option>
                                        <option value={2}>2 – Deficiente</option>
                                        <option value={3}>3 – Regular</option>
                                        <option value={4}>4 – Muy bueno</option>
                                        <option value={5}>5 – Premium</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Dirección</label>
                                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej: Av. Corrientes 1234" />
                                </div>
                                <div className="form-row three-col">
                                    <div className="form-group">
                                        <label>Ciudad</label>
                                        <input value={city} onChange={e => setCity(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Provincia</label>
                                        <input value={province} onChange={e => setProvince(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>País</label>
                                        <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Argentina" />
                                    </div>
                                </div>
                                <div className="form-row three-col">
                                    <div className="form-group">
                                        <label>Cód. País</label>
                                        <input value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)} placeholder="54" />
                                    </div>
                                    <div className="form-group">
                                        <label>Cód. Área</label>
                                        <input value={phoneArea} onChange={e => setPhoneArea(e.target.value)} placeholder="11" />
                                    </div>
                                    <div className="form-group">
                                        <label>Número</label>
                                        <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="12345678" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Sitio Web</label>
                                    <input type="text" value={website} onChange={e => setWebsite(e.target.value)} onBlur={handleWebsiteBlur} placeholder="www.ejemplo.com" />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Guardando...' : (supplierToEdit ? 'Actualizar' : 'Guardar')}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};