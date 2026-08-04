const fs = require('fs-extra');
const path = require('path');

class ConfigManager {
    static configsPath = path.join(__dirname, '..', 'data', 'guild-configs');
    static globalConfigPath = path.join(__dirname, '..', 'config.json');

    /**
     * Inicializar sistema de configuraciones
     */
    static async initialize() {
        await fs.ensureDir(this.configsPath);
    }

    /**
     * Obtener configuración de un servidor
     * @param {string} guildId - ID del servidor
     */
    static async getGuildConfig(guildId) {
        await this.initialize();
        
        const guildConfigPath = path.join(this.configsPath, `${guildId}.json`);
        
        // Si existe configuración específica del servidor, usarla
        if (await fs.pathExists(guildConfigPath)) {
            const guildConfig = await fs.readJson(guildConfigPath);
            const globalConfig = await fs.readJson(this.globalConfigPath);
            
            // Combinar configuraciones (guild override global)
            return {
                ...globalConfig,
                ...guildConfig,
                announcements: {
                    ...globalConfig.announcements,
                    ...(guildConfig.announcements || {})
                }
            };
        }
        
        // Usar configuración global por defecto
        return await fs.readJson(this.globalConfigPath);
    }

    /**
     * Guardar configuración específica de servidor
     * @param {string} guildId - ID del servidor
     * @param {Object} config - Configuración a guardar
     */
    static async setGuildConfig(guildId, config) {
        await this.initialize();
        
        const guildConfigPath = path.join(this.configsPath, `${guildId}.json`);
        await fs.writeJson(guildConfigPath, config, { spaces: 2 });
    }

