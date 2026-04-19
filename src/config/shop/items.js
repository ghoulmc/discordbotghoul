

/**
 * GhoulMC - Configuración de la Tienda de Economía
 * Todos los precios y multiplicadores pueden ser ajustados aquí.
 */

export const shopItems = [
    {
        id: 'extra_work',
        name: '🕒 Turno Extra',
        price: 5000,
        description: 'Te permite usar el comando `/work` una vez adicional de forma inmediata.',
        type: 'consumable',
        maxQuantity: 5,
        cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },
    {
        id: 'bank_upgrade_1',
        name: '🏦 Mejora de Banco I',
        price: 15000,
        description: 'Aumenta la capacidad total de tu banco para guardar más GhoulCoins.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: '💎 Pico de Diamante',
        price: 50000,
        description: 'Aumenta drásticamente las ganancias al usar el comando `/mine`.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: '👑 Rango Premium',
        price: 150000, // Precio ajustado para ser un meta-item
        description: 'Un rol especial que te otorga un color exclusivo y un bono del 10% en recompensas diarias.',
        type: 'role',
        roleId: null, // Debe configurarse en el panel de control
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'lucky_clover',
        name: '🍀 Trébol de la Suerte',
        price: 10000,
        description: 'Aumenta la probabilidad de ganar más dinero en `/gamble` una sola vez.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 Caña de Pescar',
        price: 5000,
        description: 'Herramienta esencial para usar el comando `/fish`.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Pico de Hierro',
        price: 7500,
        description: 'Herramienta necesaria para comenzar a minar.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 Laptop Gamer',
        price: 15000,
        description: 'Optimiza tus ganancias de trabajo pasivamente.',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🧿 Amuleto de Suerte',
        price: 10000,
        description: 'Aumenta tu suerte en juegos de azar. Se consume tras 3 usos.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 Pagaré Bancario',
        price: 25000,
        description: 'Aumenta la capacidad de tu banco en 10,000 de forma permanente. Apilable.',
        type: 'tool', // Se deja como tool para que el sistema lo reconozca, pero sin durabilidad
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 Caja Fuerte',
        price: 30000,
        description: 'Protege tu dinero de robos. Evita que otros usuarios te asalten.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

// --- FUNCIONES DE UTILIDAD ---

/**
 * Busca un item por su ID
 */
export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

/**
 * Filtra items por categoría (herramienta, consumible, etc)
 */
export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

/**
 * Obtiene el precio de un item
 */
export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

/**
 * Valida si un usuario puede comprar un objeto
 * Mejorado con mensajes en español y lógica más limpia.
 */
export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'El objeto solicitado no existe en la tienda.' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    // Validación de Consumibles
    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `Ya has alcanzado el límite máximo de ${item.maxQuantity} unidades para: ${item.name}.` 
            };
        }
    }

    // Validación de Mejoras (Upgrades)
    if (item.type === 'upgrade' && item.maxLevel) {
        const currentLevel = upgrades[itemId] || 0;
        if (currentLevel >= item.maxLevel) {
            return { 
                valid: false, 
                reason: `Ya has alcanzado el nivel máximo de mejora para ${item.name}.` 
            };
        }
    }

    // Validación de Herramientas (Tools)
    if (item.type === 'tool') {
        const currentQuantity = inventory[itemId] || 0;
        // Permitimos comprar múltiples "Pagarés", pero no múltiples "Picos" o "Cajas Fuertes"
        const isStackable = ['bank_note'].includes(itemId);
        
        if (!isStackable && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `Ya posees un(a) ${item.name} en tu inventario.` 
            };
        }
    }

    // Validación de Roles
    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `Ya tienes asignado el rango ${item.name}.` 
            };
        }
    }

    return { valid: true };
}
