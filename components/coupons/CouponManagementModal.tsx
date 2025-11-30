

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Coupon, Product } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import QRCode from 'qrcode'; // Native JS library from importmap

// Constants for coupon rules
const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'QR'];
const DAYS_OF_WEEK = [
    { label: 'Domingo', value: 0 },
    { label: 'Lunes', value: 1 },
    { label: 'Martes', value: 2 },
    { label: 'Miércoles', value: 3 },
    { label: 'Jueves', value: 4 },
    { label: 'Viernes', value: 5 },
    { label: 'Sábado', value: 6 },
];
const QR_CODE_STORAGE_BUCKET = 'coupon-qrs';

interface CouponManagementModalProps {
    onClose: () => void;
    onSuccess: () => void;
    couponToEdit?: Coupon | null;
    products: Product[];
}

// Pure function to generate a coupon code
const generateCouponCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};


export const CouponManagementModal: React.FC<CouponManagementModalProps> = ({ onClose, onSuccess, couponToEdit, products }) => {
    const [mode, setMode] = useState<'view' | 'edit'>((couponToEdit) ? 'view' : 'edit');
    const [isSaving, setIsSaving] = useState(false);
    
    // UI State for confirmation and feedback
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteRestrictionError, setDeleteRestrictionError] = useState(false);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);


    // Coupon Data
    const [campaignName, setCampaignName] = useState('');
    const [code, setCode] = useState('');
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
    const [discountValue, setDiscountValue] = useState('');
    const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
    const [validUntil, setValidUntil] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<'Activo' | 'Agotado' | 'Finalizado' | 'Suspendido'>('Activo');

    // Rule Toggles & Values
    const [enableMaxUses, setEnableMaxUses] = useState(false);
    const [maxUsesTotal, setMaxUsesTotal] = useState('');

    const [enableMinPurchase, setEnableMinPurchase] = useState(false);
    const [minPurchaseAmount, setMinPurchaseAmount] = useState('');

    const [enableProductSpecific, setEnableProductSpecific] = useState(false);
    const [appliesToProductId, setAppliesToProductId] = useState('');

    const [enablePaymentMethod, setEnablePaymentMethod] = useState(false);
    const [validPaymentMethods, setValidPaymentMethods] = useState<string[]>([]);

    const [enableDaysOfWeek, setEnableDaysOfWeek] = useState(false);
    const [validDaysOfWeek, setValidDaysOfWeek] = useState<number[]>([]);

    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

    // Reference for hidden canvas to generate QR blob
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);

    // Reference for visible canvas in view mode
    const qrViewCanvasRef = useRef<HTMLCanvasElement>(null);

    const populateForm = useCallback(() => {
        if (couponToEdit) {
            setCampaignName(couponToEdit.campaign_name);
            setCode(couponToEdit.code);
            setDiscountType(couponToEdit.discount_type);
            setDiscountValue(couponToEdit.discount_value.toString());
            setValidFrom(couponToEdit.valid_from);
            setValidUntil(couponToEdit.valid_until);
            setStatus(couponToEdit.status);

            setEnableMaxUses(couponToEdit.max_uses_total !== null && couponToEdit.max_uses_total !== undefined);
            setMaxUsesTotal(couponToEdit.max_uses_total?.toString() || '');

            setEnableMinPurchase(couponToEdit.min_purchase_amount !== null && couponToEdit.min_purchase_amount !== undefined);
            setMinPurchaseAmount(couponToEdit.min_purchase_amount?.toString() || '');

            setEnableProductSpecific(couponToEdit.applies_to_product_id !== null && couponToEdit.applies_to_product_id !== undefined);
            setAppliesToProductId(couponToEdit.applies_to_product_id || '');

            setEnablePaymentMethod(couponToEdit.valid_payment_methods && couponToEdit.valid_payment_methods.length > 0);
            setValidPaymentMethods(couponToEdit.valid_payment_methods || []);

            setEnableDaysOfWeek(couponToEdit.valid_days_of_week && couponToEdit.valid_days_of_week.length > 0);
            setValidDaysOfWeek(couponToEdit.valid_days_of_week || []);
            
            setQrCodeDataUrl(couponToEdit.qr_code_url || null);

        } else {
            setCampaignName('');
            setCode(generateCouponCode());
            setDiscountType('percent');
            setDiscountValue('');
            setValidFrom(new Date().toISOString().split('T')[0]);
            setValidUntil(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); 
            setStatus('Activo');

            setEnableMaxUses(false); setMaxUsesTotal('');
            setEnableMinPurchase(false); setMinPurchaseAmount('');
            setEnableProductSpecific(false); setAppliesToProductId('');
            setEnablePaymentMethod(false); setValidPaymentMethods([]);
            setEnableDaysOfWeek(false); setValidDaysOfWeek([]);
            setQrCodeDataUrl(null);
        }
    }, [couponToEdit]);

    useEffect(() => { populateForm(); }, [populateForm]);

    // Effect to draw QR code on hidden canvas for saving
    useEffect(() => {
        if (code && qrCanvasRef.current) {
            QRCode.toCanvas(qrCanvasRef.current, code, { width: 256, margin: 1 }, (error: any) => {
                if (error) console.error("QR Generation Error:", error);
            });
        }
    }, [code]);

    // Effect to draw QR code on visible canvas in VIEW mode
    useEffect(() => {
        if (mode === 'view' && code && qrViewCanvasRef.current) {
             QRCode.toCanvas(qrViewCanvasRef.current, code, { width: 256, margin: 2, scale: 8, color: { dark: '#1e3a8a', light: '#ffffff' } }, (error: any) => {
                if (error) console.error("QR View Generation Error:", error);
            });
        }
    }, [mode, code]);

    const handlePaymentMethodToggle = (method: string) => {
        setValidPaymentMethods(prev =>
            prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
        );
    };

    const handleDayOfWeekToggle = (day: number) => {
        setValidDaysOfWeek(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const generateAndUploadQRCode = async (couponCode: string, couponId: string) => {
        if (!qrCanvasRef.current) {
            console.error("Canvas ref is null, cannot generate QR blob");
            return null;
        }

        try {
            const qrImageBlob: Blob = await new Promise(resolve => qrCanvasRef.current!.toBlob(blob => resolve(blob!), 'image/png'));
            const fileName = `coupon-${couponId}-qr.png`;

            const { data, error } = await supabase.storage.from(QR_CODE_STORAGE_BUCKET).upload(fileName, qrImageBlob, {
                cacheControl: '3600',
                upsert: true,
            });

            if (error) throw error;

            const { data: publicUrlData } = supabase.storage.from(QR_CODE_STORAGE_BUCKET).getPublicUrl(fileName);
            if (!publicUrlData.publicUrl) throw new Error("No se pudo obtener la URL pública del QR");
            
            setQrCodeDataUrl(publicUrlData.publicUrl);
            return publicUrlData.publicUrl;
        } catch (error) {
            console.error("Error al subir el QR:", error);
            return null;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Detailed validation
        if (!campaignName.trim()) { alert("Falta el Nombre de Campaña."); return; }
        if (!code.trim()) { alert("Falta el Código del Cupón."); return; }
        if (!discountValue || isNaN(parseFloat(discountValue))) { alert("Falta o es inválido el Valor del Descuento."); return; }
        if (!validFrom) { alert("Falta la fecha de inicio de vigencia."); return; }
        if (!validUntil) { alert("Falta la fecha de fin de vigencia."); return; }
        if (new Date(validFrom) > new Date(validUntil)) { alert("La fecha de inicio no puede ser posterior a la fecha de fin."); return; }

        setIsSaving(true);

        const couponData = {
            campaign_name: campaignName,
            code,
            discount_type: discountType,
            discount_value: parseFloat(discountValue),
            valid_from: validFrom,
            valid_until: validUntil,
            status,
            max_uses_total: enableMaxUses ? (parseInt(maxUsesTotal) || null) : null,
            min_purchase_amount: enableMinPurchase ? (parseFloat(minPurchaseAmount) || null) : null,
            applies_to_product_id: enableProductSpecific ? (appliesToProductId || null) : null,
            valid_payment_methods: enablePaymentMethod ? validPaymentMethods : [],
            valid_days_of_week: enableDaysOfWeek ? validDaysOfWeek : [],
        };

        try {
            let currentCouponId = couponToEdit?.id;
            if (couponToEdit) {
                const { error } = await supabase.from('coupons').update(couponData).eq('id', couponToEdit.id);
                if (error) throw error;
                currentCouponId = couponToEdit.id;
            } else {
                const { data, error } = await supabase.from('coupons').insert([couponData]).select('id').single();
                if (error) throw error;
                currentCouponId = data.id;
            }

            if (currentCouponId && code) {
                const qrUrl = await generateAndUploadQRCode(code, currentCouponId);
                if (qrUrl) {
                    await supabase.from('coupons').update({ qr_code_url: qrUrl }).eq('id', currentCouponId);
                }
            }
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error("Error al guardar cupón:", error);
            alert("Error al guardar el cupón: " + (error.message || 'Error desconocido'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        if (couponToEdit) {
            setMode('view');
            populateForm();
        } else {
            onClose();
        }
    };

    // Trigger confirmation UI instead of window.confirm
    const handleDeleteClick = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // VALIDATION: Check for existing uses
        if (couponToEdit && couponToEdit.current_uses > 0) {
            setDeleteRestrictionError(true);
            return;
        }

        setShowDeleteConfirm(true);
    };

    // Actual delete operation
    const confirmDelete = async () => {
        if (!couponToEdit) return;
        setIsSaving(true);
        try {
            // 1. Attempt delete (without .select() to avoid RLS return restrictions)
            const { error: deleteError } = await supabase
                .from('coupons')
                .delete()
                .eq('id', couponToEdit.id);

            if (deleteError) throw deleteError;

            // 2. Verify if it's actually gone
            // If RLS allows delete, it should be gone (maybeSingle returns null).
            // If RLS silently blocked delete, it will still be there (maybeSingle returns object).
            const { data: exists, error: checkError } = await supabase
                .from('coupons')
                .select('id')
                .eq('id', couponToEdit.id)
                .maybeSingle();
            
            if (checkError) throw checkError;

            // If we found the record, it wasn't deleted
            if (exists) {
                throw new Error("La operación fue completada pero el registro persiste. Verifique los permisos de eliminación (RLS) en su base de datos.");
            }
            
            // Success flow
            setShowDeleteConfirm(false);
            setShowSuccessMessage(true);
            
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
            
        } catch (error: any) {
            console.error("Error al eliminar:", error);
            // Show alert but keep modal open so user knows it failed
            alert(error.message || "Error al eliminar el cupón.");
            setIsSaving(false);
            setShowDeleteConfirm(false);
        }
    };

    // Social Sharing Handlers
    const handleShare = async (platform: 'whatsapp' | 'facebook' | 'instagram' | 'copy') => {
        const text = `¡Aprovecha esta promoción! ${campaignName} con ${discountValue}${discountType === 'percent' ? '%' : '$'} de descuento. Código: *${code}*.`;
        const url = window.location.href; // In a real app, this would be the coupon specific URL

        if (platform === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
        } else if (platform === 'facebook') {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
        } else if (platform === 'instagram') {
            // Instagram sharing is best done via image on mobile. We'll trigger the download.
            handleDownloadImage();
        } else if (platform === 'copy') {
            navigator.clipboard.writeText(url).then(() => {
                alert("Enlace copiado al portapapeles.");
            }).catch(err => {
                console.error("Error al copiar enlace:", err);
            });
        }
    };

    const handleDownloadImage = () => {
        if (qrViewCanvasRef.current) {
            const link = document.createElement('a');
            link.download = `cupon-${code}.png`;
            link.href = qrViewCanvasRef.current.toDataURL('image/png');
            link.click();
        } else {
            alert("El código QR aún no está listo para descargar.");
        }
    };

    const title = mode === 'view' ? 'Cupón Digital' : (couponToEdit ? 'Editar Cupón' : 'Nuevo Cupón');

    // Display values for view mode
    const currentProduct = products.find(p => p.id === appliesToProductId);

    // Helpers to check rules for view mode
    const hasMaxUsesRule = couponToEdit?.max_uses_total !== null && couponToEdit?.max_uses_total !== undefined;
    const hasMinPurchaseRule = couponToEdit?.min_purchase_amount !== null && couponToEdit?.min_purchase_amount !== undefined;
    const hasProductRule = couponToEdit?.applies_to_product_id !== null && couponToEdit?.applies_to_product_id !== undefined;
    const hasPaymentMethodRule = couponToEdit?.valid_payment_methods && couponToEdit.valid_payment_methods.length > 0;
    const hasDaysRule = couponToEdit?.valid_days_of_week && couponToEdit.valid_days_of_week.length > 0;
    const hasAnyRule = hasMaxUsesRule || hasMinPurchaseRule || hasProductRule || hasPaymentMethodRule || hasDaysRule;

    // Resolve product name for view mode if relation is populated or find in products list
    const viewProductName = couponToEdit?.products?.name || (couponToEdit?.applies_to_product_id ? products.find(p => p.id === couponToEdit.applies_to_product_id)?.name : 'Producto desconocido');
    const viewProductCode = couponToEdit?.products?.material_code || (couponToEdit?.applies_to_product_id ? products.find(p => p.id === couponToEdit.applies_to_product_id)?.material_code : '');


    return (
        <div className={`modal-overlay`} onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: mode === 'view' ? '900px' : '1200px', height: mode === 'view' ? 'auto' : '90vh', maxHeight: '900px', background: mode === 'view' ? 'transparent' : 'white', boxShadow: mode === 'view' ? 'none' : ''}}>
                
                {mode === 'view' ? (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'scaleIn 0.3s', position: 'relative'}}>
                        
                        {/* 1. SUCCESS MESSAGE OVERLAY */}
                        {showSuccessMessage && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.98)',
                                zIndex: 150, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', borderRadius: '1.5rem',
                                animation: 'fadeIn 0.2s'
                            }}>
                                <div style={{width:'80px', height:'80px', borderRadius:'50%', background:'#dcfce7', color:'#10b981', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'3rem', marginBottom:'1.5rem'}}>
                                    <i className="fa-solid fa-check"></i>
                                </div>
                                <h3 style={{fontSize: '1.5rem', color: '#0f172a', marginBottom: '0.5rem'}}>¡Eliminado!</h3>
                                <p style={{color: '#64748b'}}>El cupón ha sido eliminado correctamente.</p>
                            </div>
                        )}

                        {/* 2. RESTRICTION ERROR MODAL */}
                        {deleteRestrictionError && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(5px)',
                                zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '1.5rem'
                            }} onClick={() => setDeleteRestrictionError(false)}>
                                <div style={{
                                    background: 'white', padding: '2rem', borderRadius: '1rem',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                                    textAlign: 'center', maxWidth: '400px', border: '1px solid #fee2e2', width: '90%'
                                }} onClick={e => e.stopPropagation()}>
                                    <div style={{fontSize: '3rem', color: '#ef4444', marginBottom: '1rem'}}>
                                        <i className="fa-solid fa-ban"></i>
                                    </div>
                                    <h3 style={{fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem'}}>
                                        Acción Denegada
                                    </h3>
                                    <p style={{color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5'}}>
                                        No se puede eliminar el cupón <strong>{couponToEdit?.code}</strong> porque ya tiene <strong>{couponToEdit?.current_uses} uso(s)</strong> registrados.
                                        <br/><br/>
                                        <span style={{fontSize:'0.85rem'}}>Para desactivarlo, edítelo y cambie su estado a <strong>Suspendido</strong> o <strong>Finalizado</strong>.</span>
                                    </p>
                                    <button className="btn btn-primary" onClick={() => setDeleteRestrictionError(false)}>
                                        Entendido
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 3. CONFIRM DELETE DIALOG */}
                        {showDeleteConfirm && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
                                zIndex: 100, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', borderRadius: '1.5rem'
                            }}>
                                <div style={{
                                    background: 'white', padding: '2rem', borderRadius: '1rem',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                    textAlign: 'center', maxWidth: '400px', border: '1px solid #e2e8f0', width: '90%'
                                }}>
                                    <div style={{fontSize: '3rem', color: '#ef4444', marginBottom: '1rem'}}>
                                        <i className="fa-solid fa-circle-exclamation"></i>
                                    </div>
                                    <h3 style={{fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem'}}>
                                        ¿Eliminar Cupón?
                                    </h3>
                                    <p style={{color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5'}}>
                                        Esta acción eliminará permanentemente el cupón <strong>{couponToEdit?.code}</strong>. No se puede deshacer.
                                    </p>
                                    <div style={{display: 'flex', gap: '1rem', justifyContent: 'center'}}>
                                        <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isSaving}>
                                            Cancelar
                                        </button>
                                        <button className="btn btn-primary" onClick={confirmDelete} disabled={isSaving} style={{background: '#ef4444', borderColor: '#ef4444', color: 'white'}}>
                                            {isSaving ? 'Eliminando...' : 'Sí, Eliminar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Ticket Style Container */}
                        <div style={{
                            background: 'white',
                            borderRadius: '1.5rem',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            overflow: 'hidden',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'row' // Default to row for desktop
                        }}>
                            {/* Left Side: Coupon Details */}
                            <div style={{
                                flex: '1.5',
                                padding: '2.5rem',
                                background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}>
                                {/* Decorative ZigZag Border Effect (Simulated with radial gradients) */}
                                <div style={{position: 'absolute', right: '-10px', top: '0', bottom: '0', width: '20px', background: 'radial-gradient(circle, transparent 0.5rem, #f8fafc 0.5rem) repeat-y', backgroundSize: '20px 30px', backgroundPosition: '-10px 0', zIndex: 10}}></div>

                                <div>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem'}}>
                                        <div>
                                            <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#64748b', fontWeight: 700}}>Campaña Promocional</span>
                                            <h1 style={{margin: '0.5rem 0 0', fontSize: '2.2rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1}}>{campaignName}</h1>
                                        </div>
                                        <div style={{background: '#1e3a8a', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(30, 58, 138, 0.3)'}}>
                                            {status}
                                        </div>
                                    </div>

                                    <div style={{marginTop: '2rem'}}>
                                        <div style={{fontSize: '4.5rem', fontWeight: 900, color: '#49FFF5', textShadow: '2px 2px 0px #1e3a8a', lineHeight: 1, marginBottom: '0.5rem'}}>
                                            {discountType === 'percent' ? `${discountValue}%` : formatCurrency(parseFloat(discountValue))}
                                        </div>
                                        <div style={{fontSize: '1.2rem', fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                                            {discountType === 'percent' ? 'de Descuento' : 'de Ahorro Directo'}
                                        </div>
                                        <p style={{fontSize: '0.95rem', color: '#64748b', marginTop: '0.5rem', maxWidth: '80%'}}>
                                            Válido para compras realizadas entre el <strong>{formatDate(validFrom)}</strong> y el <strong>{formatDate(validUntil)}</strong>.
                                        </p>
                                    </div>
                                </div>

                                <div style={{marginTop: '3rem'}}>
                                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0'}}>
                                        <div>
                                            <div style={{fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: '0.25rem'}}>Condiciones</div>
                                            <div style={{fontSize: '0.9rem', color: '#334155', fontWeight: 500, display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                                                {hasMinPurchaseRule && <div>Min. Compra: {formatCurrency(parseFloat(couponToEdit?.min_purchase_amount?.toString() || '0'))}</div>}
                                                {hasMaxUsesRule && <div>Cupos limitados: {couponToEdit?.max_uses_total}</div>}
                                                {hasPaymentMethodRule && <div>Medios: {couponToEdit?.valid_payment_methods?.join(', ')}</div>}
                                                {hasDaysRule && <div>Días: {couponToEdit?.valid_days_of_week?.map(d => DAYS_OF_WEEK[d].label.substring(0,3)).join(', ')}</div>}
                                                {!hasAnyRule && <div>Sin restricciones mayores</div>}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: '0.25rem'}}>Aplica En</div>
                                            <div style={{fontSize: '0.9rem', color: '#334155', fontWeight: 500}}>
                                                {hasProductRule ? (
                                                    <span>{viewProductName} {viewProductCode ? `(#${viewProductCode})` : ''}</span>
                                                ) : 'Toda la tienda'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: QR & Code */}
                            <div style={{
                                flex: '1',
                                background: '#1e3a8a',
                                padding: '2.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                position: 'relative',
                                borderLeft: '2px dashed rgba(255,255,255,0.3)'
                            }}>
                                {/* Punch Hole Effect */}
                                <div style={{position: 'absolute', left: '-10px', top: '-10px', width: '20px', height: '20px', background: 'var(--bg-gradient-cyan)', borderRadius: '50%'}}></div>
                                <div style={{position: 'absolute', left: '-10px', bottom: '-10px', width: '20px', height: '20px', background: 'var(--bg-gradient-cyan)', borderRadius: '50%'}}></div>

                                <h3 style={{margin: '0 0 1.5rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.8}}>Escanea</h3>
                                
                                <div style={{
                                    background: 'white',
                                    padding: '1rem',
                                    borderRadius: '1rem',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                                    marginBottom: '2rem'
                                }}>
                                    <canvas ref={qrViewCanvasRef} style={{width: '180px', height: '180px', display: 'block'}}></canvas>
                                </div>

                                <div style={{textAlign: 'center', width: '100%'}}>
                                    <div style={{fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em'}}>Código de Canje</div>
                                    <div style={{
                                        fontFamily: 'monospace',
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.1em',
                                        background: 'rgba(255,255,255,0.1)',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '0.5rem',
                                        border: '1px dashed rgba(255,255,255,0.4)',
                                        color: '#49FFF5'
                                    }}>
                                        {code}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Share Section */}
                        <div style={{
                            marginTop: '1.5rem',
                            display: 'flex',
                            gap: '1rem',
                            width: '100%',
                            justifyContent: 'center'
                        }}>
                            <button className="btn btn-secondary" style={{background: '#25D366', color: 'white', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} onClick={() => handleShare('whatsapp')}>
                                <i className="fa-brands fa-whatsapp"></i> Whatsapp
                            </button>
                            <button className="btn btn-secondary" style={{background: '#1877F2', color: 'white', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} onClick={() => handleShare('facebook')}>
                                <i className="fa-brands fa-facebook"></i> Facebook
                            </button>
                            <button className="btn btn-secondary" style={{background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)', color: 'white', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} onClick={() => handleShare('instagram')}>
                                <i className="fa-brands fa-instagram"></i> Instagram
                            </button>
                            <button className="btn btn-secondary" style={{background: 'var(--text-secondary)', color: 'white', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} onClick={() => handleShare('copy')}>
                                <i className="fa-solid fa-link"></i> Copiar
                            </button>
                        </div>

                        {/* Actions */}
                        <div style={{display: 'flex', gap: '1rem', marginTop: '1.5rem', width: '100%', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '1.5rem'}}>
                            <button type="button" className="btn btn-secondary" onClick={handleDeleteClick} style={{background: '#fee2e2', color: '#991b1b', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginRight: 'auto', zIndex: 50, position: 'relative'}}>
                                <i className="fa-solid fa-trash"></i> Eliminar
                            </button>
                            <button className="btn btn-secondary" onClick={onClose} style={{background: 'white', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                                <i className="fa-solid fa-xmark"></i> Cerrar
                            </button>
                            <button className="btn btn-primary" onClick={() => setMode('edit')} style={{boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'}}>
                                <i className="fa-solid fa-pen-to-square"></i> Editar Cupón
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="modal-header">
                            <div>
                                <h2>{title}</h2>
                                {couponToEdit && <span className="modal-subtitle">Código: {couponToEdit.code}</span>}
                            </div>
                            <button onClick={onClose} className="close-btn"><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="modal-body-layout">
                                <div className="form-section">
                                    <div className="form-group">
                                        <label htmlFor="campaignName">Nombre de Campaña</label>
                                        <input id="campaignName" type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} required autoFocus />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="couponCode">Código del Cupón</label>
                                            <div style={{display: 'flex', gap: '0.5rem'}}>
                                                <input id="couponCode" type="text" value={code} onChange={e => setCode(e.target.value)} required />
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCode(generateCouponCode())}><i className="fa-solid fa-arrows-rotate"></i></button>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Estado</label>
                                            <select value={status} onChange={e => setStatus(e.target.value as any)}>
                                                <option value="Activo">Activo</option>
                                                <option value="Suspendido">Suspendido</option>
                                                <option value="Finalizado">Finalizado</option>
                                                <option value="Agotado">Agotado</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Válido Desde</label>
                                            <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} required />
                                        </div>
                                        <div className="form-group">
                                            <label>Válido Hasta</label>
                                            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Tipo de Descuento</label>
                                            <select value={discountType} onChange={e => setDiscountType(e.target.value as any)}>
                                                <option value="percent">Porcentaje (%)</option>
                                                <option value="fixed">Monto Fijo ($)</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Valor del Descuento</label>
                                            <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} required step="0.01" />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section">
                                    <h3 style={{margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700}}>Reglas de Negocio <i className="fa-solid fa-gears" style={{marginLeft: '0.5rem', color: 'var(--text-muted)'}}></i></h3>
                                    <div className="coupon-rules-section">
                                        {/* Max Uses Rule */}
                                        <div>
                                            <div className="coupon-rule-toggle" onClick={() => setEnableMaxUses(!enableMaxUses)}>
                                                <div>
                                                    <div className="label">Límite de Usos Totales</div>
                                                    <div className="description">Máximo número de veces que se puede aplicar este cupón.</div>
                                                </div>
                                                <div className={`toggle-switch ${enableMaxUses ? 'active' : ''}`}></div>
                                            </div>
                                            {enableMaxUses && (
                                                <div className="rule-details-single-col form-group" style={{marginTop: '0.5rem'}}>
                                                    <label>Número de Usos</label>
                                                    <input type="number" value={maxUsesTotal} onChange={e => setMaxUsesTotal(e.target.value)} min="1" placeholder="Ej: 100" />
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Minimum Purchase Amount Rule */}
                                        <div>
                                            <div className="coupon-rule-toggle" onClick={() => setEnableMinPurchase(!enableMinPurchase)}>
                                                <div>
                                                    <div className="label">Monto Mínimo de Compra</div>
                                                    <div className="description">Requiere una compra igual o superior a un valor.</div>
                                                </div>
                                                <div className={`toggle-switch ${enableMinPurchase ? 'active' : ''}`}></div>
                                            </div>
                                            {enableMinPurchase && (
                                                <div className="rule-details-single-col form-group" style={{marginTop: '0.5rem'}}>
                                                    <label>Monto Mínimo ($)</label>
                                                    <input type="number" step="0.01" value={minPurchaseAmount} onChange={e => setMinPurchaseAmount(e.target.value)} min="0" placeholder="Ej: 5000" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Specific Rule */}
                                        <div>
                                            <div className="coupon-rule-toggle" onClick={() => setEnableProductSpecific(!enableProductSpecific)}>
                                                <div>
                                                    <div className="label">Producto Específico</div>
                                                    <div className="description">El cupón solo es válido para un producto.</div>
                                                </div>
                                                <div className={`toggle-switch ${enableProductSpecific ? 'active' : ''}`}></div>
                                            </div>
                                            {enableProductSpecific && (
                                                <div className="rule-details-single-col form-group" style={{marginTop: '0.5rem'}}>
                                                    <label>Seleccione Producto</label>
                                                    <select value={appliesToProductId} onChange={e => setAppliesToProductId(e.target.value)}>
                                                        <option value="">Cualquier Producto</option>
                                                        {products.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name} (#{p.material_code})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        {/* Payment Method Rule */}
                                        <div>
                                            <div className="coupon-rule-toggle" onClick={() => setEnablePaymentMethod(!enablePaymentMethod)}>
                                                <div>
                                                    <div className="label">Medio de Pago Válido</div>
                                                    <div className="description">Restringe el uso a ciertos medios de pago.</div>
                                                </div>
                                                <div className={`toggle-switch ${enablePaymentMethod ? 'active' : ''}`}></div>
                                            </div>
                                            {enablePaymentMethod && (
                                                <div className="rule-details-single-col form-group" style={{marginTop: '0.5rem'}}>
                                                    <label>Seleccione Medios</label>
                                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                                                        {PAYMENT_METHODS.map(method => (
                                                            <button type="button" key={method} 
                                                                    className={`btn btn-sm ${validPaymentMethods.includes(method) ? 'btn-primary' : 'btn-secondary'}`}
                                                                    onClick={() => handlePaymentMethodToggle(method)}
                                                                    style={{minWidth: '120px'}}>
                                                                {method}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Days of Week Rule */}
                                        <div>
                                            <div className="coupon-rule-toggle" onClick={() => setEnableDaysOfWeek(!enableDaysOfWeek)}>
                                                <div>
                                                    <div className="label">Días de la Semana Válidos</div>
                                                    <div className="description">El cupón solo se puede usar ciertos días.</div>
                                                </div>
                                                <div className={`toggle-switch ${enableDaysOfWeek ? 'active' : ''}`}></div>
                                            </div>
                                            {enableDaysOfWeek && (
                                                <div className="rule-details-single-col form-group" style={{marginTop: '0.5rem'}}>
                                                    <label>Seleccione Días</label>
                                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                                                        {DAYS_OF_WEEK.map(day => (
                                                            <button type="button" key={day.value}
                                                                    className={`btn btn-sm ${validDaysOfWeek.includes(day.value) ? 'btn-primary' : 'btn-secondary'}`}
                                                                    onClick={() => handleDayOfWeekToggle(day.value)}
                                                                    style={{minWidth: '80px'}}>
                                                                {day.label.substring(0,3)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Hidden Canvas for QR Code Generation - Used by generateAndUploadQRCode */}
                                    <canvas ref={qrCanvasRef} style={{ display: 'none' }}></canvas>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Guardando...' : (couponToEdit ? 'Actualizar Cupón' : 'Crear Cupón')}</button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};