

export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(amount);
};

export const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR', {
        maximumFractionDigits: 0
    }).format(num);
};

export const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    
    // Si viene como YYYY-MM-DD (caso Supabase DATE)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        }
    } catch (e) {
        console.error("Error formatting date", e);
    }

    // fallback final
    return dateString.split('T')[0].split('-').reverse().join('/');
};


export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
};

export const REPUTATION_LEVELS: Record<number, { label: string; desc: string; color: string }> = {
    1: { label: 'Descartado', desc: 'Proveedor no apto para operar. Fallas graves o reiteradas.', color: '#991b1b' },
    2: { label: 'Deficiente', desc: 'Cumplimiento pobre. Genera problemas frecuentes.', color: '#ef4444' },
    3: { label: 'Regular', desc: 'Cumple de forma básica, con errores o demoras ocasionales.', color: '#f59e0b' },
    4: { label: 'Muy bueno', desc: 'Opera correctamente y con bajo nivel de incidencias.', color: '#3b82f6' },
    5: { label: 'Premium', desc: 'Proveedor estratégico, altamente confiable y con valor agregado.', color: '#10b981' }
};