const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs-extra');
const colors = require('colors');
const config = require('./config.json');
const LogManager = require('./utils/logManager');
const BackupManager = require('./utils/backupManager');

// Crear cliente de Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Colecciones para comandos y eventos
client.commands = new Collection();
client.tickets = new Collection();

// Cargar módulos
const eventHandler = require('./handlers/eventHandler');
const commandHandler = require('./handlers/commandHandler');

// Inicializar manejadores
eventHandler(client);
commandHandler(client);

// Event: Bot listo
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`.green);
    console.log(`📊 Conectado a ${client.guilds.cache.size} servidores`.cyan);
    
    // Inicializar sistemas
    try {
        await LogManager.initialize();
        console.log('📝 Sistema de logs inicializado'.green);
        
        await BackupManager.initialize();
        console.log('💾 Sistema de respaldos inicializado'.green);
        
        // Programar respaldos automáticos
        BackupManager.scheduleAutomaticBackups(client);
        
        // Log de inicio del bot
        await LogManager.log(
            LogManager.LogTypes.INFO,
            'Bot started successfully',
            {
                botTag: client.user.tag,
                guildsCount: client.guilds.cache.size
            }
        );
        
    } catch (error) {
        console.error('❌ Error inicializando sistemas:', error);
        await LogManager.logError(error, { context: 'bot_startup' });
    }
    
    // Establecer actividad del bot
    client.user.setActivity('Sistema de Tickets | !help', { type: 'WATCHING' });
});

// Manejo de errores
process.on('unhandledRejection', async (error) => {
    console.error('❌ Error no manejado:'.red, error);
    await LogManager.logError(error, { context: 'unhandled_rejection' });
});

process.on('uncaughtException', async (error) => {
    console.error('❌ Excepción no capturada:'.red, error);
    await LogManager.logError(error, { context: 'uncaught_exception' });
    
    // Crear respaldo de emergencia antes de salir
    try {
        console.log('🔄 Creando respaldo de emergencia...'.yellow);
        await BackupManager.createFullBackup();
        console.log('✅ Respaldo de emergencia completado'.green);
    } catch (backupError) {
        console.error('❌ Error creando respaldo de emergencia:', backupError);
    }
    
    process.exit(1);
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🔄 Cerrando bot de manera segura...'.yellow);
    
    try {
        await LogManager.log(
            LogManager.LogTypes.INFO,
            'Bot shutting down',
            { reason: 'SIGINT' }
        );
        
        // Crear respaldo final
        console.log('💾 Creando respaldo final...'.cyan);
        await BackupManager.createFullBackup();
        console.log('✅ Respaldo final completado'.green);
        
    } catch (error) {
        console.error('❌ Error durante cierre:', error);
    }
    
    console.log('👋 Bot cerrado'.green);
    process.exit(0);
});

// Conectar el bot - usar variable de entorno primero, luego config.json
const token = process.env.DISCORD_TOKEN || config.token;
client.login(token).catch(error => {
    console.error('❌ Error al conectar el bot:'.red, error.message);
    process.exit(1);
});

module.exports = client;