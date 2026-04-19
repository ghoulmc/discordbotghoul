


import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export const shopConfig = {
    name: 'Tienda GhoulMC',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '☠️',
    
    categories: [
        {
            id: 'consumables',
            name: 'Consumibles',
            description: 'Objetos de un solo uso con beneficios temporales.',
            icon: '🧪',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: 'Mejoras',
            description: 'Potenciadores permanentes para tu cuenta.',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: 'Herramientas',
            description: 'Equipo para recolectar recursos eficientemente.',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: 'Rangos',
            description: 'Roles especiales con beneficios exclusivos en el servidor.',
            icon: '👑',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
        cooldown: 1500,        // Tiempo entre compras (ms)
        maxQuantity: 20,       // Cantidad máxima por transacción
        confirmTimeout: 30000, // Tiempo para confirmar compra
        
        refundPolicy: {
            enabled: true,
            window: 300000,    // 5 minutos para devoluciones
            fee: 0.15          // Comisión del 15% por devolución
        }
    },
    
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        colors: {
            // Sincronizado con el tema GhoulMC
            primary: '#7d5bbe',   // Morado Ghoul
            success: '#00FF7F',   // Verde Neón
            error: '#FF4500',     // Naranja/Rojo
            warning: '#F1C40F',   // Amarillo
            info: '#3498DB',      // Azul
            
            rarity: {
                common: '#99AAB5',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F',
                mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '☠️',
            quantity: '🔢',
            price: '💰',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🧪',
                upgrade: '⚡',
                tool: '⛏️',
                role: '👑'
            }
        }
    },
    
    events: {
        restock: {
            enabled: true,
            interval: 86400000, // 24 horas
            announcementChannel: null,
            message: '🛒 **¡Tienda Reabastecida!** Se han renovado los suministros en GhoulMC.'
        },
        
        sales: {
            enabled: true,
            schedule: [
                {
                    day: 0, // Domingo
                    discount: 0.2,
                    message: '🔥 **¡Ofertas de Fin de Semana!** 20% de descuento en todos los objetos.'
                },
                {
                    day: 5, // Viernes
                    discount: 0.1,
                    message: '🏮 **¡Viernes de Ghouls!** 10% de descuento disponible.'
                }
            ]
        }
    }
};

// Re-exportar utilidades de items para acceso centralizado
export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

/**
 * Calcula el precio actual aplicando descuentos de eventos y bonos de usuario
 */
export function getCurrentPrice(itemId, { quantity = 1, userData = null } = {}) {
    const basePrice = getItemPrice(itemId) * quantity;
    if (basePrice <= 0) return 0;

    let discount = 0;
    
    // 1. Descuentos por Eventos (Ventas programadas)
    if (shopConfig.events.sales.enabled) {
        const today = new Date().getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    // 2. Bonos por perfil de usuario
    if (userData) {
        // Bono por ser Premium
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        // Descuento por compra al por mayor (10 o más unidades)
        if (quantity >= 10) {
            discount += 0.05;
        }
    }
    
    // Limitar descuento total al 90% para evitar items gratis por error
    discount = Math.max(0, Math.min(0.9, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

/**
 * Obtiene la categoría asignada a un tipo de item
 */
export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: 'Varios',
        description: 'Objetos misceláneos',
        icon: '📦'
    };
}

/**
 * Obtiene todos los items que pertenecen a una categoría específica
 */
export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}

