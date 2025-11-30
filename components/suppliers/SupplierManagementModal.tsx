
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

    // Ref for Google Map
    const mapRef = useRef<HTMLDivElement>(null);
    
    // Autocomplete State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteService = useRef<any>(null);
    
    // State to track Google Maps API errors (e.g. RefererNotAllowed)
    const [mapError, setMapError] = useState<string | null>(null);

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

    // Global Google Auth Failure Handler
    useEffect(() => {
        const originalAuthFailure = (window as any).gm_authFailure;
        (window as any).gm_authFailure = () => {
            console.error("Google Maps API Authentication Failure");
            setMapError("Acceso denegado a Google Maps. Verifique restricciones de dominio (Referer) en la API Key.");
            if (originalAuthFailure) originalAuthFailure();
        };

        return () => {
            (window as any).gm_authFailure = originalAuthFailure;
        };
    }, []);

    // 1. Google Maps View Integration Effect (VIEW MODE)
    useEffect(() => {
        let isMounted = true;

        const initMap = async () => {
            if (mode !== 'view') return;
            if (mapError) return;

            const fullAddress = [address, city, province, country].filter(Boolean).join(', ');
            
            if (!fullAddress) return;
            if (!mapRef.current) return;

            try {
                if (!(window as any).google || !(window as any).google.maps) return;

                const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
                const { Map } = await (window as any).google.maps.importLibrary("maps");
                const { AdvancedMarkerElement } = await (window as any).google.maps.importLibrary("marker");

                if (!isMounted) return;

                const geocoder = new Geocoder();

                geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                    if (!isMounted) return;
                    
                    if (status === 'OK' && results[0] && mapRef.current) {
                        const map = new Map(mapRef.current, {
                            center: results[0].geometry.location,
                            zoom: 15,
                            disableDefaultUI: true,
                            zoomControl: true,
                            mapTypeControl: false,
                            streetViewControl: false,
                            mapId: 'DEMO_MAP_ID',
                        });
                        
                        new AdvancedMarkerElement({
                            map: map,
                            position: results[0].geometry.location,
                        });
                    } else {
                        console.warn('Geocode was not successful: ' + status);
                        if (status === 'REQUEST_DENIED' || status === 'ERROR') {
                            setMapError(`Error de Mapa: ${status}`);
                        }
                    }
                });
            } catch (e) {
                console.error("Error loading Google Maps libraries:", e);
                setMapError("Error cargando librerías de Google Maps");
            }
        };

        initMap();

        return () => { isMounted = false; };
    }, [mode, address, city, province, country, mapError]);

    // 2. Custom Places Autocomplete Service (EDIT MODE) - Replaces Widget
    useEffect(() => {
        if (mode === 'edit' && !autocompleteService.current) {
            const initService = async () => {
                 if (!(window as any).google) return;
                 try {
                     const { AutocompleteService } = await (window as any).google.maps.importLibrary("places");
                     autocompleteService.current = new AutocompleteService();
                 } catch (e) {
                     console.error("Error loading Places lib", e);
                 }
            };
            initService();
        }
    }, [mode]);

    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setAddress(val);
        setMapError(null);

        if (!val || val.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (autocompleteService.current) {
            autocompleteService.current.getPlacePredictions({ input: val }, (predictions: any[], status: any) => {
                if (status === 'OK' && predictions) {
                    setSuggestions(predictions);
                    setShowSuggestions(true);
                } else if (status === 'REQUEST_DENIED' || status.includes('ERROR')) {
                     // Specific error handling for permissions
                     setMapError(`API Bloqueada (${status}). Habilite 'Places API' y 'Maps JavaScript API' en Google Cloud Console.`);
                     setSuggestions([]);
                } else {
                    setSuggestions([]);
                }
            });
        }
    };

    const handleSelectSuggestion = async (placeId: string, description: string) => {
        setAddress(description);
        setShowSuggestions(false);
        setSuggestions([]);

        try {
             const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
             const geocoder = new Geocoder();
             
             geocoder.geocode({ placeId: placeId }, (results: any, status: any) => {
                 if (status === 'OK' && results[0]) {
                     const comps = results[0].address_components;
                     // Update with formatted address if available for better precision
                     if (results[0].formatted_address) {
                        setAddress(results[0].formatted_address);
                     }

                     let newCity = '';
                     let newProvince = '';
                     let newCountry = '';

                     for (const component of comps) {
                        const type = component.types[0];
                        if (type === "locality") newCity = component.long_name;
                        if (type === "administrative_area_level_2" && !newCity) newCity = component.long_name;
                        if (type === "administrative_area_level_1") newProvince = component.long_name;
                        if (type === "country") newCountry = component.long_name;
                    }
                    if (newCity) setCity(newCity);
                    if (newProvince) setProvince(newProvince);
                    if (newCountry) setCountry(newCountry);
                 }
             });
        } catch (e) {
            console.error(e);
        }
    };

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
                {/* Custom Header for View Mode is hidden, we build a custom one inside the view */}
                {mode !== 'view' && (
                    <div className="modal-header">
                        <div>
                            <h2>{title}</h2>
                            {initialData && <span className="ai-badge"><i className="fa-solid fa-wand-magic-sparkles"></i> Autocompletado por IA</span>}
                            {supplierToEdit && <span className="modal-subtitle">ID Sistema: V-{supplierToEdit.supplier_code}</span>}
                        </div>
                        <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                    </div>
                )}

                {mode === 'view' ? (
                    <div className="modal-form" style={{background: '#f1f5f9', display: 'flex', flexDirection: 'column', height: '100%'}}>
                        {/* Close Button Overlay */}
                         <button onClick={onClose} className="close-btn" style={{position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 50, background: 'rgba(255,255,255,0.5)', color: 'var(--text-main)', border: 'none', backdropFilter: 'blur(4px)'}}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>

                        <div className="modal-body-layout single-column" style={{padding: 0, gap: 0, display: 'block', overflowY: 'auto'}}>
                            
                            {/* Banner / Hero Section */}
                            <div style={{
                                background: 'linear-gradient(135deg, #6ee7b7 0%, var(--bg-gradient-cyan) 100%)',
                                padding: '3rem 2.5rem 6rem 2.5rem',
                                color: 'var(--text-main)',
                                position: 'relative'
                            }}>
                                <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 1}}></div>
                                <div style={{position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                    <div>
                                        <div style={{display: 'flex', gap: '0.75rem', marginBottom: '0.5rem'}}>
                                            <span className={`status-badge status-${status.toLowerCase()}`} style={{border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>{status}</span>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.6)', padding: '0.2rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem', backdropFilter: 'blur(4px)', border: '1px solid rgba(0,0,0,0.05)'}}>
                                                <span style={{color: '#d97706'}}>★</span>
                                                <span style={{fontWeight: 600, color: 'var(--text-main)'}}>{REPUTATION_LEVELS[reputation].label}</span>
                                            </div>
                                        </div>
                                        <h1 style={{margin: 0, fontSize: '2rem', fontWeight: 800}}>{name}</h1>
                                        <div style={{opacity: 0.8, marginTop: '0.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                            <i className="fa-solid fa-fingerprint"></i> ID: V-{supplierToEdit?.supplier_code}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Main Content Card - Overlapping Banner */}
                            <div style={{
                                margin: '-4rem 2.5rem 2.5rem 2.5rem',
                                display: 'grid',
                                gridTemplateColumns: '1fr 320px',
                                gap: '1.5rem',
                                position: 'relative',
                                zIndex: 20
                            }}>
                                {/* Left Column: Contact & Location */}
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                                    {/* Icon Avatar */}
                                    <div style={{
                                        width: '80px', height: '80px', 
                                        background: 'white', borderRadius: '1rem', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '2.5rem', color: 'var(--bg-gradient-blue)',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        border: '1px solid #e2e8f0',
                                        marginTop: '-1rem'
                                    }}>
                                        <i className="fa-solid fa-building"></i>
                                    </div>

                                    {/* Contact Card */}
                                    <div style={{background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0'}}>
                                        <h4 style={{margin: '0 0 1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700}}>Información de Contacto</h4>
                                        
                                        <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
                                            <div className="detail-group">
                                                <span className="detail-label"><i className="fa-solid fa-phone" style={{marginRight: '6px'}}></i> Teléfono</span>
                                                <div className="detail-value" style={{fontSize: '1rem', fontFamily: 'monospace'}}>
                                                    {fullPhoneNumber || <span style={{color: 'var(--text-muted)'}}>-</span>}
                                                </div>
                                            </div>
                                            <div className="detail-group">
                                                <span className="detail-label"><i className="fa-solid fa-globe" style={{marginRight: '6px'}}></i> Sitio Web</span>
                                                <div className="detail-value">
                                                    {website ? (
                                                        <a href={website} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-color)', fontWeight: 600, textDecoration: 'none'}}>
                                                            {website.replace(/^https?:\/\//, '')}
                                                        </a>
                                                    ) : <span style={{color: 'var(--text-muted)'}}>-</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location Map */}
                                    <div style={{background: 'white', borderRadius: '1rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column'}}>
                                        {/* Google Map Container */}
                                        <div 
                                            style={{height: '250px', width: '100%', background: '#f1f5f9', position: 'relative'}}
                                        >
                                            {mapError ? (
                                                <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--error-color)', padding: '1rem', textAlign: 'center'}}>
                                                     <i className="fa-solid fa-triangle-exclamation" style={{fontSize: '2rem', marginBottom: '0.5rem'}}></i>
                                                     <span style={{fontWeight: 700}}>Mapa no disponible</span>
                                                     <span style={{fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--text-secondary)'}}>{mapError}</span>
                                                </div>
                                            ) : (
                                                <div ref={mapRef} style={{width: '100%', height: '100%'}}></div>
                                            )}
                                            
                                            {!address && !mapError && (
                                                <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', background: '#f1f5f9'}}>
                                                     <i className="fa-solid fa-map-location-dot" style={{fontSize: '2rem', marginBottom: '0.5rem'}}></i>
                                                     <span>Sin dirección para mostrar</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div style={{padding: '1.25rem'}}>
                                            <h4 style={{margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700}}>Ubicación</h4>
                                            <p style={{margin: 0, fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-main)'}}>{address || 'Sin dirección registrada'}</p>
                                            <p style={{margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                                                {[city, province, country].filter(Boolean).join(', ')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Fiscal & Stats */}
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    {/* Fiscal Card */}
                                    <div style={{background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0', height: 'fit-content'}}>
                                        <h4 style={{margin: '0 0 1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700}}>
                                            <i className="fa-solid fa-scale-balanced" style={{marginRight: '8px'}}></i> Datos Fiscales
                                        </h4>
                                        
                                        <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
                                            <div>
                                                <span className="detail-label">CUIT</span>
                                                <div style={{fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.25rem'}}>
                                                    {taxId || '-'}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="detail-label">Condición IVA</span>
                                                <div style={{fontSize: '0.95rem', fontWeight: 500}}>
                                                    {taxRegime || '-'}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="detail-label">Ingresos Brutos</span>
                                                <div style={{fontSize: '0.95rem', fontWeight: 500}}>
                                                    {grossIncome || '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notes Card (if exists) */}
                                    {notes && (
                                        <div style={{background: '#fffbeb', borderRadius: '1rem', padding: '1.25rem', border: '1px solid #fcd34d'}}>
                                            <h4 style={{margin: '0 0 0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: '#b45309', fontWeight: 700}}>Notas Internas</h4>
                                            <p style={{margin: 0, fontSize: '0.9rem', color: '#92400e', lineHeight: 1.5, fontStyle: 'italic'}}>
                                                "{notes}"
                                            </p>
                                        </div>
                                    )}

                                    {/* Actions Card */}
                                     <div style={{background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0'}}>
                                        <button onClick={() => setMode('edit')} style={{width: '100%', padding: '0.75rem', background: 'var(--primary-color)', color: 'var(--primary-text)', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
                                            <i className="fa-solid fa-pen-to-square"></i> Editar Perfil
                                        </button>
                                    </div>
                                </div>
                            </div>
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
                                <div className="form-group" style={{position: 'relative'}}>
                                    <label>Dirección</label>
                                    <div className="searchable-select-container">
                                        <input 
                                            type="text" 
                                            value={address} 
                                            onChange={handleAddressChange} 
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            placeholder="Buscar dirección (Calle, Altura...)"
                                            style={{width: '100%', paddingRight: '2rem'}}
                                            autoComplete="off"
                                        />
                                        <i className="fa-solid fa-magnifying-glass" style={{position: 'absolute', right: '12px', top: '12px', color: 'var(--text-muted)'}}></i>
                                    </div>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <ul className="search-dropdown" style={{display: 'block', zIndex: 100}}>
                                            {suggestions.map((s, idx) => (
                                                <li key={idx} onClick={() => handleSelectSuggestion(s.place_id, s.description)} className="search-result-item">
                                                    <span className="search-item-name" style={{fontWeight: 400, fontSize: '0.9rem'}}>{s.description}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {mapError && (
                                        <div style={{color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '0.5rem', background: '#fee2e2', padding: '0.5rem', borderRadius: 'var(--radius-md)'}}>
                                            <i className="fa-solid fa-triangle-exclamation"></i> {mapError}
                                        </div>
                                    )}
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
                                <div className="form-group">
                                    <label>Notas Internas</label>
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotaciones privadas sobre este proveedor..." style={{minHeight: '80px'}} />
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