    /**
     * Actualizar configuración específica de servidor
     * @param {string} guildId - ID del servidor
     * @param {string} key - Clave a actualizar
     * @param {any} value - Nuevo valor
     */
    static async updateGuildConfig(guildId, key, value) {
        const currentConfig = await this.getGuildSpecificConfig(guildId);
        
        // Manejar claves anidadas (ej: "announcements.foxrank.title")
        const keys = key.split('.');
        let target = currentConfig;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) {
                target[keys[i]] = {};
            }
            target = target[keys[i]];
        }
        
        target[keys[keys.length - 1]] = value;
        
        await this.setGuildConfig(guildId, currentConfig);
    }

    /**
     * Obtener solo la configuración específica del servidor (sin global)
     * @param {string} guildId - ID del servidor
     */
    static async getGuildSpecificConfig(guildId) {
        await this.initialize();
        
        const guildConfigPath = path.join(this.configsPath, `${guildId}.json`);
        
        if (await fs.pathExists(guildConfigPath)) {
            return await fs.readJson(guildConfigPath);
        }
        
        return {};
    }

    /**
     * Eliminar configuración específica de servidor
     * @param {string} guildId - ID del servidor
     */
    static async deleteGuildConfig(guildId) {
        const guildConfigPath = path.join(this.configsPath, `${guildId}.json`);
        
        if (await fs.pathExists(guildConfigPath)) {
            await fs.remove(guildConfigPath);
            return true;
        }
        
        return false;
    }

    /**
     * Obtener lista de servidores con configuración personalizada
     */
    static async getConfiguredGuilds() {
        await this.initialize();
        
        const files = await fs.readdir(this.configsPath);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    }

    /**
     * Exportar configuración de un servidor
     * @param {string} guildId - ID del servidor
     */
    static async exportGuildConfig(guildId) {
        const config = await this.getGuildConfig(guildId);
        const specificConfig = await this.getGuildSpecificConfig(guildId);
        
        return {
            guildId,
            fullConfig: config,
            customizations: specificConfig,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Importar configuración a un servidor
     * @param {string} guildId - ID del servidor
     * @param {Object} configData - Datos de configuración
     */
    static async importGuildConfig(guildId, configData) {
        if (configData.customizations) {
            await this.setGuildConfig(guildId, configData.customizations);
        } else if (configData.fullConfig) {
            // Extraer solo las partes personalizables
            const globalConfig = await fs.readJson(this.globalConfigPath);
            const customizations = {};
            
            // Comparar y extraer diferencias
            Object.keys(configData.fullConfig).forEach(key => {
                if (key !== 'token' && key !== 'clientId') {
                    if (JSON.stringify(configData.fullConfig[key]) !== JSON.stringify(globalConfig[key])) {
                        customizations[key] = configData.fullConfig[key];
                    }
                }
            });
            
            await this.setGuildConfig(guildId, customizations);
        }
    }

    /**
     * Crear copia de seguridad de todas las configuraciones
     */
    static async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, '..', 'data', 'backups', `config-backup-${timestamp}`);
        
        await fs.ensureDir(backupPath);
        
        // Copiar configuración global
        await fs.copy(this.globalConfigPath, path.join(backupPath, 'global-config.json'));
        
        // Copiar configuraciones de servidores
        if (await fs.pathExists(this.configsPath)) {
            await fs.copy(this.configsPath, path.join(backupPath, 'guild-configs'));
        }
        
        // Crear archivo de metadatos
        const metadata = {
            createdAt: new Date().toISOString(),
            guildsCount: (await this.getConfiguredGuilds()).length,
            version: '1.0.0'
        };
        
        await fs.writeJson(path.join(backupPath, 'metadata.json'), metadata, { spaces: 2 });
        
        return backupPath;
    }

    /**
     * Restaurar desde copia de seguridad
     * @param {string} backupPath - Ruta de la copia de seguridad
     */
    static async restoreFromBackup(backupPath) {
        if (!await fs.pathExists(backupPath)) {
            throw new Error('La copia de seguridad no existe');
        }
        
        const globalBackup = path.join(backupPath, 'global-config.json');
        const guildsBackup = path.join(backupPath, 'guild-configs');
        
        // Restaurar configuración global (sin tocar token/clientId)
        if (await fs.pathExists(globalBackup)) {
            const currentGlobal = await fs.readJson(this.globalConfigPath);
            const backupGlobal = await fs.readJson(globalBackup);
            
            // Preservar credenciales
            backupGlobal.token = currentGlobal.token;
            backupGlobal.clientId = currentGlobal.clientId;
            
            await fs.writeJson(this.globalConfigPath, backupGlobal, { spaces: 2 });
        }
        
        // Restaurar configuraciones de servidores
        if (await fs.pathExists(guildsBackup)) {
            // Limpiar configuraciones actuales
            if (await fs.pathExists(this.configsPath)) {
                await fs.remove(this.configsPath);
            }
            
            // Copiar desde backup
            await fs.copy(guildsBackup, this.configsPath);
        }
        
        return true;
    }

    /**
     * Validar configuración
     * @param {Object} config - Configuración a validar
     */
    static validateConfig(config) {
        const errors = [];
        
        // Validar colores
        if (config.embedColor && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(config.embedColor)) {
            errors.push('embedColor debe ser un color hexadecimal válido');
        }
        
        // Validar prefijo
        if (config.prefix && (typeof config.prefix !== 'string' || config.prefix.length > 3)) {
            errors.push('prefix debe ser una cadena de máximo 3 caracteres');
        }
        
        // Validar adminRoles
        if (config.adminRoles && !Array.isArray(config.adminRoles)) {
            errors.push('adminRoles debe ser un array');
        }
        
        // Validar anuncios
        if (config.announcements) {
            Object.entries(config.announcements).forEach(([key, announcement]) => {
                if (!announcement.title || !announcement.description) {
                    errors.push(`Anuncio "${key}" debe tener título y descripción`);
                }
                
                if (announcement.options && !Array.isArray(announcement.options)) {
                    errors.push(`Opciones del anuncio "${key}" deben ser un array`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = ConfigManager;