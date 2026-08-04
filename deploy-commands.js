const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.json');

// Construir array de comandos
const commands = [];

// Función recursiva para obtener todos los archivos de comandos
function getCommandFiles(dir) {
    const files = fs.readdirSync(dir);
    let commandFiles = [];

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            commandFiles = commandFiles.concat(getCommandFiles(filePath));
        } else if (file.endsWith('.js')) {
            commandFiles.push(filePath);
        }
    }

    return commandFiles;
}

// Obtener todos los archivos de comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = getCommandFiles(commandsPath);

// Cargar comandos
for (const file of commandFiles) {
    const command = require(file);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Comando cargado: ${command.data.name}`);
    } else {
        console.log(`⚠️ Comando en ${file} no tiene propiedades requeridas`);
    }
}

// Construir y preparar instancia REST
const rest = new REST().setToken(config.token);

// Desplegar comandos
(async () => {
    try {
        console.log(`🔄 Iniciando despliegue de ${commands.length} comandos...`);

        // Refrescar comandos slash globalmente
        const data = await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands },
        );

        console.log(`✅ ${data.length} comandos desplegados exitosamente!`);
        
        // Mostrar lista de comandos desplegados
        console.log('\n📋 Comandos desplegados:');
        data.forEach(cmd => {
            console.log(`   - /${cmd.name}: ${cmd.description}`);
        });

    } catch (error) {
        console.error('❌ Error desplegando comandos:', error);
    }
})();