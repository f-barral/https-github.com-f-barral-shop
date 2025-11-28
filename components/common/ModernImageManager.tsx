

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export const ModernImageManager: React.FC<{
    images: string[];
    setImages: React.Dispatch<React.SetStateAction<string[]>>;
    readOnly?: boolean;
}> = ({ images, setImages, readOnly = false }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlInputValue, setUrlInputValue] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (images.length > 0 && activeIndex >= images.length) {
            setActiveIndex(images.length - 1);
        } else if (images.length === 0) {
            setActiveIndex(0);
        }
    }, [images, activeIndex]);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return;
        if (!event.target.files || event.target.files.length === 0) return;
        
        if (images.length >= 10) {
            alert("Máximo 10 imágenes permitidas.");
            return;
        }

        const file = event.target.files[0];
        const fileName = `${Date.now()}_${file.name}`;
        setUploading(true);

        try {
            const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
            if (!data.publicUrl) throw new Error("No se pudo obtener la URL pública");

            const newImages = [...images, data.publicUrl];
            setImages(newImages);
            setActiveIndex(newImages.length - 1);
        } catch (error) {
            console.error("Error al subir imagen:", error);
            alert("Error al subir imagen.");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddUrl = () => {
        if (readOnly) return;
        if (!urlInputValue) return;
        if (images.length >= 10) {
             alert("Máximo 10 imágenes permitidas.");
             return;
        }
        const newImages = [...images, urlInputValue];
        setImages(newImages);
        setUrlInputValue('');
        setShowUrlInput(false);
        setActiveIndex(newImages.length - 1);
    };

    const handleDelete = (index: number) => {
        if (readOnly) return;
        const newImages = images.filter((_, i) => i !== index);
        setImages(newImages);
    };

    return (
        <div className={`image-gallery-container ${readOnly ? 'readonly-gallery' : ''}`}>
            <div className={`main-image-preview ${images.length > 0 ? 'has-image' : ''}`}>
                {images.length > 0 ? (
                    <>
                        <img src={images[activeIndex]} alt="Vista previa" />
                        {!readOnly && (
                            <button className="delete-overlay-btn" onClick={() => handleDelete(activeIndex)} type="button">
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        )}
                    </>
                ) : (
                    <div className="placeholder">
                        <i className="fa-regular fa-images"></i>
                        <p>{readOnly ? 'Sin imágenes' : 'Sin imágenes seleccionadas'}</p>
                    </div>
                )}
                {uploading && (
                    <div style={{position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                         <div className="loader-small"></div>
                    </div>
                )}
            </div>

            {images.length > 0 && (
                <div className="thumbnails-strip">
                    {images.map((img, idx) => (
                        <div key={idx} className={`thumb-item ${idx === activeIndex ? 'active' : ''}`} onClick={() => setActiveIndex(idx)}>
                            <img src={img} alt={`Thumb ${idx}`} />
                        </div>
                    ))}
                </div>
            )}

            {!readOnly && (
                <div className="upload-controls">
                    {!showUrlInput ? (
                        <div className="upload-actions">
                            <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                                <i className="fa-solid fa-cloud-arrow-up"></i> Subir Archivo
                            </button>
                            <button type="button" className="upload-btn" onClick={() => setShowUrlInput(true)}>
                                <i className="fa-solid fa-link"></i> Desde URL
                            </button>
                        </div>
                    ) : (
                        <div className="url-input-container">
                            <input type="url" placeholder="https://ejemplo.com/imagen.jpg" value={urlInputValue} onChange={(e) => setUrlInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUrl())} autoFocus />
                            <button type="button" className="btn btn-primary" onClick={handleAddUrl} style={{padding: '0.5rem 1rem'}}><i className="fa-solid fa-plus"></i></button>
                             <button type="button" className="btn btn-secondary" onClick={() => setShowUrlInput(false)} style={{padding: '0.5rem 1rem'}}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                    )}
                    <input type="file" accept="image/*" ref={fileInputRef} style={{display: 'none'}} onChange={handleFileSelect} />
                </div>
            )}
        </div>
    );
};