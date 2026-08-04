const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

class BackupManager {
    static backupsPath = path.join(__dirname, '..', 'data', 'backups');
    static dataPath = path.join(__dirname, '..', 'data');
    
    /**
     * Inicializar sistema de respaldos
     */
    static async initialize() {
        await fs.ensureDir(this.backupsPath);
    }

    /**
     * Crear respaldo completo
     */
    static async createFullBackup() {
        try {
            await this.initialize();
            
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const backupName = `full-backup-${timestamp}`;
            const backupDir = path.join(this.backupsPath, backupName);
            
            await fs.ensureDir(backupDir);
            
            // Lista de archivos/carpetas a respaldar
            const itemsToBackup = [
                'tickets.json',
                'blacklist.json',
                'user-limits.json',
                'guild-configs',
                'logs'
            ];

            const backupInfo = {
                timestamp: new Date().toISOString(),
                type: 'full',
                items: []
            };

            // Copiar cada elemento
            for (const item of itemsToBackup) {
                const sourcePath = path.join(this.dataPath, item);
                const destPath = path.join(backupDir, item);
                
                if (await fs.pathExists(sourcePath)) {
                    await fs.copy(sourcePath, destPath);
                    
                    const stats = await fs.stat(sourcePath);
                    backupInfo.items.push({
                        name: item,
                        size: stats.isFile() ? stats.size : await this.getDirectorySize(sourcePath),
                        type: stats.isFile() ? 'file' : 'directory'
                    });
                }
            }

            // Copiar configuración principal (sin credenciales)
            const configSource = path.join(__dirname, '..', 'config.json');
            if (await fs.pathExists(configSource)) {
                const config = await fs.readJson(configSource);
                
                // Remover credenciales sensibles
                const safeConfig = { ...config };
                delete safeConfig.token;
                delete safeConfig.clientId;
                
                await fs.writeJson(path.join(backupDir, 'config.json'), safeConfig, { spaces: 2 });
                backupInfo.items.push({
                    name: 'config.json',
                    size: JSON.stringify(safeConfig).length,
                    type: 'file'
                });
            }

            // Guardar información del respaldo
            await fs.writeJson(path.join(backupDir, 'backup-info.json'), backupInfo, { spaces: 2 });

            const totalSize = backupInfo.items.reduce((sum, item) => sum + item.size, 0);
            
            return {
                name: backupName,
                path: backupDir,
                timestamp,
                itemCount: backupInfo.items.length,
                totalSize,
                items: backupInfo.items
            };

        } catch (error) {
            console.error('❌ Error creando respaldo completo:', error);
            throw error;
        }
    }

    /**
     * Crear respaldo incremental
     */
    static async createIncrementalBackup(lastBackupTimestamp) {
        try {
            await this.initialize();
            
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const backupName = `incremental-backup-${timestamp}`;
            const backupDir = path.join(this.backupsPath, backupName);
            
            await fs.ensureDir(backupDir);
            
            const backupInfo = {
                timestamp: new Date().toISOString(),
                type: 'incremental',
                basedOn: lastBackupTimestamp,
                items: []
            };

            const cutoffDate = moment(lastBackupTimestamp);
            
            // Solo respaldar archivos modificados después del último respaldo
            const itemsToCheck = [
                'tickets.json',
                'blacklist.json',
                'user-limits.json'
            ];

            for (const item of itemsToCheck) {
                const sourcePath = path.join(this.dataPath, item);
                
                if (await fs.pathExists(sourcePath)) {
                    const stats = await fs.stat(sourcePath);
                    const modifiedDate = moment(stats.mtime);
                    
                    if (modifiedDate.isAfter(cutoffDate)) {
                        const destPath = path.join(backupDir, item);
                        await fs.copy(sourcePath, destPath);
                        
                        backupInfo.items.push({
                            name: item,
                            size: stats.size,
                            type: 'file',
                            modified: stats.mtime
                        });
                    }
                }
            }

            // Verificar configuraciones de servidores modificadas
            const guildConfigsPath = path.join(this.dataPath, 'guild-configs');
            if (await fs.pathExists(guildConfigsPath)) {
                const configFiles = await fs.readdir(guildConfigsPath);
                
                for (const file of configFiles) {
                    if (!file.endsWith('.json')) continue;
                    
                    const filePath = path.join(guildConfigsPath, file);
                    const stats = await fs.stat(filePath);
                    const modifiedDate = moment(stats.mtime);
                    
                    if (modifiedDate.isAfter(cutoffDate)) {
                        const destDir = path.join(backupDir, 'guild-configs');
                        await fs.ensureDir(destDir);
                        await fs.copy(filePath, path.join(destDir, file));
                        
                        backupInfo.items.push({
                            name: `guild-configs/${file}`,
                            size: stats.size,
                            type: 'file',
                            modified: stats.mtime
                        });
                    }
                }
            }

            await fs.writeJson(path.join(backupDir, 'backup-info.json'), backupInfo, { spaces: 2 });

            const totalSize = backupInfo.items.reduce((sum, item) => sum + item.size, 0);
            
            return {
                name: backupName,
                path: backupDir,
                timestamp,
                itemCount: backupInfo.items.length,
                totalSize,
                items: backupInfo.items,
                type: 'incremental'
            };

        } catch (error) {
            console.error('❌ Error creando respaldo incremental:', error);
            throw error;
        }
    }

