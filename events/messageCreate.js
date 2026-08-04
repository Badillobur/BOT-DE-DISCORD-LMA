const { Events } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Ignorar bots
        if (message.author.bot) return;
        
        // Verificar si el mensaje empieza con el prefijo
        if (!message.content.startsWith(config.prefix)) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Buscar comando por nombre o alias
        const command = client.commands.get(commandName) 
            || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        // Verificar permisos si es necesario
        if (command.adminOnly) {
            const hasAdminRole = message.member.roles.cache.some(role => 
                config.adminRoles.includes(role.name)
            );
            
            if (!hasAdminRole && message.author.id !== message.guild.ownerId) {
                return message.reply('❌ No tienes permisos para usar este comando.');
            }
        }

        try {
            // Crear objeto interaction-like para compatibilidad
            const mockInteraction = {
                user: message.author,
                member: message.member,
                guild: message.guild,
                channel: message.channel,
                reply: (content) => message.reply(content),
                followUp: (content) => message.channel.send(content),
                deferReply: () => Promise.resolve(),
                editReply: (content) => message.edit(content),
                options: {
                    getString: (name) => args[0] || null,
                    getInteger: (name) => parseInt(args[0]) || null
                }
            };

            await command.execute(mockInteraction, args);
        } catch (error) {
            console.error('❌ Error ejecutando comando:', error);
            message.reply('❌ Hubo un error al ejecutar este comando!');
        }
    },
};