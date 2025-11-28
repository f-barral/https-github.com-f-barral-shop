

import React from 'react';

export const ReputationStars: React.FC<{ level: number }> = ({ level }) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        if (i <= level) {
            stars.push(<i key={i} className="fa-solid fa-star" style={{ color: '#f59e0b' }}></i>);
        } else {
            stars.push(<i key={i} className="fa-regular fa-star" style={{ color: '#cbd5e1' }}></i>);
        }
    }
    return <span className="reputation-stars">{stars}</span>;
};