    /**
     * Listar respaldos disponibles
     */
    static async listBackups() {
        try {
            await this.initialize();
            
            const backupDirs = await fs.readdir(this.backupsPath);
            const backups = [];

            for (const dir of backupDirs) {
                const backupPath = path.join(this.backupsPath, dir);
                const infoPath = path.join(backupPath, 'backup-info.json');
                
                if (await fs.pathExists(infoPath)) {
                    const info = await fs.readJson(infoPath);
                    const stats = await fs.stat(backupPath);
                    
                    backups.push({
                        name: dir,
                        path: backupPath,
                        ...info,
                        created: stats.birthtime
                    });
                }
            }

            // Ordenar por fecha de creación (más reciente primero)
            return backups.sort((a, b) => new Date(b.created) - new Date(a.created));

        } catch (error) {
            console.error('❌ Error listando respaldos:', error);
            return [];
        }
    }

    /**
     * Restaurar desde respaldo
     */
    static async restoreFromBackup(backupName) {
        try {
            const backupPath = path.join(this.backupsPath, backupName);
            const infoPath = path.join(backupPath, 'backup-info.json');
            
            if (!await fs.pathExists(backupPath) || !await fs.pathExists(infoPath)) {
                throw new Error('El respaldo especificado no existe');
            }

            const backupInfo = await fs.readJson(infoPath);
            const restored = [];

            // Crear respaldo de los datos actuales antes de restaurar
            const preRestoreBackup = await this.createFullBackup();
            
            for (const item of backupInfo.items) {
                const sourcePath = path.join(backupPath, item.name);
                const destPath = path.join(this.dataPath, item.name);
                
                if (await fs.pathExists(sourcePath)) {
                    // Crear directorio padre si es necesario
                    await fs.ensureDir(path.dirname(destPath));
                    
                    if (item.type === 'directory') {
                        await fs.copy(sourcePath, destPath, { overwrite: true });
                    } else {
                        await fs.copy(sourcePath, destPath, { overwrite: true });
                    }
                    
                    restored.push(item.name);
                }
            }

            return {
                restored,
                backupUsed: backupName,
                preRestoreBackup: preRestoreBackup.name,
                restoredAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error restaurando respaldo:', error);
            throw error;
        }
    }

    /**
     * Eliminar respaldos antiguos
     */
    static async cleanOldBackups(daysToKeep = 30, maxBackups = 50) {
        try {
            const backups = await this.listBackups();
            const cutoffDate = moment().subtract(daysToKeep, 'days');
            let deleted = 0;

            // Eliminar por fecha
            for (const backup of backups) {
                const backupDate = moment(backup.created);
                
                if (backupDate.isBefore(cutoffDate)) {
                    await fs.remove(backup.path);
                    deleted++;
                    console.log(`🗑️ Eliminado respaldo antiguo: ${backup.name}`.yellow);
                }
            }

            // Eliminar exceso si hay demasiados respaldos
            const remainingBackups = await this.listBackups();
            if (remainingBackups.length > maxBackups) {
                const toDelete = remainingBackups.slice(maxBackups);
                
                for (const backup of toDelete) {
                    await fs.remove(backup.path);
                    deleted++;
                    console.log(`🗑️ Eliminado respaldo por límite: ${backup.name}`.yellow);
                }
            }

            return deleted;

        } catch (error) {
            console.error('❌ Error limpiando respaldos antiguos:', error);
            return 0;
        }
    }

    /**
     * Programar respaldos automáticos
     */
    static scheduleAutomaticBackups(client) {
        // Respaldo completo diario a las 2:00 AM
        setInterval(async () => {
            const now = moment();
            if (now.hour() === 2 && now.minute() === 0) {
                try {
                    console.log('🔄 Iniciando respaldo automático diario...'.cyan);
                    const backup = await this.createFullBackup();
                    console.log(`✅ Respaldo completado: ${backup.name}`.green);
                    
                    // Limpiar respaldos antiguos
                    const deleted = await this.cleanOldBackups();
                    if (deleted > 0) {
                        console.log(`🗑️ Eliminados ${deleted} respaldos antiguos`.yellow);
                    }
                } catch (error) {
                    console.error('❌ Error en respaldo automático:', error);
                }
            }
        }, 60000); // Verificar cada minuto

        // Respaldo incremental cada 6 horas
        setInterval(async () => {
            try {
                const backups = await this.listBackups();
                const lastBackup = backups[0];
                
                if (lastBackup) {
                    const timeSinceLastBackup = moment().diff(moment(lastBackup.created), 'hours');
                    
                    if (timeSinceLastBackup >= 6) {
                        console.log('🔄 Iniciando respaldo incremental...'.cyan);
                        const backup = await this.createIncrementalBackup(lastBackup.timestamp);
                        
                        if (backup.itemCount > 0) {
                            console.log(`✅ Respaldo incremental completado: ${backup.name} (${backup.itemCount} elementos)`.green);
                        } else {
                            console.log('ℹ️ No hay cambios para respaldar'.gray);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error en respaldo incremental:', error);
            }
        }, 6 * 60 * 60 * 1000); // Cada 6 horas

        console.log('🕒 Respaldos automáticos programados'.green);
    }

    /**
     * Verificar integridad de respaldo
     */
    static async verifyBackupIntegrity(backupName) {
        try {
            const backupPath = path.join(this.backupsPath, backupName);
            const infoPath = path.join(backupPath, 'backup-info.json');
            
            if (!await fs.pathExists(infoPath)) {
                return { valid: false, error: 'Archivo de información faltante' };
            }

            const backupInfo = await fs.readJson(infoPath);
            const issues = [];

            // Verificar cada elemento listado
            for (const item of backupInfo.items) {
                const itemPath = path.join(backupPath, item.name);
                
                if (!await fs.pathExists(itemPath)) {
                    issues.push(`Elemento faltante: ${item.name}`);
                    continue;
                }

                const stats = await fs.stat(itemPath);
                
                if (item.type === 'file' && stats.size !== item.size) {
                    issues.push(`Tamaño incorrecto: ${item.name} (esperado: ${item.size}, actual: ${stats.size})`);
                }
            }

            return {
                valid: issues.length === 0,
                issues,
                itemCount: backupInfo.items.length,
                backupInfo
            };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Obtener tamaño de directorio
     */
    static async getDirectorySize(dirPath) {
        let size = 0;
        
        try {
            const files = await fs.readdir(dirPath);
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isFile()) {
                    size += stats.size;
                } else if (stats.isDirectory()) {
                    size += await this.getDirectorySize(filePath);
                }
            }
        } catch (error) {
            console.error('Error calculando tamaño de directorio:', error);
        }
        
        return size;
    }

    /**
     * Exportar respaldo como archivo comprimido (simulado)
     */
    static async exportBackup(backupName) {
        try {
            const backupPath = path.join(this.backupsPath, backupName);
            
            if (!await fs.pathExists(backupPath)) {
                throw new Error('El respaldo no existe');
            }

            // En un entorno real, aquí se crearía un archivo ZIP o TAR
            // Por simplicidad, creamos un archivo JSON con toda la información
            const exportPath = path.join(this.backupsPath, `${backupName}-export.json`);
            const exportData = {
                backupName,
                exportedAt: new Date().toISOString(),
                files: {}
            };

            // Leer todos los archivos del respaldo
            const files = await fs.readdir(backupPath);
            
            for (const file of files) {
                const filePath = path.join(backupPath, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isFile() && file.endsWith('.json')) {
                    exportData.files[file] = await fs.readJson(filePath);
                }
            }

            await fs.writeJson(exportPath, exportData, { spaces: 2 });
            
            return {
                exportPath,
                size: (await fs.stat(exportPath)).size
            };

        } catch (error) {
            console.error('❌ Error exportando respaldo:', error);
            throw error;
        }
    }
}

module.exports = BackupManager;